"""Backend plan-module access enforcement (scoped_modulo / _ensure_modulo)."""
from types import SimpleNamespace

import pytest

import app.api.deps as deps
from app.core.exceptions import ForbiddenException


def _user(role, plano="free"):
    return SimpleNamespace(
        role=SimpleNamespace(nome=role),
        municipio=SimpleNamespace(plano=plano) if plano else None,
        municipio_id=42,
    )


def test_admin_global_bypasses(monkeypatch):
    # Must not even look at the plan.
    monkeypatch.setattr(deps, "_plano_modulos", lambda db, u: [])
    deps._ensure_modulo(None, _user("ADMIN_GLOBAL"), "pib")  # no raise


def test_non_admin_without_module_is_forbidden(monkeypatch):
    monkeypatch.setattr(deps, "_plano_modulos", lambda db, u: ["caged"])
    with pytest.raises(ForbiddenException):
        deps._ensure_modulo(object(), _user("ADMIN_MUNICIPIO"), "pib")


def test_non_admin_with_module_passes(monkeypatch):
    monkeypatch.setattr(deps, "_plano_modulos", lambda db, u: ["pib", "caged"])
    deps._ensure_modulo(object(), _user("ADMIN_MUNICIPIO"), "pib")  # no raise


def test_scoped_modulo_returns_own_municipio_for_non_admin(monkeypatch):
    monkeypatch.setattr(deps, "_plano_modulos", lambda db, u: ["pib"])
    dep = deps.scoped_modulo("pib")
    # non-admin: ignores the query param, returns own município
    assert dep(municipio_id=999, current_user=_user("ADMIN_MUNICIPIO"), db=object()) == 42


def test_scoped_modulo_uses_param_for_admin():
    dep = deps.scoped_modulo("pib")
    admin = _user("ADMIN_GLOBAL", plano=None)
    assert dep(municipio_id=7, current_user=admin, db=object()) == 7
    assert dep(municipio_id=None, current_user=admin, db=object()) is None
