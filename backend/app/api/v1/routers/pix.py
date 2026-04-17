from typing import List

from app.api.deps import get_current_user, get_db
from app.models.pix import PixMensal
from app.schemas.pix import PixMensalItem, PixResumo
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

router = APIRouter(prefix="/pix", tags=["PIX"])


def _municipio_filter(query, current_user):
    if current_user.role.nome != "ADMIN_GLOBAL":
        query = query.filter(PixMensal.municipio_id == current_user.municipio_id)
    return query


@router.get("/serie", response_model=List[PixMensalItem])
def serie_pix(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    query = _municipio_filter(db.query(PixMensal), current_user)
    registros = query.order_by(PixMensal.ano, PixMensal.mes).all()
    return [
        PixMensalItem(
            ano=r.ano,
            mes=r.mes,
            vl_pagador_pf=r.vl_pagador_pf,
            qt_pagador_pf=r.qt_pagador_pf,
            qt_pes_pagador_pf=r.qt_pes_pagador_pf,
            vl_pagador_pj=r.vl_pagador_pj,
            qt_pagador_pj=r.qt_pagador_pj,
            qt_pes_pagador_pj=r.qt_pes_pagador_pj,
            vl_recebedor_pf=r.vl_recebedor_pf,
            qt_recebedor_pf=r.qt_recebedor_pf,
            qt_pes_recebedor_pf=r.qt_pes_recebedor_pf,
            vl_recebedor_pj=r.vl_recebedor_pj,
            qt_recebedor_pj=r.qt_recebedor_pj,
            qt_pes_recebedor_pj=r.qt_pes_recebedor_pj,
        )
        for r in registros
    ]


@router.get("/resumo", response_model=PixResumo)
def resumo_pix(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    query = _municipio_filter(db.query(PixMensal), current_user)
    registros = query.all()
    if not registros:
        return PixResumo()
    total_transacoes = sum(
        (r.qt_pagador_pf or 0) + (r.qt_pagador_pj or 0) for r in registros
    )
    volume_pf = sum(r.vl_pagador_pf or 0 for r in registros)
    volume_pj = sum(r.vl_pagador_pj or 0 for r in registros)
    return PixResumo(
        total_transacoes=total_transacoes,
        volume_total_pf=volume_pf,
        volume_total_pj=volume_pj,
    )


@router.get("/comparativo")
def comparativo_pix(
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
            (
                func.coalesce(func.sum(PixMensal.vl_pagador_pf), 0)
                + func.coalesce(func.sum(PixMensal.vl_pagador_pj), 0)
            ).label("volume_total"),
        )
        .join(PixMensal, PixMensal.municipio_id == Municipio.id)
    )
    if ano:
        query = query.filter(PixMensal.ano == ano)
    resultados = (
        query.group_by(Municipio.nome, Municipio.id)
        .order_by(
            (
                func.coalesce(func.sum(PixMensal.vl_pagador_pf), 0)
                + func.coalesce(func.sum(PixMensal.vl_pagador_pj), 0)
            ).desc()
        )
        .all()
    )
    return [
        {"municipio": r.municipio, "municipio_id": r.municipio_id, "volume_total": r.volume_total or 0}
        for r in resultados
    ]
