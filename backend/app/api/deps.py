from app.core.security import decode_token
from app.db.session import SessionLocal
from app.models.usuario import Usuario
from fastapi import Depends
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
        from app.core.exceptions import UnauthorizedException

        raise UnauthorizedException("Invalid or expired token")

    user_id = payload.get("sub")

    if user_id is None:
        from app.core.exceptions import UnauthorizedException

        raise UnauthorizedException("Invalid token payload")

    user = db.get(Usuario, int(user_id))

    if not user or not user.ativo:
        from app.core.exceptions import UnauthorizedException

        raise UnauthorizedException("User not found or inactive")

    return user


def require_role(required_role: str):
    def role_checker(current_user: Usuario = Depends(get_current_user)):
        if current_user.role.nome != required_role:
            from app.core.exceptions import ForbiddenException

            raise ForbiddenException("Insufficient permissions")
        return current_user

    return role_checker
