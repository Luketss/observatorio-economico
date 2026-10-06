"""Fonte automática Empresas/CNPJ — snapshot mensal dos dados abertos da RFB.

Share Nextcloud/SERPRO (WebDAV público; a URL antiga morreu em jan/2026; o
índice HTTP antigo `/dados/cnpj/dados_abertos_cnpj/` também não existe mais).
O host da RFB RECUSA conexões vindas da faixa de IPs da Railway (derruba sem
resposta — "RemoteDisconnected"), então a coleta roda de uma máquina no Brasil
pelo comando `python -m app.coletar_cnpj` (docs/coleta-cnpj.md). Transporte
tolerante: User-Agent de navegador (hosts gov.br também derrubam a conexão do
UA padrão do requests) e re-tentativas com backoff na listagem e no download.
Arquivos nacionais SEM header, CSV ';' com aspas, latin-1, posicionais:
Estabelecimentos (30 colunas, único com município — código TOM da RFB, não
IBGE), Empresas (7), Simples (7), auxiliar Municípios (2: TOM -> nome, SEM UF).
Match de município: TOM -> nome (auxiliar) + UF da própria linha, casados com
os alvos via norm_nome_municipio + estado (padrão FPM).

Duas passadas: Estabelecimentos filtra os alvos e colhe cnpj_basico (matriz
preferida); Empresas/Simples completam razão social, porte, capital e opções.
Parsers de valores byte-compatíveis com backend/ingestao/carregar_cnpj.py
(paridade com dados manuais). Códigos crus preservados (situacao "02" etc.).

Gravação: REPLACE por município na tabela empresas (snapshot completo), commit
por município, com anti-wipe (alvo sem estabelecimentos não sofre delete).
Se QUALQUER zip de Estabelecimentos falhar, NADA é gravado (snapshot parcial
geraria REPLACE com menos empresas); falha só em Empresas/Simples degrada com
aviso audível. `anos` e `notificar` são aceitos e ignorados (snapshot corrente,
sem regra de notificação).
ESCALA: ~7,6GB de download por execução (varredura nacional obrigatória) — a
fonte mais pesada da esteira; fora do meta-job, pensada para o worker."""
import contextlib
import csv
import io
import logging
import os
import re
import tempfile
import time
import zipfile
from datetime import datetime

import requests

from app.services.ingestao_automatica.base import (
    FonteAutomatica,
    ResumoIngestao,
    registrar,
)
from app.services.ingestao_automatica.util import norm_nome_municipio

logger = logging.getLogger(__name__)

# Share público oficial da RFB (Nextcloud/SERPRO) — token faz parte da URL
# publicada, não é segredo.
WEBDAV = "https://arquivos.receitafederal.gov.br/public.php/webdav"
SHARE_TOKEN = "YggdBLfdninEJX9"

# Paridade com as demais fontes (util.baixar_zip, estban, arrecadacao_*): os
# hosts gov.br fecham a conexão sem resposta para o User-Agent padrão do
# requests ("python-requests/x") — sintoma exato "RemoteDisconnected".
HEADERS = {"User-Agent": "Mozilla/5.0"}

# Re-tentativas por endpoint (listagem) e por arquivo (download), com backoff
# exponencial: 2s, 4s. "Connection aborted"/"RemoteDisconnected" é a falha
# transitória típica do Nextcloud atrás do balanceador da SERPRO.
TENTATIVAS = 3
ESPERA_BASE_S = 2.0

COLS_ESTAB = 30
COLS_EMPRESAS = 7
COLS_SIMPLES = 7
COLS_MUNICIPIOS = 2

# As passadas mantêm em memória TODOS os estabelecimentos dos alvos (~1-1,5GB
# para uma capital; UF inteira estoura o worker) — seleção grande é recusada
# audivelmente; rode em lotes.
MAX_MUNICIPIOS_POR_EXECUCAO = 20

# Posições oficiais (metadados RFB) usadas em cada arquivo
E_CNPJ, E_MATRIZ, E_FANTASIA, E_SITUACAO = 0, 3, 4, 5
E_DATA_INICIO, E_CNAE, E_UF, E_TOM = 10, 11, 19, 20
P_CNPJ, P_RAZAO, P_CAPITAL, P_PORTE = 0, 1, 4, 5
S_CNPJ, S_OPCAO_SIMPLES, S_OPCAO_MEI = 0, 1, 4


