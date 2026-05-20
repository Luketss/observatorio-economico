"""
Tests for the LoginAuditOut schema.

The login audit list now shows every account's activity and identifies each row
by user name + role. The endpoint constructs LoginAuditOut explicitly from a
joined query, so the new fields must be optional (None for attempts on unknown
emails, which have no account). Runs in the lightweight venv (pydantic only).
"""
from datetime import datetime

from app.schemas.login_audit import LoginAuditOut


def _base_kwargs():
    return dict(
        id=1,
        email_tentado="user@x.com",
        sucesso=True,
        criado_em=datetime(2026, 5, 20, 12, 0, 0),
    )


def test_out_defaults_nome_and_papel_to_none():
    """Unknown-email attempts have no resolved account."""
    out = LoginAuditOut(**_base_kwargs())
    assert out.nome is None
    assert out.papel is None


def test_out_carries_nome_and_papel():
    out = LoginAuditOut(
        **_base_kwargs(),
        usuario_id=10,
        nome="Maria",
        papel="ADMIN_MUNICIPIO",
    )
    assert out.nome == "Maria"
    assert out.papel == "ADMIN_MUNICIPIO"
