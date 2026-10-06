"""Segundo fator TOTP (app autenticador) — cadastro, validacao e codigos de recuperacao.

Spec: docs/superpowers/specs/2026-10-06-mfa-totp-admin-global-design.md
"""
import hashlib
import hmac
import re
import secrets
import time
from datetime import datetime, timedelta, timezone

import pyotp
import qrcode
from qrcode.image.svg import SvgPathImage
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.datas import garantir_utc
from app.core.exceptions import AppException, ConflictException, UnauthorizedException
from app.core.mfa_crypto import cifrar, decifrar, exigir_chave
from app.core.security import hash_password, verify_password
from app.models.usuario import Usuario
from app.models.usuario_mfa import UsuarioMfa
from app.services.audit_service import registrar_acao
from app.services.email_service import enviar, mascarar_email
from app.services.email_templates import assunto, renderizar

EMISSOR = "UAIZI NID"
PASSO_SEGUNDOS = 30
N_CODIGOS_RECUPERACAO = 10
ALFABETO_RECUPERACAO = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # sem 0/O/1/I
_RE_RECUPERACAO = re.compile(r"^[A-Z2-9]{8}$")

METODOS = ("totp", "email")
CODIGO_EMAIL_VALIDADE_MINUTOS = 10
CODIGO_EMAIL_MAX_TENTATIVAS = 5
CODIGO_EMAIL_MAX_REENVIOS = 3
CODIGO_EMAIL_INTERVALO_SEGUNDOS = 60
FINALIDADE_LOGIN = "entrar na plataforma"
FINALIDADE_ATIVAR = "ativar a verificacao por e-mail"
FINALIDADE_DESATIVAR = "confirmar a desativacao da verificacao em duas etapas"


def gerar_codigo_email() -> str:
    return f"{secrets.randbelow(10**6):06d}"


def hash_codigo_email(codigo: str) -> str:
    return hmac.new(settings.SECRET_KEY.encode("utf-8"), codigo.encode("utf-8"), hashlib.sha256).hexdigest()


