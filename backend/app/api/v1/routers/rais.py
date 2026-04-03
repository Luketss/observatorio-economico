from typing import List

from app.api.deps import get_current_user, get_db
from app.models.rais import (
    RaisVinculo, RaisPorCnae, RaisPorRaca, RaisPorSexo,
    RaisPorFaixaEtaria, RaisPorEscolaridade, RaisPorFaixaRemuneracao,
    RaisPorFaixaTempoEmprego, RaisMetricasAnuais,
)
from app.schemas.rais import (
    RaisCnaeItem, RaisItem, RaisRacaItem, RaisResumo, RaisSexoItem,
    RaisFaixaEtariaItem, RaisEscolaridadeItem, RaisFaixaRemuneracaoItem,
    RaisFaixaTempoEmpregoItem, RaisMetricasAnuaisItem,
)
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

router = APIRouter(prefix="/rais", tags=["RAIS"])


def _municipio_filter(query, model, current_user):
    if current_user.role.nome != "ADMIN_GLOBAL":
        query = query.filter(model.municipio_id == current_user.municipio_id)
    return query


@router.get("/serie", response_model=List[RaisItem])
def serie_rais(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    query = _municipio_filter(db.query(RaisVinculo), RaisVinculo, current_user)
    registros = query.order_by(RaisVinculo.ano).all()
    return [
        RaisItem(
            ano=r.ano,
            total_vinculos=r.total_vinculos,
            setor=r.setor,
            remuneracao_media=r.remuneracao_media,
        )
        for r in registros
    ]


@router.get("/resumo", response_model=RaisResumo)
def resumo_rais(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    query = _municipio_filter(db.query(RaisVinculo), RaisVinculo, current_user)
    registros = query.all()
    total = sum(r.total_vinculos for r in registros)
    rem_lista = [r.remuneracao_media for r in registros if r.remuneracao_media]
    rem_media = sum(rem_lista) / len(rem_lista) if rem_lista else None
    return RaisResumo(total_vinculos=total, remuneracao_media=rem_media)


@router.get("/por_sexo", response_model=List[RaisSexoItem])
def por_sexo(
    ano: int = Query(None),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    query = _municipio_filter(db.query(RaisPorSexo), RaisPorSexo, current_user)
    if ano:
        query = query.filter(RaisPorSexo.ano == ano)
    registros = query.order_by(RaisPorSexo.ano, RaisPorSexo.sexo).all()
    return [
        RaisSexoItem(
            ano=r.ano,
            sexo=r.sexo,
            total_vinculos=r.total_vinculos,
            remuneracao_media=r.remuneracao_media,
        )
        for r in registros
    ]


@router.get("/por_raca", response_model=List[RaisRacaItem])
def por_raca(
    ano: int = Query(None),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    query = _municipio_filter(db.query(RaisPorRaca), RaisPorRaca, current_user)
    if ano:
        query = query.filter(RaisPorRaca.ano == ano)
    registros = query.order_by(RaisPorRaca.ano, RaisPorRaca.raca_cor).all()
    return [
        RaisRacaItem(
            ano=r.ano,
            raca_cor=r.raca_cor,
            total_vinculos=r.total_vinculos,
            remuneracao_media=r.remuneracao_media,
        )
        for r in registros
    ]


@router.get("/por_cnae", response_model=List[RaisCnaeItem])
def por_cnae(
    ano: int = Query(None),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    query = _municipio_filter(db.query(RaisPorCnae), RaisPorCnae, current_user)
    if ano:
        query = query.filter(RaisPorCnae.ano == ano)
    registros = query.order_by(RaisPorCnae.ano, RaisPorCnae.secao).all()
    return [
        RaisCnaeItem(
            ano=r.ano,
            secao=r.secao,
            descricao_secao=r.descricao_secao,
            total_vinculos=r.total_vinculos,
            remuneracao_media=r.remuneracao_media,
        )
        for r in registros
    ]


@router.get("/por_faixa_etaria", response_model=List[RaisFaixaEtariaItem])
def por_faixa_etaria(
    ano: int = Query(None),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    query = _municipio_filter(db.query(RaisPorFaixaEtaria), RaisPorFaixaEtaria, current_user)
    if ano:
        query = query.filter(RaisPorFaixaEtaria.ano == ano)
    registros = query.order_by(RaisPorFaixaEtaria.ano, RaisPorFaixaEtaria.faixa_etaria).all()
    return [
        RaisFaixaEtariaItem(
            ano=r.ano,
            faixa_etaria=r.faixa_etaria,
            total_vinculos=r.total_vinculos,
            remuneracao_media=r.remuneracao_media,
        )
        for r in registros
    ]


@router.get("/por_escolaridade", response_model=List[RaisEscolaridadeItem])
def por_escolaridade(
    ano: int = Query(None),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    query = _municipio_filter(db.query(RaisPorEscolaridade), RaisPorEscolaridade, current_user)
    if ano:
        query = query.filter(RaisPorEscolaridade.ano == ano)
    registros = query.order_by(RaisPorEscolaridade.ano, RaisPorEscolaridade.grau_instrucao).all()
    return [
        RaisEscolaridadeItem(
            ano=r.ano,
            grau_instrucao=r.grau_instrucao,
            total_vinculos=r.total_vinculos,
            remuneracao_media=r.remuneracao_media,
        )
        for r in registros
    ]


@router.get("/por_faixa_remuneracao", response_model=List[RaisFaixaRemuneracaoItem])
def por_faixa_remuneracao(
    ano: int = Query(None),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    query = _municipio_filter(db.query(RaisPorFaixaRemuneracao), RaisPorFaixaRemuneracao, current_user)
    if ano:
        query = query.filter(RaisPorFaixaRemuneracao.ano == ano)
    registros = query.order_by(RaisPorFaixaRemuneracao.ano, RaisPorFaixaRemuneracao.faixa_remuneracao_sm).all()
    return [
        RaisFaixaRemuneracaoItem(
            ano=r.ano,
            faixa_remuneracao_sm=r.faixa_remuneracao_sm,
            total_vinculos=r.total_vinculos,
        )
        for r in registros
    ]


@router.get("/por_faixa_tempo_emprego", response_model=List[RaisFaixaTempoEmpregoItem])
def por_faixa_tempo_emprego(
    ano: int = Query(None),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    query = _municipio_filter(db.query(RaisPorFaixaTempoEmprego), RaisPorFaixaTempoEmprego, current_user)
    if ano:
        query = query.filter(RaisPorFaixaTempoEmprego.ano == ano)
    registros = query.order_by(RaisPorFaixaTempoEmprego.ano, RaisPorFaixaTempoEmprego.faixa_tempo_emprego).all()
    return [
        RaisFaixaTempoEmpregoItem(
            ano=r.ano,
            faixa_tempo_emprego=r.faixa_tempo_emprego,
            total_vinculos=r.total_vinculos,
        )
        for r in registros
    ]


@router.get("/metricas_anuais", response_model=List[RaisMetricasAnuaisItem])
def metricas_anuais(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    query = _municipio_filter(db.query(RaisMetricasAnuais), RaisMetricasAnuais, current_user)
    registros = query.order_by(RaisMetricasAnuais.ano).all()
    return [
        RaisMetricasAnuaisItem(
            ano=r.ano,
            total_vinculos=r.total_vinculos,
            total_pcd=r.total_pcd,
            total_outro_municipio=r.total_outro_municipio,
            media_dias_afastamento=r.media_dias_afastamento,
        )
        for r in registros
    ]
