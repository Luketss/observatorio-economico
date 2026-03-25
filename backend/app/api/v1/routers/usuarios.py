from typing import List

from app.api.deps import get_current_user, get_db, require_role
from app.api.pagination import PaginatedResponse
from app.api.response import SuccessResponse
from app.models.usuario import Usuario
from app.schemas.usuario import UsuarioCreate, UsuarioOut
from app.services.usuario_service import UsuarioService
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

router = APIRouter(prefix="/usuarios", tags=["Usuários"])


# ==============================
# Listar usuários (Thin Controller)
# ==============================
@router.get("/", response_model=PaginatedResponse[UsuarioOut])
def listar_usuarios(
    skip: int = 0,
    limit: int = 20,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    service = UsuarioService(db)

    # ADMIN_GLOBAL sees all; others are scoped to their municipality
    municipio_filter = (
        None if current_user.role.nome == "ADMIN_GLOBAL" else current_user.municipio_id
    )

    usuarios, total = service.list(skip=skip, limit=limit, municipio_id=municipio_filter)

    items = [
        UsuarioOut(
            id=u.id,
            nome=u.nome,
            email=u.email,
            municipio_id=u.municipio_id,
            role=u.role.nome,
            ativo=u.ativo,
        )
        for u in usuarios
    ]

    return PaginatedResponse(
        items=items,
        total=total,
        skip=skip,
        limit=limit,
    )


# ==============================
# Criar usuário (Thin Controller)
# ==============================
@router.post("/", response_model=SuccessResponse[UsuarioOut])
def criar_usuario(
    data: UsuarioCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_role("ADMIN_GLOBAL")),
):
    service = UsuarioService(db)

    usuario = service.create(data)

    out = UsuarioOut(
        id=usuario.id,
        nome=usuario.nome,
        email=usuario.email,
        municipio_id=usuario.municipio_id,
        role=usuario.role.nome,
        ativo=usuario.ativo,
    )

    return SuccessResponse(data=out)
