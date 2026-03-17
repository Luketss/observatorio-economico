from app.core.exceptions import UnauthorizedException
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    verify_password,
)
from app.db.repositories.usuario_repository import UsuarioRepository
from sqlalchemy.orm import Session


class AuthService:
    """
    Camada de autenticação (Business Layer).
    """

    def __init__(self, session: Session):
        self.session = session
        self.usuario_repository = UsuarioRepository(session)

    def authenticate(self, email: str, password: str) -> dict:
        user = self.usuario_repository.get_by_email(email)

        if not user:
            raise UnauthorizedException("Invalid credentials")

        if not verify_password(password, user.senha_hash):
            raise UnauthorizedException("Invalid credentials")

        if not user.ativo:
            raise UnauthorizedException("User is inactive")

        access_token = create_access_token(
            subject=str(user.id),
            extra_data={
                "role": user.role.nome,
                "municipio_id": user.municipio_id,
            },
        )

        refresh_token = create_refresh_token(subject=str(user.id))

        return {
            "access_token": access_token,
            "refresh_token": refresh_token,
            "token_type": "bearer",
        }

    def refresh(self, refresh_token: str) -> dict:
        payload = decode_token(refresh_token)

        if not payload:
            raise UnauthorizedException("Invalid refresh token")

        if payload.get("type") != "refresh":
            raise UnauthorizedException("Invalid token type")

        user_id = payload.get("sub")
        if not user_id:
            raise UnauthorizedException("Invalid token payload")

        user = self.usuario_repository.get_by_id(int(user_id))
        if not user or not user.ativo:
            raise UnauthorizedException("User not found or inactive")

        new_access_token = create_access_token(
            subject=str(user.id),
            extra_data={
                "role": user.role.nome,
                "municipio_id": user.municipio_id,
            },
        )

        return {
            "access_token": new_access_token,
            "token_type": "bearer",
        }
