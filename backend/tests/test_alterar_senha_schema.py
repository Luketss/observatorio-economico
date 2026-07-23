"""Validação pura do payload de troca de senha."""
import pytest
from app.schemas.auth import AlterarSenhaPayload


def test_payload_valido():
    p = AlterarSenhaPayload(senha_atual="antiga1", nova_senha="nova123")
    assert p.nova_senha == "nova123"


def test_nova_senha_curta():
    with pytest.raises(ValueError):
        AlterarSenhaPayload(senha_atual="antiga1", nova_senha="12345")


def test_senha_atual_obrigatoria():
    with pytest.raises(ValueError):
        AlterarSenhaPayload(nova_senha="nova123")
