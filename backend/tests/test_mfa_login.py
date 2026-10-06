"""Login em duas etapas: authenticate -> mfa_token -> verificar; rotas /auth/mfa/*."""
import time
from datetime import datetime, timezone

import pyotp
import pytest
from jose import jwt
from cryptography.fernet import Fernet
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker

import app.core.mfa_crypto as mfa_crypto
import app.models  # noqa: F401
import app.services.auth_service as auth_mod
from app.api.deps import get_current_user, require_role
from app.api.v1.routers.mfa import (
    mfa_ativar,
    mfa_configurar,
    mfa_desativar,
    mfa_status,
    mfa_verificar,
)
from app.core.exceptions import AppException, ForbiddenException, UnauthorizedException
from app.core.config import settings
from app.core.security import ALGORITHM, create_mfa_token, decode_token, hash_password
from app.db.base import Base
from app.models.acao_audit import AcaoAudit
from app.models.login_audit import LoginAudit
from app.models.municipio import Municipio
from app.models.role import Role
from app.models.usuario import Usuario
from app.models.usuario_mfa import UsuarioMfa
from app.schemas.mfa import MfaCodigoIn, MfaDesativarIn, MfaVerificarIn
from app.services.auth_service import AuthService
from app.services.mfa_service import MfaService


class _FakeClient:
    host = "10.0.0.1"


class _FakeRequest:
    headers = {"user-agent": "pytest"}
    client = _FakeClient()


TEMPO_FIXO = 1_900_000_000.0


@pytest.fixture(autouse=True)
def chave(monkeypatch):
    monkeypatch.setattr(mfa_crypto.settings, "MFA_ENCRYPTION_KEY", Fernet.generate_key().decode())
    monkeypatch.setattr(time, "time", lambda: TEMPO_FIXO)  # TOTP deterministico; gerar codigos com .at(int(time.time())), nunca .now()
    # Os handlers sao decorados com @limiter.limit; chamados direto com um Request
    # falso (sem .state/.app), o slowapi so e inofensivo com o limiter desligado.
    from app.core.rate_limit import limiter
    monkeypatch.setattr(limiter, "enabled", False)
    auth_mod._FALHAS_MFA.clear()


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
    s.add(Role(nome="VISUALIZADOR", builtin=True, permissoes={}))
    s.commit()
    yield s
    s.close()


def _user(db, role="ADMIN_GLOBAL", email="admin@x.com"):
    r = db.query(Role).filter(Role.nome == role).one()
    u = Usuario(nome="U", email=email, senha_hash=hash_password("senha123"), role_id=r.id)
    db.add(u)
    db.commit()
    return u


def _ativar(db, user):
    svc = MfaService(db)
    seg = svc.configurar(user)["segredo"]
    codigos = svc.ativar(user, pyotp.TOTP(seg).at(int(time.time())))
    db.refresh(user)
    return seg, codigos


