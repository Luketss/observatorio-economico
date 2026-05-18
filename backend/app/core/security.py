import secrets
from datetime import datetime, timedelta, timezone
from typing import Any, Dict

from app.core.config import settings
from jose import JWTError, jwt
from passlib.context import CryptContext

ALGORITHM = "HS256"

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# Precomputed bcrypt hash used to keep `authenticate()` constant-time when
# the email is unknown — without this, response time leaks email existence.
DUMMY_PASSWORD_HASH = pwd_context.hash(secrets.token_urlsafe(32))


# ==============================
# Password Handling
# ==============================


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


# Compatibilidade com services que usam nome antigo
def get_password_hash(password: str) -> str:
    return hash_password(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


# ==============================
# JWT Handling
# ==============================


def create_access_token(subject: str, extra_data: Dict[str, Any] | None = None) -> str:
    now = datetime.now(timezone.utc)
    expire = now + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)

    to_encode: Dict[str, Any] = {
        "sub": subject,
        "type": "access",
        "exp": expire,
        "iat": now,
    }

    if extra_data:
        to_encode.update(extra_data)

    encoded_jwt = jwt.encode(
        to_encode,
        settings.SECRET_KEY,
        algorithm=ALGORITHM,
    )

    return encoded_jwt


def create_refresh_token(subject: str) -> str:
    now = datetime.now(timezone.utc)
    expire = now + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)

    to_encode: Dict[str, Any] = {
        "sub": subject,
        "type": "refresh",
        "exp": expire,
        "iat": now,
    }

    encoded_jwt = jwt.encode(
        to_encode,
        settings.SECRET_KEY,
        algorithm=ALGORITHM,
    )

    return encoded_jwt


def decode_token(token: str) -> Dict[str, Any] | None:
    try:
        payload = jwt.decode(
            token,
            settings.SECRET_KEY,
            algorithms=[ALGORITHM],
        )
        return payload
    except JWTError:
        return None
