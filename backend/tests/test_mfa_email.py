"""MFA por e-mail: codigo HMAC de 6 digitos, 10 min, 5 tentativas, 3 reenvios (Task 5);
login em duas etapas com metodo email, reenviar e enviar-codigo (Task 6)."""
import re
from datetime import datetime, timedelta, timezone

import pytest
from cryptography.fernet import Fernet
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker

import app.core.mfa_crypto as mfa_crypto
import app.models  # noqa: F401
import app.services.auth_service as auth_mod
import app.services.mfa_service as mfa_mod
from app.core.exceptions import AppException, UnauthorizedException
from app.core.security import hash_password
from app.db.base import Base
from app.models.acao_audit import AcaoAudit
from app.models.login_audit import LoginAudit
from app.models.municipio import Municipio
from app.models.role import Role
from app.models.usuario import Usuario
from app.models.usuario_mfa import UsuarioMfa
from app.api.v1.routers.mfa import mfa_configurar, mfa_enviar_codigo, mfa_reenviar, mfa_status, mfa_verificar
from app.schemas.mfa import MfaConfigurarIn, MfaReenviarIn, MfaVerificarIn
from app.services.auth_service import AuthService
from app.services.mfa_service import (
    FINALIDADE_ATIVAR,
    FINALIDADE_DESATIVAR,
    MfaService,
    hash_codigo_email,
)


class _FakeClient:
    host = "10.0.0.1"


class _FakeRequest:
    headers = {"user-agent": "pytest"}
    client = _FakeClient()


@pytest.fixture(autouse=True)
def ambiente(monkeypatch):
    monkeypatch.setattr(mfa_crypto.settings, "MFA_ENCRYPTION_KEY", Fernet.generate_key().decode())
    from app.core.rate_limit import limiter
    monkeypatch.setattr(limiter, "enabled", False)
    auth_mod._FALHAS_MFA.clear()


class _Espiao:
    """Substitui mfa_service.enviar. `falhar = True` simula Resend fora (devolve None)."""

    def __init__(self):
        self.lista = []
        self.falhar = False

    def __call__(self, para, assunto, html, texto):
        self.lista.append({"para": para, "assunto": assunto, "html": html, "texto": texto})
        return None if self.falhar else "id-fake"

    def __getitem__(self, i):
        return self.lista[i]

    @property
    def total(self):
        return len(self.lista)

    @property
    def ultimo_codigo(self):
        return re.search(r"\b(\d{6})\b", self.lista[-1]["texto"]).group(1)


@pytest.fixture()
def enviados(monkeypatch):
    espiao = _Espiao()
    monkeypatch.setattr(mfa_mod, "enviar", espiao)
    return espiao


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


def _admin(db, email="admin@x.com"):
    role = db.query(Role).filter(Role.nome == "ADMIN_GLOBAL").one()
    u = Usuario(nome="Admin", email=email, senha_hash=hash_password("senha123"), role_id=role.id)
    db.add(u)
    db.commit()
    return u


def _ativar_email(db, u, enviados):
    svc = MfaService(db)
    svc.configurar(u, metodo="email")
    codigos = svc.ativar(u, enviados.ultimo_codigo, request=_FakeRequest())
    db.refresh(u)
    return svc, codigos


def _agora():
    return datetime.now(timezone.utc)


def _voltar_envio(db, mfa, segundos=61):
    mfa.codigo_enviado_em = _agora() - timedelta(seconds=segundos)
    db.add(mfa)
    db.commit()


# ---------- Task 5: modelo e servico ----------

def test_modelo_tem_colunas_email_e_segredo_nulo():
    cols = {c.name: c for c in UsuarioMfa.__table__.columns}
    for nome in ("metodo", "codigo_hash", "codigo_expira_em", "codigo_enviado_em", "codigo_tentativas", "codigo_reenvios"):
        assert nome in cols, nome
    assert cols["segredo_cifrado"].nullable is True
    assert cols["metodo"].type.length == 10 and cols["metodo"].default.arg == "totp"
    assert cols["codigo_hash"].type.length == 64


def test_hash_codigo_email_e_hmac_deterministico():
    assert hash_codigo_email("012345") == hash_codigo_email("012345")
    assert hash_codigo_email("012345") != hash_codigo_email("012346")
    assert len(hash_codigo_email("012345")) == 64


