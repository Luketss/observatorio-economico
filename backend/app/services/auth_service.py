import time
from datetime import datetime, timezone

from app.core.exceptions import AppException, UnauthorizedException
from app.core.mfa_crypto import exigir_chave
from app.core.security import (
    DUMMY_PASSWORD_HASH,
    create_access_token,
    create_mfa_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)
from app.db.repositories.usuario_repository import UsuarioRepository
from app.models.login_audit import LoginAudit
from app.models.usuario import Usuario
from app.services.mfa_service import MfaService
from sqlalchemy.orm import Session

# Falhas de 2o fator por mfa_token (jti): 5 falhas invalidam o token. Em memoria,
# por processo, TTL 5 min (= validade do token). Aceito pela spec (volume baixo).
MFA_MAX_FALHAS = 5
_FALHAS_MFA: dict[str, tuple[int, float]] = {}


def _registrar_falha_mfa(jti: str) -> int:
    agora = time.time()
    for k, (_, exp) in list(_FALHAS_MFA.items()):
        if exp < agora:
            _FALHAS_MFA.pop(k, None)
    n, exp = _FALHAS_MFA.get(jti, (0, agora + 300))
    _FALHAS_MFA[jti] = (n + 1, exp)
    return n + 1


def _token_mfa_invalidado(jti: str) -> bool:
    n, exp = _FALHAS_MFA.get(jti, (0, 0))
    return exp >= time.time() and n >= MFA_MAX_FALHAS


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

    def _emitir_tokens(self, user: Usuario) -> dict:
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

        # Segundo fator: nao emite tokens, nao audita, nao atualiza last_login
        # ate o codigo ser verificado em /auth/mfa/verificar.
        if user.mfa is not None and user.mfa.ativo:
            return {"mfa_obrigatorio": True, "mfa_token": create_mfa_token(str(user.id))}

        tokens = self._emitir_tokens(user)

        # Update last_login and record the successful attempt in one commit.
        user.last_login = datetime.now(timezone.utc)
        self.session.add(user)
        self._record_attempt(user.id, email, True, "ok", ip, user_agent)

        return tokens

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

    def verificar_mfa(self, mfa_token: str, codigo: str, ip: str | None, user_agent: str | None) -> dict:
        payload = decode_token(mfa_token)
        if not payload or payload.get("type") != "mfa" or not payload.get("jti"):
            raise AppException(
                code="MFA_SESSAO_INVALIDA",
                message="Sessao de verificacao invalida ou expirada; faca login de novo",
                status_code=401,
            )
        jti = payload["jti"]
        if _token_mfa_invalidado(jti):
            raise AppException(
                code="MFA_TOKEN_INVALIDADO", message="Muitas tentativas; faca login de novo", status_code=401
            )
        try:
            uid = int(payload.get("sub"))
        except (TypeError, ValueError):
            raise AppException(code="MFA_SESSAO_INVALIDA", message="Sessao de verificacao invalida", status_code=401)
        user = self.session.get(Usuario, uid)
        if not user or not user.ativo or user.mfa is None or not user.mfa.ativo:
            raise AppException(code="MFA_SESSAO_INVALIDA", message="Sessao de verificacao invalida", status_code=401)
        exigir_chave()
        if not MfaService(self.session).codigo_valido(user.mfa, codigo):
            self._record_attempt(user.id, user.email, False, "mfa_invalido", ip, user_agent)
            n = _registrar_falha_mfa(jti)
            if n >= MFA_MAX_FALHAS:
                raise AppException(
                code="MFA_TOKEN_INVALIDADO", message="Muitas tentativas; faca login de novo", status_code=401
            )
            raise UnauthorizedException("Codigo invalido")
        # Uso unico: marca o jti como consumido ate expirar (reuso cai no pre-check).
        _FALHAS_MFA[jti] = (MFA_MAX_FALHAS, payload["exp"])
        tokens = self._emitir_tokens(user)
        user.last_login = datetime.now(timezone.utc)
        self.session.add(user)
        self._record_attempt(user.id, user.email, True, "mfa_ok", ip, user_agent)
        return tokens

    def alterar_senha(self, user, senha_atual: str, nova_senha: str) -> None:
        if not verify_password(senha_atual, user.senha_hash):
            raise AppException(
                code="INVALID_PASSWORD",
                message="Senha atual incorreta.",
                status_code=400,
            )
        user.senha_hash = hash_password(nova_senha)
        self.session.add(user)
        self.session.commit()
