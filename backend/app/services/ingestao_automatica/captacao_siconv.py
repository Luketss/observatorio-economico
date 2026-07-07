"""Fonte automática: captação federal por município (SICONV/Transferegov).

Fonte: repositorio.dados.gov.br/seges/detru/ — CSVs nacionais diários, sem
auth, UTF-8 com BOM, ';'. O join é ID_PROPOSTA (proposta→convênio/emenda) e
NR_CONVENIO (desembolso); o município vem de COD_MUNIC_IBGE na proposta,
filtrando NATUREZA_JURIDICA "Administração Pública Municipal" (captação da
prefeitura, não de ONGs/estado no território). Métrica: VL_REPASSE_CONV dos
convênios assinados (IND_ASSINADO=SIM) no ano da coluna ANO."""
import csv
import logging
from dataclasses import dataclass, field

from app.services.ingestao_automatica.util import indices_colunas, parse_valor_br

logger = logging.getLogger(__name__)

BASE_URL = "http://repositorio.dados.gov.br/seges/detru/"
ANO_INICIO_PADRAO = 2019
NATUREZA_MUNICIPAL = "Administração Pública Municipal"


def parse_proposta_csv(linhas, ibge_para_mid: dict[str, int]) -> dict[str, int]:
    """siconv_proposta.csv → {ID_PROPOSTA: municipio_id}. Mantém só propostas de
    Adm. Pública Municipal dos municípios-alvo — o CSV nacional tem ~750 MB
    descomprimidos, então o dicionário fica pequeno e o resto é descartado."""
    reader = csv.reader(linhas, delimiter=";")
    header = next(reader, None)
    if header is None:
        raise ValueError("siconv_proposta.csv vazio")
    idx = indices_colunas(header, ["ID_PROPOSTA", "COD_MUNIC_IBGE", "NATUREZA_JURIDICA"],
                          "siconv_proposta.csv")
    out: dict[str, int] = {}
    for row in reader:
        try:
            if row[idx["NATUREZA_JURIDICA"]].strip() != NATUREZA_MUNICIPAL:
                continue
            mid = ibge_para_mid.get(row[idx["COD_MUNIC_IBGE"]].strip())
            if mid is not None:
                out[row[idx["ID_PROPOSTA"]].strip()] = mid
        except IndexError:
            continue
    return out


@dataclass
class ConveniosParse:
    # (municipio_id, ano) → {"firmado": soma VL_REPASSE_CONV, "qtd": nº convênios}
    por_municipio_ano: dict = field(default_factory=dict)
    # ID_PROPOSTA → (mid, ano de assinatura) — só assinados na janela (p/ emendas)
    ano_por_proposta: dict = field(default_factory=dict)
    # NR_CONVENIO → mid — todos os assinados, qualquer ano (p/ desembolso)
    mid_por_convenio: dict = field(default_factory=dict)


def parse_convenio_csv(linhas, proposta_para_mid: dict[str, int], anos: set[int]) -> ConveniosParse:
    reader = csv.reader(linhas, delimiter=";")
    header = next(reader, None)
    if header is None:
        raise ValueError("siconv_convenio.csv vazio")
    idx = indices_colunas(header, ["NR_CONVENIO", "ID_PROPOSTA", "ANO", "IND_ASSINADO",
                                   "VL_REPASSE_CONV"], "siconv_convenio.csv")
    out = ConveniosParse()
    for row in reader:
        try:
            id_proposta = row[idx["ID_PROPOSTA"]].strip()
            mid = proposta_para_mid.get(id_proposta)
            if mid is None or row[idx["IND_ASSINADO"]].strip().upper() != "SIM":
                continue
            ano = int(row[idx["ANO"]])
        except (IndexError, ValueError):
            continue
        out.mid_por_convenio[row[idx["NR_CONVENIO"]].strip()] = mid
        if ano not in anos:
            continue
        valor = parse_valor_br(row[idx["VL_REPASSE_CONV"]]) or 0.0
        item = out.por_municipio_ano.setdefault((mid, ano), {"firmado": 0.0, "qtd": 0})
        item["firmado"] += valor
        item["qtd"] += 1
        out.ano_por_proposta[id_proposta] = (mid, ano)
    return out


def parse_emenda_csv(linhas, ano_por_proposta: dict[str, tuple[int, int]]) -> dict[tuple[int, int], float]:
    """siconv_emenda.csv → {(mid, ano de assinatura do convênio): valor via emenda}."""
    reader = csv.reader(linhas, delimiter=";")
    header = next(reader, None)
    if header is None:
        raise ValueError("siconv_emenda.csv vazio")
    idx = indices_colunas(header, ["ID_PROPOSTA", "VALOR_REPASSE_EMENDA"], "siconv_emenda.csv")
    out: dict[tuple[int, int], float] = {}
    for row in reader:
        try:
            destino = ano_por_proposta.get(row[idx["ID_PROPOSTA"]].strip())
        except IndexError:
            continue
        if destino is None:
            continue
        out[destino] = out.get(destino, 0.0) + (parse_valor_br(row[idx["VALOR_REPASSE_EMENDA"]]) or 0.0)
    return out


def parse_desembolso_csv(linhas, mid_por_convenio: dict[str, int], anos: set[int]) -> dict[tuple[int, int], float]:
    """siconv_desembolso.csv → {(mid, ANO_DESEMBOLSO): total desembolsado} —
    dinheiro que ENTROU no ano, inclusive de convênios assinados antes da janela."""
    reader = csv.reader(linhas, delimiter=";")
    header = next(reader, None)
    if header is None:
        raise ValueError("siconv_desembolso.csv vazio")
    idx = indices_colunas(header, ["NR_CONVENIO", "ANO_DESEMBOLSO", "VL_DESEMBOLSADO"],
                          "siconv_desembolso.csv")
    out: dict[tuple[int, int], float] = {}
    for row in reader:
        try:
            mid = mid_por_convenio.get(row[idx["NR_CONVENIO"]].strip())
            if mid is None:
                continue
            ano = int(row[idx["ANO_DESEMBOLSO"]])
        except (IndexError, ValueError):
            continue
        if ano not in anos:
            continue
        out[(mid, ano)] = out.get((mid, ano), 0.0) + (parse_valor_br(row[idx["VL_DESEMBOLSADO"]]) or 0.0)
    return out


def montar_registros(convenios: ConveniosParse,
                     via_emenda: dict[tuple[int, int], float],
                     desembolsos: dict[tuple[int, int], float]) -> list[dict]:
    """Une os agregados em linhas prontas para upsert em CaptacaoFederalAnual."""
    chaves = set(convenios.por_municipio_ano) | set(via_emenda) | set(desembolsos)
    registros = []
    for mid, ano in sorted(chaves):
        conv = convenios.por_municipio_ano.get((mid, ano), {"firmado": 0.0, "qtd": 0})
        registros.append({
            "municipio_id": mid,
            "ano": ano,
            "valor_firmado": round(conv["firmado"], 2),
            "qtd_convenios": conv["qtd"],
            "valor_via_emenda": round(via_emenda.get((mid, ano), 0.0), 2),
            "valor_desembolsado": round(desembolsos.get((mid, ano), 0.0), 2),
        })
    return registros
