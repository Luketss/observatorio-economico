from app.core.exceptions import ForbiddenException, UnauthorizedException
from app.core.security import decode_token
from app.db.session import SessionLocal
from app.models.usuario import Usuario
from fastapi import Depends, Query
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> Usuario:
    payload = decode_token(token)

    if payload is None:
        raise UnauthorizedException("Invalid or expired token")

    # Refresh tokens must never be accepted as access tokens — they have a
    # much longer lifetime and are only valid against /auth/refresh.
    if payload.get("type") != "access":
        raise UnauthorizedException("Invalid token type")

    user_id = payload.get("sub")

    if user_id is None:
        raise UnauthorizedException("Invalid token payload")

    try:
        uid = int(user_id)
    except (TypeError, ValueError):
        raise UnauthorizedException("Invalid token payload")

    user = db.get(Usuario, uid)

    if not user or not user.ativo:
        raise UnauthorizedException("User not found or inactive")

    return user


def require_role(required_role: str):
    def role_checker(current_user: Usuario = Depends(get_current_user)):
        if current_user.role.nome != required_role:
            raise ForbiddenException("Insufficient permissions")
        return current_user

    return role_checker


def municipio_scope(
    municipio_id: int | None = Query(default=None),
    current_user: Usuario = Depends(get_current_user),
) -> int | None:
    """Resolve which município a single-município dashboard endpoint should scope to.

    - Non-ADMIN_GLOBAL users are always scoped to their own município; the
      `municipio_id` query param is ignored (a município user can never read
      another município's data).
    - ADMIN_GLOBAL is scoped to the município sent by the front's "view-as"
      override (`?municipio_id=`); when none is selected this returns None, and
      the endpoint should return an empty payload so the UI prompts for a
      selection instead of stacking every município onto the same chart.

    Auth is still enforced because this depends on get_current_user.
    """
    if current_user.role.nome != "ADMIN_GLOBAL":
        return current_user.municipio_id
    return municipio_id