def _erro_envio() -> AppException:
    return AppException(
        code="EMAIL_NAO_ENVIADO",
        message="Nao foi possivel enviar o codigo por e-mail; tente de novo",
        status_code=502,
    )


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
            return {"ativo": False, "ativado_em": None, "codigos_restantes": 0, "metodo": None}
        return {
            "ativo": True,
            "ativado_em": mfa.ativado_em,
            "codigos_restantes": len(mfa.codigos_recuperacao or []),
            "metodo": mfa.metodo,
        }

    # ---------- cadastro ----------

    def configurar(self, user: Usuario, metodo: str = "totp") -> dict:
        if metodo not in METODOS:
            raise AppException(code="METODO_INVALIDO", message="Metodo de MFA invalido", status_code=422)
        if user.mfa is not None and user.mfa.ativo:
            raise ConflictException("MFA ja esta ativo; desative antes de reconfigurar.")
        if metodo == "totp":
            exigir_chave()
        segredo = pyotp.random_base32() if metodo == "totp" else None
        cifrado = cifrar(segredo) if segredo else None
        if user.mfa is None:
            user.mfa = UsuarioMfa(segredo_cifrado=cifrado, ativo=False, codigos_recuperacao=[], metodo=metodo)
        else:
            mfa = user.mfa
            mfa.segredo_cifrado = cifrado
            mfa.ativo = False
            mfa.ultimo_passo_usado = None
            mfa.codigos_recuperacao = []
            mfa.metodo = metodo
            mfa.codigo_hash = None
            mfa.codigo_expira_em = None
            mfa.codigo_enviado_em = None
            mfa.codigo_tentativas = 0
            mfa.codigo_reenvios = 0
        self.db.add(user)
        self.db.commit()
        if metodo == "email":
            if not self.enviar_codigo(user.mfa, user, FINALIDADE_ATIVAR):
                raise _erro_envio()
            return {"metodo": "email", "enviado_para": mascarar_email(user.email)}
        url = pyotp.TOTP(segredo).provisioning_uri(name=user.email, issuer_name=EMISSOR)
        qr_svg = qrcode.make(url, image_factory=SvgPathImage).to_string(encoding="unicode")
        return {"metodo": "totp", "otpauth_url": url, "segredo": segredo, "qr_svg": qr_svg}

    def ativar(self, user: Usuario, codigo: str, request=None) -> list[str]:
        mfa = user.mfa
        if mfa is None or mfa.ativo:
            raise ConflictException("Nenhuma configuracao de MFA pendente.")
        valido = self._codigo_email_valido(mfa, codigo) if mfa.metodo == "email" else self._totp_valido(mfa, codigo)
        if not valido:
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
        """Codigo de recuperacao (consome) OU, conforme o metodo, TOTP (janela +-1, anti-replay)
        ou codigo por e-mail (hash HMAC, 10 min, 5 tentativas)."""
        if eh_codigo_recuperacao(codigo):
            return self._recuperacao_valida(mfa, codigo)
        if mfa.metodo == "email":
            return self._codigo_email_valido(mfa, codigo)
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

    def _codigo_email_valido(self, mfa: UsuarioMfa, codigo: str) -> bool:
        digitos = normalizar_codigo(codigo)
        if not digitos.isdigit() or len(digitos) != 6:
            return False
        expira = garantir_utc(mfa.codigo_expira_em)
        if not mfa.codigo_hash or expira is None or expira < datetime.now(timezone.utc):
            return False
        if mfa.codigo_tentativas >= CODIGO_EMAIL_MAX_TENTATIVAS:
            return False
        if hmac.compare_digest(hash_codigo_email(digitos), mfa.codigo_hash):
            mfa.codigo_hash = None
            mfa.codigo_expira_em = None
            mfa.codigo_tentativas = 0
            self.db.add(mfa)
            self.db.commit()
            return True
        mfa.codigo_tentativas += 1
        self.db.add(mfa)
        self.db.commit()
        return False

    # ---------- codigo por e-mail ----------

    def enviar_codigo(self, mfa: UsuarioMfa, user: Usuario, finalidade: str) -> bool:
        """Gera um codigo novo (o anterior morre), persiste so o hash e envia. False se o envio falhou
        (o hash fica gravado: um "Reenviar" depois resolve)."""
        codigo = gerar_codigo_email()
        agora = datetime.now(timezone.utc)
        mfa.codigo_hash = hash_codigo_email(codigo)
        mfa.codigo_expira_em = agora + timedelta(minutes=CODIGO_EMAIL_VALIDADE_MINUTOS)
        mfa.codigo_enviado_em = agora
        mfa.codigo_tentativas = 0
        self.db.add(mfa)
        self.db.commit()
        html, texto = renderizar("codigo_verificacao", codigo=codigo, finalidade=finalidade)
        return enviar(user.email, assunto("codigo_verificacao"), html, texto) is not None

    def reenviar_codigo(self, mfa: UsuarioMfa, user: Usuario, finalidade: str) -> dict:
        """Limites: 60 s entre envios (429 AGUARDE) e 3 reenvios por ciclo (429 LIMITE_REENVIO);
        o ciclo recomeca quando o codigo anterior ja expirou."""
        agora = datetime.now(timezone.utc)
        expira = garantir_utc(mfa.codigo_expira_em)
        if expira is None or expira < agora:
            mfa.codigo_reenvios = 0
        if mfa.codigo_reenvios >= CODIGO_EMAIL_MAX_REENVIOS:
            raise AppException(
                code="LIMITE_REENVIO",
                message="Limite de reenvios atingido; aguarde 10 minutos e tente de novo",
                status_code=429,
            )
        enviado_em = garantir_utc(mfa.codigo_enviado_em)
        if enviado_em is not None:
            faltam = CODIGO_EMAIL_INTERVALO_SEGUNDOS - int((agora - enviado_em).total_seconds())
            if faltam > 0:
                raise AppException(code="AGUARDE", message=f"Aguarde {faltam} s para reenviar", status_code=429)
        mfa.codigo_reenvios += 1
        if not self.enviar_codigo(mfa, user, finalidade):
            raise _erro_envio()
        return {"enviado_para": mascarar_email(user.email)}
