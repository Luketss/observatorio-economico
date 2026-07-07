"""Fonte automática: repasses mensais do FPM por município (STN).

Fonte: Tesouro Transparente, dataset "Transferências Obrigatórias da União -
por Município" — CSV único (~30 MB, latin-1, ';') com todos os municípios,
colunas por ano (1996→corrente) e uma linha por (município, mês). O CSV não
traz código IBGE (COD_MUN é código TCU), então o match é (nome normalizado,
UF). URL resolvida via API CKAN com fallback para a URL fixa do recurso.
Valores são o repasse BRUTO (antes de retenções como FUNDEB)."""
import csv
import io
import logging
import re
import unicodedata
from datetime import date

import requests

from app.services.ingestao_automatica.base import FonteAutomatica, ResumoIngestao, registrar

logger = logging.getLogger(__name__)

CKAN_PACKAGE_SHOW = (
    "https://www.tesourotransparente.gov.br/ckan/api/3/action/package_show"
    "?id=3b5a779d-78f5-4602-a6b7-23ece6d60f27"
)
FPM_CSV_URL_FALLBACK = (
    "https://www.tesourotransparente.gov.br/ckan/dataset/"
    "3b5a779d-78f5-4602-a6b7-23ece6d60f27/resource/"
    "d69ff32a-6681-4114-81f0-233bb6b17f58/download/fpm-por-municipio.csv"
)


def _parse_valor(s) -> float | None:
    s = (s or "").strip()
    if not s or set(s) <= {"-"}:
        return None
    try:
        return float(s.replace(".", "").replace(",", "."))
    except ValueError:
        return None


def _norm_nome(s) -> str:
    """Normaliza para casar a grafia IBGE do banco com a grafia histórica do
    CSV da STN: acentos, caixa, hífens/apóstrofos ('Passa-Vinte'), 'th'
    ('São Thomé das Letras') e s/z ('Brasópolis', 'Dona Eusébia'). As dobras
    são aplicadas nos DOIS lados do match, então grafias equivalentes do mesmo
    município convergem sem colapsar nomes realmente distintos."""
    s = unicodedata.normalize("NFD", s or "")
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    s = s.lower().replace("-", " ").replace("'", " ").replace("’", " ")
    s = re.sub(r"\s+", " ", s).strip()
    return s.replace("th", "t").replace("z", "s")


def parse_fpm_csv(
    texto: str,
    alvo: dict[tuple[str, str], int],
    anos: set[int] | None = None,
) -> dict[int, list[tuple[int, int, float]]]:
    """CSV da STN → {municipio_id: [(ano, mes, valor), ...]} apenas para os
    municípios em `alvo` ({(nome_norm, UF): municipio_id})."""
    reader = csv.reader(io.StringIO(texto), delimiter=";")
    header = None
    for row in reader:
        if row and row[0].strip().upper() == "COD_MUN":
            header = row
            break
    if header is None:
        raise ValueError("CSV da STN sem header COD_MUN — layout mudou?")

    colunas_ano = {
        i: int(c.strip()) for i, c in enumerate(header) if c.strip().isdigit()
    }
    out: dict[int, list[tuple[int, int, float]]] = {}
    for row in reader:
        if len(row) < 6:
            continue
        mid = alvo.get((_norm_nome(row[1]), (row[2] or "").strip().upper()))
        if mid is None:
            continue
        try:
            mes = int(row[4])
        except (ValueError, IndexError):
            continue
        for idx, ano in colunas_ano.items():
            if anos and ano not in anos:
                continue
            valor = _parse_valor(row[idx]) if idx < len(row) else None
            if valor is None:
                continue
            out.setdefault(mid, []).append((ano, mes, valor))
    return out


def _url_csv() -> str:
    try:
        resp = requests.get(CKAN_PACKAGE_SHOW, timeout=30)
        resp.raise_for_status()
        for recurso in resp.json()["result"]["resources"]:
            nome = (recurso.get("name") or "").upper()
            if "FPM" in nome and "CAPITAIS" not in nome:
                return recurso["url"]
    except (requests.RequestException, KeyError, ValueError) as exc:
        logger.warning("CKAN indisponível (%s); usando URL fixa do CSV.", exc)
    return FPM_CSV_URL_FALLBACK


def executar(db, municipios, anos=None, usuario_id=None, notificar=True) -> ResumoIngestao:
    from app.models.fpm import FpmMensal

    resumo = ResumoIngestao(dataset="fpm")
    alvo = {(_norm_nome(m.nome), m.estado.upper()): m.id for m in municipios}
    if not alvo:
        return resumo

    if not anos:
        ano_atual = date.today().year
        anos = {ano_atual - 2, ano_atual - 1, ano_atual}

    resp = requests.get(_url_csv(), timeout=300)
    resp.raise_for_status()
    texto = resp.content.decode("latin-1")

    por_municipio = parse_fpm_csv(texto, alvo, set(anos))

    for m in municipios:
        linhas = por_municipio.get(m.id)
        if not linhas:
            resumo.municipios_erro += 1
            resumo.erros.append(f"{m.nome}/{m.estado}: não encontrado no CSV da STN")
            continue
        existentes = {
            (r.ano, r.mes): r
            for r in db.query(FpmMensal).filter(FpmMensal.municipio_id == m.id).all()
        }
        for ano, mes, valor in linhas:
            reg = existentes.get((ano, mes))
            if reg:
                reg.valor = valor
            else:
                db.add(FpmMensal(municipio_id=m.id, ano=ano, mes=mes, valor=valor))
            resumo.linhas += 1
        resumo.municipios_ok += 1
        db.commit()
    return resumo


registrar(FonteAutomatica(
    key="fpm",
    label="FPM — repasses (STN)",
    fonte="STN / Tesouro Transparente — Transferências Obrigatórias da União por Município (valores brutos)",
    executar=executar,
))
