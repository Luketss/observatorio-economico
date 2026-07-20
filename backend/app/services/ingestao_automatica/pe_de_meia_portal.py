"""Fonte automática: Pé-de-Meia por município (Portal da Transparência).

ZIP mensal nacional (latin-1, ';'), 1 linha por beneficiário, desde 2024-01.
Parse streaming agregando só os municípios-alvo (match nome+UF). Resumo:
upsert por (município, competência). Etapas: REPLACE por (município,
competência) — combinações (etapa, incentivo) mudam entre meses."""
import csv
import logging
import os
import tempfile

import requests

from app.services.ingestao_automatica.base import FonteAutomatica, ResumoIngestao, registrar
from app.services.ingestao_automatica.util import (
    baixar_zip,
    competencias_janela,
    indices_colunas,
    linhas_zip,
    norm_nome_municipio,
    parse_valor_br,
)

logger = logging.getLogger(__name__)

URL = "https://portaldatransparencia.gov.br/download-de-dados/pe-de-meia/{anomes}"
INICIO_SERIE = (2024, 1)

_COLS = ["MÊS REFERÊNCIA", "UF", "NOME MUNICÍPIO", "ETAPA ENSINO", "TIPO INCENTIVO", "VALOR PARCELA"]


def parse_pe_de_meia_csv(linhas, alvo: dict[tuple[str, str], int]) -> dict:
    """CSV de UMA competência → {"resumo": {mid: agg}, "etapa": {(mid, etapa,
    tipo): agg}}, agg = {total_estudantes, valor_total}."""
    reader = csv.reader(linhas, delimiter=";")
    header = next(reader, None)
    if header is None:
        raise ValueError("CSV do Pé-de-Meia vazio")
    idx = indices_colunas([c.strip() for c in header], _COLS, "pe_de_meia")

    resumo: dict[int, dict] = {}
    etapa: dict[tuple, dict] = {}
    for row in reader:
        try:
            mid = alvo.get((norm_nome_municipio(row[idx["NOME MUNICÍPIO"]]), row[idx["UF"]].strip().upper()))
            if mid is None:
                continue
            valor = parse_valor_br(row[idx["VALOR PARCELA"]]) or 0.0
            nome_etapa = row[idx["ETAPA ENSINO"]].strip()[:150]
            tipo = row[idx["TIPO INCENTIVO"]].strip()[:100]
        except IndexError:
            continue
        r = resumo.setdefault(mid, {"total_estudantes": 0, "valor_total": 0.0})
        r["total_estudantes"] += 1
        r["valor_total"] += valor
        e = etapa.setdefault((mid, nome_etapa, tipo), {"total_estudantes": 0, "valor_total": 0.0})
        e["total_estudantes"] += 1
        e["valor_total"] += valor
    return {"resumo": resumo, "etapa": etapa}


def executar(db, municipios, anos=None, usuario_id=None, notificar=True, progresso=None) -> ResumoIngestao:
    from app.models.pe_de_meia import PeDeMeiaEtapa, PeDeMeiaResumo

    resumo = ResumoIngestao(dataset="pe_de_meia")
    alvo = {(norm_nome_municipio(m.nome), m.estado.upper()): m.id for m in municipios}
    if not alvo:
        return resumo

    competencias = competencias_janela(anos=anos, inicio=INICIO_SERIE, meses_default=12)
    mids_ok: set[int] = set()
    for i, (ano, mes) in enumerate(competencias, start=1):
        anomes = f"{ano}{mes:02d}"
        if progresso:
            progresso(len(mids_ok), len(alvo), f"baixando {anomes} ({i}/{len(competencias)})")
        with tempfile.TemporaryDirectory(prefix="pm_") as pasta:
            try:
                caminho = baixar_zip(URL.format(anomes=anomes), os.path.join(pasta, "pm.zip"))
                with linhas_zip(caminho, encoding="latin-1") as linhas:
                    parsed = parse_pe_de_meia_csv(linhas, alvo)
            except requests.RequestException as exc:
                resumo.erros.append(f"Pé-de-Meia {anomes}: indisponível ({exc})")
                continue

        for mid, agg in parsed["resumo"].items():
            agg = {"total_estudantes": agg["total_estudantes"], "valor_total": round(agg["valor_total"], 2)}
            reg = (
                db.query(PeDeMeiaResumo)
                .filter(PeDeMeiaResumo.municipio_id == mid,
                        PeDeMeiaResumo.ano == ano, PeDeMeiaResumo.mes == mes)
                .first()
            )
            if reg:
                reg.total_estudantes = agg["total_estudantes"]
                reg.valor_total = agg["valor_total"]
            else:
                db.add(PeDeMeiaResumo(municipio_id=mid, ano=ano, mes=mes, **agg))
            resumo.linhas += 1
            mids_ok.add(mid)

        mids_da_competencia = list({k[0] for k in parsed["etapa"]})
        if mids_da_competencia:
            db.query(PeDeMeiaEtapa).filter(
                PeDeMeiaEtapa.municipio_id.in_(mids_da_competencia),
                PeDeMeiaEtapa.ano == ano, PeDeMeiaEtapa.mes == mes,
            ).delete(synchronize_session=False)
        for (mid, nome_etapa, tipo), agg in parsed["etapa"].items():
            db.add(PeDeMeiaEtapa(
                municipio_id=mid, ano=ano, mes=mes, etapa_ensino=nome_etapa,
                tipo_incentivo=tipo, total_estudantes=agg["total_estudantes"],
                valor_total=round(agg["valor_total"], 2),
            ))
            resumo.linhas += 1
        db.commit()

    resumo.municipios_ok = len(mids_ok)
    faltantes = set(alvo.values()) - mids_ok
    resumo.municipios_erro += len(faltantes)
    if faltantes:
        nomes = {mid: f"{nome}/{uf}" for (nome, uf), mid in alvo.items()}
        for mid in sorted(faltantes):
            resumo.erros.append(f"{nomes.get(mid, mid)}: não encontrado nos CSVs do Portal")
    return resumo


registrar(FonteAutomatica(
    key="pe_de_meia",
    label="Pé-de-Meia (Portal da Transparência)",
    fonte="Portal da Transparência/CGU — parcelas do Pé-de-Meia por beneficiário, agregadas por município",
    executar=executar,
))
