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


@router.get("/comparativo")
def comparativo_inss(
    ano: int | None = None,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    from app.models.municipio import Municipio
    from sqlalchemy import func

    query = (
        db.query(
            Municipio.nome.label("municipio"),
            Municipio.id.label("municipio_id"),
            func.sum(InssAnual.valor_anual).label("valor_total"),
        )
        .join(InssAnual, InssAnual.municipio_id == Municipio.id)
    )
    if ano:
        query = query.filter(InssAnual.ano == ano)
    resultados = (
        query.group_by(Municipio.nome, Municipio.id)
        .order_by(func.sum(InssAnual.valor_anual).desc())
        .all()
    )
    return [
        {"municipio": r.municipio, "municipio_id": r.municipio_id, "valor_total": r.valor_total or 0}
        for r in resultados
    ]
