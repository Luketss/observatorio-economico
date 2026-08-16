from typing import List

from app.api.deps import get_current_user, get_db, require_permissao
from app.api.pagination import PaginatedResponse
from app.api.response import SuccessResponse
from app.core.exceptions import (
    ConflictException,
    ForbiddenException,
    NotFoundException,
)
from app.core.permissions import (
    escopo_listagem_usuarios,
    pode_gerenciar_usuario,
    valida_atribuicao,
)
from app.models.role import Role
from app.models.usuario import Usuario
from app.schemas.usuario import UsuarioCreate, UsuarioOut, UsuarioUpdate
from app.services.audit_service import montar_detalhe_atualizacao, registrar_acao
from app.services.usuario_service import UsuarioService
from fastapi import APIRouter, Depends, Request
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
    alvo_role_nome: str,
    alvo_email: str,
) -> list[str]:
    """Regras anti-escalação do delegado (pura, testável sem DB).

    payload: campos presentes no update (model_dump(exclude_unset=True)).
    alvo_role_nome: nome da role atual do alvo — usado para impedir que um
    delegado tome conta de um ADMIN_MUNICIPIO alterando sua senha/e-mail.
    alvo_email: e-mail atual do alvo — usado para permitir que um delegado
    renomei um ADMIN_MUNICIPIO quando o e-mail permanece inalterado.
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
    if alvo_role_nome == "ADMIN_MUNICIPIO" and ("senha" in payload or ("email" in payload and payload["email"] != alvo_email)):
        erros.append(
            "Delegado não pode alterar senha ou e-mail de um administrador do município."
        )
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
    request: Request,
    skip: int = 0,
    limit: int = 20,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    service = UsuarioService(db)

    # Fail-closed: exige verbo na área 'usuarios' (ADMIN_GLOBAL bypass) e
    # nega não-global sem município — NULL nunca degrada para "listar tudo".
    municipio_filter = escopo_listagem_usuarios(
        current_user.role, current_user.municipio_id
    )

    usuarios, total = service.list(skip=skip, limit=limit, municipio_id=municipio_filter)

    registrar_acao(
        db, categoria="leitura", acao="usuarios_listados", ator=current_user,
        detalhe=f"total: {total} | municipio_filter: {municipio_filter}",
        request=request,
    )
    return PaginatedResponse(
        items=[_to_out(u) for u in usuarios],
        total=total,
        skip=skip,
        limit=limit,
    )


@router.post("", response_model=SuccessResponse[UsuarioOut])
def criar_usuario(
    data: UsuarioCreate,
    request: Request,
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
    registrar_acao(
        db, categoria="acao", acao="usuario_criado",
        ator=current_user, alvo=usuario,
        detalhe=f"role: {usuario.role.nome} | municipio: {usuario.municipio_id}",
        request=request,
    )
    return SuccessResponse(data=_to_out(usuario))


@router.put("/{user_id}", response_model=SuccessResponse[UsuarioOut])
def atualizar_usuario(
    user_id: int,
    data: UsuarioUpdate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_permissao("usuarios", "editar")),
):
    service = UsuarioService(db)
    alvo = service.get_by_id(user_id)
    payload = data.model_dump(exclude_unset=True)
    role_de, ativo_de = alvo.role.nome, alvo.ativo

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
            alvo_role_nome=alvo.role.nome,
            alvo_email=alvo.email,
        )
        if erros:
            raise ForbiddenException(" ".join(erros))

    usuario = service.update(user_id, data)
    registrar_acao(
        db, categoria="acao", acao="usuario_atualizado",
        ator=current_user, alvo=usuario,
        detalhe=montar_detalhe_atualizacao(
            list(payload.keys()),
            role_de=role_de, role_para=usuario.role.nome,
            ativo_de=ativo_de, ativo_para=usuario.ativo,
        ),
        request=request,
    )
    return SuccessResponse(data=_to_out(usuario))


@router.delete("/{user_id}")
def deletar_usuario(
    user_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_permissao("usuarios", "excluir")),
):
    service = UsuarioService(db)
    alvo = service.get_by_id(user_id)
    if not _is_global(current_user):
        _exigir_gerencia(current_user, alvo)
    alvo_email, alvo_mun, alvo_role = alvo.email, alvo.municipio_id, alvo.role.nome
    service.delete(user_id, current_user.id)
    # alvo_usuario_id fica None de propósito: o usuário já não existe e a FK
    # não pode apontar para ele — o vínculo sobrevive no snapshot + detalhe.
    registrar_acao(
        db, categoria="acao", acao="usuario_excluido",
        ator=current_user, alvo_email=alvo_email, municipio_id=alvo_mun,
        detalhe=f"usuario_id: {user_id} | role: {alvo_role}",
        request=request,
    )
    return {"ok": True}