# ── Parsers byte-compatíveis com backend/ingestao/carregar_cnpj.py ──────────

def _parse_data(valor: str):
    valor = (valor or "").strip()
    if not valor:
        return None
    try:
        return datetime.strptime(valor, "%Y%m%d").date()
    except ValueError:
        return None


def _parse_capital(valor: str):
    valor = (valor or "").strip()
    if not valor:
        return None
    try:
        return float(valor.replace(".", "").replace(",", "."))
    except ValueError:
        return None


def _parse_bool(valor: str) -> bool:
    return (valor or "").strip().upper() in ("S", "SIM", "1", "TRUE")


def _parse_mei(valor: str) -> bool:
    v = (valor or "").strip().upper()
    if v in ("S", "SIM", "TRUE"):
        return True
    if v in ("", "N", "NAO", "NÃO", "0", "00000000"):
        return False
    return v.isdigit() and len(v) == 8  # data AAAAMMDD de opção vale como flag


# ── Núcleo puro ─────────────────────────────────────────────────────────────

def validar_colunas(row, esperado: int, arquivo: str) -> None:
    if len(row) != esperado:
        raise ValueError(
            f"CNPJ {arquivo}: {len(row)} colunas (esperado {esperado}) — layout mudou?")


def _reader(fobj):
    return csv.reader(fobj, delimiter=";", quotechar='"')


def carregar_mapa_tom(fobj) -> dict:
    """Auxiliar Municípios: código TOM -> nome (sem UF)."""
    mapa = {}
    primeira = True
    for row in _reader(fobj):
        if primeira:
            validar_colunas(row, COLS_MUNICIPIOS, "Municipios")
            primeira = False
        if len(row) >= 2:
            mapa[row[0].strip()] = row[1].strip()
    return mapa


def indexar_alvos(municipios) -> dict:
    """(nome normalizado, UF) -> municipio_id."""
    return {
        (norm_nome_municipio(m.nome), (m.estado or "").upper()): m.id
        for m in municipios
    }


def processar_estabelecimentos(fobj, mapa_tom, alvos, colhidas, stats) -> None:
    """Passada 1: colhe estabelecimentos dos alvos por (mid, cnpj_basico),
    com matriz preferida. TOM sem entrada no mapa é contado (nunca silencioso)."""
    primeira = True
    for row in _reader(fobj):
        if primeira:
            validar_colunas(row, COLS_ESTAB, "Estabelecimentos")
            primeira = False
        if len(row) != COLS_ESTAB:
            stats["malformadas"] += 1
            continue
        tom = row[E_TOM].strip()
        if not tom:
            stats["malformadas"] += 1
            continue
        nome = mapa_tom.get(tom)
        if nome is None:
            stats["tom_desconhecido"] += 1
            continue
        mid = alvos.get((norm_nome_municipio(nome), row[E_UF].strip().upper()))
        if mid is None:
            continue
        cnpj = row[E_CNPJ].strip()
        if not cnpj:
            stats["malformadas"] += 1
            continue
        eh_matriz = row[E_MATRIZ].strip() == "1"
        chave = (mid, cnpj)
        atual = colhidas.get(chave)
        if atual is not None and (atual["matriz"] or not eh_matriz):
            continue  # mantém matriz (ou a primeira filial vista)
        colhidas[chave] = {
            "nome_fantasia": row[E_FANTASIA].strip() or None,
            "situacao": row[E_SITUACAO].strip() or None,
            "data_inicio": row[E_DATA_INICIO].strip(),
            "cnae_fiscal": row[E_CNAE].strip() or None,
            "matriz": eh_matriz,
        }


def processar_empresas(fobj, cnpjs: set, dados: dict, stats: dict) -> None:
    """Passada 2a: razão social, capital e porte dos cnpjs colhidos."""
    primeira = True
    for row in _reader(fobj):
        if primeira:
            validar_colunas(row, COLS_EMPRESAS, "Empresas")
            primeira = False
        if len(row) != COLS_EMPRESAS:
            stats["malformadas"] += 1
            continue
        cnpj = row[P_CNPJ].strip()
        if cnpj in cnpjs and cnpj not in dados:
            dados[cnpj] = {
                "razao_social": row[P_RAZAO].strip() or None,
                "capital_social": _parse_capital(row[P_CAPITAL]),
                "porte": row[P_PORTE].strip() or None,
            }


