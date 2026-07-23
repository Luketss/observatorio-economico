from typing import List

from app.api.deps import get_current_user, get_db, require_permissao
from app.api.pagination import PaginatedResponse
from app.api.response import SuccessResponse
from app.core.exceptions import (
    ConflictException,
    ForbiddenException,
    NotFoundException,
)
from app.core.permissions import pode_gerenciar_usuario, valida_atribuicao
from app.models.role import Role
from app.models.usuario import Usuario
from app.schemas.usuario import UsuarioCreate, UsuarioOut, UsuarioUpdate
from app.services.usuario_service import UsuarioService
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

router = APIRouter(prefix="/usuarios", tags=["Usuários"])


def _is_global(user: Usuario) -> bool:
    return user.role.nome == "ADMIN_GLOBAL"


def erros_payload_delegado(
    payload: dict,
    alvo_role_id: int,
    alvo_id: int,
    ator_id: int,
    alvo_municipio_id: int | None,
) -> list[str]:
    """Regras anti-escalação do delegado (pura, testável sem DB).

    payload: campos presentes no update (model_dump(exclude_unset=True)).
    """
    erros = []
    if "role_id" in payload and payload["role_id"] != alvo_role_id:
        erros.append("Delegado não pode alterar a role de um usuário.")
    if (
        "municipio_id" in payload
        and payload["municipio_id"] != alvo_municipio_id
    ):
        erros.append("Delegado não pode mover usuário de município.")
    if payload.get("ativo") is False and alvo_id == ator_id:
        erros.append("Você não pode desativar a si mesmo.")
    return erros


def _to_out(u: Usuario) -> UsuarioOut:
    return UsuarioOut(
        id=u.id,
        nome=u.nome,
        email=u.email,
        municipio_id=u.municipio_id,
        role=u.role.nome,
        ativo=u.ativo,
    )


def _exigir_gerencia(current_user: Usuario, alvo: Usuario) -> None:
    if not pode_gerenciar_usuario(
        current_user.role.nome,
        current_user.municipio_id,
        alvo.role.nome,
        alvo.municipio_id,
    ):
        raise ForbiddenException("Sem permissão para gerenciar este usuário.")


def _validar_role_para_usuario(
    db: Session, role_id: int, municipio_id: int | None
) -> None:
    role = db.get(Role, role_id)
    if not role:
        raise NotFoundException("Role não encontrada")
    if not valida_atribuicao(role.municipio_id, municipio_id):
        raise ConflictException(
            "Role específica de outro município não pode ser atribuída a este usuário."
        )


@router.get("", response_model=PaginatedResponse[UsuarioOut])
def listar_usuarios(
    skip: int = 0,
    limit: int = 20,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    service = UsuarioService(db)

    # ADMIN_GLOBAL sees all; others are scoped to their municipality
    municipio_filter = (
        None if _is_global(current_user) else current_user.municipio_id
    )

    usuarios, total = service.list(skip=skip, limit=limit, municipio_id=municipio_filter)

    return PaginatedResponse(
        items=[_to_out(u) for u in usuarios],
        total=total,
        skip=skip,
        limit=limit,
    )


@router.post("", response_model=SuccessResponse[UsuarioOut])
def criar_usuario(
    data: UsuarioCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_permissao("usuarios", "criar")),
):
    service = UsuarioService(db)

    if _is_global(current_user):
        if data.role_id is None:
            raise ConflictException("role_id é obrigatório.")
        _validar_role_para_usuario(db, data.role_id, data.municipio_id)
    else:
        # Delegado: cria só no próprio município e sempre como VISUALIZADOR.
        visualizador = db.query(Role).filter(Role.nome == "VISUALIZADOR").first()
        if not visualizador:
            raise ConflictException("Role VISUALIZADOR não configurada.")
        data = data.model_copy(
            update={
                "municipio_id": current_user.municipio_id,
                "role_id": visualizador.id,
            }
        )

    usuario = service.create(data)
    return SuccessResponse(data=_to_out(usuario))


@router.put("/{user_id}", response_model=SuccessResponse[UsuarioOut])
def atualizar_usuario(
    user_id: int,
    data: UsuarioUpdate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_permissao("usuarios", "editar")),
):
    service = UsuarioService(db)
    alvo = service.get_by_id(user_id)
    payload = data.model_dump(exclude_unset=True)

    if _is_global(current_user):
        if "role_id" in payload or "municipio_id" in payload:
            role_id = payload.get("role_id", alvo.role_id)
            municipio_id = payload.get("municipio_id", alvo.municipio_id)
            _validar_role_para_usuario(db, role_id, municipio_id)
    else:
        _exigir_gerencia(current_user, alvo)
        erros = erros_payload_delegado(
            payload=payload,
            alvo_role_id=alvo.role_id,
            alvo_id=alvo.id,
            ator_id=current_user.id,
            alvo_municipio_id=alvo.municipio_id,
        )
        if erros:
            raise ForbiddenException(" ".join(erros))

    usuario = service.update(user_id, data)
    return SuccessResponse(data=_to_out(usuario))


@router.delete("/{user_id}")
def deletar_usuario(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_permissao("usuarios", "excluir")),
):
    service = UsuarioService(db)
    if not _is_global(current_user):
        alvo = service.get_by_id(user_id)
        _exigir_gerencia(current_user, alvo)
    service.delete(user_id, current_user.id)
    return {"ok": True}
