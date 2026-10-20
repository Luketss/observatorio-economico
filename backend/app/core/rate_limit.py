"""
Central slowapi limiter.

Lives here (not in main.py) so both the FastAPI app and individual routers
can import it without creating a circular import — routers must never import
`app.main`.

Note: the default storage is in-memory, so under gunicorn with multiple
workers each worker keeps its own counters (effective limit ≈ n_workers ×
the configured rate). That still caps brute force with no extra infra. To
make limits exact across workers, pass `storage_uri="redis://..."`.
"""

from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)


def chave_por_usuario(request) -> str:
    """Chave por usuario autenticado (IP sozinho limitaria uma prefeitura inteira atras de um NAT)."""
    from app.core.security import decode_token

    auth = request.headers.get("authorization") or ""
    scheme, _, token = auth.partition(" ")
    if scheme.lower() == "bearer" and token:
        payload = decode_token(token.strip())
        if payload and payload.get("sub"):
            return f"user:{payload['sub']}"
    return get_remote_address(request)