def test_configurar_email_cria_pendente_envia_codigo_e_devolve_mascarado(db, enviados):
    u = _admin(db)
    out = MfaService(db).configurar(u, metodo="email")
    assert out == {"metodo": "email", "enviado_para": "a***@x.com"}
    db.refresh(u)
    mfa = u.mfa
    assert mfa.ativo is False and mfa.metodo == "email" and mfa.segredo_cifrado is None
    assert mfa.codigo_hash == hash_codigo_email(enviados.ultimo_codigo)
    assert mfa.codigo_tentativas == 0 and mfa.codigo_reenvios == 0
    assert mfa.codigo_enviado_em is not None and mfa.codigo_expira_em is not None
    assert enviados.total == 1 and enviados[0]["para"] == "admin@x.com"
    assert enviados[0]["assunto"] == "Seu codigo de verificacao - UAIZI NID"
    assert FINALIDADE_ATIVAR in enviados[0]["texto"]
    assert enviados.ultimo_codigo not in (mfa.codigo_hash or "")


def test_configurar_email_envio_falho_502_e_fica_pendente(db, enviados):
    u = _admin(db)
    enviados.falhar = True
    with pytest.raises(AppException) as exc:
        MfaService(db).configurar(u, metodo="email")
    assert exc.value.status_code == 502 and exc.value.code == "EMAIL_NAO_ENVIADO"
    db.refresh(u)
    assert u.mfa is not None and u.mfa.ativo is False and u.mfa.metodo == "email"


def test_configurar_metodo_invalido_422(db, enviados):
    u = _admin(db)
    with pytest.raises(AppException) as exc:
        MfaService(db).configurar(u, metodo="sms")
    assert exc.value.status_code == 422 and exc.value.code == "METODO_INVALIDO"


def test_configurar_totp_continua_igual_e_inclui_metodo(db, enviados):
    u = _admin(db)
    out = MfaService(db).configurar(u)
    assert out["metodo"] == "totp"
    assert out["otpauth_url"].startswith("otpauth://totp/") and out["segredo"] and "<svg" in out["qr_svg"]
    assert enviados.total == 0
    db.refresh(u)
    assert u.mfa.metodo == "totp" and u.mfa.segredo_cifrado


def test_configurar_email_depois_de_totp_pendente_troca_metodo(db, enviados):
    u = _admin(db)
    svc = MfaService(db)
    svc.configurar(u)
    svc.configurar(u, metodo="email")
    db.refresh(u)
    assert u.mfa.metodo == "email" and u.mfa.segredo_cifrado is None and u.mfa.ultimo_passo_usado is None


def test_ativar_email_com_codigo_certo_ativa_gera_codigos_e_audita(db, enviados):
    u = _admin(db)
    svc, codigos = _ativar_email(db, u, enviados)
    assert len(codigos) == 10 and all(re.fullmatch(r"[A-Z2-9]{4}-[A-Z2-9]{4}", c) for c in codigos)
    assert u.mfa.ativo is True and u.mfa.metodo == "email"
    assert u.mfa.codigo_hash is None and u.mfa.codigo_expira_em is None
    assert db.query(AcaoAudit).filter(AcaoAudit.acao == "mfa_ativado").count() == 1
    assert svc.status(u) == {"ativo": True, "ativado_em": u.mfa.ativado_em, "codigos_restantes": 10, "metodo": "email"}


def test_status_sem_mfa_ou_pendente_tem_metodo_none(db, enviados):
    u = _admin(db)
    svc = MfaService(db)
    assert svc.status(u) == {"ativo": False, "ativado_em": None, "codigos_restantes": 0, "metodo": None}
    svc.configurar(u, metodo="email")
    db.refresh(u)
    assert svc.status(u)["metodo"] is None


def test_ativar_email_codigo_errado_incrementa_e_5_invalida(db, enviados):
    u = _admin(db)
    svc = MfaService(db)
    svc.configurar(u, metodo="email")
    db.refresh(u)
    certo = enviados.ultimo_codigo
    errado = "000000" if certo != "000000" else "111111"
    for i in range(5):
        with pytest.raises(UnauthorizedException):
            svc.ativar(u, errado)
        db.refresh(u)
        assert u.mfa.codigo_tentativas == i + 1
    with pytest.raises(UnauthorizedException):
        svc.ativar(u, certo)  # codigo invalidado pelas 5 falhas
    assert u.mfa.ativo is False


