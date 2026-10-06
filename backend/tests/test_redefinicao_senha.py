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
