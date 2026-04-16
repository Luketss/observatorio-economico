from typing import List

from app.api.deps import get_current_user, get_db
from app.models.bolsa_familia import BolsaFamiliaResumo as BFModel
from app.schemas.bolsa_familia import BolsaFamiliaSerieItem, BolsaFamiliaResumo
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

router = APIRouter(prefix="/bolsa_familia", tags=["Bolsa Família"])


@router.get("/serie", response_model=List[BolsaFamiliaSerieItem])
def serie_bolsa_familia(db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    query = db.query(BFModel)
    if current_user.role.nome != "ADMIN_GLOBAL":
        query = query.filter(BFModel.municipio_id == current_user.municipio_id)
    registros = query.order_by(BFModel.ano, BFModel.mes).all()
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
def resumo_bolsa_familia(db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    query = db.query(BFModel)
    if current_user.role.nome != "ADMIN_GLOBAL":
        query = query.filter(BFModel.municipio_id == current_user.municipio_id)
    registros = query.all()
    return BolsaFamiliaResumo(
        total_beneficiarios=sum(r.total_beneficiarios for r in registros),
        valor_total=sum(r.valor_total for r in registros),
        valor_bolsa=sum(r.valor_bolsa for r in registros),
        valor_primeira_infancia=sum((r.valor_primeira_infancia or 0) for r in registros),
        beneficiarios_primeira_infancia=sum((r.beneficiarios_primeira_infancia or 0) for r in registros),
    )


@router.get("/comparativo")
def comparativo_bolsa_familia(
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
            func.sum(BFModel.valor_total).label("valor_total"),
        )
        .join(BFModel, BFModel.municipio_id == Municipio.id)
    )
    if ano:
        query = query.filter(BFModel.ano == ano)
    resultados = (
        query.group_by(Municipio.nome, Municipio.id)
        .order_by(func.sum(BFModel.valor_total).desc())
        .all()
    )
    return [
        {"municipio": r.municipio, "municipio_id": r.municipio_id, "valor_total": r.valor_total or 0}
        for r in resultados
    ]
