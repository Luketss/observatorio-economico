"""Redefinicao de senha por e-mail: modelo e purga (Task 2); servico e rotas (Task 3)."""
import re
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker

import app.models  # noqa: F401
from app.core.datas import garantir_utc
from app.core.security import hash_password, verify_password
from app.db.base import Base
from app.models.acao_audit import AcaoAudit
from app.models.login_audit import LoginAudit
from app.models.municipio import Municipio
from app.models.redefinicao_senha import RedefinicaoSenha
from app.models.role import Role
from app.models.usuario import Usuario
from app.models.usuario_mfa import UsuarioMfa
from app.services.audit_service import purgar_auditoria
import app.services.redefinicao_senha_service as redef_mod
from app.api.v1.routers.auth import esqueci_senha, redefinir_senha, validar_redefinicao
from app.core.exceptions import AppException
from app.schemas.redefinicao_senha import EsqueciSenhaIn, RedefinirSenhaIn
from app.services.redefinicao_senha_service import (
    MENSAGEM_GENERICA,
    RedefinicaoSenhaService,
    hash_token,
)
from pydantic import ValidationError


class _FakeClient:
    host = "10.0.0.1"


class _FakeRequest:
    headers = {"user-agent": "pytest"}
    client = _FakeClient()


@pytest.fixture(autouse=True)
def limiter_desligado(monkeypatch):
    # Handlers decorados com @limiter.limit sao chamados direto com _FakeRequest.
    from app.core.rate_limit import limiter
    monkeypatch.setattr(limiter, "enabled", False)


@pytest.fixture()
def db():
    engine = create_engine("sqlite://")

    @event.listens_for(engine, "connect")
    def _fk_on(dbapi_conn, _record):
        dbapi_conn.execute("PRAGMA foreign_keys=ON")

    Base.metadata.create_all(engine, tables=[
        Municipio.__table__, Role.__table__, Usuario.__table__, UsuarioMfa.__table__,
        RedefinicaoSenha.__table__, LoginAudit.__table__, AcaoAudit.__table__,
    ])
    s = sessionmaker(bind=engine)()
    s.add(Role(nome="VISUALIZADOR", builtin=True, permissoes={}))
    s.commit()
    yield s
    s.close()


def _usuario(db, email="ana@x.gov.br", ativo=True):
    role = db.query(Role).filter(Role.nome == "VISUALIZADOR").one()
    u = Usuario(nome="Ana", email=email, senha_hash=hash_password("senha123"), role_id=role.id, ativo=ativo)
    db.add(u)
    db.commit()
    return u


def _agora():
    return datetime.now(timezone.utc)


# ---------- Task 2: modelo, garantir_utc, purga ----------

def test_modelo_colunas_fk_cascade_e_unicidade():
    cols = {c.name: c for c in RedefinicaoSenha.__table__.columns}
    assert set(cols) == {"id", "usuario_id", "token_hash", "expira_em", "usado_em", "ip", "criado_em"}
    fk = next(iter(cols["usuario_id"].foreign_keys))
    assert fk.ondelete == "CASCADE"
    assert cols["token_hash"].unique is True
    assert cols["token_hash"].type.length == 64
    assert cols["usado_em"].nullable is True and cols["ip"].nullable is True


def test_excluir_usuario_apaga_tokens(db):
    u = _usuario(db)
    db.add(RedefinicaoSenha(usuario_id=u.id, token_hash="a" * 64, expira_em=_agora() + timedelta(minutes=30)))
    db.commit()
    db.delete(u)
    db.commit()
    assert db.query(RedefinicaoSenha).count() == 0


def test_garantir_utc():
    assert garantir_utc(None) is None
    naive = datetime(2026, 10, 6, 12, 0, 0)
    assert garantir_utc(naive).tzinfo == timezone.utc
    aware = datetime(2026, 10, 6, 12, 0, 0, tzinfo=timezone(timedelta(hours=-3)))
    assert garantir_utc(aware) is aware


def test_purga_apaga_tokens_com_mais_de_24h(db):
    u = _usuario(db)
    agora = _agora()
    db.add(RedefinicaoSenha(usuario_id=u.id, token_hash="b" * 64, expira_em=agora, criado_em=agora - timedelta(hours=25)))
    db.add(RedefinicaoSenha(usuario_id=u.id, token_hash="c" * 64, expira_em=agora, criado_em=agora - timedelta(hours=23)))
    db.commit()
    resultado = purgar_auditoria(db, agora=agora)
    assert resultado["redefinicoes"] == 1
    assert [r.token_hash for r in db.query(RedefinicaoSenha).all()] == ["c" * 64]


