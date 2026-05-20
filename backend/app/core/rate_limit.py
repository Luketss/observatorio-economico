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
