"""Fonte automática: Arrecadação RS — repasses da Sefaz-RS aos municípios.

Download direto (ASP.NET legado): MontaArquivo.aspx?al=l_icms_rep_AAAAMM e
al=l_ipva_rep_AAAAMM — um .xls por tributo/mês. VERIFICADO nas amostras de
2026-08-05: é BIFF real (OLE2), lido com xlrd==2.0.2 (dependência nova,
exclusiva desta fonte) — NÃO é tabela HTML disfarçada. Série mensal desde
2007 (2005/2006 têm arquivo anual único de formato distinto — fora do
escopo). Município identificado SÓ POR NOME (maiúsculo sem acento).

Layout ICMS (amostra 01/2026, sheet "JANEIRO 2026"): linha 0 = "MUNICIPIO" +
um serial de data POR SEMANA de repasse + blocos "TOTAL <MES>/<ANO>" e
"TOTAL EM <ANO>"; linha 1 = REPASSE/RETENÇÃO/LÍQUIDO por bloco (3 colunas);
o Nº DE COLUNAS VARIA com as semanas → o bloco do total do mês é localizado
DINAMICAMENTE pelo texto do cabeçalho (nunca por posição fixa). Última linha
"REPASSE TOTAL ICMS" (total geral, pulada). Usa-se o LÍQUIDO do bloco TOTAL.

Layout IPVA (amostra 01/2025, sheet "Repasses"): linha 0 = "NOME DO
MUNICÍPIO" + um serial de data POR DIA de repasse (quantidade varia) +
"Total Mês" + "Total Ano"; dados direto da linha 1 (sem sub-cabeçalho);
última linha "TOTAIS" (pulada). A coluna "Total Mês" é localizada pelo texto
e o mês do arquivo é validado pela primeira data da linha 0 (epoch
1899-12-30, datemode 0 confirmado nas amostras) — a Sefaz-RS alterna entre
serial BIFF numérico e texto "DD/MM/AAAA" para essas células (visto ao vivo:
IPVA 10/2025 veio em texto; os demais meses de 2025 sondados vieram em
serial); `_data_cabecalho` aceita as duas formas com a mesma semântica
(dado válido da origem, não mudança de layout — decisão do controlador de
2026-08-06, registrada no ledger).

valor_icms = LÍQUIDO total do mês; valor_ipva = Total Mês; valor_ipi = 0.0
(o RS NÃO publica a cota do IPI-Exportação em fonte dedicada — documentado
também no texto da fonte no registro); valor_total = ICMS + IPVA.

Regra anti-meio-mês: o mês SÓ é gravado quando os DOIS arquivos respondem
com layout válido — o ICMS costuma sair antes do IPVA e gravar meio-mês
criaria um registro incompleto que uma rodada futura corrigiria em silêncio.
Guardas de layout → ValueError audível hard-stop; arquivo de outro mês →
MesDivergente (aviso, mês fica de fora). Nenhum descarte silencioso: linha
ilegível → `ignoradas`; alvo sem match → `sem_match` (agregado no executar).

Testabilidade: extração xlrd (extrair_matriz, thin, sem teste) separada da
interpretação (funções puras sobre list[list], testadas com matrizes
sintéticas — nenhum teste gera BIFF)."""
import logging
import re
import unicodedata
from datetime import date, timedelta

import requests

from app.services.ingestao_automatica.arrecadacao_mg import NOME_MESES
from app.services.ingestao_automatica.base import ResumoIngestao
from app.services.ingestao_automatica.util import (
    ca_bundle_gov,
    competencias_janela,
    norm_nome_municipio,
)

logger = logging.getLogger(__name__)

URL_ARQUIVO = "https://www.sefaz.rs.gov.br/Site/MontaArquivo.aspx?al={al}"
INICIO_SERIE = (2007, 1)  # 2005/2006 = arquivos anuais de formato distinto (fora do escopo)
_MAGIC_OLE2 = b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1"  # assinatura de .xls BIFF real

# Como aparecem no cabeçalho "TOTAL <MES>/<ANO>" do ICMS (comparação sem
# acento via _norm_txt — tolera MARÇO/MARCO).
MESES_RS = ["JANEIRO", "FEVEREIRO", "MARÇO", "ABRIL", "MAIO", "JUNHO",
            "JULHO", "AGOSTO", "SETEMBRO", "OUTUBRO", "NOVEMBRO", "DEZEMBRO"]

_EPOCH_XLS = date(1899, 12, 30)


class MesDivergente(Exception):
    """O arquivo respondido é de outro mês (pedido ainda não publicado)."""


def _norm_txt(s) -> str:
    s = unicodedata.normalize("NFD", str(s or ""))
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return " ".join(s.upper().split())


