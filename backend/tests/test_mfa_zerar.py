"""POST /usuarios/{id}/mfa/zerar e campo mfa_ativo na listagem."""
import time

import pyotp
import pytest
from cryptography.fernet import Fernet
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker

import app.core.mfa_crypto as mfa_crypto
import app.models  # noqa: F401
from app.api.v1.routers.usuarios import _to_out, zerar_mfa
from app.core.exceptions import AppException, NotFoundException
from app.core.security import hash_password
from app.db.base import Base
from app.models.acao_audit import AcaoAudit
from app.models.login_audit import LoginAudit
from app.models.municipio import Municipio
from app.models.role import Role
from app.models.usuario import Usuario
from app.models.usuario_mfa import UsuarioMfa
from app.services.mfa_service import MfaService


class _FakeClient:
    host = "10.0.0.1"


class _FakeRequest:
    headers = {"user-agent": "pytest"}
    client = _FakeClient()


@pytest.fixture(autouse=True)
def chave(monkeypatch):
    monkeypatch.setattr(mfa_crypto.settings, "MFA_ENCRYPTION_KEY", Fernet.generate_key().decode())


@pytest.fixture()
def db():
    engine = create_engine("sqlite://")

    @event.listens_for(engine, "connect")
    def _fk_on(dbapi_conn, _record):
        dbapi_conn.execute("PRAGMA foreign_keys=ON")

    Base.metadata.create_all(engine, tables=[
        Municipio.__table__, Role.__table__, Usuario.__table__, UsuarioMfa.__table__,
        LoginAudit.__table__, AcaoAudit.__table__,
    ])
    s = sessionmaker(bind=engine)()
    s.add(Role(nome="ADMIN_GLOBAL", builtin=True, permissoes={}))
    s.commit()
    yield s
    s.close()


def _admin(db, email):
    r = db.query(Role).filter(Role.nome == "ADMIN_GLOBAL").one()
    u = Usuario(nome=email, email=email, senha_hash=hash_password("x"), role_id=r.id)
    db.add(u)
    db.commit()
    return u


def _ativar(db, u):
    svc = MfaService(db)
    seg = svc.configurar(u)["segredo"]
    svc.ativar(u, pyotp.TOTP(seg).at(int(time.time())))
    db.refresh(u)


def test_to_out_expoe_mfa_ativo(db):
    u = _admin(db, "a@x.com")
    assert _to_out(u).mfa_ativo is False
    _ativar(db, u)
    assert _to_out(u).mfa_ativo is True


def test_zerar_apaga_mfa_e_audita(db):
    ator = _admin(db, "ator@x.com")
    alvo = _admin(db, "alvo@x.com")
    _ativar(db, alvo)
    out = zerar_mfa(alvo.id, _FakeRequest(), db=db, current_user=ator)
    assert out == {"ok": True}
    db.refresh(alvo)
    assert alvo.mfa is None
    linha = db.query(AcaoAudit).filter(AcaoAudit.acao == "mfa_zerado").one()
    assert linha.ator_email == "ator@x.com" and linha.alvo_email == "alvo@x.com"


def test_zerar_a_si_mesmo_400(db):
    ator = _admin(db, "ator@x.com")
    _ativar(db, ator)
    with pytest.raises(AppException) as exc:
        zerar_mfa(ator.id, _FakeRequest(), db=db, current_user=ator)
    assert exc.value.status_code == 400 and exc.value.code == "MFA_PROPRIO"
    db.refresh(ator)
    assert ator.mfa is not None


def test_zerar_usuario_inexistente_404_e_sem_mfa_e_idempotente(db):
    ator = _admin(db, "ator@x.com")
    with pytest.raises(NotFoundException):
        zerar_mfa(9999, _FakeRequest(), db=db, current_user=ator)
    alvo = _admin(db, "alvo@x.com")
    assert zerar_mfa(alvo.id, _FakeRequest(), db=db, current_user=ator) == {"ok": True}
    assert db.query(AcaoAudit).filter(AcaoAudit.acao == "mfa_zerado").count() == 0
