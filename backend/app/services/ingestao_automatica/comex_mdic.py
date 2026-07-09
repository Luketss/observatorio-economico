"""Fonte automática: comércio exterior por município (Comex Stat/MDIC).

CSVs anuais EXP/IMP_{ano}_MUN.csv (latin-1, ';', campos entre aspas) com
CO_MUN = código IBGE de 7 dígitos. Semântica REPLACE por (município, ano):
as 3 tabelas comex são agregados — upsert deixaria produtos/países que
saíram da pauta como lixo. `produto` recebe "SH4 — descrição" (via NCM_SH.csv)
e `pais` o nome em português (via PAIS.csv); anos legados não reprocessados
mantêm o formato antigo (código puro), sem duplicar dentro do mesmo ano."""
import csv
import io
import logging
from datetime import date

import requests

from app.services.ingestao_automatica.base import FonteAutomatica, ResumoIngestao, registrar

logger = logging.getLogger(__name__)

BASE_MUN = "https://balanca.economia.gov.br/balanca/bd/comexstat-bd/mun/{tipo}_{ano}_MUN.csv"
URL_PAIS = "https://balanca.economia.gov.br/balanca/bd/tabelas/PAIS.csv"
URL_SH = "https://balanca.economia.gov.br/balanca/bd/tabelas/NCM_SH.csv"
TIPOS = (("EXP", "export"), ("IMP", "import"))


def parse_comex_mun(linhas, ibge_para_mid: dict[str, int], tipo_operacao: str) -> dict:
    """CSV MUN (iterável de linhas) → agregados {mensal, por_produto, por_pais}.
    Chaves: mensal=(mid, ano, mes, tipo); por_produto=(mid, ano, tipo, sh4);
    por_pais=(mid, ano, tipo, co_pais). Códigos ficam crus aqui — a tradução
    para rótulos acontece no executar()."""
    reader = csv.reader(linhas, delimiter=";")
    header = next(reader, None)
    if header is None:
        raise ValueError("CSV MUN vazio")
    idx = {c.strip('"').strip(): i for i, c in enumerate(header)}
    faltando = [c for c in ("CO_ANO", "CO_MES", "SH4", "CO_PAIS", "CO_MUN", "KG_LIQUIDO", "VL_FOB") if c not in idx]
    if faltando:
        raise ValueError(f"CSV MUN: colunas ausentes {faltando} — layout mudou?")

    mensal: dict = {}
    por_produto: dict = {}
    por_pais: dict = {}
    for row in reader:
        try:
            mid = ibge_para_mid.get(row[idx["CO_MUN"]].strip('"').strip())
            if mid is None:
                continue
            ano = int(row[idx["CO_ANO"]].strip('"'))
            mes = int(row[idx["CO_MES"]].strip('"'))
            valor = float(row[idx["VL_FOB"]].strip('"') or 0)
            peso = float(row[idx["KG_LIQUIDO"]].strip('"') or 0)
            sh4 = row[idx["SH4"]].strip('"').strip()
            pais = row[idx["CO_PAIS"]].strip('"').strip()
        except (IndexError, ValueError):
            continue
        km = (mid, ano, mes, tipo_operacao)
        mensal.setdefault(km, {"valor_usd": 0.0, "peso_kg": 0.0})
        mensal[km]["valor_usd"] += valor
        mensal[km]["peso_kg"] += peso
        kp = (mid, ano, tipo_operacao, sh4)
        por_produto.setdefault(kp, {"valor_usd": 0.0, "peso_kg": 0.0})
        por_produto[kp]["valor_usd"] += valor
        por_produto[kp]["peso_kg"] += peso
        kc = (mid, ano, tipo_operacao, pais)
        por_pais.setdefault(kc, {"valor_usd": 0.0})
        por_pais[kc]["valor_usd"] += valor
    return {"mensal": mensal, "por_produto": por_produto, "por_pais": por_pais}


