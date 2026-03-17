from typing import Optional

from app.db.repositories.base_repository import BaseRepository
from app.models.usuario import Usuario
from sqlalchemy import select
from sqlalchemy.orm import Session


class UsuarioRepository(BaseRepository[Usuario]):
    """
    Repository específico para entidade Usuario.
    """

    def __init__(self, session: Session):
        super().__init__(Usuario, session)

    def get_by_email(self, email: str) -> Optional[Usuario]:
        stmt = select(Usuario).where(Usuario.email == email)
        return self.session.scalar(stmt)

    def get_active_by_email(self, email: str) -> Optional[Usuario]:
        stmt = select(Usuario).where(
            Usuario.email == email,
            Usuario.ativo.is_(True),
        )
        return self.session.scalar(stmt)

    def list_filtered(
        self,
        skip: int = 0,
        limit: int = 100,
        municipio_id: int | None = None,
        ativo: bool | None = None,
        role_id: int | None = None,
    ) -> tuple[list[Usuario], int]:
        query = self.session.query(Usuario)

        if municipio_id is not None:
            query = query.filter(Usuario.municipio_id == municipio_id)

        if ativo is not None:
            query = query.filter(Usuario.ativo == ativo)

        if role_id is not None:
            query = query.filter(Usuario.role_id == role_id)

        total = query.count()

        items = query.offset(skip).limit(limit).all()

        return items, total