def _numero(v) -> float | None:
    if isinstance(v, bool) or not isinstance(v, (int, float)):
        return None
    return float(v)


_RE_DATA_TXT = re.compile(r"^\s*(\d{2})/(\d{2})/(\d{4})\s*$")


def _data_cabecalho(v) -> date | None:
    """Data efetiva de uma célula de cabeçalho de repasse (linha 0 do IPVA):
    aceita serial BIFF numérico (formato usual) OU string 'DD/MM/AAAA' — a
    Sefaz-RS alterna os dois formatos entre arquivos (visto ao vivo: IPVA
    10/2025 veio em texto; os demais meses de 2025 sondados vieram em
    serial — dado válido da origem, não mudança de layout). Mesma semântica
    nos dois casos: devolve a data do repasse daquela coluna, ou None se a
    célula não é nenhuma das duas formas (inclui texto com data
    calendarmente inválida, ex. 31/02)."""
    n = _numero(v)
    if n is not None:
        return _EPOCH_XLS + timedelta(days=int(n))
    if isinstance(v, str):
        m = _RE_DATA_TXT.match(v)
        if m:
            dia, mes_txt, ano_txt = (int(x) for x in m.groups())
            try:
                return date(ano_txt, mes_txt, dia)
            except ValueError:
                return None
    return None


def interpretar_matriz_icms(matriz, ano: int, mes: int) -> tuple[dict[str, float], list[str]]:
    """Matriz do .xls de ICMS → ({nome: líquido_total_do_mês}, ignoradas)."""
    if not matriz or _norm_txt(matriz[0][0]) != "MUNICIPIO":
        raise ValueError(
            f"RS ICMS {mes:02d}/{ano}: primeira célula não é MUNICIPIO — layout mudou?")
    alvo_header = f"TOTAL {_norm_txt(MESES_RS[mes - 1])}/{ano}"
    col = next((i for i, c in enumerate(matriz[0])
                if isinstance(c, str) and _norm_txt(c) == alvo_header), None)
    if col is None:
        outro = next((_norm_txt(c) for c in matriz[0] if isinstance(c, str)
                      and re.fullmatch(r"TOTAL \S+/\d{4}", _norm_txt(c))), None)
        if outro:
            raise MesDivergente(f"arquivo traz '{outro}', esperado '{alvo_header}'")
        raise ValueError(
            f"RS ICMS {mes:02d}/{ano}: bloco '{alvo_header}' ausente da linha 0 — layout mudou?")
    if len(matriz) < 3 or [_norm_txt(c) for c in matriz[1][col:col + 3]] != \
            ["REPASSE", "RETENCAO", "LIQUIDO"]:
        raise ValueError(
            f"RS ICMS {mes:02d}/{ano}: bloco TOTAL sem REPASSE/RETENÇÃO/LÍQUIDO — layout mudou?")
    col_liquido = col + 2

    valores: dict[str, float] = {}
    ignoradas: list[str] = []
    for linha in matriz[2:]:
        nome = str(linha[0] or "").strip()
        if not nome:
            continue
        if _norm_txt(nome).startswith("REPASSE TOTAL"):
            continue  # linha de total geral do arquivo
        v = _numero(linha[col_liquido]) if col_liquido < len(linha) else None
        if v is None:
            ignoradas.append(nome)
            continue
        valores[nome] = v
    return valores, ignoradas


def interpretar_matriz_ipva(matriz, ano: int, mes: int) -> tuple[dict[str, float], list[str]]:
    """Matriz do .xls de IPVA → ({nome: total_do_mês}, ignoradas)."""
    if not matriz or _norm_txt(matriz[0][0]) != "NOME DO MUNICIPIO":
        raise ValueError(
            f"RS IPVA {mes:02d}/{ano}: primeira célula não é NOME DO MUNICÍPIO — layout mudou?")
    col = next((i for i, c in enumerate(matriz[0])
                if isinstance(c, str) and _norm_txt(c) == "TOTAL MES"), None)
    if col is None:
        raise ValueError(
            f"RS IPVA {mes:02d}/{ano}: coluna 'Total Mês' ausente da linha 0 — layout mudou?")
    datas = (_data_cabecalho(c) for c in matriz[0][1:])
    d = next((x for x in datas if x is not None), None)
    if d is None:
        raise ValueError(
            f"RS IPVA {mes:02d}/{ano}: nenhuma data (serial ou texto DD/MM/AAAA) "
            "na linha 0 — layout mudou?")
    if (d.year, d.month) != (ano, mes):
        raise MesDivergente(f"arquivo traz repasses de {d.month:02d}/{d.year}")

    valores: dict[str, float] = {}
    ignoradas: list[str] = []
    for linha in matriz[1:]:
        nome = str(linha[0] or "").strip()
        if not nome:
            continue
        if _norm_txt(nome) == "TOTAIS":
            continue  # linha de total geral do arquivo
        v = _numero(linha[col]) if col < len(linha) else None
        if v is None:
            ignoradas.append(nome)
            continue
        valores[nome] = v
    return valores, ignoradas


