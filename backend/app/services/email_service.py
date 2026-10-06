"""Envio de e-mail transacional via API REST do Resend. NUNCA lanca.

Spec: docs/superpowers/specs/2026-10-06-email-resend-redefinicao-mfa-design.md, secao 1.
Sem RESEND_API_KEY: modo seco (devolve MODO_SECO; nada e enviado). Falha real: None.
"""
import logging

import requests

from app.core.config import settings

logger = logging.getLogger("app.email")

RESEND_URL = "https://api.resend.com/emails"
TIMEOUT_SEGUNDOS = 10
MODO_SECO = "seco"


def mascarar_email(email: str) -> str:
    local, arroba, dominio = (email or "").partition("@")
    if not arroba or not dominio:
        return "***"
    return f"{local[:1]}***@{dominio}"


def enviar(para: str, assunto: str, html: str, texto: str) -> str | None:
    """Devolve o id do Resend, MODO_SECO sem chave, ou None em qualquer falha."""
    destino = mascarar_email(para)
    if not (settings.RESEND_API_KEY or "").strip():
        logger.info("[email seco] para=%s assunto=%s", destino, assunto)
        if settings.ENVIRONMENT != "production":
            logger.info("[email seco] corpo:\n%s", texto)
        return MODO_SECO
    try:
        resposta = requests.post(
            RESEND_URL,
            json={
                "from": settings.EMAIL_REMETENTE,
                "to": [para],
                "subject": assunto,
                "html": html,
                "text": texto,
            },
            headers={"Authorization": f"Bearer {settings.RESEND_API_KEY}"},
            timeout=TIMEOUT_SEGUNDOS,
        )
    except requests.RequestException as exc:
        logger.warning("E-mail nao enviado para %s: %s", destino, exc.__class__.__name__)
        return None
    if not 200 <= resposta.status_code < 300:
        logger.warning("E-mail nao enviado para %s: HTTP %s", destino, resposta.status_code)
        return None
    try:
        return resposta.json().get("id")
    except (ValueError, AttributeError):
        logger.warning("E-mail para %s aceito mas resposta sem id", destino)
        return None
