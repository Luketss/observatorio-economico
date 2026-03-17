from typing import List

from app.api.deps import get_current_user, get_db
from app.models.arrecadacao import ArrecadacaoMensal
from app.models.caged import CagedMovimentacao
from app.models.municipio import Municipio
from app.models.rais import RaisVinculo
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

router = APIRouter(prefix="/comparativo", tags=["Comparativo"])


def validar_admin_global(current_user):
    if current_user.role.nome != "ADMIN_GLOBAL":
        raise HTTPException(status_code=403, detail="Acesso restrito a ADMIN_GLOBAL")


@router.get("/arrecadacao")
def comparativo_arrecadacao(
    ano: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    validar_admin_global(current_user)

    resultados = (
        db.query(
            Municipio.nome.label("municipio"),
            func.sum(ArrecadacaoMensal.valor_total).label("total"),
        )
        .join(ArrecadacaoMensal, ArrecadacaoMensal.municipio_id == Municipio.id)
        .filter(ArrecadacaoMensal.ano == ano)
        .group_by(Municipio.nome)
        .order_by(func.sum(ArrecadacaoMensal.valor_total).desc())
        .all()
    )

    return [{"municipio": r.municipio, "total": r.total or 0} for r in resultados]


@router.get("/caged")
def comparativo_caged(
    ano: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    validar_admin_global(current_user)

    resultados = (
        db.query(
            Municipio.nome.label("municipio"),
            func.sum(CagedMovimentacao.saldo).label("saldo_total"),
        )
        .join(CagedMovimentacao, CagedMovimentacao.municipio_id == Municipio.id)
        .filter(CagedMovimentacao.ano == ano)
        .group_by(Municipio.nome)
        .order_by(func.sum(CagedMovimentacao.saldo).desc())
        .all()
    )

    return [
        {"municipio": r.municipio, "saldo_total": r.saldo_total or 0}
        for r in resultados
    ]


@router.get("/rais")
def comparativo_rais(
    ano: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    validar_admin_global(current_user)

    resultados = (
        db.query(
            Municipio.nome.label("municipio"),
            func.sum(RaisVinculo.total_vinculos).label("total_vinculos"),
        )
        .join(RaisVinculo, RaisVinculo.municipio_id == Municipio.id)
        .filter(RaisVinculo.ano == ano)
        .group_by(Municipio.nome)
        .order_by(func.sum(RaisVinculo.total_vinculos).desc())
        .all()
    )

    return [
        {"municipio": r.municipio, "total_vinculos": r.total_vinculos or 0}
        for r in resultados
    ]