def montar_registros_rs(valores_icms, valores_ipva, alvo: dict[str, int],
                        ano: int, mes: int) -> tuple[list[dict], list[str]]:
    """Junção ICMS+IPVA por nome normalizado, restrita aos alvos
    (`alvo` = {norm_nome_municipio(nome): municipio_id}).

    Só monta registro para município presente NOS DOIS arquivos (espelho
    municipal da regra anti-meio-mês); alvo ausente de um ou dos dois entra
    em `sem_match` (contado e audível, nunca silencioso)."""
    icms_norm = {norm_nome_municipio(n): v for n, v in valores_icms.items()}
    ipva_norm = {norm_nome_municipio(n): v for n, v in valores_ipva.items()}
    regs: list[dict] = []
    sem_match: list[str] = []
    for nome_norm, mid in alvo.items():
        icms, ipva = icms_norm.get(nome_norm), ipva_norm.get(nome_norm)
        if icms is None and ipva is None:
            sem_match.append(f"{nome_norm}: ausente nos arquivos de ICMS e IPVA")
            continue
        if icms is None or ipva is None:
            faltou = "ICMS" if icms is None else "IPVA"
            sem_match.append(f"{nome_norm}: ausente no arquivo de {faltou}")
            continue
        regs.append({
            "municipio_id": mid,
            "ano": ano,
            "mes": mes,
            "nome_mes": NOME_MESES[mes - 1],
            "data_base": date(ano, mes, 1),
            "valor_icms": icms,
            "valor_ipva": ipva,
            "valor_ipi": 0.0,  # RS não publica IPI-Exportação (docstring do módulo)
            "valor_total": round(icms + ipva, 2),
        })
    return regs, sem_match


def extrair_matriz(conteudo: bytes) -> list[list]:
    """EXTRAÇÃO thin (deliberadamente sem teste): bytes .xls → matriz de
    células da primeira sheet não vazia, com a semântica de tipos do xlrd
    (str para texto, float para números e seriais de data, '' para vazio).
    Toda a interpretação fica nas funções puras acima. Import local: xlrd só
    é exigido quando a fonte RS de fato roda."""
    import xlrd

    wb = xlrd.open_workbook(file_contents=conteudo)
    for sh in wb.sheets():
        if sh.nrows:
            return [sh.row_values(r) for r in range(sh.nrows)]
    return []


# ── HTTP + execução (parte 2) ────────────────────────────────────────────────

def _get_retry(url: str) -> requests.Response:
    """GET com 1 retry, mas só em falha de rede (timeout/conexão) — o status
    HTTP de um servidor legado é determinístico (o mesmo 500/404 se repete),
    então re-tentar HTTPError só duplica tráfego no caminho rotineiro dos
    meses ainda não publicados. HTTPError propaga direto, sem retry."""
    try:
        resp = requests.get(url, timeout=(30, 120),
                            headers={"User-Agent": "Mozilla/5.0"}, verify=ca_bundle_gov())
        resp.raise_for_status()
        return resp
    except requests.HTTPError:
        raise
    except requests.RequestException:
        resp = requests.get(url, timeout=(30, 120),
                            headers={"User-Agent": "Mozilla/5.0"}, verify=ca_bundle_gov())
        resp.raise_for_status()
        return resp


def _baixar_matriz(al: str) -> tuple[list[list] | None, str | None]:
    """(matriz, None) ou (None, motivo-não-publicado). Não-publicado = status
    404 OU 500 com corpo que não é OLE2/BIFF — os dois casos confirmados ao
    vivo em 2026-08-06 (meses ainda não publicados respondem 500 com página
    HTML "Nenhum registro encontrado na consulta."; 404 é o caso de `al`
    inválido). QUALQUER outro status HTTP (403/502/503/...) propaga como
    indisponibilidade real da Sefaz-RS — o executar aborta a UF, audível."""
    try:
        resp = _get_retry(URL_ARQUIVO.format(al=al))
    except requests.HTTPError as exc:
        resp = exc.response
        if resp is not None and resp.status_code in (404, 500) \
                and not resp.content.startswith(_MAGIC_OLE2):
            return None, f"não publicado (HTTP {resp.status_code})"
        raise
    if not resp.content.startswith(_MAGIC_OLE2):
        return None, "não publicado (resposta não é .xls)"
    return extrair_matriz(resp.content), None


