"""Fonte automática: ESTBAN por município e instituição (Bacen).

ZIP mensal por AGÊNCIA (uma linha por agência) — agrega por município
(estban_mensal, qtd_agencias = nº de linhas) e por município+instituição
(estban_por_instituicao). O CSV (latin-1, ';') tem 2 linhas de preâmbulo
antes do header '#DATA_BASE' (mesma técnica do fpm_stn de procurar o header).

URL (validada em 2026-07-09 — o Bacen desligou o endereço legado
www4.bcb.gov.br/fis/cosif/... entre 2023 e 2024):
- Listagem oficial JSON (API do portal novo): LISTA_URL abaixo, entries com
  Nome ('202603_ESTBAN_AG.csv.zip'), Titulo ('03/2026') e Url relativa.
- Download: https://www.bcb.gov.br + Url. O sufixo varia na série: `.ZIP`
  (1988-07..2022-11), `.csv` puro (2022-12..2023-01) e `.csv.zip` (2023-02+),
  por isso a listagem é a fonte primária de URLs e o padrão direto
  {anomes}_ESTBAN_AG.csv.zip é só fallback p/ meses recentes se a API cair.

Unidade dos valores: R$ inteiros, 1:1 com a tabela legada — validado contra
estban_mensal de Divinópolis/MG em 2026-03 (12 agências; operações de crédito
4.596.657.440 exato; 9 de 11 colunas exatas, 2 com ruído de revisão <0,015%).
NENHUMA conversão (diferente do PIB, que precisou de ×1000).

Match de município: o arquivo tem CODMUN_IBGE (código IBGE de 7 dígitos, é a
última coluna) — match primário por código, fallback (nome normalizado, UF).
Publicação com defasagem de ~60-90 dias: competências recentes ausentes da
listagem não são erro.

Conceitos sem verbete no layout por agência (capturado nos dois formatos,
202201 e 202603): 'empréstimos ao setor público' não existe — a coluna do
model fica 0.0. 'Outros créditos' é o VERBETE_172 (o 176 é 'operações
especiais', diferente do palpite original do plano)."""
import csv
import logging
import os
import tempfile
import zipfile
from datetime import date

import requests

from app.services.ingestao_automatica.base import FonteAutomatica, ResumoIngestao, registrar
from app.services.ingestao_automatica.util import (
    baixar_zip,
    competencias_janela,
    linhas_zip,
    norm_nome_municipio,
    parse_valor_br,
)

logger = logging.getLogger(__name__)

LISTA_URL = (
    "https://www.bcb.gov.br/api/servico/sitebcb/Documentos/byListGuid"
    "?tronco=estatisticas&guidLista=f6391806-fd85-43af-acf1-c86d5b8dd6df"
    "&ordem=DataDocumento%20desc&pasta=agencia"
)
URL_DIRETA = (
    "https://www.bcb.gov.br/content/estatisticas/estatistica_bancaria_estban/"
    "agencia/{anomes}_ESTBAN_AG.csv.zip"
)
INICIO_SERIE = (2022, 1)

# Coluna combinada de depósitos à vista (verbetes 401..419 somados pelo próprio
# Bacen numa única coluna — nome idêntico nos layouts antigo e novo).
_VISTA_401_419 = (
    "VERBETE_401_SERVICOS_PUBLICOS + VERBETE_402_ATIVIDADES_EMPRESARIAIS + "
    "VERBETE_403_ESPECIAIS_DO_TESOURO_NACIONAL + "
    "VERBETE_404_SALDOS_CREDORES_EM_CONTAS_DE_EMPRESTIMOS_E_FINAN + "
    "VERBETE_411_DE_PESSOAS_FISICAS + VERBETE_412_DE_PESSOAS_JURIDICAS + "
    "VERBETE_413_DE_INSTITUICOES_FINANCEIRAS + VERBETE_414_JUDICIAIS + "
    "VERBETE_415_OBRIGATORIOS + VERBETE_416_PARA_INVESTIMENTOS + "
    "VERBETE_417_VINCULADOS + VERBETE_418_DEMAIS_DEPOSITOS + "
    "VERBETE_419_SLD_CRED_CTAS_EMPR_FINANC_OUTR"
)

