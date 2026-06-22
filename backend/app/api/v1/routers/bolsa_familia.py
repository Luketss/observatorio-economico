from typing import List

from app.api.deps import get_current_user, get_db, scoped_modulo
from app.models.bolsa_familia import BolsaFamiliaResumo as BFModel
from app.schemas.bolsa_familia import BolsaFamiliaSerieItem, BolsaFamiliaResumo
from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

router = APIRouter(prefix="/bolsa_familia", tags=["Bolsa Família"])


@router.get("/serie", response_model=List[BolsaFamiliaSerieItem])
def serie_bolsa_familia(
    mid: int | None = Depends(scoped_modulo("bolsa_familia")),
    db: Session = Depends(get_db),
):
    if mid is None:
        return []
    registros = (
        db.query(BFModel)
        .filter(BFModel.municipio_id == mid)
        .order_by(BFModel.ano, BFModel.mes)
        .all()
    )
    return [
        BolsaFamiliaSerieItem(
            ano=r.ano,
            mes=r.mes,
            total_beneficiarios=r.total_beneficiarios,
            valor_total=r.valor_total,
            valor_bolsa=r.valor_bolsa,
            valor_primeira_infancia=r.valor_primeira_infancia,
            beneficiarios_primeira_infancia=r.beneficiarios_primeira_infancia,
        )
        for r in registros
    ]


@router.get("/resumo", response_model=BolsaFamiliaResumo)
def resumo_bolsa_familia(
    mid: int | None = Depends(scoped_modulo("bolsa_familia")),
    db: Session = Depends(get_db),
):
    if mid is None:
        return BolsaFamiliaResumo(
            total_beneficiarios=0, valor_total=0, valor_bolsa=0,
            valor_primeira_infancia=0, beneficiarios_primeira_infancia=0,
        )
    row = (
        db.query(
            func.coalesce(func.sum(BFModel.total_beneficiarios), 0),
            func.coalesce(func.sum(BFModel.valor_total), 0),
            func.coalesce(func.sum(BFModel.valor_bolsa), 0),
            func.coalesce(func.sum(BFModel.valor_primeira_infancia), 0),
            func.coalesce(func.sum(BFModel.beneficiarios_primeira_infancia), 0),
        )
        .filter(BFModel.municipio_id == mid)
        .one()
    )
    return BolsaFamiliaResumo(
        total_beneficiarios=int(row[0] or 0),
        valor_total=row[1] or 0,
        valor_bolsa=row[2] or 0,
        valor_primeira_infancia=row[3] or 0,
        beneficiarios_primeira_infancia=int(row[4] or 0),
    )


@router.get("/comparativo")
def comparativo_bolsa_familia(
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
            func.sum(BFModel.valor_total).label("valor_total"),
        )
        .join(BFModel, BFModel.municipio_id == Municipio.id)
        .filter(Municipio.is_demo.is_(False))
    )
    if ano:
        query = query.filter(BFModel.ano == ano)
    if estado:
        query = query.filter(Municipio.estado == estado.upper())
    resultados = (
        query.group_by(Municipio.nome, Municipio.id, Municipio.estado)
        .order_by(func.sum(BFModel.valor_total).desc())
        .all()
    )
    return [
        {"municipio": r.municipio, "municipio_id": r.municipio_id, "estado": r.estado, "valor_total": r.valor_total or 0}
        for r in resultados
    ]
