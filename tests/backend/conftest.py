"""
Pytest configuration for backend tests.

1. Adds the `backend/` directory to sys.path so that bare `app.*` imports
   inside backend source modules (e.g. `from app.core.config import settings`)
   resolve correctly — mirroring how the FastAPI app itself is launched from
   the `backend/` working directory.

2. Stubs out `fastapi` so that the service module can be imported without
   a full FastAPI installation in the test venv (only the ingestao/pipeline
   packages are installed here; FastAPI lives in the backend Docker image).
   The HTTPException stub preserves `status_code` and `detail` as instance
   attributes so that tests can assert on `exc_info.value.status_code` and
   `exc_info.value.detail` without a real FastAPI installation.
"""
import sys
import types
from pathlib import Path
from unittest.mock import MagicMock

# --- 1. sys.path fix -------------------------------------------------------
_BACKEND_DIR = Path(__file__).resolve().parents[2] / "backend"
if str(_BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(_BACKEND_DIR))

# --- 2. fastapi stub -------------------------------------------------------
# `insights_service` does `from fastapi import HTTPException` at module level.
# We provide a minimal stub so the import succeeds without a real FastAPI
# install. The stub is intentionally faithful enough for tests that inspect
# status_code / detail on a caught HTTPException.
if "fastapi" not in sys.modules:
    _fastapi_stub = types.ModuleType("fastapi")

    class _HTTPException(Exception):
        """Minimal stand-in for fastapi.HTTPException.

        Stores status_code and detail as instance attributes so that tests
        can assert on them after catching the exception via pytest.raises.
        Any extra kwargs are accepted silently for forward-compatibility.
        """

        def __init__(self, status_code: int = 500, detail: object = None, **kwargs):
            self.status_code = status_code
            self.detail = detail
            super().__init__(detail or "")

    _fastapi_stub.HTTPException = _HTTPException
    sys.modules["fastapi"] = _fastapi_stub
