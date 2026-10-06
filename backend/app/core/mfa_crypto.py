"""Cifra em repouso do segredo TOTP (Fernet). Sem chave configurada, MFA fica indisponivel."""
from cryptography.fernet import Fernet, InvalidToken

from app.core.config import settings
from app.core.exceptions import AppException, UnauthorizedException


class MfaIndisponivel(AppException):
    def __init__(self, message: str = "MFA indisponivel no servidor (MFA_ENCRYPTION_KEY ausente ou invalida)"):
        super().__init__(code="MFA_INDISPONIVEL", message=message, status_code=503)


def chave_configurada() -> bool:
    return bool((settings.MFA_ENCRYPTION_KEY or "").strip())


def exigir_chave() -> None:
    if not chave_configurada():
        raise MfaIndisponivel()


def _fernet() -> Fernet:
    exigir_chave()
    try:
        return Fernet(settings.MFA_ENCRYPTION_KEY.strip().encode())
    except (ValueError, TypeError) as exc:
        raise MfaIndisponivel() from exc


def cifrar(texto: str) -> str:
    return _fernet().encrypt(texto.encode()).decode()


def decifrar(token: str) -> str:
    try:
        return _fernet().decrypt(token.encode()).decode()
    except InvalidToken as exc:
        raise UnauthorizedException("Segredo MFA invalido; zere e recadastre o MFA") from exc
