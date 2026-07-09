"""Fonte automática: estatísticas de transações PIX por município (BCB/Olinda).

Um request JSON por competência (payload nacional, ~5,6k municípios) — os
campos do recurso TransacoesPixPorMunicipio mapeiam 1:1 nas colunas de
pix_mensal. Competência sem publicação retorna value vazio (não é erro).

NOTA (validado em 2026-07-09, ver Step 1 do task-7-brief): o parâmetro de
função `DataBase=@DataBase` do OData NÃO filtra a competência no servidor —
requests idênticos retornam AnoMes distintos e não-determinísticos a cada
chamada. O filtro que de fato funciona é `$filter=AnoMes eq {anomes}`
(confirmado: payload nacional completo, todas as linhas com o AnoMes pedido,
sem @odata.nextLink pois ~5,6k < $top=10000). Mantemos o parâmetro DataBase
na URL porque a função OData o exige (Nullable=false), mas quem garante a
competência correta é o $filter."""
import logging

import requests

from app.services.ingestao_automatica.base import FonteAutomatica, ResumoIngestao, registrar
from app.services.ingestao_automatica.util import competencias_janela

logger = logging.getLogger(__name__)

OLINDA_URL = (
    "https://olinda.bcb.gov.br/olinda/servico/Pix_DadosAbertos/versao/v1/odata/"
    "TransacoesPixPorMunicipio(DataBase=@DataBase)?@DataBase='{anomes}'"
    "&$filter=AnoMes%20eq%20{anomes}&$format=json&$top=10000"
)
# campo do payload Olinda → coluna do model PixMensal
CAMPOS = {
    "VL_PagadorPF": "vl_pagador_pf", "QT_PagadorPF": "qt_pagador_pf", "QT_PES_PagadorPF": "qt_pes_pagador_pf",
    "VL_PagadorPJ": "vl_pagador_pj", "QT_PagadorPJ": "qt_pagador_pj", "QT_PES_PagadorPJ": "qt_pes_pagador_pj",
    "VL_RecebedorPF": "vl_recebedor_pf", "QT_RecebedorPF": "qt_recebedor_pf", "QT_PES_RecebedorPF": "qt_pes_recebedor_pf",
    "VL_RecebedorPJ": "vl_recebedor_pj", "QT_RecebedorPJ": "qt_recebedor_pj", "QT_PES_RecebedorPJ": "qt_pes_recebedor_pj",
}
INICIO_SERIE = (2020, 11)  # primeiras estatísticas municipais do PIX


def _anomes_confere(item, anomes: int) -> bool:
    """AnoMes do item bate com a competência pedida? Ausente/não-numérico
    conta como mismatch (a API envia Edm.Int32; normalizamos os dois lados)."""
    try:
        return int(item.get("AnoMes")) == anomes
    except (TypeError, ValueError):
        return False


def parse_pix_olinda(valores, ibge_para_mid: dict[str, int], anomes: int | None = None) -> dict[int, dict]:
    """Lista `value` de UMA competência → {mid: {coluna_model: valor}}.

    Com `anomes`, descarta itens cujo AnoMes não bate — guarda client-side
    contra regressão do $filter do OData (o Step 1 provou que o parâmetro
    DataBase da API não filtra; se o $filter falhar um dia, sem esta guarda
    gravaríamos valores do mês errado sob a chave certa)."""
    out: dict[int, dict] = {}
    for item in valores or []:
        if anomes is not None and not _anomes_confere(item, int(anomes)):
            continue
        mid = ibge_para_mid.get(str(item.get("Municipio_Ibge") or "").strip())
        if mid is None:
            continue
        out[mid] = {coluna: item.get(campo) for campo, coluna in CAMPOS.items()}
    return out


_MAX_PAGINAS = 20


def _buscar_competencia(anomes: str) -> list:
    url = OLINDA_URL.format(anomes=anomes)
    valores: list = []
    paginas = 0
    while url:
        if paginas >= _MAX_PAGINAS:
            # ValueError audível de propósito (não capturado pelo executar):
            # nextLink em loop é comportamento anômalo da API e deve derrubar
            # o job, consistente com o padrão das outras fontes.
            raise ValueError(
                f"PIX {anomes}: paginação não terminou em {_MAX_PAGINAS} páginas — nextLink em loop?"
            )
        paginas += 1
        resp = requests.get(url, timeout=120)
        resp.raise_for_status()
        corpo = resp.json()
        valores.extend(corpo.get("value") or [])
        url = corpo.get("@odata.nextLink")
    return valores


def executar(db, municipios, anos=None, usuario_id=None, notificar=True, progresso=None) -> ResumoIngestao:
    from app.models.pix import PixMensal
    from app.services.ingestao_automatica.populacao_ibge import codigo_ibge_valido

    resumo = ResumoIngestao(dataset="pix")
    alvo: dict[str, int] = {}
    for m in municipios:
        if codigo_ibge_valido(m.codigo_ibge):
            alvo[m.codigo_ibge.strip()] = m.id
        else:
            resumo.municipios_erro += 1
            resumo.erros.append(f"{m.nome}/{m.estado}: codigo_ibge ausente/inválido")
    if not alvo:
        return resumo

    competencias = competencias_janela(anos=anos, inicio=INICIO_SERIE, meses_default=36)
    mids_ok: set[int] = set()
    for i, (ano, mes) in enumerate(competencias, start=1):
        anomes = f"{ano}{mes:02d}"
        if progresso:
            progresso(0, len(alvo), f"PIX {anomes} ({i}/{len(competencias)})")
        try:
            valores = _buscar_competencia(anomes)
        except requests.RequestException as exc:
            resumo.erros.append(f"PIX {anomes}: {exc}")
            continue
        anomes_int = int(anomes)
        descartados = sum(1 for item in valores if not _anomes_confere(item, anomes_int))
        if descartados:
            resumo.erros.append(f"PIX {anomes}: {descartados} linha(s) fora da competência descartada(s)")
        por_mid = parse_pix_olinda(valores, alvo, anomes=anomes_int)
        existentes = {
            r.municipio_id: r
            for r in db.query(PixMensal)
            .filter(PixMensal.municipio_id.in_(list(por_mid)), PixMensal.ano == ano, PixMensal.mes == mes)
            .all()
        } if por_mid else {}
        for mid, campos in por_mid.items():
            reg = existentes.get(mid)
            if reg:
                for coluna, valor in campos.items():
                    setattr(reg, coluna, valor)
            else:
                db.add(PixMensal(municipio_id=mid, ano=ano, mes=mes, **campos))
            resumo.linhas += 1
            mids_ok.add(mid)
        db.commit()
        if progresso:
            progresso(len(mids_ok), len(alvo), f"PIX {anomes} gravado")

    resumo.municipios_ok = len(mids_ok)
    resumo.municipios_erro += len(set(alvo.values()) - mids_ok)
    for codigo, mid in alvo.items():
        if mid not in mids_ok:
            resumo.erros.append(f"IBGE {codigo}: sem dados PIX na janela")
    return resumo


registrar(FonteAutomatica(
    key="pix",
    label="PIX — transações por município (BCB)",
    fonte="Banco Central — Estatísticas do PIX por município (API Olinda)",
    executar=executar,
))