def processar_simples(fobj, cnpjs: set, dados: dict, stats: dict) -> None:
    """Passada 2b: opções Simples/MEI dos cnpjs colhidos."""
    primeira = True
    for row in _reader(fobj):
        if primeira:
            validar_colunas(row, COLS_SIMPLES, "Simples")
            primeira = False
        if len(row) != COLS_SIMPLES:
            stats["malformadas"] += 1
            continue
        cnpj = row[S_CNPJ].strip()
        if cnpj in cnpjs and cnpj not in dados:
            dados[cnpj] = {
                "opcao_simples": _parse_bool(row[S_OPCAO_SIMPLES]),
                "opcao_mei": _parse_mei(row[S_OPCAO_MEI]),
            }


def montar_linhas(colhidas, dados_emp, dados_simples) -> dict:
    """Junta as passadas em rows da tabela empresas, agrupadas por municipio_id.
    razao_social é NOT NULL: fallback nome_fantasia -> '' quando a passada 2
    não cobrir (modo degradado, sempre audível no resumo)."""
    por_mid: dict[int, list[dict]] = {}
    for (mid, cnpj), e in colhidas.items():
        emp = dados_emp.get(cnpj, {})
        simp = dados_simples.get(cnpj, {})
        razao = emp.get("razao_social") or e.get("nome_fantasia") or ""
        por_mid.setdefault(mid, []).append({
            "municipio_id": mid,
            "cnpj_basico": cnpj[:8],
            "razao_social": razao[:150],
            "nome_fantasia": (e.get("nome_fantasia") or None) and e["nome_fantasia"][:150],
            "situacao": (e.get("situacao") or None) and e["situacao"][:2],
            "data_inicio": _parse_data(e.get("data_inicio", "")),
            "cnae_fiscal": (e.get("cnae_fiscal") or None) and e["cnae_fiscal"][:7],
            "porte": (emp.get("porte") or None) and emp["porte"][:2],
            "capital_social": emp.get("capital_social"),
            "opcao_simples": simp.get("opcao_simples", False),
            "opcao_mei": simp.get("opcao_mei", False),
        })
    return por_mid


# ── Transporte (share WebDAV da RFB, tolerante a falhas) ─────

_RE_MES = re.compile(r"(?<![\d-])(20\d{2}-(?:0[1-9]|1[0-2]))/")


def extrair_meses(texto: str) -> list[str]:
    """Meses ("AAAA-MM") presentes numa listagem — o XML do PROPFIND (hrefs
    ".../webdav/2026-07/"); também aceita autoindex HTML (href="2026-07/")."""
    meses = sorted(set(_RE_MES.findall(texto)))
    if not meses:
        raise ValueError("nenhum mês encontrado na listagem — layout mudou?")
    return meses


class Transporte:
    """Um endpoint da RFB: como listar os meses e de onde baixar cada zip."""

    def __init__(self, nome: str, base: str, auth=None, metodo="GET", headers=None):
        self.nome, self.base, self.auth, self.metodo = nome, base, auth, metodo
        self.headers = {**HEADERS, **(headers or {})}

    def url_listagem(self) -> str:
        return self.base + "/"

    def url_zip(self, mes: str, nome: str) -> str:
        return f"{self.base}/{mes}/{nome}"

    def listar_meses(self) -> list[str]:
        r = requests.request(self.metodo, self.url_listagem(), auth=self.auth,
                             headers=self.headers, timeout=60)
        r.raise_for_status()
        return extrair_meses(r.text)

    def __repr__(self) -> str:
        return f"{self.nome} ({self.url_listagem()})"


TRANSPORTE_WEBDAV = Transporte(
    "share WebDAV", WEBDAV, auth=(SHARE_TOKEN, ""), metodo="PROPFIND",
    headers={"Depth": "1"})
# Único endpoint vivo (verificado em 2026-10). O host recusa a faixa de IPs da
# Railway; a coleta roda pelo comando local `python -m app.coletar_cnpj`.
TRANSPORTES = (TRANSPORTE_WEBDAV,)


def _esperar(tentativa: int, dormir) -> None:
    dormir(ESPERA_BASE_S * (2 ** (tentativa - 1)))


def _descrever(exc: Exception) -> str:
    resp = getattr(exc, "response", None)
    if resp is not None and getattr(resp, "status_code", None):
        return f"HTTP {resp.status_code}"
    return f"{type(exc).__name__}: {exc}"


