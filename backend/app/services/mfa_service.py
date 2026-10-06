"""Segundo fator TOTP (app autenticador) — cadastro, validacao e codigos de recuperacao.

Spec: docs/superpowers/specs/2026-10-06-mfa-totp-admin-global-design.md
"""
import re
import secrets
import time
from datetime import datetime, timezone

import pyotp
import qrcode
from qrcode.image.svg import SvgPathImage
from sqlalchemy.orm import Session

from app.core.exceptions import ConflictException, UnauthorizedException
from app.core.mfa_crypto import cifrar, decifrar, exigir_chave
from app.core.security import hash_password, verify_password
from app.models.usuario import Usuario
from app.models.usuario_mfa import UsuarioMfa
from app.services.audit_service import registrar_acao

EMISSOR = "UAIZI NID"
PASSO_SEGUNDOS = 30
N_CODIGOS_RECUPERACAO = 10
ALFABETO_RECUPERACAO = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # sem 0/O/1/I
_RE_RECUPERACAO = re.compile(r"^[A-Z2-9]{8}$")


def normalizar_codigo(texto: str) -> str:
    return re.sub(r"[\s-]", "", texto or "").upper()


def eh_codigo_recuperacao(texto: str) -> bool:
    return bool(_RE_RECUPERACAO.match(normalizar_codigo(texto)))


def gerar_codigos_recuperacao() -> list[str]:
    def bloco():
        return "".join(secrets.choice(ALFABETO_RECUPERACAO) for _ in range(4))

    codigos: list[str] = []
    while len(codigos) < N_CODIGOS_RECUPERACAO:
        c = f"{bloco()}-{bloco()}"
        if c not in codigos:
            codigos.append(c)
    return codigos


class MfaService:
    def __init__(self, db: Session):
        self.db = db

    # ---------- consulta ----------

    def status(self, user: Usuario) -> dict:
        mfa = user.mfa
        if mfa is None or not mfa.ativo:
            return {"ativo": False, "ativado_em": None, "codigos_restantes": 0}
        return {
            "ativo": True,
            "ativado_em": mfa.ativado_em,
            "codigos_restantes": len(mfa.codigos_recuperacao or []),
        }

    # ---------- cadastro ----------

    def configurar(self, user: Usuario) -> dict:
        exigir_chave()
        if user.mfa is not None and user.mfa.ativo:
            raise ConflictException("MFA ja esta ativo; desative antes de reconfigurar.")
        segredo = pyotp.random_base32()
        if user.mfa is None:
            user.mfa = UsuarioMfa(segredo_cifrado=cifrar(segredo), ativo=False, codigos_recuperacao=[])
        else:
            user.mfa.segredo_cifrado = cifrar(segredo)
            user.mfa.ativo = False
            user.mfa.ultimo_passo_usado = None
            user.mfa.codigos_recuperacao = []
        self.db.add(user)
        self.db.commit()
        url = pyotp.TOTP(segredo).provisioning_uri(name=user.email, issuer_name=EMISSOR)
        qr_svg = qrcode.make(url, image_factory=SvgPathImage).to_string(encoding="unicode")
        return {"otpauth_url": url, "segredo": segredo, "qr_svg": qr_svg}

    def ativar(self, user: Usuario, codigo: str, request=None) -> list[str]:
        mfa = user.mfa
        if mfa is None or mfa.ativo:
            raise ConflictException("Nenhuma configuracao de MFA pendente.")
        if not self._totp_valido(mfa, codigo):
            raise UnauthorizedException("Codigo invalido")
        codigos = gerar_codigos_recuperacao()
        mfa.codigos_recuperacao = [hash_password(c) for c in codigos]
        mfa.ativo = True
        mfa.ativado_em = datetime.now(timezone.utc)
        self.db.add(mfa)
        self.db.commit()
        registrar_acao(self.db, categoria="acao", acao="mfa_ativado", ator=user, alvo=user, request=request)
        return codigos

    def desativar(self, user: Usuario, senha_atual: str, codigo: str, request=None) -> None:
        mfa = user.mfa
        if mfa is None or not mfa.ativo:
            raise ConflictException("MFA nao esta ativo.")
        if not verify_password(senha_atual, user.senha_hash):
            raise UnauthorizedException("Senha atual incorreta")
        if not self.codigo_valido(mfa, codigo):
            raise UnauthorizedException("Codigo invalido")
        self.db.delete(mfa)
        user.mfa = None
        self.db.commit()
        registrar_acao(self.db, categoria="acao", acao="mfa_desativado", ator=user, alvo=user, request=request)

    # ---------- validacao ----------

    def codigo_valido(self, mfa: UsuarioMfa, codigo: str) -> bool:
        """TOTP (janela +-1 passo, anti-replay) OU codigo de recuperacao (consome)."""
        if eh_codigo_recuperacao(codigo):
            return self._recuperacao_valida(mfa, codigo)
        return self._totp_valido(mfa, codigo)

    # Por design, os validadores abaixo persistem (commit) o passo/codigo consumido.
    def _totp_valido(self, mfa: UsuarioMfa, codigo: str) -> bool:
        digitos = normalizar_codigo(codigo)
        if not digitos.isdigit() or len(digitos) != 6:
            return False
        totp = pyotp.TOTP(decifrar(mfa.segredo_cifrado))
        passo_atual = int(time.time()) // PASSO_SEGUNDOS
        ultimo = mfa.ultimo_passo_usado
        for delta in (0, 1, -1):
            passo = passo_atual + delta
            if ultimo is not None and passo <= ultimo:
                continue
            if secrets.compare_digest(totp.at(passo * PASSO_SEGUNDOS), digitos):
                mfa.ultimo_passo_usado = passo
                self.db.add(mfa)
                self.db.commit()
                return True
        return False

    def _recuperacao_valida(self, mfa: UsuarioMfa, codigo: str) -> bool:
        texto = normalizar_codigo(codigo)
        texto = f"{texto[:4]}-{texto[4:]}"
        restantes = list(mfa.codigos_recuperacao or [])
        for i, h in enumerate(restantes):
            if verify_password(texto, h):
                del restantes[i]
                mfa.codigos_recuperacao = restantes
                self.db.add(mfa)
                self.db.commit()
                return True
        return False
