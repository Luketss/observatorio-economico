from typing import List, Optional

from app.api.deps import get_current_user, get_db, require_role
from app.core.exceptions import ForbiddenException, NotFoundException
from app.models.projeto import Projeto, ProjetoEixo
from app.models.usuario import Usuario
from app.schemas.projeto import (
    EixoCreate,
    EixoOut,
    EixoUpdate,
    ProjetoCreate,
    ProjetoOut,
    ProjetoUpdate,
)
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

router = APIRouter(prefix="/projetos", tags=["Projetos"])


# ── Eixos ────────────────────────────────────────────────────────────────────

@router.get("/eixos", response_model=List[EixoOut])
def listar_eixos(db: Session = Depends(get_db), _=Depends(get_current_user)):
    return db.query(ProjetoEixo).order_by(ProjetoEixo.ordem, ProjetoEixo.nome).all()


@router.post("/eixos", response_model=EixoOut)
def criar_eixo(
    data: EixoCreate,
    db: Session = Depends(get_db),
    _: Usuario = Depends(require_role("ADMIN_GLOBAL")),
):
    eixo = ProjetoEixo(**data.model_dump())
    db.add(eixo)
    db.commit()
    db.refresh(eixo)
    return eixo


@router.put("/eixos/{eixo_id}", response_model=EixoOut)
def atualizar_eixo(
    eixo_id: int,
    data: EixoUpdate,
    db: Session = Depends(get_db),
    _: Usuario = Depends(require_role("ADMIN_GLOBAL")),
):
    eixo = db.get(ProjetoEixo, eixo_id)
    if not eixo:
        raise NotFoundException("Eixo not found")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(eixo, field, value)
    db.commit()
    db.refresh(eixo)
    return eixo


@router.delete("/eixos/{eixo_id}")
def deletar_eixo(
    eixo_id: int,
    db: Session = Depends(get_db),
    _: Usuario = Depends(require_role("ADMIN_GLOBAL")),
):
    eixo = db.get(ProjetoEixo, eixo_id)
    if not eixo:
        raise NotFoundException("Eixo not found")
    db.delete(eixo)
    db.commit()
    return {"ok": True}


# ── Projetos ─────────────────────────────────────────────────────────────────

@router.get("", response_model=List[ProjetoOut])
def listar_projetos(
    eixo_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    query = db.query(Projeto)
    if current_user.role.nome != "ADMIN_GLOBAL":
        query = query.filter(Projeto.municipio_id == current_user.municipio_id)
    if eixo_id:
        query = query.filter(Projeto.eixo_id == eixo_id)
    return query.order_by(Projeto.criado_em.desc()).all()


@router.post("", response_model=ProjetoOut)
def criar_projeto(
    data: ProjetoCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    if current_user.role.nome == "VISUALIZADOR":
        raise ForbiddenException("Insufficient permissions")
    municipio_id = current_user.municipio_id if current_user.role.nome != "ADMIN_GLOBAL" else current_user.municipio_id
    projeto = Projeto(
        **data.model_dump(),
        municipio_id=municipio_id,
        criado_por=current_user.id,
    )
    db.add(projeto)
    db.commit()
    db.refresh(projeto)
    return projeto


@router.put("/{projeto_id}", response_model=ProjetoOut)
def atualizar_projeto(
    projeto_id: int,
    data: ProjetoUpdate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    projeto = db.get(Projeto, projeto_id)
    if not projeto:
        raise NotFoundException("Projeto not found")
    if current_user.role.nome == "VISUALIZADOR":
        raise ForbiddenException("Insufficient permissions")
    if current_user.role.nome != "ADMIN_GLOBAL" and projeto.municipio_id != current_user.municipio_id:
        raise ForbiddenException("Insufficient permissions")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(projeto, field, value)
    db.commit()
    db.refresh(projeto)
    return projeto


@router.delete("/{projeto_id}")
def deletar_projeto(
    projeto_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    projeto = db.get(Projeto, projeto_id)
    if not projeto:
        raise NotFoundException("Projeto not found")
    if current_user.role.nome == "VISUALIZADOR":
        raise ForbiddenException("Insufficient permissions")
    if current_user.role.nome != "ADMIN_GLOBAL" and projeto.municipio_id != current_user.municipio_id:
        raise ForbiddenException("Insufficient permissions")
    db.delete(projeto)
    db.commit()
    return {"ok": True}