class FonteIndisponivel(Exception):
    """Nenhum endpoint da RFB respondeu com uma listagem válida."""


def listar_meses(transporte: Transporte = TRANSPORTE_WEBDAV, dormir=time.sleep) -> list[str]:
    """Meses publicados num endpoint, com TENTATIVAS e backoff. Esgotadas as
    tentativas, propaga a última exceção (rede ou layout)."""
    ultimo: Exception | None = None
    for tentativa in range(1, TENTATIVAS + 1):
        try:
            return transporte.listar_meses()
        except (requests.RequestException, ValueError) as exc:
            ultimo = exc
            logger.warning("CNPJ: %s tentativa %d/%d falhou: %s",
                           transporte.nome, tentativa, TENTATIVAS, _descrever(exc))
            if tentativa < TENTATIVAS:
                _esperar(tentativa, dormir)
    assert ultimo is not None
    raise ultimo


def localizar_snapshot(transportes=TRANSPORTES, dormir=time.sleep) -> tuple[Transporte, str]:
    """(transporte, mês mais recente) do primeiro endpoint que responder.
    Todos esgotados -> FonteIndisponivel com o diagnóstico de cada um (URL +
    motivo); se foram só conexões derrubadas, diz a causa (bloqueio da Railway)."""
    falhas = []
    so_conexao = True
    for transporte in transportes:
        try:
            return transporte, listar_meses(transporte, dormir)[-1]
        except (requests.RequestException, ValueError) as exc:
            falhas.append(f"{transporte.nome} {transporte.url_listagem()}: {_descrever(exc)}")
            if not isinstance(exc, requests.ConnectionError) or isinstance(exc, requests.Timeout):
                so_conexao = False
    base = (f"nenhum endpoint da RFB respondeu após {TENTATIVAS} tentativa(s) em cada — "
            + "; ".join(falhas))
    if so_conexao:
        raise FonteIndisponivel(
            base + " — o servidor da RFB derrubou a conexão sem responder: ele recusa "
            "conexões vindas da Railway. Rode a coleta de uma máquina no Brasil: "
            "python -m app.coletar_cnpj (docs/coleta-cnpj.md)")
    raise FonteIndisponivel(
        base + " — confira as URLs no navegador: o share ou o caminho podem ter mudado")


def nomes_zips() -> list[str]:
    """Ordem de processamento: auxiliar -> Estabelecimentos -> Empresas -> Simples."""
    return (["Municipios.zip"]
            + [f"Estabelecimentos{i}.zip" for i in range(10)]
            + [f"Empresas{i}.zip" for i in range(10)]
            + ["Simples.zip"])


def baixar_zip(transporte: Transporte, mes: str, nome: str, destino_dir: str, dormir=time.sleep):
    """(caminho, erro): download streaming com TENTATIVAS e backoff em falha
    transitória. Esgotadas, devolve (None, mensagem) — erro audível por arquivo."""
    destino = os.path.join(destino_dir, nome)
    for tentativa in range(1, TENTATIVAS + 1):
        try:
            with requests.get(transporte.url_zip(mes, nome), auth=transporte.auth,
                              headers=transporte.headers, stream=True,
                              timeout=(60, 300)) as r:
                r.raise_for_status()
                with open(destino, "wb") as f:
                    for chunk in r.iter_content(chunk_size=1024 * 1024):
                        f.write(chunk)
            return destino, None
        except requests.RequestException as exc:
            logger.warning("CNPJ: download %s tentativa %d/%d falhou: %s",
                           nome, tentativa, TENTATIVAS, _descrever(exc))
            if tentativa == TENTATIVAS:
                return None, _descrever(exc)
            _esperar(tentativa, dormir)
    return None, "inalcançável"


@contextlib.contextmanager
def iterar_arquivo_do_zip(caminho_zip: str):
    """Abre o único arquivo interno do zip como texto latin-1, SEM extrair."""
    with zipfile.ZipFile(caminho_zip) as z:
        interno = z.namelist()[0]
        with z.open(interno) as raw:
            yield io.TextIOWrapper(raw, encoding="latin-1", newline="")


# ── Orquestração ────────────────────────────────────────────────────────────