def _tabela_auxiliar(url: str, col_codigo: str, col_nome: str) -> dict[str, str]:
    resp = requests.get(url, timeout=120)
    resp.raise_for_status()
    reader = csv.reader(io.StringIO(resp.content.decode("latin-1")), delimiter=";")
    header = next(reader)
    idx = {c.strip('"').strip(): i for i, c in enumerate(header)}
    out: dict[str, str] = {}
    for row in reader:
        try:
            out[row[idx[col_codigo]].strip('"').strip()] = row[idx[col_nome]].strip('"').strip()
        except (IndexError, KeyError):
            continue
    return out


def executar(db, municipios, anos=None, usuario_id=None, notificar=True, progresso=None) -> ResumoIngestao:
    from app.models.comex import ComexMensal, ComexPorPais, ComexPorProduto
    from app.services.ingestao_automatica.populacao_ibge import codigo_ibge_valido

    resumo = ResumoIngestao(dataset="comex")
    alvo: dict[str, int] = {}
    for m in municipios:
        if codigo_ibge_valido(m.codigo_ibge):
            alvo[m.codigo_ibge.strip()] = m.id
        else:
            resumo.municipios_erro += 1
            resumo.erros.append(f"{m.nome}/{m.estado}: codigo_ibge ausente/inválido")
    if not alvo:
        return resumo

    if not anos:
        atual = date.today().year
        anos = [atual - 2, atual - 1, atual]
    anos = sorted(set(anos))

    if progresso:
        progresso(0, len(alvo), "baixando tabelas auxiliares (SH4, países)")
    nome_sh4 = _tabela_auxiliar(URL_SH, "CO_SH4", "NO_SH4_POR")
    nome_pais = _tabela_auxiliar(URL_PAIS, "CO_PAIS", "NO_PAIS")

    mensal: dict = {}
    por_produto: dict = {}
    por_pais: dict = {}
    for ano in anos:
        for sigla, tipo in TIPOS:
            if progresso:
                progresso(0, len(alvo), f"baixando {sigla} {ano}")
            try:
                resp = requests.get(BASE_MUN.format(tipo=sigla, ano=ano), timeout=(30, 600))
                resp.raise_for_status()
            except requests.RequestException as exc:
                resumo.erros.append(f"Comex {sigla} {ano}: {exc}")
                continue
            parsed = parse_comex_mun(
                io.StringIO(resp.content.decode("latin-1")), alvo, tipo
            )
            mensal.update(parsed["mensal"])
            por_produto.update(parsed["por_produto"])
            por_pais.update(parsed["por_pais"])

    todos_mids = sorted(set(alvo.values()))
    for i, mid in enumerate(todos_mids, start=1):
        if progresso:
            progresso(i, len(todos_mids), "gravando municípios")
        # REPLACE por (município, anos processados)
        for model in (ComexMensal, ComexPorProduto, ComexPorPais):
            db.query(model).filter(model.municipio_id == mid, model.ano.in_(anos)).delete(
                synchronize_session=False
            )
        for (m_id, ano, mes, tipo), tot in mensal.items():
            if m_id == mid:
                db.add(ComexMensal(municipio_id=mid, ano=ano, mes=mes, tipo_operacao=tipo, **tot))
                resumo.linhas += 1
        for (m_id, ano, tipo, sh4), tot in por_produto.items():
            if m_id == mid:
                rotulo = f"{sh4} — {nome_sh4.get(sh4, '')}".strip(" —")[:300]
                db.add(ComexPorProduto(municipio_id=mid, ano=ano, tipo_operacao=tipo, produto=rotulo, **tot))
                resumo.linhas += 1
        for (m_id, ano, tipo, pais), tot in por_pais.items():
            if m_id == mid:
                db.add(ComexPorPais(municipio_id=mid, ano=ano, tipo_operacao=tipo,
                                    pais=nome_pais.get(pais, pais)[:150], **tot))
                resumo.linhas += 1
        db.commit()
        resumo.municipios_ok += 1
        # município sem linha = sem comércio exterior (zero é dado, não erro)
    return resumo


registrar(FonteAutomatica(
    key="comex",
    label="Comércio Exterior (Comex Stat/MDIC)",
    fonte="MDIC — Comex Stat, exportações e importações por município (CSVs anuais MUN)",
    executar=executar,
))
