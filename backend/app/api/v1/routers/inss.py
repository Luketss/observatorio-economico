from typing import List

from app.api.deps import get_current_user, get_db
from app.models.inss import InssAnual
from app.schemas.inss import InssItem, InssResumo
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

router = APIRouter(prefix="/inss", tags=["INSS"])


@router.get("/serie", response_model=List[InssItem])
def serie_inss(db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    query = db.query(InssAnual)
    if current_user.role.nome != "ADMIN_GLOBAL":
        query = query.filter(InssAnual.municipio_id == current_user.municipio_id)
    registros = query.order_by(InssAnual.ano, InssAnual.categoria).all()
    return [
        InssItem(
            ano=r.ano,
            categoria=r.categoria,
            quantidade_beneficios=r.quantidade_beneficios,
            valor_anual=r.valor_anual,
        )
        for r in registros
    ]


@router.get("/resumo", response_model=InssResumo)
def resumo_inss(db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    query = db.query(InssAnual)
    if current_user.role.nome != "ADMIN_GLOBAL":
        query = query.filter(InssAnual.municipio_id == current_user.municipio_id)
    registros = query.all()
    return InssResumo(
        total_beneficios=sum(r.quantidade_beneficios for r in registros),
        valor_total=sum(r.valor_anual for r in registros),
    )
