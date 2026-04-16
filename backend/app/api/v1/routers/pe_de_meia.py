from typing import List

from app.api.deps import get_current_user, get_db
from app.models.pe_de_meia import PeDeMeiaResumo as PeDeMeiaResumoModel
from app.models.pe_de_meia import PeDeMeiaEtapa
from app.schemas.pe_de_meia import PeDeMeiaResumoItem, PeDeMeiaResumo, PeDeMeiaEtapaItem, PeDeMeiaIncentivo
from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

router = APIRouter(prefix="/pe_de_meia", tags=["Pé-de-Meia"])


@router.get("/serie", response_model=List[PeDeMeiaResumoItem])
def serie_pe_de_meia(db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    query = db.query(PeDeMeiaResumoModel)
    if current_user.role.nome != "ADMIN_GLOBAL":
        query = query.filter(PeDeMeiaResumoModel.municipio_id == current_user.municipio_id)
    registros = query.order_by(PeDeMeiaResumoModel.ano, PeDeMeiaResumoModel.mes).all()
    return [
        PeDeMeiaResumoItem(ano=r.ano, mes=r.mes, total_estudantes=r.total_estudantes, valor_total=r.valor_total)
        for r in registros
    ]


@router.get("/resumo", response_model=PeDeMeiaResumo)
def resumo_pe_de_meia(db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    query = db.query(PeDeMeiaResumoModel)
    if current_user.role.nome != "ADMIN_GLOBAL":
        query = query.filter(PeDeMeiaResumoModel.municipio_id == current_user.municipio_id)
    registros = query.all()
    total_estudantes = sum(r.total_estudantes for r in registros)
    valor_total = sum(r.valor_total for r in registros)
    return PeDeMeiaResumo(total_estudantes=total_estudantes, valor_total=valor_total)


@router.get("/por_etapa", response_model=List[PeDeMeiaEtapaItem])
def por_etapa(db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    query = db.query(
        PeDeMeiaEtapa.etapa_ensino,
        func.sum(PeDeMeiaEtapa.total_estudantes).label("total_estudantes"),
        func.sum(PeDeMeiaEtapa.valor_total).label("valor_total"),
    )
    if current_user.role.nome != "ADMIN_GLOBAL":
        query = query.filter(PeDeMeiaEtapa.municipio_id == current_user.municipio_id)
    resultados = query.group_by(PeDeMeiaEtapa.etapa_ensino).order_by(
        func.sum(PeDeMeiaEtapa.total_estudantes).desc()
    ).all()
    return [
        PeDeMeiaEtapaItem(
            etapa_ensino=r.etapa_ensino,
            total_estudantes=r.total_estudantes or 0,
            valor_total=r.valor_total or 0.0,
        )
        for r in resultados
    ]


@router.get("/por_incentivo", response_model=List[PeDeMeiaIncentivo])
def por_incentivo(db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    query = db.query(
        PeDeMeiaEtapa.tipo_incentivo,
        func.sum(PeDeMeiaEtapa.total_estudantes).label("total_estudantes"),
        func.sum(PeDeMeiaEtapa.valor_total).label("valor_total"),
    )
    if current_user.role.nome != "ADMIN_GLOBAL":
        query = query.filter(PeDeMeiaEtapa.municipio_id == current_user.municipio_id)
    resultados = query.group_by(PeDeMeiaEtapa.tipo_incentivo).order_by(
        func.sum(PeDeMeiaEtapa.total_estudantes).desc()
    ).all()
    return [
        PeDeMeiaIncentivo(
            tipo_incentivo=r.tipo_incentivo,
            total_estudantes=r.total_estudantes or 0,
            valor_total=r.valor_total or 0.0,
        )
        for r in resultados
    ]


@router.get("/comparativo")
def comparativo_pe_de_meia(
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
            func.sum(PeDeMeiaResumoModel.total_estudantes).label("total_estudantes"),
        )
        .join(PeDeMeiaResumoModel, PeDeMeiaResumoModel.municipio_id == Municipio.id)
    )
    if ano:
        query = query.filter(PeDeMeiaResumoModel.ano == ano)
    resultados = (
        query.group_by(Municipio.nome, Municipio.id)
        .order_by(func.sum(PeDeMeiaResumoModel.total_estudantes).desc())
        .all()
    )
    return [
        {"municipio": r.municipio, "municipio_id": r.municipio_id, "total_estudantes": r.total_estudantes or 0}
        for r in resultados
    ]
