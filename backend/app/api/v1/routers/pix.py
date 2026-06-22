from typing import List

from app.api.deps import get_current_user, get_db, scoped_modulo
from app.models.pix import PixMensal
from app.schemas.pix import PixMensalItem, PixResumo
from fastapi import APIRouter, Depends, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

router = APIRouter(prefix="/pix", tags=["PIX"])


@router.get("/serie", response_model=List[PixMensalItem])
def serie_pix(
    mid: int | None = Depends(scoped_modulo("pix")),
    db: Session = Depends(get_db),
):
    if mid is None:
        return []
    query = db.query(PixMensal).filter(PixMensal.municipio_id == mid)
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
    mid: int | None = Depends(scoped_modulo("pix")),
    db: Session = Depends(get_db),
):
    if mid is None:
        return PixResumo()
    row = (
        db.query(
            func.coalesce(func.sum(func.coalesce(PixMensal.qt_pagador_pf, 0) + func.coalesce(PixMensal.qt_pagador_pj, 0)), 0),
            func.coalesce(func.sum(PixMensal.vl_pagador_pf), 0),
            func.coalesce(func.sum(PixMensal.vl_pagador_pj), 0),
        )
        .filter(PixMensal.municipio_id == mid)
        .one()
    )
    return PixResumo(
        total_transacoes=int(row[0] or 0),
        volume_total_pf=row[1] or 0,
        volume_total_pj=row[2] or 0,
    )


@router.get("/comparativo")
def comparativo_pix(
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
            (
                func.coalesce(func.sum(PixMensal.vl_pagador_pf), 0)
                + func.coalesce(func.sum(PixMensal.vl_pagador_pj), 0)
            ).label("volume_total"),
        )
        .join(PixMensal, PixMensal.municipio_id == Municipio.id)
        .filter(Municipio.is_demo.is_(False))
    )
    if ano:
        query = query.filter(PixMensal.ano == ano)
    if estado:
        query = query.filter(Municipio.estado == estado.upper())
    resultados = (
        query.group_by(Municipio.nome, Municipio.id, Municipio.estado)
        .order_by(
            (
                func.coalesce(func.sum(PixMensal.vl_pagador_pf), 0)
                + func.coalesce(func.sum(PixMensal.vl_pagador_pj), 0)
            ).desc()
        )
        .all()
    )
    return [
        {"municipio": r.municipio, "municipio_id": r.municipio_id, "estado": r.estado, "volume_total": r.volume_total or 0}
        for r in resultados
    ]