def _upsert_mensal(db, regs: list[dict], resumo: ResumoIngestao, mids_ok: set) -> None:
    """Idêntico ao do conector PR (idioma do MG; módulos autocontidos como o
    próprio MG — duplicação deliberada de ~20 linhas)."""
    from app.models.arrecadacao import ArrecadacaoMensal

    if not regs:
        return
    mids = {r["municipio_id"] for r in regs}
    existentes = {
        (r.municipio_id, r.ano, r.mes): r
        for r in db.query(ArrecadacaoMensal).filter(
            ArrecadacaoMensal.municipio_id.in_(mids),
            ArrecadacaoMensal.ano == regs[0]["ano"],
            ArrecadacaoMensal.mes == regs[0]["mes"]).all()
    }
    for r in regs:
        reg = existentes.get((r["municipio_id"], r["ano"], r["mes"]))
        if reg:
            for coluna, valor in r.items():
                setattr(reg, coluna, valor)
        else:
            db.add(ArrecadacaoMensal(**r))
        resumo.linhas += 1
        mids_ok.add(r["municipio_id"])
    db.commit()


def executar_rs(db, municipios, anos=None, usuario_id=None, notificar=True, progresso=None) -> ResumoIngestao:
    """Conector RS. Janela default: últimas 36 competências (idioma das
    demais fontes mensais do repo); com `anos`, todos os meses desses anos,
    clampados entre INICIO_SERIE (2007-01) e o mês anterior — backfill
    histórico = `anos` explícitos. Um mês só é gravado com ICMS E IPVA
    válidos (anti-meio-mês — ver docstring do módulo). `notificar` aceito e
    ignorado."""
    resumo = ResumoIngestao(dataset="arrecadacao")
    de_rs = [m for m in municipios if (m.estado or "").upper() == "RS"]
    fora = len(municipios) - len(de_rs)
    if fora:
        resumo.erros.append(
            f"conector RS cobre apenas municípios do RS — {fora} município(s) de outra UF ignorado(s)")
        resumo.municipios_erro += fora
    alvo = {norm_nome_municipio(m.nome): m.id for m in de_rs}
    if not alvo:
        return resumo

    competencias = competencias_janela(anos=anos, inicio=INICIO_SERIE, meses_default=36)
    mids_ok: set[int] = set()
    sem_match_meses: dict[str, int] = {}
    for i, (ano, mes) in enumerate(competencias):
        if progresso:
            progresso(i, len(competencias), f"repasses RS {mes:02d}/{ano}")
        anomes = f"{ano}{mes:02d}"
        try:
            matriz_icms, motivo_icms = _baixar_matriz(f"l_icms_rep_{anomes}")
            matriz_ipva, motivo_ipva = _baixar_matriz(f"l_ipva_rep_{anomes}")
        except requests.RequestException as exc:
            resumo.erros.append(
                f"{mes:02d}/{ano}: Sefaz-RS indisponível ({exc}) — meses restantes abortados")
            break
        if matriz_icms is None or matriz_ipva is None:
            faltas = [f"{rot} {mot}" for rot, mtz, mot in
                      (("ICMS", matriz_icms, motivo_icms), ("IPVA", matriz_ipva, motivo_ipva))
                      if mtz is None]
            resumo.erros.append(
                f"{mes:02d}/{ano}: aguardando publicação completa — {'; '.join(faltas)}")
            continue
        try:
            valores_icms, ign_icms = interpretar_matriz_icms(matriz_icms, ano, mes)
            valores_ipva, ign_ipva = interpretar_matriz_ipva(matriz_ipva, ano, mes)
        except MesDivergente as exc:
            resumo.erros.append(f"{mes:02d}/{ano}: ainda não publicado ({exc})")
            continue
        except ValueError as exc:
            resumo.erros.append(f"{exc} — nenhuma linha do mês gravada; meses restantes abortados")
            break
        if ign_icms or ign_ipva:
            resumo.erros.append(
                f"{mes:02d}/{ano}: linha(s) ilegível(is) ignorada(s) — ICMS {len(ign_icms)}, IPVA {len(ign_ipva)}")
        regs, sem_match = montar_registros_rs(valores_icms, valores_ipva, alvo, ano, mes)
        for s in sem_match:
            sem_match_meses[s] = sem_match_meses.get(s, 0) + 1
        _upsert_mensal(db, regs, resumo, mids_ok)

    for s, n in sorted(sem_match_meses.items()):
        resumo.erros.append(f"{s} em {n} mês(es)")
    resumo.municipios_ok = len(mids_ok)
    faltantes = set(alvo.values()) - mids_ok
    resumo.municipios_erro += len(faltantes)
    if progresso:
        progresso(len(competencias), len(competencias), "repasses RS gravados")
    return resumo
