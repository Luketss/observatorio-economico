import json
from typing import List

from app.api.deps import get_current_user, get_db, require_role
from app.models.dashboard_card_custom import DashboardCardCustom
from app.schemas.dashboard_card_custom import (
    DashboardCardCustomCreate,
    DashboardCardCustomOut,
    DashboardCardCustomUpdate,
)
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

router = APIRouter(prefix="/dashboard-cards", tags=["Dashboard Cards"])


@router.get("/", response_model=List[DashboardCardCustomOut])
def listar_cards(
    municipio_id: int | None = None,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    is_global = current_user.role.nome == "ADMIN_GLOBAL"

    if is_global:
        mid = municipio_id
    else:
        mid = current_user.municipio_id

    if mid is None:
        return []

    return (
        db.query(DashboardCardCustom)
        .filter(
            DashboardCardCustom.municipio_id == mid,
            DashboardCardCustom.ativo == True,
        )
        .order_by(DashboardCardCustom.ordem)
        .all()
    )


@router.post("/", response_model=DashboardCardCustomOut)
def criar_card(
    data: DashboardCardCustomCreate,
    db: Session = Depends(get_db),
    current_user=Depends(require_role("ADMIN_GLOBAL")),
):
    card = DashboardCardCustom(
        municipio_id=data.municipio_id,
        titulo=data.titulo,
        valor=data.valor,
        subtitulo=data.subtitulo,
        icone=data.icone,
        cor=data.cor,
        ordem=data.ordem,
    )
    db.add(card)
    db.commit()
    db.refresh(card)
    return card


@router.put("/{card_id}", response_model=DashboardCardCustomOut)
def atualizar_card(
    card_id: int,
    data: DashboardCardCustomUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(require_role("ADMIN_GLOBAL")),
):
    card = db.get(DashboardCardCustom, card_id)
    if not card:
        raise HTTPException(status_code=404, detail="Card não encontrado.")

    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(card, field, value)

    db.commit()
    db.refresh(card)
    return card


@router.delete("/{card_id}")
def deletar_card(
    card_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(require_role("ADMIN_GLOBAL")),
):
    card = db.get(DashboardCardCustom, card_id)
    if not card:
        raise HTTPException(status_code=404, detail="Card não encontrado.")

    db.delete(card)
    db.commit()
    return {"ok": True}
