from datetime import datetime, timezone

from app.core.exceptions import UnauthorizedException
from app.core.security import (
    DUMMY_PASSWORD_HASH,
    create_access_token,
    create_refresh_token,
    decode_token,
    verify_password,
)
from app.db.repositories.usuario_repository import UsuarioRepository
from app.models.login_audit import LoginAudit
from sqlalchemy.orm import Session


class AuthService:
    """
    Camada de autenticação (Business Layer).
    """

    def __init__(self, session: Session):
        self.session = session
        self.usuario_repository = UsuarioRepository(session)

    def _record_attempt(
        self,
        usuario_id: int | None,
        email: str,
        sucesso: bool,
        motivo: str,
        ip: str | None,
        user_agent: str | None,
    ) -> None:
        """Persist a login attempt. Never let an audit failure break login."""
        try:
            self.session.add(
                LoginAudit(
                    usuario_id=usuario_id,
                    email_tentado=email,
                    sucesso=sucesso,
                    motivo=motivo,
                    ip=ip,
                    user_agent=user_agent,
                )
            )
            self.session.commit()
        except Exception:
            self.session.rollback()

    def authenticate(
        self,
        email: str,
        password: str,
        ip: str | None = None,
        user_agent: str | None = None,
    ) -> dict:
        user = self.usuario_repository.get_by_email(email)

        # Always run bcrypt so response time doesn't reveal whether the
        # email exists (timing-based account enumeration).
        if not user:
            verify_password(password, DUMMY_PASSWORD_HASH)
            self._record_attempt(
                None, email, False, "invalid_credentials", ip, user_agent
            )
            raise UnauthorizedException("Invalid credentials")

        if not verify_password(password, user.senha_hash):
            self._record_attempt(
                user.id, email, False, "invalid_credentials", ip, user_agent
            )
            raise UnauthorizedException("Invalid credentials")

        if not user.ativo:
            self._record_attempt(user.id, email, False, "inactive", ip, user_agent)
            raise UnauthorizedException("User is inactive")

        access_token = create_access_token(
            subject=str(user.id),
            extra_data={
                "role": user.role.nome,
                "municipio_id": user.municipio_id,
            },
        )

        refresh_token = create_refresh_token(subject=str(user.id))

        # Update last_login and record the successful attempt in one commit.
        user.last_login = datetime.now(timezone.utc)
        self.session.add(user)
        self._record_attempt(user.id, email, True, "ok", ip, user_agent)

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
