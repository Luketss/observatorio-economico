"""Cifra em repouso do segredo TOTP (Fernet) e guarda de chave ausente."""
import pytest
from cryptography.fernet import Fernet

import app.core.mfa_crypto as mfa_crypto
from app.core.exceptions import AppException


@pytest.fixture()
def com_chave(monkeypatch):
    monkeypatch.setattr(mfa_crypto.settings, "MFA_ENCRYPTION_KEY", Fernet.generate_key().decode())


@pytest.fixture()
def sem_chave(monkeypatch):
    monkeypatch.setattr(mfa_crypto.settings, "MFA_ENCRYPTION_KEY", "")


def test_round_trip_e_valor_cifrado_nao_contem_o_segredo(com_chave):
    segredo = "JBSWY3DPEHPK3PXP"
    token = mfa_crypto.cifrar(segredo)
    assert segredo not in token
    assert mfa_crypto.decifrar(token) == segredo


def test_cifrar_duas_vezes_gera_tokens_diferentes(com_chave):
    assert mfa_crypto.cifrar("ABC") != mfa_crypto.cifrar("ABC")


def test_chave_configurada(com_chave, monkeypatch):
    assert mfa_crypto.chave_configurada() is True
    monkeypatch.setattr(mfa_crypto.settings, "MFA_ENCRYPTION_KEY", "")
    assert mfa_crypto.chave_configurada() is False


def test_sem_chave_cifrar_e_decifrar_levantam_503(sem_chave):
    with pytest.raises(mfa_crypto.MfaIndisponivel) as exc:
        mfa_crypto.cifrar("x")
    assert exc.value.status_code == 503
    assert exc.value.code == "MFA_INDISPONIVEL"
    with pytest.raises(mfa_crypto.MfaIndisponivel):
        mfa_crypto.decifrar("x")
    with pytest.raises(mfa_crypto.MfaIndisponivel):
        mfa_crypto.exigir_chave()
    assert issubclass(mfa_crypto.MfaIndisponivel, AppException)


def test_chave_invalida_levanta_503(monkeypatch):
    monkeypatch.setattr(mfa_crypto.settings, "MFA_ENCRYPTION_KEY", "nao-e-fernet")
    with pytest.raises(mfa_crypto.MfaIndisponivel):
        mfa_crypto.cifrar("x")


def test_token_corrompido_levanta_401_com_codigo_proprio(com_chave):
    with pytest.raises(AppException) as exc:
        mfa_crypto.decifrar("gAAAAABtoken-invalido")
    assert exc.value.status_code == 401
    assert exc.value.code == "MFA_SEGREDO_INVALIDO"


def test_chave_so_com_espacos_nao_conta_como_configurada(monkeypatch):
    monkeypatch.setattr(mfa_crypto.settings, "MFA_ENCRYPTION_KEY", "   ")
    assert mfa_crypto.chave_configurada() is False
    with pytest.raises(mfa_crypto.MfaIndisponivel) as exc:
        mfa_crypto.exigir_chave()
    assert exc.value.status_code == 503


def test_modelo_usuario_mfa_registrado():
    import app.models  # noqa: F401
    from app.models.usuario_mfa import UsuarioMfa
    from app.models.usuario import Usuario
    assert UsuarioMfa.__tablename__ == "usuario_mfa"
    cols = {c.name for c in UsuarioMfa.__table__.columns}
    assert cols == {
        "usuario_id", "segredo_cifrado", "ativo", "ativado_em",
        "ultimo_passo_usado", "codigos_recuperacao", "criado_em", "atualizado_em",
        "metodo", "codigo_hash", "codigo_expira_em", "codigo_enviado_em", "codigo_tentativas", "codigo_reenvios",
    }
    fk = list(UsuarioMfa.__table__.c.usuario_id.foreign_keys)[0]
    assert fk.ondelete == "CASCADE"
    assert "mfa" in Usuario.__mapper__.relationships
