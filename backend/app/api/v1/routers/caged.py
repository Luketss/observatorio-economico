from typing import List

from app.api.deps import get_current_user, get_db
from app.models.caged import CagedMovimentacao, CagedPorCnae, CagedPorRaca, CagedPorSexo, CagedSalario
from app.schemas.caged import (
    CagedCnaeItem,
    CagedItem,
    CagedRacaItem,
    CagedResumo,
    CagedSalarioItem,
    CagedSexoItem,
)
from fastapi import APIRouter, Depends, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

router = APIRouter(prefix="/caged", tags=["CAGED"])


def _municipio_filter(query, model, current_user):
    if current_user.role.nome != "ADMIN_GLOBAL":
        query = query.filter(model.municipio_id == current_user.municipio_id)
    return query


@router.get("/serie", response_model=List[CagedItem])
def serie_caged(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    query = _municipio_filter(db.query(CagedMovimentacao), CagedMovimentacao, current_user)
    return query.order_by(CagedMovimentacao.ano, CagedMovimentacao.mes).all()


@router.get("/resumo", response_model=CagedResumo)
def resumo_caged(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    query = db.query(
        func.sum(getattr(CagedMovimentacao, "admissões")).label("total_admissoes"),
        func.sum(CagedMovimentacao.desligamentos).label("total_desligamentos"),
        func.sum(CagedMovimentacao.saldo).label("saldo_total"),
    )
    query = _municipio_filter(query, CagedMovimentacao, current_user)
    resultado = query.one_or_none()

    if not resultado:
        return CagedResumo(total_admissoes=0, total_desligamentos=0, saldo_total=0)

    return CagedResumo(
        total_admissoes=resultado.total_admissoes or 0,
        total_desligamentos=resultado.total_desligamentos or 0,
        saldo_total=resultado.saldo_total or 0,
    )


@router.get("/por_sexo", response_model=List[CagedSexoItem])
def por_sexo(
    ano: int = Query(None),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    query = _municipio_filter(db.query(CagedPorSexo), CagedPorSexo, current_user)
    if ano:
        query = query.filter(CagedPorSexo.ano == ano)
    registros = query.order_by(CagedPorSexo.ano, CagedPorSexo.mes, CagedPorSexo.sexo).all()
    return [
        CagedSexoItem(
            ano=r.ano,
            mes=r.mes,
            sexo=r.sexo,
            admissoes=r.admissoes,
            desligamentos=r.desligamentos,
            saldo=r.saldo,
        )
        for r in registros
    ]


@router.get("/por_raca", response_model=List[CagedRacaItem])
def por_raca(
    ano: int = Query(None),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    query = _municipio_filter(db.query(CagedPorRaca), CagedPorRaca, current_user)
    if ano:
        query = query.filter(CagedPorRaca.ano == ano)
    registros = query.order_by(CagedPorRaca.ano, CagedPorRaca.mes, CagedPorRaca.raca_cor).all()
    return [
        CagedRacaItem(
            ano=r.ano,
            mes=r.mes,
            raca_cor=r.raca_cor,
            admissoes=r.admissoes,
            desligamentos=r.desligamentos,
            saldo=r.saldo,
        )
        for r in registros
    ]


@router.get("/salario", response_model=List[CagedSalarioItem])
def salario(
    ano: int = Query(None),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    query = _municipio_filter(db.query(CagedSalario), CagedSalario, current_user)
    if ano:
        query = query.filter(CagedSalario.ano == ano)
    registros = query.order_by(CagedSalario.ano, CagedSalario.mes).all()
    return [
        CagedSalarioItem(
            ano=r.ano,
            mes=r.mes,
            salario_medio_admissoes=r.salario_medio_admissoes,
            salario_medio_desligamentos=r.salario_medio_desligamentos,
        )
        for r in registros
    ]


@router.get("/por_cnae", response_model=List[CagedCnaeItem])
def por_cnae(
    ano: int = Query(None),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    query = _municipio_filter(db.query(CagedPorCnae), CagedPorCnae, current_user)
    if ano:
        query = query.filter(CagedPorCnae.ano == ano)
    registros = query.order_by(CagedPorCnae.ano, CagedPorCnae.mes, CagedPorCnae.secao).all()
    return [
        CagedCnaeItem(
            ano=r.ano,
            mes=r.mes,
            secao=r.secao,
            descricao_secao=r.descricao_secao,
            admissoes=r.admissoes,
            desligamentos=r.desligamentos,
            saldo=r.saldo,
        )
        for r in registros
    ]