# coluna do model → colunas de verbete do CSV (somadas as presentes no header).
# NOMES CONFERIDOS contra os headers reais em 2026-07 (202603 = layout novo,
# 202201 = layout antigo). Atenção: 420 é POUPANÇA e 432 é PRAZO (o plano
# original supunha o contrário); à vista é a coluna combinada 401..419.
MAPA_VERBETES = {
    "valor_operacoes_credito": ["VERBETE_160_OPERACOES_DE_CREDITO"],
    "valor_depositos_vista": [_VISTA_401_419],
    "valor_poupanca": ["VERBETE_420_DEPOSITOS_DE_POUPANCA"],
    "valor_depositos_prazo": ["VERBETE_432_DEPOSITOS_A_PRAZO"],
    "emprestimos_titulos_descontados": ["VERBETE_161_EMPRES_E_TIT_DESCONTADOS"],
    "financiamentos_gerais": ["VERBETE_162_FINANCIAMENTOS"],
    "financiamento_agropecuario": [
        "VERBETE_163_FIN_RURAIS_AGRICUL_CUST/INVEST",
        "VERBETE_164_FIN_RURAIS_PECUAR_CUST/INVEST",        # só layout <= 2022-11
        "VERBETE_165_FIN_RURAIS_AGRICUL_COMERCIALIZ",        # só layout <= 2022-11
        "VERBETE_166_FIN_RURAIS_PECUARIA_COMERCIALIZ",       # só layout <= 2022-11
        "VERBETE_167_FINANCIAMENTOS_AGROINDUSTRIAIS",        # layout >= 2022-12
        "VERBETE_167_FINANCIAMENTOS_AGROINDUSTRIAIS"
        "+VERBETE_168_RENDAS_A_APROPRIAR_FINANC_RURAIS_AGROINDUSTRIAIS",  # <= 2022-11
    ],
    "financiamentos_imobiliarios": ["VERBETE_169_FINANCIAMENTOS_IMOBILIARIOS"],
    "arrendamento_mercantil": ["VERBETE_180_ARRENDAMENTO_MERCANTIL"],
    "emprestimos_setor_publico": [],  # sem verbete equivalente — coluna fica 0.0
    "outros_creditos": ["VERBETE_172_OUTROS_CREDITOS"],
}
_ZERO = {coluna: 0.0 for coluna in MAPA_VERBETES}


def parse_estban_agencia(
    linhas,
    alvo: dict[tuple[str, str], int],
    alvo_ibge: dict[str, int] | None = None,
) -> dict:
    """CSV por agência de UMA competência → {"municipio": {mid: totais},
    "instituicao": {(mid, nome): totais}}. `alvo` = {(nome_norm, UF): mid};
    `alvo_ibge` = {codigo_ibge: mid} (match primário, via coluna CODMUN_IBGE)."""
    reader = csv.reader(linhas, delimiter=";")
    header = None
    for row in reader:
        if row and row[0].strip().upper().startswith("#DATA_BASE"):
            header = [c.strip() for c in row]
            break
    if header is None:
        raise ValueError("ESTBAN sem header #DATA_BASE — layout mudou?")
    idx = {c: i for i, c in enumerate(header)}
    for obrig in ("NOME_INSTITUICAO", "MUNICIPIO", "UF"):
        if obrig not in idx:
            raise ValueError(f"ESTBAN: coluna {obrig} ausente — layout mudou?")
    col_verbetes = {
        coluna: [idx[v] for v in verbetes if v in idx]
        for coluna, verbetes in MAPA_VERBETES.items()
    }
    if not col_verbetes["valor_operacoes_credito"]:
        raise ValueError("ESTBAN: verbete 160 (operações de crédito) ausente — layout mudou?")
    idx_ibge = idx.get("CODMUN_IBGE")
    alvo_ibge = alvo_ibge or {}

    municipio: dict[int, dict] = {}
    instituicao: dict[tuple[int, str], dict] = {}
    for row in reader:
        if len(row) < len(header) - 5:
            continue
        mid = None
        if idx_ibge is not None and idx_ibge < len(row):
            mid = alvo_ibge.get(row[idx_ibge].strip())
        if mid is None:
            mid = alvo.get(
                (norm_nome_municipio(row[idx["MUNICIPIO"]]), row[idx["UF"]].strip().upper())
            )
        if mid is None:
            continue
        nome_inst = row[idx["NOME_INSTITUICAO"]].strip()[:150]
        mun = municipio.setdefault(mid, {"qtd_agencias": 0, **_ZERO})
        inst = instituicao.setdefault((mid, nome_inst), {"qtd_agencias": 0, **_ZERO})
        mun["qtd_agencias"] += 1
        inst["qtd_agencias"] += 1
        for coluna, indices in col_verbetes.items():
            soma = sum(parse_valor_br(row[i]) or 0.0 for i in indices if i < len(row))
            mun[coluna] += soma
            inst[coluna] += soma
    return {"municipio": municipio, "instituicao": instituicao}


