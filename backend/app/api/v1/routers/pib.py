from typing import List

from app.api.deps import get_current_user, get_db
from app.models.municipio import Municipio
from app.models.pib import PibAnual
from app.schemas.pib import PibComparativoItem, PibItem, PibResumo
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

router = APIRouter(prefix="/pib", tags=["PIB"])


# ==============================
# Série Anual
# ==============================
@router.get("/serie", response_model=List[PibItem])
def serie_pib(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    query = db.query(PibAnual)

    if current_user.role.nome != "ADMIN_GLOBAL":
        query = query.filter(PibAnual.municipio_id == current_user.municipio_id)

    registros = query.order_by(PibAnual.ano).all()

    return [
        PibItem(
            ano=r.ano,
            pib_total=r.pib_total,
            tipo_dado=r.tipo_dado,
        )
        for r in registros
    ]


# ==============================
# Resumo
# ==============================
@router.get("/resumo", response_model=PibResumo)
def resumo_pib(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    query = db.query(PibAnual)

    if current_user.role.nome != "ADMIN_GLOBAL":
        query = query.filter(PibAnual.municipio_id == current_user.municipio_id)

    registros = query.order_by(PibAnual.ano).all()

    if not registros:
        return PibResumo(
            ultimo_ano=0,
            pib_ultimo_ano=0,
            crescimento_percentual=0,
        )

    ultimo = registros[-1]
    crescimento = 0

    if len(registros) > 1:
        anterior = registros[-2]
        if anterior.pib_total > 0:
            crescimento = (
                (ultimo.pib_total - anterior.pib_total) / anterior.pib_total
            ) * 100

    return PibResumo(
        ultimo_ano=ultimo.ano,
        pib_ultimo_ano=ultimo.pib_total,
        crescimento_percentual=round(crescimento, 2),
    )


# ==============================
# Comparativo entre Municípios (ADMIN_GLOBAL)
# ==============================
@router.get("/comparativo", response_model=List[PibComparativoItem])
def comparativo_pib(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    if current_user.role.nome != "ADMIN_GLOBAL":
        municipio = (
            db.query(Municipio)
            .filter(Municipio.id == current_user.municipio_id)
            .first()
        )
        registros = (
            db.query(PibAnual)
            .filter(PibAnual.municipio_id == current_user.municipio_id)
            .all()
        )
        return [
            PibComparativoItem(
                ano=r.ano,
                cidade=municipio.nome if municipio else "",
                pib_total=r.pib_total,
                va_agropecuaria=r.va_agropecuaria,
                va_governo=r.va_governo,
                va_industria=r.va_industria,
                va_servicos=r.va_servicos,
            )
            for r in registros
        ]

    # ADMIN_GLOBAL vê todos
    registros = (
        db.query(PibAnual, Municipio.nome)
        .join(Municipio, PibAnual.municipio_id == Municipio.id)
        .order_by(PibAnual.ano)
        .all()
    )
    return [
        PibComparativoItem(
            ano=r.ano,
            cidade=nome,
            pib_total=r.pib_total,
            va_agropecuaria=r.va_agropecuaria,
            va_governo=r.va_governo,
            va_industria=r.va_industria,
            va_servicos=r.va_servicos,
        )
        for r, nome in registros
    ]


@router.get("/ranking")
def ranking_pib(
    ano: int | None = None,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    from sqlalchemy import func

    query = (
        db.query(
            Municipio.nome.label("municipio"),
            Municipio.id.label("municipio_id"),
            func.sum(PibAnual.pib_total).label("pib_total"),
        )
        .join(PibAnual, PibAnual.municipio_id == Municipio.id)
    )
    if ano:
        query = query.filter(PibAnual.ano == ano)
    else:
        # Use latest available year
        latest = db.query(func.max(PibAnual.ano)).scalar()
        if latest:
            query = query.filter(PibAnual.ano == latest)

    resultados = (
        query.group_by(Municipio.nome, Municipio.id)
        .order_by(func.sum(PibAnual.pib_total).desc())
        .all()
    )
    return [
        {"municipio": r.municipio, "municipio_id": r.municipio_id, "pib_total": r.pib_total or 0}
        for r in resultados
    ]
