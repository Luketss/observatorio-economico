from typing import List

from app.api.deps import get_current_user, get_db
from app.models.caged import CagedMovimentacao
from app.schemas.caged import CagedItem, CagedResumo
from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

router = APIRouter(prefix="/caged", tags=["CAGED"])


@router.get("/serie", response_model=List[CagedItem])
def serie_caged(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    query = db.query(CagedMovimentacao)

    # Multi-tenant filter
    if current_user.role.nome != "ADMIN_GLOBAL":
        query = query.filter(
            CagedMovimentacao.municipio_id == current_user.municipio_id
        )

    registros = query.order_by(CagedMovimentacao.ano, CagedMovimentacao.mes).all()

    return registros


@router.get("/resumo", response_model=CagedResumo)
def resumo_caged(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    query = db.query(
        func.sum(CagedMovimentacao.admissoes).label("total_admissoes"),
        func.sum(CagedMovimentacao.desligamentos).label("total_desligamentos"),
        func.sum(CagedMovimentacao.saldo).label("saldo_total"),
    )

    # Multi-tenant filter
    if current_user.role.nome != "ADMIN_GLOBAL":
        query = query.filter(
            CagedMovimentacao.municipio_id == current_user.municipio_id
        )

    resultado = query.one()

    return CagedResumo(
        total_admissoes=resultado.total_admissoes or 0,
        total_desligamentos=resultado.total_desligamentos or 0,
        saldo_total=resultado.saldo_total or 0,
    )
