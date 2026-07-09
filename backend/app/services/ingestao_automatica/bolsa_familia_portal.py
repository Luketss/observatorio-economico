"""Fonte automática: Bolsa Família / Auxílio Brasil por município (Portal da
Transparência).

ZIP mensal NACIONAL com 1 linha por parcela/NIS (latin-1, ';') — centenas de
MB; o parse é streaming e só acumula agregados dos municípios-alvo. Sem
código IBGE no arquivo — match (nome normalizado, UF). Regra da primeira
infância portada de coleta.py: só no Novo Bolsa Família (>= 2023-03).
Upsert por (município, competência); reexecução é idempotente."""
import logging
import os
import tempfile
from datetime import date

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

URL_AUXILIO_BRASIL = "https://portaldatransparencia.gov.br/download-de-dados/auxilio-brasil/{anomes}"
URL_NOVO_BOLSA = "https://portaldatransparencia.gov.br/download-de-dados/novo-bolsa-familia/{anomes}"
INICIO_SERIE = (2022, 1)
INICIO_NOVO_BOLSA = (2023, 3)

_COLS = ["MÊS COMPETÊNCIA", "UF", "NOME MUNICÍPIO", "VALOR PARCELA"]


def calcular_primeira_infancia(valor: float) -> float:
    """Benefício Primeira Infância embutido na parcela (coleta.py:172-181):
    acima de R$600, o excedente em múltiplos de R$150."""
    return int((valor - 600) // 150) * 150.0 if valor > 600 else 0.0


def parse_bolsa_familia_csv(linhas, alvo: dict[tuple[str, str], int], eh_novo_bolsa: bool) -> dict[int, dict]:
    """CSV de UMA competência → {mid: agregado BolsaFamiliaResumo (sem
    municipio_id/ano/mes)}. Streaming: uma linha por vez."""
    import csv

    reader = csv.reader(linhas, delimiter=";")
    header = next(reader, None)
    if header is None:
        raise ValueError("CSV do Bolsa Família vazio")
    idx = indices_colunas([c.strip() for c in header], _COLS, "bolsa_familia")

    out: dict[int, dict] = {}
    for row in reader:
        try:
            mid = alvo.get((norm_nome_municipio(row[idx["NOME MUNICÍPIO"]]), row[idx["UF"]].strip().upper()))
            if mid is None:
                continue
            valor = parse_valor_br(row[idx["VALOR PARCELA"]]) or 0.0
        except IndexError:
            continue
        agg = out.setdefault(mid, {
            "total_beneficiarios": 0, "valor_total": 0.0, "valor_bolsa": 0.0,
            "valor_primeira_infancia": 0.0, "beneficiarios_primeira_infancia": 0,
        })
        pi = calcular_primeira_infancia(valor) if eh_novo_bolsa else 0.0
        agg["total_beneficiarios"] += 1
        agg["valor_total"] += valor
        agg["valor_primeira_infancia"] += pi
        agg["valor_bolsa"] += valor - pi
        if pi > 0:
            agg["beneficiarios_primeira_infancia"] += 1
    return out


def executar(db, municipios, anos=None, usuario_id=None, notificar=True, progresso=None) -> ResumoIngestao:
    from app.models.bolsa_familia import BolsaFamiliaResumo

    resumo = ResumoIngestao(dataset="bolsa_familia")
    alvo = {(norm_nome_municipio(m.nome), m.estado.upper()): m.id for m in municipios}
    if not alvo:
        return resumo

    competencias = competencias_janela(anos=anos, inicio=INICIO_SERIE, meses_default=12)
    mids_ok: set[int] = set()
    for i, (ano, mes) in enumerate(competencias, start=1):
        anomes = f"{ano}{mes:02d}"
        eh_novo = (ano, mes) >= INICIO_NOVO_BOLSA
        url = (URL_NOVO_BOLSA if eh_novo else URL_AUXILIO_BRASIL).format(anomes=anomes)
        if progresso:
            progresso(len(mids_ok), len(alvo), f"baixando {anomes} ({i}/{len(competencias)})")
        with tempfile.TemporaryDirectory(prefix="bf_") as pasta:
            try:
                caminho = baixar_zip(url, os.path.join(pasta, "bf.zip"))
                with linhas_zip(caminho, encoding="latin-1") as linhas:
                    por_mid = parse_bolsa_familia_csv(linhas, alvo, eh_novo)
            except requests.RequestException as exc:
                resumo.erros.append(f"Bolsa Família {anomes}: indisponível ({exc})")
                continue

        for mid, agg in por_mid.items():
            agg = {k: round(v, 2) if isinstance(v, float) else v for k, v in agg.items()}
            reg = (
                db.query(BolsaFamiliaResumo)
                .filter(BolsaFamiliaResumo.municipio_id == mid,
                        BolsaFamiliaResumo.ano == ano, BolsaFamiliaResumo.mes == mes)
                .first()
            )
            if reg:
                for coluna, valor in agg.items():
                    setattr(reg, coluna, valor)
            else:
                db.add(BolsaFamiliaResumo(municipio_id=mid, ano=ano, mes=mes, **agg))
            resumo.linhas += 1
            mids_ok.add(mid)
        db.commit()
        if progresso:
            progresso(len(mids_ok), len(alvo), f"{anomes} gravado")

    resumo.municipios_ok = len(mids_ok)
    faltantes = set(alvo.values()) - mids_ok
    resumo.municipios_erro += len(faltantes)
    if faltantes:
        nomes = {mid: f"{nome}/{uf}" for (nome, uf), mid in alvo.items()}
        for mid in sorted(faltantes):
            resumo.erros.append(f"{nomes.get(mid, mid)}: não encontrado nos CSVs do Portal")
    return resumo


registrar(FonteAutomatica(
    key="bolsa_familia",
    label="Bolsa Família (Portal da Transparência)",
    fonte="Portal da Transparência/CGU — parcelas do Novo Bolsa Família e Auxílio Brasil, agregadas por município",
    executar=executar,
))
