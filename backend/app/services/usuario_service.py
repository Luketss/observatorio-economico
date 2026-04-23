from typing import Sequence

from app.core.exceptions import ConflictException, NotFoundException
from app.core.security import hash_password
from app.db.repositories.usuario_repository import UsuarioRepository
from app.models.usuario import Usuario
from app.schemas.usuario import UsuarioCreate, UsuarioUpdate
from sqlalchemy.orm import Session


class UsuarioService:
    """
    Camada de regra de negócio para Usuario.
    """

    def __init__(self, session: Session):
        self.session = session
        self.repository = UsuarioRepository(session)

    def create(self, data: UsuarioCreate) -> Usuario:
        existing = self.repository.get_by_email(data.email)
        if existing:
            raise ConflictException("Email already registered")

        hashed_password = hash_password(data.senha)

        obj_data = {
            "nome": data.nome,
            "email": data.email,
            "senha_hash": hashed_password,
            "municipio_id": data.municipio_id,
            "role_id": data.role_id,
            "ativo": True,
        }

        return self.repository.create(obj_data)

    def list(
        self,
        skip: int = 0,
        limit: int = 100,
        municipio_id: int | None = None,
    ) -> tuple[Sequence[Usuario], int]:
        items, total = self.repository.list_filtered(
            skip=skip, limit=limit, municipio_id=municipio_id
        )
        return items, total

    def get_by_id(self, usuario_id: int) -> Usuario:
        usuario = self.repository.get_by_id(usuario_id)
        if not usuario:
            raise NotFoundException("User not found")
        return usuario

    def update(self, usuario_id: int, data: UsuarioUpdate) -> Usuario:
        usuario = self.get_by_id(usuario_id)
        updates = {}
        payload = data.model_dump(exclude_unset=True)

        if "email" in payload:
            new_email = payload["email"]
            if new_email != usuario.email:
                existing = self.repository.get_by_email(new_email)
                if existing:
                    raise ConflictException("Email already in use")
            updates["email"] = new_email

        if "senha" in payload and payload["senha"]:
            updates["senha_hash"] = hash_password(payload["senha"])

        for field in ("nome", "municipio_id", "role_id", "ativo"):
            if field in payload:
                updates[field] = payload[field]

        if updates:
            return self.repository.update(usuario, updates)
        return usuario

    def delete(self, usuario_id: int, requesting_user_id: int) -> None:
        if usuario_id == requesting_user_id:
            raise ConflictException("Cannot delete your own account")
        usuario = self.get_by_id(usuario_id)
        self.repository.delete(usuario)

    def deactivate(self, usuario_id: int) -> Usuario:
        usuario = self.get_by_id(usuario_id)
        return self.repository.update(usuario, {"ativo": False})