def _prox(seg):
    return pyotp.TOTP(seg).at(((int(time.time()) // 30) + 1) * 30)


# ---------- authenticate ----------

def test_login_sem_mfa_devolve_tokens_como_antes(db):
    _user(db)
    out = AuthService(db).authenticate("admin@x.com", "senha123", "1.1.1.1", "ua")
    assert "access_token" in out and "refresh_token" in out and "mfa_obrigatorio" not in out
    assert db.query(LoginAudit).filter(LoginAudit.motivo == "ok").count() == 1


def test_login_com_mfa_devolve_mfa_token_e_nao_audita_nem_atualiza_last_login(db):
    u = _user(db)
    _ativar(db, u)
    out = AuthService(db).authenticate("admin@x.com", "senha123", "1.1.1.1", "ua")
    assert out == {"mfa_obrigatorio": True, "mfa_token": out["mfa_token"]}
    p = decode_token(out["mfa_token"])
    assert p["type"] == "mfa" and p["sub"] == str(u.id)
    assert db.query(LoginAudit).count() == 0
    db.refresh(u)
    assert u.last_login is None


def test_login_senha_errada_com_mfa_ainda_401(db):
    u = _user(db)
    _ativar(db, u)
    with pytest.raises(UnauthorizedException):
        AuthService(db).authenticate("admin@x.com", "errada", None, None)


def test_login_sem_mfa_funciona_sem_chave_de_cifra(db, monkeypatch):
    _user(db)
    monkeypatch.setattr(mfa_crypto.settings, "MFA_ENCRYPTION_KEY", "")
    out = AuthService(db).authenticate("admin@x.com", "senha123", None, None)
    assert "access_token" in out


# ---------- verificar ----------

def test_verificar_totp_devolve_tokens_audita_e_atualiza_last_login(db):
    u = _user(db)
    seg, _ = _ativar(db, u)
    tok = AuthService(db).authenticate("admin@x.com", "senha123", None, None)["mfa_token"]
    out = AuthService(db).verificar_mfa(tok, _prox(seg), "1.1.1.1", "ua")
    assert decode_token(out["access_token"])["type"] == "access"
    assert decode_token(out["refresh_token"])["type"] == "refresh"
    db.refresh(u)
    assert u.last_login is not None
    assert db.query(LoginAudit).filter(LoginAudit.motivo == "mfa_ok").count() == 1


def test_verificar_codigo_recuperacao_consome(db):
    u = _user(db)
    _, codigos = _ativar(db, u)
    tok = AuthService(db).authenticate("admin@x.com", "senha123", None, None)["mfa_token"]
    AuthService(db).verificar_mfa(tok, codigos[0], None, None)
    db.refresh(u)
    assert len(u.mfa.codigos_recuperacao) == 9
    tok2 = create_mfa_token(str(u.id))
    with pytest.raises(UnauthorizedException):
        AuthService(db).verificar_mfa(tok2, codigos[0], None, None)


def test_verificar_replay_401_e_audita_invalido(db):
    u = _user(db)
    seg, _ = _ativar(db, u)
    tok = create_mfa_token(str(u.id))
    codigo = _prox(seg)
    AuthService(db).verificar_mfa(tok, codigo, None, None)
    tok2 = create_mfa_token(str(u.id))
    with pytest.raises(UnauthorizedException):
        AuthService(db).verificar_mfa(tok2, codigo, None, None)
    assert db.query(LoginAudit).filter(LoginAudit.motivo == "mfa_invalido").count() == 1


def test_verificar_5_falhas_invalidam_o_token(db):
    u = _user(db)
    _ativar(db, u)
    tok = create_mfa_token(str(u.id))
    for i in range(5):
        with pytest.raises(AppException) as e:
            AuthService(db).verificar_mfa(tok, "000000", None, None)
        assert e.value.code == ("MFA_TOKEN_INVALIDADO" if i == 4 else "UNAUTHORIZED")
    # 6a tentativa, mesmo com codigo certo, e recusada: token invalidado
    seg = mfa_crypto.decifrar(u.mfa.segredo_cifrado)
    with pytest.raises(AppException) as exc:
        AuthService(db).verificar_mfa(tok, _prox(seg), None, None)
    assert exc.value.status_code == 401 and exc.value.code == "MFA_TOKEN_INVALIDADO"
    assert "login" in exc.value.message.lower()


def test_verificar_token_errado_ou_expirado_401(db):
    u = _user(db)
    seg, _ = _ativar(db, u)
    from app.core.security import create_access_token
    with pytest.raises(AppException) as e1:
        AuthService(db).verificar_mfa(create_access_token(str(u.id)), _prox(seg), None, None)
    assert e1.value.status_code == 401 and e1.value.code == "MFA_SESSAO_INVALIDA"
    with pytest.raises(AppException) as e2:
        AuthService(db).verificar_mfa("nao-e-jwt", _prox(seg), None, None)
    assert e2.value.status_code == 401 and e2.value.code == "MFA_SESSAO_INVALIDA"


def test_verificar_token_expirado_401(db):
    u = _user(db)
    seg, _ = _ativar(db, u)
    # jose valida exp contra o relogio real (nao o time.time congelado)
    agora = int(datetime.now(timezone.utc).timestamp())
    expirado = jwt.encode(
        {"sub": str(u.id), "type": "mfa", "jti": "x", "exp": agora - 60, "iat": agora - 360},
        settings.SECRET_KEY, algorithm=ALGORITHM,
    )
    with pytest.raises(AppException) as exc:
        AuthService(db).verificar_mfa(expirado, _prox(seg), None, None)
    assert exc.value.status_code == 401 and exc.value.code == "MFA_SESSAO_INVALIDA"
    assert db.query(LoginAudit).count() == 0


def test_verificar_usuario_desativado_entre_etapas_401(db):
    u = _user(db)
    seg, _ = _ativar(db, u)
    tok = AuthService(db).authenticate("admin@x.com", "senha123", None, None)["mfa_token"]
    u.ativo = False
    db.commit()
    with pytest.raises(AppException) as exc:
        AuthService(db).verificar_mfa(tok, _prox(seg), None, None)
    assert exc.value.status_code == 401 and exc.value.code == "MFA_SESSAO_INVALIDA"
    assert db.query(LoginAudit).count() == 0


def test_mfa_token_nao_pode_ser_reutilizado_apos_sucesso(db):
    u = _user(db)
    seg, _ = _ativar(db, u)
    # time.time esta congelado no futuro: o token precisa expirar apos TEMPO_FIXO
    # (o jose valida exp no relogio real, entao TEMPO_FIXO + 300 ainda e valido).
    tok = jwt.encode(
        {"sub": str(u.id), "type": "mfa", "jti": "j1", "exp": int(TEMPO_FIXO) + 300, "iat": int(TEMPO_FIXO)},
        settings.SECRET_KEY, algorithm=ALGORITHM,
    )
    passo = int(time.time()) // 30
    AuthService(db).verificar_mfa(tok, pyotp.TOTP(seg).at((passo + 1) * 30), None, None)
    with pytest.raises(AppException) as exc:
        AuthService(db).verificar_mfa(tok, pyotp.TOTP(seg).at((passo + 2) * 30), None, None)
    assert exc.value.status_code == 401 and exc.value.code == "MFA_TOKEN_INVALIDADO"


def test_mfa_pendente_nao_ativado_nao_exige_segundo_fator(db):
    u = _user(db)
    MfaService(db).configurar(u)
    out = AuthService(db).authenticate("admin@x.com", "senha123", None, None)
    assert "access_token" in out and "mfa_obrigatorio" not in out


def test_verificar_usuario_sem_mfa_ativo_401(db):
    u = _user(db)
    with pytest.raises(AppException) as exc:
        AuthService(db).verificar_mfa(create_mfa_token(str(u.id)), "123456", None, None)
    assert exc.value.status_code == 401 and exc.value.code == "MFA_SESSAO_INVALIDA"


def test_mfa_token_nao_abre_rota_protegida(db):
    u = _user(db)
    with pytest.raises(UnauthorizedException):
        get_current_user(token=create_mfa_token(str(u.id)), db=db)


def test_verificar_sem_chave_503(db, monkeypatch):
    u = _user(db)
    _ativar(db, u)
    tok = create_mfa_token(str(u.id))
    monkeypatch.setattr(mfa_crypto.settings, "MFA_ENCRYPTION_KEY", "")
    with pytest.raises(mfa_crypto.MfaIndisponivel):
        AuthService(db).verificar_mfa(tok, "123456", None, None)


# ---------- rotas ----------

def test_rotas_de_cadastro_exigem_admin_global():
    dep = require_role("ADMIN_GLOBAL")
    from types import SimpleNamespace
    with pytest.raises(ForbiddenException):
        dep(current_user=SimpleNamespace(role=SimpleNamespace(nome="ADMIN_MUNICIPIO")))


def test_handlers_configurar_ativar_status_desativar(db):
    u = _user(db)
    req = _FakeRequest()
    cfg = mfa_configurar(req, db=db, current_user=u)
    assert cfg.data.otpauth_url.startswith("otpauth://")
    st = mfa_status(req, db=db, current_user=u)
    assert st.data.ativo is False
    codigo = pyotp.TOTP(cfg.data.segredo).at(int(time.time()))
    ativ = mfa_ativar(req, MfaCodigoIn(codigo=codigo), db=db, current_user=u)
    assert len(ativ.data.codigos_recuperacao) == 10
    db.refresh(u)
    st = mfa_status(req, db=db, current_user=u)
    assert st.data.ativo is True and st.data.codigos_restantes == 10
    out = mfa_desativar(req, MfaDesativarIn(senha_atual="senha123", codigo=ativ.data.codigos_recuperacao[0]), db=db, current_user=u)
    assert out == {"ok": True}


def test_handler_verificar(db):
    u = _user(db)
    seg, _ = _ativar(db, u)
    tok = create_mfa_token(str(u.id))
    out = mfa_verificar(_FakeRequest(), MfaVerificarIn(mfa_token=tok, codigo=_prox(seg)), db=db)
    assert "access_token" in out


def test_rotas_registradas_no_app():
    from app.main import app
    paths = {r.path for r in app.routes if hasattr(r, "path")}
    for p in ("/api/v1/auth/mfa/configurar", "/api/v1/auth/mfa/ativar", "/api/v1/auth/mfa/desativar",
              "/api/v1/auth/mfa/status", "/api/v1/auth/mfa/verificar"):
        assert p in paths, p
