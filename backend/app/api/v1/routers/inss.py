from typing import List

from app.api.deps import get_current_user, get_db, scoped_modulo
from app.models.inss import InssAnual
from app.schemas.inss import InssItem, InssResumo
from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

router = APIRouter(prefix="/inss", tags=["INSS"])


@router.get("/serie", response_model=List[InssItem])
def serie_inss(
    mid: int | None = Depends(scoped_modulo("inss")),
    db: Session = Depends(get_db),
):
    if mid is None:
        return []
    registros = (
        db.query(InssAnual)
        .filter(InssAnual.municipio_id == mid)
        .order_by(InssAnual.ano, InssAnual.categoria)
        .all()
    )
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
def resumo_inss(
    mid: int | None = Depends(scoped_modulo("inss")),
    db: Session = Depends(get_db),
):
    if mid is None:
        return InssResumo(total_beneficios=0, valor_total=0)
    row = (
        db.query(
            func.coalesce(func.sum(InssAnual.quantidade_beneficios), 0),
            func.coalesce(func.sum(InssAnual.valor_anual), 0),
        )
        .filter(InssAnual.municipio_id == mid)
        .one()
    )
    return InssResumo(total_beneficios=int(row[0] or 0), valor_total=row[1] or 0)


@router.get("/comparativo")
def comparativo_inss(
    ano: int | None = None,
    estado: str | None = None,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    from app.models.municipio import Municipio
    from sqlalchemy import func

    query = (
        db.query(
            Municipio.nome.label("municipio"),
            Municipio.id.label("municipio_id"),
            Municipio.estado.label("estado"),
            func.sum(InssAnual.valor_anual).label("valor_total"),
        )
        .join(InssAnual, InssAnual.municipio_id == Municipio.id)
        .filter(Municipio.is_demo.is_(False))
    )
    if ano:
        query = query.filter(InssAnual.ano == ano)
    if estado:
        query = query.filter(Municipio.estado == estado.upper())
    resultados = (
        query.group_by(Municipio.nome, Municipio.id, Municipio.estado)
        .order_by(func.sum(InssAnual.valor_anual).desc())
        .all()
    )
    return [
        {"municipio": r.municipio, "municipio_id": r.municipio_id, "estado": r.estado, "valor_total": r.valor_total or 0}
        for r in resultados
    ]
