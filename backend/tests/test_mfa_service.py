"""MfaService: configurar/ativar/desativar/status e validacao de codigos (sqlite in-memory)."""
import time

import pyotp
import pytest
from cryptography.fernet import Fernet
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker

import app.core.mfa_crypto as mfa_crypto
import app.models  # noqa: F401
from app.core.exceptions import ConflictException, UnauthorizedException
from app.core.security import create_mfa_token, decode_token, hash_password
from app.db.base import Base
from app.models.acao_audit import AcaoAudit
from app.models.login_audit import LoginAudit
from app.models.municipio import Municipio
from app.models.role import Role
from app.models.usuario import Usuario
from app.models.usuario_mfa import UsuarioMfa
from app.services.mfa_service import (
    MfaService,
    eh_codigo_recuperacao,
    gerar_codigos_recuperacao,
    normalizar_codigo,
)


class _FakeClient:
    host = "10.0.0.1"


class _FakeRequest:
    headers = {"user-agent": "pytest"}
    client = _FakeClient()


TEMPO_FIXO = 1_900_000_000.0  # relogio congelado: TOTP e janela ficam deterministicos


@pytest.fixture(autouse=True)
def chave(monkeypatch):
    monkeypatch.setattr(mfa_crypto.settings, "MFA_ENCRYPTION_KEY", Fernet.generate_key().decode())
    # o servico usa time.time(); pyotp.now() usa datetime.now() (NAO congela) -> testes geram codigos com .at(int(time.time()))
    monkeypatch.setattr(time, "time", lambda: TEMPO_FIXO)


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


def _admin(db):
    role = db.query(Role).filter(Role.nome == "ADMIN_GLOBAL").one()
    u = Usuario(nome="Admin", email="admin@x.com", senha_hash=hash_password("senha123"), role_id=role.id)
    db.add(u)
    db.commit()
    return u


def _ativar(db, user):
    svc = MfaService(db)
    cfg = svc.configurar(user)
    codigo = pyotp.TOTP(cfg["segredo"]).at(int(time.time()))
    codigos = svc.ativar(user, codigo, request=_FakeRequest())
    return svc, cfg["segredo"], codigos


# ---------- helpers puros ----------

def test_normalizar_codigo_remove_espacos_tracos_e_sobe_caixa():
    assert normalizar_codigo(" 123 456 ") == "123456"
    assert normalizar_codigo("abcd-efgh") == "ABCDEFGH"
    assert normalizar_codigo("ab cd-ef gh") == "ABCDEFGH"


def test_gerar_codigos_recuperacao_formato_e_unicidade():
    codigos = gerar_codigos_recuperacao()
    assert len(codigos) == 10 and len(set(codigos)) == 10
    for c in codigos:
        assert len(c) == 9 and c[4] == "-"
        assert all(ch in "ABCDEFGHJKLMNPQRSTUVWXYZ23456789" for ch in c.replace("-", ""))


def test_eh_codigo_recuperacao():
    assert eh_codigo_recuperacao("ABCD-EFGH") is True
    assert eh_codigo_recuperacao("abcdefgh") is True
    assert eh_codigo_recuperacao("123456") is False


# ---------- create_mfa_token ----------

def test_create_mfa_token_tem_type_mfa_jti_e_expira_em_5_min():
    tok = create_mfa_token("42")
    p = decode_token(tok)
    assert p["sub"] == "42" and p["type"] == "mfa" and len(p["jti"]) >= 16
    assert 290 <= p["exp"] - p["iat"] <= 310


# ---------- configurar / status ----------

def test_status_sem_mfa(db):
    u = _admin(db)
    assert MfaService(db).status(u) == {"ativo": False, "ativado_em": None, "codigos_restantes": 0, "metodo": None}


def test_configurar_cria_pendente_cifrado_e_devolve_qr(db):
    u = _admin(db)
    out = MfaService(db).configurar(u)
    assert out["otpauth_url"].startswith("otpauth://totp/")
    assert "UAIZI%20NID" in out["otpauth_url"] or "UAIZI NID" in out["otpauth_url"]
    assert out["qr_svg"].lstrip().startswith("<svg") or "<svg" in out["qr_svg"][:200]
    db.refresh(u)
    assert u.mfa is not None and u.mfa.ativo is False
    assert out["segredo"] not in u.mfa.segredo_cifrado
    assert mfa_crypto.decifrar(u.mfa.segredo_cifrado) == out["segredo"]


def test_configurar_de_novo_antes_de_ativar_sobrescreve(db):
    u = _admin(db)
    svc = MfaService(db)
    a = svc.configurar(u)["segredo"]
    b = svc.configurar(u)["segredo"]
    assert a != b
    db.refresh(u)
    assert mfa_crypto.decifrar(u.mfa.segredo_cifrado) == b


