"""Fonte automática: Arrecadação — repasses de impostos do Estado de MG aos
municípios (ICMS/IPVA/IPI).

Star schema Frictionless do CKAN dados.mg.gov.br (dataset
transferencia-de-impostos-a-municipios, que alimenta a consulta oficial da
Transparência-MG): fato ft_repasse_mun (~3,6 MB gz, 2007→mês corrente) +
dimensões dm_tempo_mensal e dm_municipio. CSVs gzip UTF-8 BOM ';'. Match por
código IBGE; territórios (códigos curtos) descartados. Upsert por
(município, ano, mês) — o Estado corrige o fato retroativamente. Fonte
MG-only: alvos de outra UF geram um aviso único. Registrada pelo roteador
arrecadacao.py (como executar_mg); não se registra mais sozinha."""
import csv
import gzip
import logging
from datetime import date

import requests

from app.services.ingestao_automatica.base import ResumoIngestao

logger = logging.getLogger(__name__)

CKAN_PACKAGE_SHOW = (
    "https://dados.mg.gov.br/api/3/action/package_show"
    "?id=transferencia-de-impostos-a-municipios"
)
_BASE_FALLBACK = "https://dados.mg.gov.br/dataset/5a849756-f55b-4399-860f-b9b08eca0f1a/resource"
URLS_FALLBACK = {
    "ft_repasse_mun": f"{_BASE_FALLBACK}/ebed720b-5c5e-4e38-878b-be800c6e9967/download/ft_repasse_mun.csv.gz",
    "dm_tempo_mensal": f"{_BASE_FALLBACK}/a3a38dfc-2724-4276-9e0f-0b98d4138f09/download/dm_tempo_mensal.csv.gz",
    "dm_municipio": f"{_BASE_FALLBACK}/bf4671ef-1131-497f-9580-e720bb8ad585/download/dm_municipio.csv.gz",
}

NOME_MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
              "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"]


def parse_dim_tempo(linhas) -> dict[str, tuple[int, int]]:
    """dm_tempo_mensal → {id_tempo: (ano, mes)}."""
    out: dict[str, tuple[int, int]] = {}
    for row in csv.DictReader(linhas, delimiter=";"):
        out[row["id_tempo"].strip()] = (int(row["ano"]), int(row["mes"]))
    return out


def parse_dim_municipio(linhas) -> dict[str, str]:
    """dm_municipio → {id_municipio: cd_municipio_ibge}, só municípios reais
    (código IBGE de 7 dígitos); territórios/agregados ficam de fora."""
    out: dict[str, str] = {}
    for row in csv.DictReader(linhas, delimiter=";"):
        codigo = (row.get("cd_municipio_ibge") or "").strip()
        if codigo.isdigit() and len(codigo) == 7:
            out[row["id_municipio"].strip()] = codigo
    return out


def _valor(campo) -> float:
    campo = (campo or "").strip()
    return float(campo) if campo else 0.0


def montar_repasses(linhas_fato, tempo, municipio_ibge, alvo: dict[str, int], anos=None) -> list[dict]:
    """Join fato × dims, filtrado pelos municípios-alvo (código IBGE → id) e
    opcionalmente por anos → dicts prontos para ArrecadacaoMensal."""
    anos_set = set(anos) if anos else None
    regs: list[dict] = []
    for row in csv.DictReader(linhas_fato, delimiter=";"):
        codigo = municipio_ibge.get(row["id_municipio"].strip())
        mid = alvo.get(codigo) if codigo else None
        if mid is None:
            continue
        par = tempo.get(row["id_tempo"].strip())
        if par is None:
            continue
        ano, mes = par
        if anos_set is not None and ano not in anos_set:
            continue
        icms, ipi, ipva = _valor(row["vr_icms"]), _valor(row["vr_ipi"]), _valor(row["vr_ipva"])
        regs.append({
            "municipio_id": mid,
            "ano": ano,
            "mes": mes,
            "nome_mes": NOME_MESES[mes - 1],
            "data_base": date(ano, mes, 1),
            "valor_icms": icms,
            "valor_ipva": ipva,
            "valor_ipi": ipi,
            "valor_total": round(icms + ipva + ipi, 2),
        })
    return regs


