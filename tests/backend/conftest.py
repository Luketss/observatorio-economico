"""
Pytest configuration for backend tests.

1. Adds the `backend/` directory to sys.path so that bare `app.*` imports
   inside backend source modules (e.g. `from app.core.config import settings`)
   resolve correctly — mirroring how the FastAPI app itself is launched from
   the `backend/` working directory.

2. Stubs out `fastapi` so that the service module can be imported without
   a full FastAPI installation in the test venv (only the ingestao/pipeline
   packages are installed here; FastAPI lives in the backend Docker image).
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
# We provide a minimal stub so the import succeeds; HTTPException is only
# raised at runtime (inside gerar_prioridades), which the tests don't hit.
if "fastapi" not in sys.modules:
    _fastapi_stub = types.ModuleType("fastapi")
    _fastapi_stub.HTTPException = type("HTTPException", (Exception,), {"__init__": lambda self, *a, **kw: None})
    sys.modules["fastapi"] = _fastapi_stub
