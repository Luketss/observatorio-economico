from typing import List, Optional

from app.api.deps import get_db, require_role
from app.core.exceptions import (
    AppException,
    ConflictException,
    NotFoundException,
)
from app.models.municipio import Municipio
from app.models.role import Role
from app.models.usuario import Usuario
from app.schemas.role import RoleCreate, RoleOut, RoleUpdate
from fastapi import APIRouter, Depends, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

router = APIRouter(prefix="/roles", tags=["Roles"])


def _to_out(role: Role, usuarios_count: int) -> RoleOut:
    return RoleOut(
        id=role.id,
        nome=role.nome,
        descricao=role.descricao,
        municipio_id=role.municipio_id,
        builtin=role.builtin,
        permissoes=role.permissoes or {},
        usuarios_count=usuarios_count,
    )


def _exigir_municipio_valido(db: Session, municipio_id: Optional[int]) -> None:
    if municipio_id is not None and db.get(Municipio, municipio_id) is None:
        raise NotFoundException("Município não encontrado")


@router.get("", response_model=List[RoleOut])
def listar_roles(
    municipio_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    _: Usuario = Depends(require_role("ADMIN_GLOBAL")),
):
    query = (
        db.query(Role, func.count(Usuario.id))
        .outerjoin(Usuario, Usuario.role_id == Role.id)
        .group_by(Role.id)
        .order_by(Role.builtin.desc(), Role.nome)
    )
    if municipio_id is not None:
        query = query.filter(
            (Role.municipio_id.is_(None)) | (Role.municipio_id == municipio_id)
        )
    return [_to_out(role, count) for role, count in query.all()]


@router.post("", response_model=RoleOut)
def criar_role(
    data: RoleCreate,
    db: Session = Depends(get_db),
    _: Usuario = Depends(require_role("ADMIN_GLOBAL")),
):
    if db.query(Role).filter(Role.nome == data.nome).first():
        raise ConflictException("Já existe uma role com esse nome.")
    _exigir_municipio_valido(db, data.municipio_id)
    role = Role(
        nome=data.nome,
        descricao=data.descricao,
        municipio_id=data.municipio_id,
        builtin=False,
        permissoes=data.permissoes,
    )
    db.add(role)
    db.commit()
    db.refresh(role)
    return _to_out(role, 0)


@router.put("/{role_id}", response_model=RoleOut)
def atualizar_role(
    role_id: int,
    data: RoleUpdate,
    db: Session = Depends(get_db),
    _: Usuario = Depends(require_role("ADMIN_GLOBAL")),
):
    role = db.get(Role, role_id)
    if not role:
        raise NotFoundException("Role não encontrada")
    if role.builtin:
        # 400 (não 403): a requisição é inválida por alvo imutável, cf. spec.
        raise AppException(
            code="BUILTIN_ROLE",
            message="Roles do sistema não podem ser alteradas.",
            status_code=400,
        )
    payload = data.model_dump(exclude_unset=True)
    if "nome" in payload and payload["nome"] != role.nome:
        if db.query(Role).filter(Role.nome == payload["nome"]).first():
            raise ConflictException("Já existe uma role com esse nome.")
    if "municipio_id" in payload:
        _exigir_municipio_valido(db, payload["municipio_id"])
    for field, value in payload.items():
        setattr(role, field, value)
    db.commit()
    db.refresh(role)
    count = db.query(func.count(Usuario.id)).filter(Usuario.role_id == role.id).scalar()
    return _to_out(role, count or 0)


@router.delete("/{role_id}")
def deletar_role(
    role_id: int,
    db: Session = Depends(get_db),
    _: Usuario = Depends(require_role("ADMIN_GLOBAL")),
):
    role = db.get(Role, role_id)
    if not role:
        raise NotFoundException("Role não encontrada")
    if role.builtin:
        raise AppException(
            code="BUILTIN_ROLE",
            message="Roles do sistema não podem ser excluídas.",
            status_code=400,
        )
    em_uso = db.query(func.count(Usuario.id)).filter(Usuario.role_id == role.id).scalar()
    if em_uso:
        raise ConflictException(
            f"Role em uso por {em_uso} usuário(s). Reatribua antes de excluir."
        )
    db.delete(role)
    db.commit()
    return {"ok": True}