def test_codigo_email_expirado_401(db, enviados):
    u = _admin(db)
    svc = MfaService(db)
    svc.configurar(u, metodo="email")
    db.refresh(u)
    u.mfa.codigo_expira_em = _agora() - timedelta(minutes=1)
    db.commit()
    with pytest.raises(UnauthorizedException):
        svc.ativar(u, enviados.ultimo_codigo)


def test_codigo_email_aceita_com_espacos(db, enviados):
    u = _admin(db)
    svc = MfaService(db)
    svc.configurar(u, metodo="email")
    db.refresh(u)
    c = enviados.ultimo_codigo
    assert len(svc.ativar(u, f"{c[:3]} {c[3:]}", request=_FakeRequest())) == 10


def test_reenviar_respeita_60s_invalida_anterior_e_limite_3(db, enviados):
    u = _admin(db)
    svc = MfaService(db)
    svc.configurar(u, metodo="email")
    db.refresh(u)
    mfa = u.mfa
    with pytest.raises(AppException) as exc:
        svc.reenviar_codigo(mfa, u, FINALIDADE_ATIVAR)
    assert exc.value.status_code == 429 and exc.value.code == "AGUARDE" and "Aguarde" in exc.value.message
    antigo = enviados.ultimo_codigo
    for n in range(1, 4):
        _voltar_envio(db, mfa)
        assert svc.reenviar_codigo(mfa, u, FINALIDADE_ATIVAR) == {"enviado_para": "a***@x.com"}
        db.refresh(u)
        assert mfa.codigo_reenvios == n
    assert enviados.total == 4
    assert not svc.codigo_valido(mfa, antigo)  # anterior morreu
    _voltar_envio(db, mfa)
    with pytest.raises(AppException) as exc:
        svc.reenviar_codigo(mfa, u, FINALIDADE_ATIVAR)
    assert exc.value.status_code == 429 and exc.value.code == "LIMITE_REENVIO"
    assert svc.codigo_valido(mfa, enviados.ultimo_codigo)  # o ultimo enviado ainda vale


def test_reenvios_zeram_quando_codigo_expirou(db, enviados):
    u = _admin(db)
    svc = MfaService(db)
    svc.configurar(u, metodo="email")
    db.refresh(u)
    u.mfa.codigo_reenvios = 3
    u.mfa.codigo_expira_em = _agora() - timedelta(minutes=1)
    _voltar_envio(db, u.mfa, segundos=700)
    assert svc.reenviar_codigo(u.mfa, u, FINALIDADE_ATIVAR)["enviado_para"] == "a***@x.com"
    assert u.mfa.codigo_reenvios == 1


def test_reenviar_envio_falho_502(db, enviados):
    u = _admin(db)
    svc = MfaService(db)
    svc.configurar(u, metodo="email")
    db.refresh(u)
    _voltar_envio(db, u.mfa)
    enviados.falhar = True
    with pytest.raises(AppException) as exc:
        svc.reenviar_codigo(u.mfa, u, FINALIDADE_ATIVAR)
    assert exc.value.status_code == 502


def test_codigo_recuperacao_vale_no_metodo_email(db, enviados):
    u = _admin(db)
    svc, codigos = _ativar_email(db, u, enviados)
    assert svc.codigo_valido(u.mfa, codigos[0]) is True
    assert svc.codigo_valido(u.mfa, codigos[0]) is False  # consumido


def test_desativar_email_com_codigo_enviado(db, enviados):
    u = _admin(db)
    svc, _ = _ativar_email(db, u, enviados)
    assert svc.enviar_codigo(u.mfa, u, FINALIDADE_DESATIVAR) is True
    assert FINALIDADE_DESATIVAR in enviados[-1]["texto"]
    svc.desativar(u, "senha123", enviados.ultimo_codigo, request=_FakeRequest())
    db.refresh(u)
    assert u.mfa is None
    assert db.query(AcaoAudit).filter(AcaoAudit.acao == "mfa_desativado").count() == 1