def executar(db, municipios, anos=None, usuario_id=None, notificar=True, progresso=None) -> ResumoIngestao:
    """`anos` e `notificar` aceitos e ignorados (snapshot corrente do cadastro)."""
    from app.models.empresa import Empresa

    resumo = ResumoIngestao(dataset="cnpj")
    alvos = indexar_alvos(municipios)
    if len(alvos) > MAX_MUNICIPIOS_POR_EXECUCAO:
        resumo.erros.append(
            f"seleção com {len(alvos)} municípios excede o limite de "
            f"{MAX_MUNICIPIOS_POR_EXECUCAO} da fonte cnpj — rode em lotes menores")
        return resumo
    nomes_por_mid = {m.id: m.nome for m in municipios}
    if not alvos:
        return resumo

    if progresso:
        progresso(0, 1, "CNPJ: localizando snapshot mais recente na RFB")
    try:
        transporte, mes = localizar_snapshot()
    except FonteIndisponivel as exc:
        resumo.erros.append(f"fonte RFB indisponível: {exc}")
        return resumo
    logger.info("CNPJ: snapshot %s via %s", mes, transporte.nome)

    zips = nomes_zips()
    total = len(zips)
    mapa_tom: dict = {}
    colhidas: dict = {}
    dados_emp: dict = {}
    dados_simples: dict = {}
    stats = {"tom_desconhecido": 0, "malformadas": 0}
    estab_falhou = False

    cnpjs: set = set()
    for i, nome in enumerate(zips, start=1):
        if progresso:
            progresso(i - 1, total, f"CNPJ {mes}: baixando {nome}")
        with tempfile.TemporaryDirectory(prefix="cnpj_") as tmp:
            caminho, erro = baixar_zip(transporte, mes, nome, tmp)
            if erro:
                resumo.erros.append(f"{nome}: {erro}")
                if nome.startswith(("Municipios", "Estabelecimentos")):
                    estab_falhou = True
                continue
            if progresso:
                progresso(i - 1, total, f"CNPJ {mes}: processando {nome}")
            try:
                with iterar_arquivo_do_zip(caminho) as f:
                    if nome == "Municipios.zip":
                        mapa_tom = carregar_mapa_tom(f)
                    elif nome.startswith("Estabelecimentos"):
                        processar_estabelecimentos(f, mapa_tom, alvos, colhidas, stats)
                    elif nome.startswith("Empresas"):
                        if not cnpjs:
                            cnpjs = {c for (_, c) in colhidas}
                        processar_empresas(f, cnpjs, dados_emp, stats)
                    else:  # Simples.zip
                        if not cnpjs:
                            cnpjs = {c for (_, c) in colhidas}
                        processar_simples(f, cnpjs, dados_simples, stats)
            except (zipfile.BadZipFile, ValueError) as exc:
                resumo.erros.append(f"{nome}: {exc}")
                if nome.startswith(("Municipios", "Estabelecimentos")):
                    estab_falhou = True

    if stats["tom_desconhecido"]:
        resumo.erros.append(
            f"{stats['tom_desconhecido']} linha(s) com código TOM fora do mapa de municípios da RFB")
    if stats["malformadas"]:
        resumo.erros.append(f"{stats['malformadas']} linha(s) malformada(s) puladas")

    if estab_falhou:
        resumo.erros.append(
            "snapshot incompleto (Municípios/Estabelecimentos com falha) — NADA foi gravado")
        return resumo

    linhas_por_mid = montar_linhas(colhidas, dados_emp, dados_simples)
    if not dados_emp and colhidas:
        resumo.erros.append(
            "passada de Empresas vazia — razão social/porte/capital em modo degradado")

    mids = sorted(alvos.values())
    for i, mid in enumerate(mids, start=1):
        if progresso:
            progresso(i, len(mids), "gravando municípios")
        linhas = linhas_por_mid.get(mid, [])
        if not linhas:
            resumo.erros.append(
                f"{nomes_por_mid.get(mid, mid)}: sem estabelecimentos no arquivo — dados anteriores mantidos")
            continue
        db.query(Empresa).filter(Empresa.municipio_id == mid).delete(synchronize_session=False)
        for row in linhas:
            db.add(Empresa(**row))
        resumo.linhas += len(linhas)
        db.commit()
        resumo.municipios_ok += 1
    return resumo


registrar(FonteAutomatica(
    key="cnpj",
    label="Empresas (CNPJ/RFB)",
    fonte="RFB — Cadastro Nacional da Pessoa Jurídica, dados abertos mensais",
    executar=executar,
    max_municipios=MAX_MUNICIPIOS_POR_EXECUCAO,
))
