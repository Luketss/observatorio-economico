"""Esqueci minha senha: token de uso unico enviado por e-mail (30 min), sem enumeracao de contas.

Spec: docs/superpowers/specs/2026-10-06-email-resend-redefinicao-mfa-design.md, secao 2.
"""
import hashlib
import secrets
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.exceptions import AppException
from app.core.security import DUMMY_PASSWORD_HASH, hash_password, verify_password
from app.models.redefinicao_senha import RedefinicaoSenha
from app.models.usuario import Usuario
from app.services.audit_service import registrar_acao
from app.services.email_service import enviar
from app.services.email_templates import assunto, renderizar

TOKEN_VALIDADE_MINUTOS = 30
MAX_PEDIDOS_POR_HORA = 3
MENSAGEM_GENERICA = "Se o e-mail estiver cadastrado, enviamos as instrucoes."


class TokenInvalido(AppException):
    def __init__(self):
        super().__init__(code="TOKEN_INVALIDO", message="Link invalido, expirado ou ja usado", status_code=410)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def montar_link(token: str) -> str:
    return f"{settings.FRONTEND_URL.rstrip('/')}/redefinir-senha?token={token}"


class RedefinicaoSenhaService:
    def __init__(self, db: Session):
        self.db = db

    def solicitar(self, email: str, ip: str | None = None) -> None:
        """Sempre silencioso: quem chama responde 202 com MENSAGEM_GENERICA."""
        email = (email or "").strip().lower()
        user = self.db.query(Usuario).filter(Usuario.email == email).first()
        if user is None or not user.ativo:
            verify_password("x", DUMMY_PASSWORD_HASH)  # equaliza o tempo (anti-enumeracao)
            return
        agora = datetime.now(timezone.utc)
        pedidos_na_hora = (
            self.db.query(RedefinicaoSenha)
            .filter(
                RedefinicaoSenha.usuario_id == user.id,
                RedefinicaoSenha.criado_em >= agora - timedelta(hours=1),
            )
            .count()
        )
        if pedidos_na_hora >= MAX_PEDIDOS_POR_HORA:
            return
        # Pedir de novo invalida o anterior: so o ultimo link vale.
        (
            self.db.query(RedefinicaoSenha)
            .filter(RedefinicaoSenha.usuario_id == user.id, RedefinicaoSenha.usado_em.is_(None))
            .update({"usado_em": agora}, synchronize_session=False)
        )
        token = secrets.token_urlsafe(32)
        self.db.add(RedefinicaoSenha(
            usuario_id=user.id,
            token_hash=hash_token(token),
            expira_em=agora + timedelta(minutes=TOKEN_VALIDADE_MINUTOS),
            ip=ip,
            criado_em=agora,
        ))
        self.db.commit()
        html, texto = renderizar("redefinir_senha", nome=user.nome, link=montar_link(token))
        enviar(user.email, assunto("redefinir_senha"), html, texto)  # falha fica no log; a resposta nao muda

    def _pendente(self, token: str) -> tuple[RedefinicaoSenha, Usuario]:
        token = (token or "").strip()
        if not token:
            raise TokenInvalido()
        agora = datetime.now(timezone.utc)
        reg = (
            self.db.query(RedefinicaoSenha)
            .filter(
                RedefinicaoSenha.token_hash == hash_token(token),
                RedefinicaoSenha.usado_em.is_(None),
                RedefinicaoSenha.expira_em > agora,
            )
            .first()
        )
        if reg is None:
            raise TokenInvalido()
        user = self.db.get(Usuario, reg.usuario_id)
        if user is None or not user.ativo:
            raise TokenInvalido()
        return reg, user

    def validar(self, token: str) -> Usuario:
        return self._pendente(token)[1]

    def redefinir(self, token: str, nova_senha: str, request=None) -> None:
        reg, user = self._pendente(token)
        user.senha_hash = hash_password(nova_senha)
        reg.usado_em = datetime.now(timezone.utc)
        self.db.add(user)
        self.db.add(reg)
        self.db.commit()
        registrar_acao(
            self.db, categoria="acao", acao="senha_redefinida_por_email",
            ator=user, alvo=user, request=request,
        )