# ---------- Task 6: login em duas etapas por e-mail, reenviar, enviar-codigo ----------

def _login(db, email="admin@x.com"):
    return AuthService(db).authenticate(email, "senha123", ip="1.1.1.1", user_agent="t")


def test_login_email_envia_codigo_e_devolve_metodo_e_mascarado(db, enviados):
    u = _admin(db)
    _ativar_email(db, u, enviados)
    antes = enviados.total
    r = _login(db)
    assert r["mfa_obrigatorio"] is True and r["mfa_token"]
    assert r["metodo"] == "email" and r["enviado_para"] == "a***@x.com" and r["enviado"] is True
    assert "access_token" not in r
    assert enviados.total == antes + 1 and "entrar na plataforma" in enviados[-1]["texto"]
    db.refresh(u)
    assert u.mfa.codigo_reenvios == 0 and u.mfa.codigo_tentativas == 0
    assert db.query(LoginAudit).count() == 0


def test_login_totp_inclui_metodo_totp(db, enviados):
    u = _admin(db)
    MfaService(db).configurar(u)
    # ativa direto no banco para nao depender do relogio TOTP neste arquivo
    u.mfa.ativo = True
    u.mfa.codigos_recuperacao = []
    db.commit()
    r = _login(db)
    assert r["metodo"] == "totp" and "enviado_para" not in r
    assert enviados.total == 0


def test_login_email_envio_falho_enviado_false_e_reenviar_depois_funciona(db, enviados):
    u = _admin(db)
    _ativar_email(db, u, enviados)
    enviados.falhar = True
    r = _login(db)
    assert r["enviado"] is False and r["mfa_token"]
    enviados.falhar = False
    db.refresh(u)
    _voltar_envio(db, u.mfa)
    assert AuthService(db).reenviar_codigo_mfa(r["mfa_token"]) == {"enviado_para": "a***@x.com"}
    tokens = AuthService(db).verificar_mfa(r["mfa_token"], enviados.ultimo_codigo, "1.1.1.1", "t")
    assert tokens["access_token"]


def test_verificar_email_certo_emite_tokens_audita_e_limpa_codigo(db, enviados):
    u = _admin(db)
    _ativar_email(db, u, enviados)
    r = _login(db)
    tokens = AuthService(db).verificar_mfa(r["mfa_token"], enviados.ultimo_codigo, "1.1.1.1", "t")
    assert tokens["access_token"] and tokens["refresh_token"] and tokens["token_type"] == "bearer"
    db.refresh(u)
    assert u.mfa.codigo_hash is None and u.last_login is not None
    assert db.query(LoginAudit).filter(LoginAudit.motivo == "mfa_ok").count() == 1


def test_verificar_email_errado_5x_invalida_token(db, enviados):
    u = _admin(db)
    _ativar_email(db, u, enviados)
    r = _login(db)
    svc = AuthService(db)
    certo = enviados.ultimo_codigo
    errado = "000000" if certo != "000000" else "111111"
    for _ in range(4):
        with pytest.raises(UnauthorizedException):
            svc.verificar_mfa(r["mfa_token"], errado, "1.1.1.1", "t")
    with pytest.raises(AppException) as exc:
        svc.verificar_mfa(r["mfa_token"], errado, "1.1.1.1", "t")
    assert exc.value.code == "MFA_TOKEN_INVALIDADO"
    with pytest.raises(AppException) as exc:
        svc.verificar_mfa(r["mfa_token"], certo, "1.1.1.1", "t")
    assert exc.value.code == "MFA_TOKEN_INVALIDADO"
    assert db.query(LoginAudit).filter(LoginAudit.motivo == "mfa_invalido").count() == 5


def test_verificar_email_expirado_401(db, enviados):
    u = _admin(db)
    _ativar_email(db, u, enviados)
    r = _login(db)
    db.refresh(u)
    u.mfa.codigo_expira_em = _agora() - timedelta(minutes=1)
    db.commit()
    with pytest.raises(UnauthorizedException):
        AuthService(db).verificar_mfa(r["mfa_token"], enviados.ultimo_codigo, "1.1.1.1", "t")


