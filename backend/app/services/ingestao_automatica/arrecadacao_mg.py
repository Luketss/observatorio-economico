"""Fonte automática: Arrecadação — repasses de impostos do Estado de MG aos
municípios (ICMS/IPVA/IPI).

Star schema Frictionless do CKAN dados.mg.gov.br (dataset
transferencia-de-impostos-a-municipios, que alimenta a consulta oficial da
Transparência-MG): fato ft_repasse_mun (~3,6 MB gz, 2007→mês corrente) +
dimensões dm_tempo_mensal e dm_municipio. CSVs gzip UTF-8 BOM ';'. Match por
código IBGE; territórios (códigos curtos) descartados. Upsert por
(município, ano, mês) — o Estado corrige o fato retroativamente. Fonte
MG-only: alvos de outra UF geram um aviso único."""
import csv
import gzip
import logging
from datetime import date

import requests

from app.services.ingestao_automatica.base import FonteAutomatica, ResumoIngestao, registrar

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
