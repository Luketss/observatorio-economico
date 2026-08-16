"""Helpers do audit_service — lógica pura, fakes, sem DB."""
from app.services.audit_service import (
    montar_detalhe_atualizacao,
    origem_do_request,
    registrar_acao,
)


class _FakeClient:
    host = "10.0.0.1"


class _FakeRequest:
    def __init__(self, headers=None, client=_FakeClient()):
        self.headers = headers or {}
        self.client = client


class _FakeDB:
    def __init__(self, fail=False):
        self.added, self.commits, self.rollbacks = [], 0, 0
        self._fail = fail

    def add(self, obj):
        if self._fail:
            raise RuntimeError("boom")
        self.added.append(obj)

    def commit(self):
        self.commits += 1

    def rollback(self):
        self.rollbacks += 1


class _FakeUser:
    def __init__(self, id=1, email="ator@x.com", municipio_id=None):
        self.id, self.email, self.municipio_id = id, email, municipio_id


def test_origem_prefere_x_forwarded_for():
    req = _FakeRequest(headers={"x-forwarded-for": "1.2.3.4, 10.0.0.9",
                                "user-agent": "UA"})
    assert origem_do_request(req) == ("1.2.3.4", "UA")


def test_origem_fallback_socket_e_request_none():
    assert origem_do_request(_FakeRequest()) == ("10.0.0.1", None)
    assert origem_do_request(None) == (None, None)


def test_detalhe_lista_campos_sem_valores():
    d = montar_detalhe_atualizacao(["senha", "nome"])
    assert "senha" in d and "nome" in d
    assert "campos:" in d


def test_detalhe_role_e_ativo_de_para():
    d = montar_detalhe_atualizacao(
        ["role_id", "ativo"],
        role_de="VISUALIZADOR", role_para="ADMIN_MUNICIPIO",
        ativo_de=True, ativo_para=False,
    )
    assert "VISUALIZADOR → ADMIN_MUNICIPIO" in d
    assert "ativo: True → False" in d


def test_detalhe_role_igual_nao_aparece():
    d = montar_detalhe_atualizacao(["nome"], role_de="X", role_para="X")
    assert "role:" not in d


def test_registrar_acao_grava_snapshots():
    db = _FakeDB()
    ator = _FakeUser()
    alvo = _FakeUser(id=2, email="alvo@x.com", municipio_id=7)
    registrar_acao(
        db, categoria="acao", acao="usuario_criado", ator=ator, alvo=alvo,
        request=_FakeRequest(headers={"user-agent": "UA"}),
    )
    assert db.commits == 1
    linha = db.added[0]
    assert (linha.ator_id, linha.ator_email) == (1, "ator@x.com")
    assert (linha.alvo_usuario_id, linha.alvo_email) == (2, "alvo@x.com")
    assert linha.municipio_id == 7  # herdado do alvo
    assert linha.ip == "10.0.0.1"


def test_registrar_acao_nunca_propaga_falha():
    db = _FakeDB(fail=True)
    registrar_acao(db, categoria="acao", acao="usuario_criado",
                   ator=_FakeUser())  # não pode levantar
    assert db.rollbacks == 1
