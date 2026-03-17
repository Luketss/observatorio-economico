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
        # Usuários comuns só veem seu município
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
            )
            for r in registros
        ]

    # ADMIN_GLOBAL vê todos
    registros = db.query(PibAnual).all()

    resultado = []

    for r in registros:
        municipio = db.get(Municipio, r.municipio_id)
        resultado.append(
            PibComparativoItem(
                ano=r.ano,
                cidade=municipio.nome if municipio else "",
                pib_total=r.pib_total,
            )
        )

    return resultado
