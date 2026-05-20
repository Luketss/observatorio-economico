"""
Tests for the AuthenticatedUser schema.

The IPS page defaults to the logged account's município, which requires the
user's `estado` to be present on the /auth/me payload. This guards that the
field exists and is optional (None for ADMIN_GLOBAL accounts with no município).
"""
from app.schemas.auth import AuthenticatedUser


def test_authenticated_user_has_optional_estado():
    user = AuthenticatedUser(
        id=1, nome="Maria", email="maria@x.com",
        municipio_id=10, role="ADMIN_MUNICIPIO", ativo=True,
    )
    # estado defaults to None when omitted (e.g. ADMIN_GLOBAL)
    assert user.estado is None


def test_authenticated_user_accepts_estado():
    user = AuthenticatedUser(
        id=2, nome="João", email="joao@x.com",
        municipio_id=10, estado="MG", role="ADMIN_MUNICIPIO", ativo=True,
    )
    assert user.estado == "MG"