# ---------- Task 3: servico e rotas ----------

@pytest.fixture()
def enviados(monkeypatch):
    """Espiona email_service.enviar como importado pelo servico; devolve a lista de envios."""
    lista = []

    def fake_enviar(para, assunto, html, texto):
        lista.append({"para": para, "assunto": assunto, "html": html, "texto": texto})
        return "id-fake"

    monkeypatch.setattr(redef_mod, "enviar", fake_enviar)
    monkeypatch.setattr(redef_mod.settings, "FRONTEND_URL", "https://nid.uaizi.com.br")
    return lista


def _token_do_envio(envio):
    return re.search(r"token=([A-Za-z0-9_\-]+)", envio["texto"]).group(1)


def test_solicitar_email_inexistente_nao_envia_nem_grava(db, enviados):
    RedefinicaoSenhaService(db).solicitar("ninguem@x.gov.br", ip="1.2.3.4")
    assert enviados == []
    assert db.query(RedefinicaoSenha).count() == 0


def test_solicitar_usuario_inativo_nao_envia(db, enviados):
    _usuario(db, ativo=False)
    RedefinicaoSenhaService(db).solicitar("ana@x.gov.br")
    assert enviados == [] and db.query(RedefinicaoSenha).count() == 0


def test_solicitar_normaliza_email(db, enviados):
    _usuario(db)
    RedefinicaoSenhaService(db).solicitar("  ANA@X.GOV.BR ")
    assert len(enviados) == 1 and enviados[0]["para"] == "ana@x.gov.br"
    assert db.query(RedefinicaoSenha).count() == 1


def test_solicitar_grava_hash_e_envia_link_com_frontend_url(db, enviados):
    u = _usuario(db)
    RedefinicaoSenhaService(db).solicitar("ana@x.gov.br", ip="9.9.9.9")
    reg = db.query(RedefinicaoSenha).one()
    token = _token_do_envio(enviados[0])
    assert len(token) >= 40
    assert reg.token_hash == hash_token(token)
    assert token not in reg.token_hash and reg.usuario_id == u.id and reg.ip == "9.9.9.9"
    assert reg.usado_em is None
    assert "https://nid.uaizi.com.br/redefinir-senha?token=" + token in enviados[0]["texto"]
    assert "Ana" in enviados[0]["html"]
    assert enviados[0]["assunto"] == "Redefinicao de senha - UAIZI NID"


def test_link_sem_barra_dupla(db, enviados, monkeypatch):
    monkeypatch.setattr(redef_mod.settings, "FRONTEND_URL", "https://nid.uaizi.com.br/")
    _usuario(db)
    RedefinicaoSenhaService(db).solicitar("ana@x.gov.br")
    assert "https://nid.uaizi.com.br/redefinir-senha?token=" in enviados[0]["texto"]
    assert "//redefinir-senha" not in enviados[0]["texto"]


def test_segundo_pedido_invalida_o_primeiro(db, enviados):
    _usuario(db)
    svc = RedefinicaoSenhaService(db)
    svc.solicitar("ana@x.gov.br")
    svc.solicitar("ana@x.gov.br")
    t1, t2 = (_token_do_envio(e) for e in enviados)
    with pytest.raises(AppException) as exc:
        svc.validar(t1)
    assert exc.value.status_code == 410 and exc.value.code == "TOKEN_INVALIDO"
    assert svc.validar(t2).email == "ana@x.gov.br"


def test_quarto_pedido_na_hora_nao_envia(db, enviados):
    _usuario(db)
    svc = RedefinicaoSenhaService(db)
    for _ in range(4):
        svc.solicitar("ana@x.gov.br")
    assert len(enviados) == 3
    assert db.query(RedefinicaoSenha).count() == 3


def test_validar_token_com_espacos_e_desconhecido(db, enviados):
    _usuario(db)
    svc = RedefinicaoSenhaService(db)
    svc.solicitar("ana@x.gov.br")
    token = _token_do_envio(enviados[0])
    assert svc.validar(f"  {token}\n").email == "ana@x.gov.br"
    for ruim in ("x" * 43, "", "   "):
        with pytest.raises(AppException) as exc:
            svc.validar(ruim)
        assert exc.value.status_code == 410


