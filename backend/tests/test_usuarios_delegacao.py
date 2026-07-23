"""Regras puras da delegação de usuários (sem DB)."""
from app.api.v1.routers.usuarios import erros_payload_delegado


def test_delegado_nao_muda_role():
    erros = erros_payload_delegado(
        payload={"role_id": 5}, alvo_role_id=3, alvo_id=10, ator_id=2,
        alvo_municipio_id=7, alvo_role_nome="VISUALIZADOR",
    )
    assert any("role" in e for e in erros)


def test_delegado_role_igual_ok():
    erros = erros_payload_delegado(
        payload={"role_id": 3}, alvo_role_id=3, alvo_id=10, ator_id=2,
        alvo_municipio_id=7, alvo_role_nome="VISUALIZADOR",
    )
    assert erros == []


def test_delegado_nao_muda_municipio():
    erros = erros_payload_delegado(
        payload={"municipio_id": 8}, alvo_role_id=3, alvo_id=10, ator_id=2,
        alvo_municipio_id=7, alvo_role_nome="VISUALIZADOR",
    )
    # "munic" e não "municipio": a mensagem tem acento ("município").
    assert any("munic" in e.lower() for e in erros)


def test_delegado_nao_se_desativa():
    erros = erros_payload_delegado(
        payload={"ativo": False}, alvo_role_id=3, alvo_id=2, ator_id=2,
        alvo_municipio_id=7, alvo_role_nome="VISUALIZADOR",
    )
    assert any("si mesmo" in e for e in erros)


def test_delegado_desativa_outro_ok():
    erros = erros_payload_delegado(
        payload={"ativo": False}, alvo_role_id=3, alvo_id=10, ator_id=2,
        alvo_municipio_id=7, alvo_role_nome="VISUALIZADOR",
    )
    assert erros == []


def test_payload_normal_ok():
    erros = erros_payload_delegado(
        payload={"nome": "Novo", "email": "a@b.com"},
        alvo_role_id=3, alvo_id=10, ator_id=2, alvo_municipio_id=7,
        alvo_role_nome="VISUALIZADOR",
    )
    assert erros == []


def test_delegado_nao_altera_senha_de_admin_municipio():
    erros = erros_payload_delegado(
        payload={"senha": "novaSenha123"},
        alvo_role_id=3, alvo_id=10, ator_id=2, alvo_municipio_id=7,
        alvo_role_nome="ADMIN_MUNICIPIO",
    )
    assert any("senha" in e.lower() for e in erros)


def test_delegado_nao_altera_email_de_admin_municipio():
    erros = erros_payload_delegado(
        payload={"email": "novo@x.com"},
        alvo_role_id=3, alvo_id=10, ator_id=2, alvo_municipio_id=7,
        alvo_role_nome="ADMIN_MUNICIPIO",
    )
    assert any("e-mail" in e.lower() or "email" in e.lower() for e in erros)


def test_delegado_altera_senha_de_visualizador_ok():
    erros = erros_payload_delegado(
        payload={"senha": "novaSenha123"},
        alvo_role_id=3, alvo_id=10, ator_id=2, alvo_municipio_id=7,
        alvo_role_nome="VISUALIZADOR",
    )
    assert erros == []