def test_codigo_recuperacao_no_login_email(db, enviados):
    u = _admin(db)
    _, codigos = _ativar_email(db, u, enviados)
    r = _login(db)
    assert AuthService(db).verificar_mfa(r["mfa_token"], codigos[0], "1.1.1.1", "t")["access_token"]


def test_verificar_email_nao_exige_chave_fernet(db, enviados, monkeypatch):
    u = _admin(db)
    _ativar_email(db, u, enviados)
    monkeypatch.setattr(mfa_crypto.settings, "MFA_ENCRYPTION_KEY", "")
    r = _login(db)
    assert AuthService(db).verificar_mfa(r["mfa_token"], enviados.ultimo_codigo, "1.1.1.1", "t")["access_token"]


def test_reenviar_rota_limites_e_codigo_antigo_morre(db, enviados):
    u = _admin(db)
    _ativar_email(db, u, enviados)
    r = _login(db)
    req = _FakeRequest()
    with pytest.raises(AppException) as exc:
        mfa_reenviar(req, MfaReenviarIn(mfa_token=r["mfa_token"]), db=db)
    assert exc.value.code == "AGUARDE"
    antigo = enviados.ultimo_codigo
    db.refresh(u)
    _voltar_envio(db, u.mfa)
    assert mfa_reenviar(req, MfaReenviarIn(mfa_token=r["mfa_token"]), db=db) == {"enviado_para": "a***@x.com"}
    with pytest.raises(UnauthorizedException):
        mfa_verificar(req, MfaVerificarIn(mfa_token=r["mfa_token"], codigo=antigo), db=db)
    assert mfa_verificar(req, MfaVerificarIn(mfa_token=r["mfa_token"], codigo=enviados.ultimo_codigo), db=db)["access_token"]


def test_reenviar_token_invalido_401_e_metodo_totp_409(db, enviados):
    with pytest.raises(AppException) as exc:
        AuthService(db).reenviar_codigo_mfa("nao-e-token")
    assert exc.value.status_code == 401 and exc.value.code == "MFA_SESSAO_INVALIDA"
    u = _admin(db)
    MfaService(db).configurar(u)
    u.mfa.ativo = True
    db.commit()
    r = _login(db)
    with pytest.raises(AppException) as exc:
        AuthService(db).reenviar_codigo_mfa(r["mfa_token"])
    assert exc.value.status_code == 409 and exc.value.code == "METODO_NAO_EMAIL"


def test_enviar_codigo_rota_para_desativar(db, enviados):
    u = _admin(db)
    svc, _ = _ativar_email(db, u, enviados)
    req = _FakeRequest()
    _voltar_envio(db, u.mfa)
    assert mfa_enviar_codigo(req, db=db, current_user=u) == {"enviado_para": "a***@x.com"}
    assert FINALIDADE_DESATIVAR in enviados[-1]["texto"]
    svc.desativar(u, "senha123", enviados.ultimo_codigo, request=req)
    db.refresh(u)
    assert u.mfa is None
    # usuario TOTP (ou sem MFA) nao tem o que enviar
    v = _admin(db, email="totp@x.com")
    MfaService(db).configurar(v)
    v.mfa.ativo = True
    db.commit()
    with pytest.raises(AppException) as exc:
        mfa_enviar_codigo(req, db=db, current_user=v)
    assert exc.value.status_code == 409 and exc.value.code == "MFA_NAO_EMAIL"


def test_handler_configurar_com_payload_email_e_status_com_metodo(db, enviados):
    u = _admin(db)
    req = _FakeRequest()
    cfg = mfa_configurar(req, payload=MfaConfigurarIn(metodo="email"), db=db, current_user=u)
    assert cfg.data.metodo == "email" and cfg.data.enviado_para == "a***@x.com" and cfg.data.qr_svg is None
    db.refresh(u)
    assert mfa_status(req, db=db, current_user=u).data.metodo is None
    MfaService(db).ativar(u, enviados.ultimo_codigo, request=req)
    db.refresh(u)
    st = mfa_status(req, db=db, current_user=u).data
    assert st.ativo is True and st.metodo == "email"
    # sem payload continua TOTP (compatibilidade com o front atual)
    w = _admin(db, email="w@x.com")
    cfg2 = mfa_configurar(req, db=db, current_user=w)
    assert cfg2.data.metodo == "totp" and cfg2.data.qr_svg