def test_validar_expirado_410(db, enviados):
    _usuario(db)
    svc = RedefinicaoSenhaService(db)
    svc.solicitar("ana@x.gov.br")
    reg = db.query(RedefinicaoSenha).one()
    reg.expira_em = _agora() - timedelta(minutes=1)
    db.commit()
    with pytest.raises(AppException) as exc:
        svc.validar(_token_do_envio(enviados[0]))
    assert exc.value.code == "TOKEN_INVALIDO"


def test_redefinir_troca_senha_marca_usado_audita_e_reuso_410(db, enviados):
    u = _usuario(db)
    svc = RedefinicaoSenhaService(db)
    svc.solicitar("ana@x.gov.br")
    token = _token_do_envio(enviados[0])
    svc.redefinir(token, "novaSenha9", request=_FakeRequest())
    db.refresh(u)
    assert verify_password("novaSenha9", u.senha_hash) and not verify_password("senha123", u.senha_hash)
    reg = db.query(RedefinicaoSenha).one()
    assert reg.usado_em is not None
    audit = db.query(AcaoAudit).filter(AcaoAudit.acao == "senha_redefinida_por_email").one()
    assert audit.ator_email == "ana@x.gov.br" and audit.alvo_email == "ana@x.gov.br" and audit.ip == "10.0.0.1"
    with pytest.raises(AppException) as exc:
        svc.redefinir(token, "outraSenha9")
    assert exc.value.status_code == 410


def test_redefinir_usuario_inativo_410(db, enviados):
    u = _usuario(db)
    svc = RedefinicaoSenhaService(db)
    svc.solicitar("ana@x.gov.br")
    token = _token_do_envio(enviados[0])
    u.ativo = False
    db.commit()
    with pytest.raises(AppException) as exc:
        svc.redefinir(token, "novaSenha9")
    assert exc.value.status_code == 410
    db.refresh(u)
    assert verify_password("senha123", u.senha_hash)


def test_handlers_esqueci_validar_redefinir(db, enviados):
    _usuario(db)
    req = _FakeRequest()
    r = esqueci_senha(req, EsqueciSenhaIn(email="ana@x.gov.br"), db=db)
    assert r == {"message": MENSAGEM_GENERICA}
    r2 = esqueci_senha(req, EsqueciSenhaIn(email="nao@existe.gov.br"), db=db)
    assert r2 == r  # mesma resposta, sem enumeracao
    token = _token_do_envio(enviados[0])
    v = validar_redefinicao(token=token, db=db)
    assert v == {"valido": True, "email_mascarado": "a***@x.gov.br"}
    out = redefinir_senha(req, RedefinirSenhaIn(token=token, nova_senha="novaSenha9"), db=db)
    assert out["message"].startswith("Senha redefinida")
    with pytest.raises(AppException) as exc:
        validar_redefinicao(token=token, db=db)
    assert exc.value.status_code == 410


def test_schema_nova_senha_curta_422():
    with pytest.raises(ValidationError):
        RedefinirSenhaIn(token="t" * 43, nova_senha="12345")
    with pytest.raises(ValidationError):
        EsqueciSenhaIn(email="ab")


def test_solicitar_email_gravado_com_maiusculas_envia_para_o_gravado(db, enviados):
    _usuario(db, email="Joao.Silva@x.gov.br")
    RedefinicaoSenhaService(db).solicitar("joao.silva@x.gov.br")
    assert len(enviados) == 1 and enviados[0]["para"] == "Joao.Silva@x.gov.br"


def test_redefinir_corrida_token_ja_usado_410_e_senha_nao_muda(db, enviados):
    u = _usuario(db)
    svc = RedefinicaoSenhaService(db)
    svc.solicitar("ana@x.gov.br")
    token = _token_do_envio(enviados[0])
    original = svc._pendente

    def pendente_com_corrida(t):
        resultado = original(t)
        # outro request consome o token entre a leitura e o UPDATE guardado
        db.query(RedefinicaoSenha).update({"usado_em": _agora()}, synchronize_session=False)
        db.commit()
        return resultado

    svc._pendente = pendente_com_corrida
    with pytest.raises(AppException) as exc:
        svc.redefinir(token, "novaSenha9")
    assert exc.value.status_code == 410
    db.refresh(u)
    assert verify_password("senha123", u.senha_hash)
    assert db.query(AcaoAudit).filter(AcaoAudit.acao == "senha_redefinida_por_email").count() == 0
