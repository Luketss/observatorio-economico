from typing import List

from app.api.deps import get_current_user, get_db
from app.models.rais import RaisVinculo
from app.schemas.rais import RaisItem, RaisResumo
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

router = APIRouter(prefix="/rais", tags=["RAIS"])


@router.get("/serie", response_model=List[RaisItem])
def serie_rais(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    query = db.query(RaisVinculo)

    if current_user.role.nome != "ADMIN_GLOBAL":
        query = query.filter(RaisVinculo.municipio_id == current_user.municipio_id)

    registros = query.order_by(RaisVinculo.ano).all()

    return [
        RaisItem(
            ano=r.ano,
            total_vinculos=r.total_vinculos,
            setor=r.setor,
        )
        for r in registros
    ]


@router.get("/resumo", response_model=RaisResumo)
def resumo_rais(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    query = db.query(RaisVinculo)

    if current_user.role.nome != "ADMIN_GLOBAL":
        query = query.filter(RaisVinculo.municipio_id == current_user.municipio_id)

    registros = query.all()

    total = sum(r.total_vinculos for r in registros)

    return RaisResumo(total_vinculos=total)