def test_configurar_com_mfa_ativo_409(db):
    u = _admin(db)
    _ativar(db, u)
    with pytest.raises(ConflictException):
        MfaService(db).configurar(u)


# ---------- ativar ----------

def test_ativar_com_codigo_certo_devolve_10_codigos_e_audita(db):
    u = _admin(db)
    svc, segredo, codigos = _ativar(db, u)
    assert len(codigos) == 10
    db.refresh(u)
    assert u.mfa.ativo is True and u.mfa.ativado_em is not None
    assert len(u.mfa.codigos_recuperacao) == 10
    assert all(c not in u.mfa.codigos_recuperacao for c in codigos)  # so hashes
    assert db.query(AcaoAudit).filter(AcaoAudit.acao == "mfa_ativado").count() == 1
    assert svc.status(u)["codigos_restantes"] == 10


def test_ativar_com_codigo_errado_401_e_continua_pendente(db):
    u = _admin(db)
    svc = MfaService(db)
    svc.configurar(u)
    with pytest.raises(UnauthorizedException):
        svc.ativar(u, "000000", request=_FakeRequest())
    db.refresh(u)
    assert u.mfa.ativo is False


def test_ativar_sem_configurar_409(db):
    u = _admin(db)
    with pytest.raises(ConflictException):
        MfaService(db).ativar(u, "123456")


# ---------- codigo_valido (TOTP) ----------

def test_totp_janela_e_anti_replay(db):
    u = _admin(db)
    svc, segredo, _ = _ativar(db, u)
    totp = pyotp.TOTP(segredo)
    db.refresh(u)
    agora = int(time.time())
    passo_atual = agora // 30
    # o codigo usado no ativar foi o do passo atual -> replay recusado
    assert svc.codigo_valido(u.mfa, totp.at(passo_atual * 30)) is False
    # proximo passo (relogio do celular adiantado 30s) aceito uma vez
    prox = totp.at((passo_atual + 1) * 30)
    assert svc.codigo_valido(u.mfa, prox) is True
    assert svc.codigo_valido(u.mfa, prox) is False
    # passo anterior ao ultimo usado -> recusado mesmo dentro da janela
    assert svc.codigo_valido(u.mfa, totp.at(passo_atual * 30)) is False
    # fora da janela
    assert svc.codigo_valido(u.mfa, totp.at((passo_atual + 3) * 30)) is False


def test_totp_aceita_com_espacos(db):
    u = _admin(db)
    svc, segredo, _ = _ativar(db, u)
    db.refresh(u)
    prox = pyotp.TOTP(segredo).at(((int(time.time()) // 30) + 1) * 30)
    assert svc.codigo_valido(u.mfa, prox[:3] + " " + prox[3:]) is True


# ---------- codigo_valido (recuperacao) ----------

def test_codigo_recuperacao_consome_e_nao_repete(db):
    u = _admin(db)
    svc, _, codigos = _ativar(db, u)
    db.refresh(u)
    assert svc.codigo_valido(u.mfa, codigos[0].lower()) is True
    db.refresh(u)
    assert len(u.mfa.codigos_recuperacao) == 9
    assert svc.codigo_valido(u.mfa, codigos[0]) is False
    assert svc.codigo_valido(u.mfa, "ZZZZ-ZZZZ") is False


# ---------- desativar ----------

def test_desativar_exige_senha_e_codigo(db):
    u = _admin(db)
    svc, segredo, codigos = _ativar(db, u)
    db.refresh(u)
    with pytest.raises(UnauthorizedException):
        svc.desativar(u, "errada", codigos[1], request=_FakeRequest())
    with pytest.raises(UnauthorizedException):
        svc.desativar(u, "senha123", "000000", request=_FakeRequest())
    db.refresh(u)
    assert u.mfa is not None
    svc.desativar(u, "senha123", codigos[1], request=_FakeRequest())
    db.refresh(u)
    assert u.mfa is None
    assert db.query(AcaoAudit).filter(AcaoAudit.acao == "mfa_desativado").count() == 1


def test_desativar_sem_mfa_409(db):
    u = _admin(db)
    with pytest.raises(ConflictException):
        MfaService(db).desativar(u, "senha123", "123456")


# ---------- chave ausente ----------

def test_configurar_sem_chave_503(db, monkeypatch):
    u = _admin(db)
    monkeypatch.setattr(mfa_crypto.settings, "MFA_ENCRYPTION_KEY", "")
    with pytest.raises(mfa_crypto.MfaIndisponivel):
        MfaService(db).configurar(u)