def _resolver_urls() -> dict[str, str]:
    """URLs dos 3 resources via API CKAN; cai para as URLs fixas se a API
    estiver fora (mesmo padrão da fonte FPM/STN)."""
    urls = dict(URLS_FALLBACK)
    try:
        resp = requests.get(CKAN_PACKAGE_SHOW, timeout=30, headers={"User-Agent": "Mozilla/5.0"})
        resp.raise_for_status()
        for recurso in resp.json()["result"]["resources"]:
            url = recurso.get("url") or ""
            for chave in urls:
                if chave in url:
                    urls[chave] = url
    except (requests.RequestException, KeyError, ValueError) as exc:
        logger.warning("CKAN de MG indisponível (%s); usando URLs fixas.", exc)
    return urls


def _baixar_gz_linhas(url: str) -> list[str]:
    resp = requests.get(url, timeout=(30, 300), headers={"User-Agent": "Mozilla/5.0"})
    resp.raise_for_status()
    return gzip.decompress(resp.content).decode("utf-8-sig").splitlines()


def executar_mg(db, municipios, anos=None, usuario_id=None, notificar=True, progresso=None) -> ResumoIngestao:
    from app.models.arrecadacao import ArrecadacaoMensal

    resumo = ResumoIngestao(dataset="arrecadacao")

    fora_mg = [m for m in municipios if (m.estado or "").upper() != "MG"]
    de_mg = [m for m in municipios if (m.estado or "").upper() == "MG"]
    if fora_mg:
        resumo.erros.append(
            f"fonte cobre apenas municípios de MG — {len(fora_mg)} município(s) de outra(s) UF ignorado(s)"
        )
        resumo.municipios_erro += len(fora_mg)

    alvo = {str(m.codigo_ibge).strip(): m.id for m in de_mg if m.codigo_ibge}
    for m in de_mg:
        if not m.codigo_ibge:
            resumo.erros.append(f"{m.nome}/{m.estado}: sem codigo_ibge cadastrado")
            resumo.municipios_erro += 1
    if not alvo:
        return resumo

    if progresso:
        progresso(0, len(alvo), "baixando repasses de MG (CKAN)")
    try:
        urls = _resolver_urls()
        tempo = parse_dim_tempo(_baixar_gz_linhas(urls["dm_tempo_mensal"]))
        municipio_ibge = parse_dim_municipio(_baixar_gz_linhas(urls["dm_municipio"]))
        linhas_fato = _baixar_gz_linhas(urls["ft_repasse_mun"])
    except requests.RequestException as exc:
        resumo.erros.append(f"repasses de MG: indisponível ({exc})")
        resumo.municipios_erro += len(alvo)
        return resumo

    if progresso:
        progresso(0, len(alvo), "cruzando fato × dimensões")
    regs = montar_repasses(linhas_fato, tempo, municipio_ibge, alvo, anos=anos)

    mids = {r["municipio_id"] for r in regs}
    existentes = {
        (r.municipio_id, r.ano, r.mes): r
        for r in db.query(ArrecadacaoMensal).filter(ArrecadacaoMensal.municipio_id.in_(mids)).all()
    } if mids else {}
    for r in regs:
        reg = existentes.get((r["municipio_id"], r["ano"], r["mes"]))
        if reg:
            for coluna, valor in r.items():
                setattr(reg, coluna, valor)
        else:
            db.add(ArrecadacaoMensal(**r))
        resumo.linhas += 1
    db.commit()

    resumo.municipios_ok = len(mids)
    faltantes = set(alvo.values()) - mids
    resumo.municipios_erro += len(faltantes)
    if faltantes:
        nomes = {m.id: f"{m.nome}/{m.estado}" for m in de_mg}
        for mid in sorted(faltantes):
            resumo.erros.append(f"{nomes.get(mid, mid)}: não encontrado nos repasses de MG")
    if progresso:
        progresso(len(mids), len(alvo), "repasses gravados")
    return resumo
