from types import SimpleNamespace

from app.core.rate_limit import chave_por_usuario
from app.core.security import create_access_token


def _req(headers=None, host="10.0.0.1"):
    return SimpleNamespace(headers=headers or {}, client=SimpleNamespace(host=host))


def test_com_bearer_valido_chave_e_o_usuario():
    token = create_access_token("42")
    assert chave_por_usuario(_req({"authorization": f"Bearer {token}"})) == "user:42"


def test_sem_token_ou_token_invalido_cai_para_ip():
    assert chave_por_usuario(_req()) == "10.0.0.1"
    assert chave_por_usuario(_req({"authorization": "Bearer nao-e-jwt"})) == "10.0.0.1"
