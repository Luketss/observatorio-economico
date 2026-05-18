from typing import List, Optional

from app.api.deps import get_current_user, get_db
from app.models.arrecadacao import ArrecadacaoMensal
from app.models.caged import CagedMovimentacao
from app.models.municipio import Municipio
from app.models.rais import RaisVinculo
from fastapi import APIRouter, Depends, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

router = APIRouter(prefix="/comparativo", tags=["Comparativo"])


@router.get("/arrecadacao")
def comparativo_arrecadacao(
    ano: int,
    estado: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    query = (
        db.query(
            Municipio.id.label("municipio_id"),
            Municipio.nome.label("municipio"),
            Municipio.estado.label("estado"),
            func.sum(ArrecadacaoMensal.valor_total).label("total"),
        )
        .join(ArrecadacaoMensal, ArrecadacaoMensal.municipio_id == Municipio.id)
        .filter(Municipio.is_demo.is_(False))
        .filter(ArrecadacaoMensal.ano == ano)
    )
    if estado:
        query = query.filter(Municipio.estado == estado.upper())
    resultados = (
        query.group_by(Municipio.id, Municipio.nome, Municipio.estado)
        .order_by(func.sum(ArrecadacaoMensal.valor_total).desc())
        .all()
    )
    return [
        {"municipio_id": r.municipio_id, "municipio": r.municipio, "estado": r.estado, "total": r.total or 0}
        for r in resultados
    ]


@router.get("/caged")
def comparativo_caged(
    ano: int,
    estado: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    query = (
        db.query(
            Municipio.id.label("municipio_id"),
            Municipio.nome.label("municipio"),
            Municipio.estado.label("estado"),
            func.sum(CagedMovimentacao.saldo).label("saldo_total"),
        )
        .join(CagedMovimentacao, CagedMovimentacao.municipio_id == Municipio.id)
        .filter(Municipio.is_demo.is_(False))
        .filter(CagedMovimentacao.ano == ano)
    )
    if estado:
        query = query.filter(Municipio.estado == estado.upper())
    resultados = (
        query.group_by(Municipio.id, Municipio.nome, Municipio.estado)
        .order_by(func.sum(CagedMovimentacao.saldo).desc())
        .all()
    )
    return [
        {"municipio_id": r.municipio_id, "municipio": r.municipio, "estado": r.estado, "saldo_total": r.saldo_total or 0}
        for r in resultados
    ]


@router.get("/rais")
def comparativo_rais(
    ano: int,
    estado: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    query = (
        db.query(
            Municipio.id.label("municipio_id"),
            Municipio.nome.label("municipio"),
            Municipio.estado.label("estado"),
            func.sum(RaisVinculo.total_vinculos).label("total_vinculos"),
        )
        .join(RaisVinculo, RaisVinculo.municipio_id == Municipio.id)
        .filter(Municipio.is_demo.is_(False))
        .filter(RaisVinculo.ano == ano)
    )
    if estado:
        query = query.filter(Municipio.estado == estado.upper())
    resultados = (
        query.group_by(Municipio.id, Municipio.nome, Municipio.estado)
        .order_by(func.sum(RaisVinculo.total_vinculos).desc())
        .all()
    )
    return [
        {"municipio_id": r.municipio_id, "municipio": r.municipio, "estado": r.estado, "total_vinculos": r.total_vinculos or 0}
        for r in resultados
    ]
