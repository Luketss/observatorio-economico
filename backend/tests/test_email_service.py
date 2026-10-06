"""email_service.enviar (Resend via requests, nunca lanca) e email_templates.renderizar."""
import logging

import pytest
import requests

import app.services.email_service as email_service
from app.services.email_service import enviar, mascarar_email
from app.services.email_templates import assunto, renderizar


class _Resp:
    def __init__(self, status_code, body=None):
        self.status_code = status_code
        self._body = body if body is not None else {}

    def json(self):
        if isinstance(self._body, Exception):
            raise self._body
        return self._body


@pytest.fixture()
def chave(monkeypatch):
    monkeypatch.setattr(email_service.settings, "RESEND_API_KEY", "re_test_123")
    monkeypatch.setattr(email_service.settings, "EMAIL_REMETENTE", "UAIZI NID <nao-responda@uaizi.com.br>")


def test_enviar_monta_payload_headers_e_timeout(chave, monkeypatch):
    chamadas = []

    def fake_post(url, **kw):
        chamadas.append((url, kw))
        return _Resp(200, {"id": "abc-123"})

    monkeypatch.setattr(email_service.requests, "post", fake_post)
    rid = enviar("lucas@uaizi.com.br", "Assunto X", "<p>oi</p>", "oi")
    assert rid == "abc-123"
    url, kw = chamadas[0]
    assert url == "https://api.resend.com/emails"
    assert kw["timeout"] == 10
    assert kw["headers"]["Authorization"] == "Bearer re_test_123"
    assert kw["json"] == {
        "from": "UAIZI NID <nao-responda@uaizi.com.br>",
        "to": ["lucas@uaizi.com.br"],
        "subject": "Assunto X",
        "html": "<p>oi</p>",
        "text": "oi",
    }


def test_sem_chave_modo_seco_nao_posta_e_devolve_seco(monkeypatch, caplog):
    monkeypatch.setattr(email_service.settings, "RESEND_API_KEY", "   ")
    monkeypatch.setattr(email_service.settings, "ENVIRONMENT", "development")
    monkeypatch.setattr(email_service.requests, "post", lambda *a, **k: pytest.fail("nao deveria postar"))
    with caplog.at_level(logging.INFO, logger="app.email"):
        rid = enviar("lucas@uaizi.com.br", "Assunto", "<p>x</p>", "corpo texto")
    assert rid == "seco"
    assert "l***@uaizi.com.br" in caplog.text
    assert "corpo texto" in caplog.text  # fora de producao o texto vai para o log
    assert "lucas@uaizi.com.br" not in caplog.text


def test_modo_seco_em_producao_nao_loga_corpo(monkeypatch, caplog):
    monkeypatch.setattr(email_service.settings, "RESEND_API_KEY", "")
    monkeypatch.setattr(email_service.settings, "ENVIRONMENT", "production")
    monkeypatch.setattr(email_service.requests, "post", lambda *a, **k: pytest.fail("nao deveria postar"))
    with caplog.at_level(logging.INFO, logger="app.email"):
        assert enviar("a@b.com", "S", "<p>x</p>", "corpo secreto") is None
    assert "corpo secreto" not in caplog.text
    avisos = [r for r in caplog.records if r.levelno == logging.WARNING]
    assert len(avisos) == 1 and "RESEND_API_KEY ausente em producao" in avisos[0].getMessage()
    assert "a***@b.com" in caplog.text and "a@b.com" not in caplog.text


def test_excecao_de_rede_devolve_none_e_loga(chave, monkeypatch, caplog):
    def boom(*a, **k):
        raise requests.ConnectionError("down")

    monkeypatch.setattr(email_service.requests, "post", boom)
    with caplog.at_level(logging.WARNING, logger="app.email"):
        assert enviar("lucas@uaizi.com.br", "S", "<p>x</p>", "x") is None
    assert "l***@uaizi.com.br" in caplog.text
    assert "ConnectionError" in caplog.text


def test_status_nao_2xx_devolve_none(chave, monkeypatch, caplog):
    monkeypatch.setattr(email_service.requests, "post", lambda *a, **k: _Resp(422, {"message": "invalid"}))
    with caplog.at_level(logging.WARNING, logger="app.email"):
        assert enviar("a@b.com", "S", "<p>x</p>", "x") is None
    assert "422" in caplog.text


@pytest.mark.parametrize("corpo", [ValueError("no json"), {}, ["x"]])
def test_2xx_sem_id_devolve_enviado_sem_id_e_avisa(chave, monkeypatch, caplog, corpo):
    monkeypatch.setattr(email_service.requests, "post", lambda *a, **k: _Resp(200, corpo))
    with caplog.at_level(logging.WARNING, logger="app.email"):
        assert enviar("a@b.com", "S", "<p>x</p>", "x") == "enviado-sem-id"
    assert "sem id" in caplog.text


def test_mascarar_email():
    assert mascarar_email("lucas@uaizi.com.br") == "l***@uaizi.com.br"
    assert mascarar_email("a@b.c") == "a***@b.c"
    assert mascarar_email("sem-arroba") == "***"
    assert mascarar_email("") == "***"


def test_renderizar_redefinir_senha_escapa_html_e_preenche_link():
    html, texto = renderizar("redefinir_senha", nome="Ana <b>X</b>", link="https://nid.uaizi.com.br/redefinir-senha?token=abc&x=1")
    assert "Ana &lt;b&gt;X&lt;/b&gt;" in html
    assert "<b>X</b>" not in html
    assert 'href="https://nid.uaizi.com.br/redefinir-senha?token=abc&amp;x=1"' in html
    assert "https://nid.uaizi.com.br/redefinir-senha?token=abc&x=1" in texto
    assert "30 minutos" in html and "30 minutos" in texto
    assert "UAIZI NID" in html and "não responda" in html.lower()
    assert "$conteudo" not in html and "$nome" not in html


def test_renderizar_codigo_verificacao():
    html, texto = renderizar("codigo_verificacao", codigo="012345", finalidade="entrar na plataforma")
    assert "012345" in html and "012345" in texto
    assert "entrar na plataforma" in html
    assert "10 minutos" in texto


def test_renderizar_template_desconhecido():
    with pytest.raises(KeyError):
        renderizar("nao_existe", x=1)


def test_assunto():
    assert assunto("redefinir_senha") == "Redefinicao de senha - UAIZI NID"
    assert assunto("codigo_verificacao") == "Seu codigo de verificacao - UAIZI NID"
