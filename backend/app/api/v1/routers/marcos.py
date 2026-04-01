from datetime import date
from typing import List

from app.api.deps import get_current_user, get_db
from app.models.marco import Marco
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

router = APIRouter(prefix="/marcos", tags=["Timeline do Mandato"])

TIPOS_VALIDOS = {"inicio_mandato", "obras", "politica", "evento"}


class MarcoOut(BaseModel):
    id: int
    municipio_id: int
    data: date
    titulo: str
    descricao: str | None
    tipo: str
    ativo: bool

    model_config = {"from_attributes": True}


class MarcoCreate(BaseModel):
    data: date
    titulo: str
    descricao: str | None = None
    tipo: str = "evento"
    municipio_id: int | None = None


class MarcoUpdate(BaseModel):
    data: date | None = None
    titulo: str | None = None
    descricao: str | None = None
    tipo: str | None = None
    ativo: bool | None = None


def _resolve_mid(current_user, municipio_id: int | None) -> int:
    if current_user.role.nome == "ADMIN_GLOBAL" and municipio_id:
        return municipio_id
    mid = current_user.municipio_id
    if not mid:
        raise HTTPException(status_code=400, detail="municipio_id é obrigatório.")
    return mid


@router.get("", response_model=List[MarcoOut])
def listar_marcos(
    municipio_id: int | None = None,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    mid = _resolve_mid(current_user, municipio_id)
    return (
        db.query(Marco)
        .filter(Marco.municipio_id == mid, Marco.ativo == True)
        .order_by(Marco.data)
        .all()
    )


@router.post("", response_model=MarcoOut)
def criar_marco(
    body: MarcoCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    if current_user.role.nome == "VISUALIZADOR":
        raise HTTPException(status_code=403, detail="Sem permissão para criar marcos.")

    if body.tipo not in TIPOS_VALIDOS:
        raise HTTPException(status_code=400, detail=f"Tipo inválido. Use: {TIPOS_VALIDOS}")

    mid = _resolve_mid(current_user, body.municipio_id)

    marco = Marco(
        municipio_id=mid,
        data=body.data,
        titulo=body.titulo,
        descricao=body.descricao,
        tipo=body.tipo,
    )
    db.add(marco)
    db.commit()
    db.refresh(marco)
    return marco


@router.put("/{marco_id}", response_model=MarcoOut)
def atualizar_marco(
    marco_id: int,
    body: MarcoUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    if current_user.role.nome == "VISUALIZADOR":
        raise HTTPException(status_code=403, detail="Sem permissão para editar marcos.")

    marco = db.get(Marco, marco_id)
    if not marco:
        raise HTTPException(status_code=404, detail="Marco não encontrado.")

    if current_user.role.nome != "ADMIN_GLOBAL" and marco.municipio_id != current_user.municipio_id:
        raise HTTPException(status_code=403, detail="Sem permissão para editar este marco.")

    if body.tipo and body.tipo not in TIPOS_VALIDOS:
        raise HTTPException(status_code=400, detail=f"Tipo inválido. Use: {TIPOS_VALIDOS}")

    for field in ("data", "titulo", "descricao", "tipo", "ativo"):
        val = getattr(body, field)
        if val is not None:
            setattr(marco, field, val)

    db.commit()
    db.refresh(marco)
    return marco


@router.delete("/{marco_id}")
def deletar_marco(
    marco_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    if current_user.role.nome == "VISUALIZADOR":
        raise HTTPException(status_code=403, detail="Sem permissão para excluir marcos.")

    marco = db.get(Marco, marco_id)
    if not marco:
        raise HTTPException(status_code=404, detail="Marco não encontrado.")

    if current_user.role.nome != "ADMIN_GLOBAL" and marco.municipio_id != current_user.municipio_id:
        raise HTTPException(status_code=403, detail="Sem permissão para excluir este marco.")

    db.delete(marco)
    db.commit()
    return {"ok": True}