def _urls_por_anomes() -> dict[str, str]:
    """Listagem oficial → {'202603': url absoluta, ...}. Levanta RequestException
    se a API estiver fora — o chamador decide o fallback."""
    resp = requests.get(LISTA_URL, timeout=60, headers={"User-Agent": "Mozilla/5.0"})
    resp.raise_for_status()
    out: dict[str, str] = {}
    for entry in resp.json().get("conteudo", []):
        nome, url = (entry.get("Nome") or ""), (entry.get("Url") or "")
        if nome[:6].isdigit() and url:
            out[nome[:6]] = "https://www.bcb.gov.br" + url
    return out


def executar(db, municipios, anos=None, usuario_id=None, notificar=True, progresso=None) -> ResumoIngestao:
    from app.models.estban import EstbanMensal, EstbanPorInstituicao

    resumo = ResumoIngestao(dataset="estban")
    alvo = {(norm_nome_municipio(m.nome), m.estado.upper()): m.id for m in municipios}
    alvo_ibge = {
        m.codigo_ibge.strip(): m.id
        for m in municipios
        if m.codigo_ibge and m.codigo_ibge.strip().isdigit()
    }
    if not alvo:
        return resumo

    competencias = competencias_janela(anos=anos, inicio=INICIO_SERIE, meses_default=36)

    try:
        urls = _urls_por_anomes()
    except (requests.RequestException, ValueError) as exc:
        logger.warning("Listagem ESTBAN indisponível (%s); usando URL direta.", exc)
        urls = {}

    mids_ok: set[int] = set()
    for i, (ano, mes) in enumerate(competencias, start=1):
        anomes = f"{ano}{mes:02d}"
        data_ref = date(ano, mes, 1)
        if progresso:
            progresso(len(mids_ok), len(alvo), f"ESTBAN {anomes} ({i}/{len(competencias)})")
        if urls and anomes not in urls:
            # defasagem de publicação de ~60-90 dias — informação, não falha
            resumo.erros.append(f"ESTBAN {anomes}: ainda não publicado")
            continue
        with tempfile.TemporaryDirectory(prefix="estban_") as pasta:
            try:
                caminho = baixar_zip(
                    urls.get(anomes) or URL_DIRETA.format(anomes=anomes),
                    os.path.join(pasta, "estban.bin"),
                )
            except requests.RequestException as exc:
                resumo.erros.append(f"ESTBAN {anomes}: indisponível ({exc})")
                continue
            if zipfile.is_zipfile(caminho):
                with linhas_zip(caminho, encoding="latin-1") as linhas:
                    parsed = parse_estban_agencia(linhas, alvo, alvo_ibge)
            else:  # 2022-12 e 2023-01 são .csv puro na listagem do Bacen
                with open(caminho, encoding="latin-1", newline="") as linhas:
                    parsed = parse_estban_agencia(linhas, alvo, alvo_ibge)

        for mid, totais in parsed["municipio"].items():
            reg = (
                db.query(EstbanMensal)
                .filter(EstbanMensal.municipio_id == mid, EstbanMensal.data_referencia == data_ref)
                .first()
            )
            if reg:
                for coluna, valor in totais.items():
                    setattr(reg, coluna, valor)
            else:
                db.add(EstbanMensal(municipio_id=mid, data_referencia=data_ref, **totais))
            resumo.linhas += 1
            mids_ok.add(mid)
        # instituições: REPLACE por (município, competência) — bancos fecham agências
        mids_da_competencia = sorted({k[0] for k in parsed["instituicao"]})
        if mids_da_competencia:
            db.query(EstbanPorInstituicao).filter(
                EstbanPorInstituicao.municipio_id.in_(mids_da_competencia),
                EstbanPorInstituicao.data_referencia == data_ref,
            ).delete(synchronize_session=False)
        for (mid, nome_inst), totais in parsed["instituicao"].items():
            db.add(EstbanPorInstituicao(
                municipio_id=mid, data_referencia=data_ref, nome_instituicao=nome_inst, **totais
            ))
            resumo.linhas += 1
        db.commit()

    resumo.municipios_ok = len(mids_ok)
    faltantes = set(alvo.values()) - mids_ok
    resumo.municipios_erro += len(faltantes)
    if faltantes:
        nomes = {mid: f"{nome}/{uf}" for (nome, uf), mid in alvo.items()}
        for mid in sorted(faltantes):
            resumo.erros.append(f"{nomes.get(mid, mid)}: sem agências no ESTBAN na janela")
    return resumo


registrar(FonteAutomatica(
    key="estban",
    label="ESTBAN — estatística bancária (Bacen)",
    fonte="Banco Central — ESTBAN por agência, agregado por município e instituição",
    executar=executar,
))
