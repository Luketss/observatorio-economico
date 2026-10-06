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
SEM_ID = "enviado-sem-id"


def mascarar_email(email: str) -> str:
    local, arroba, dominio = (email or "").partition("@")
    if not arroba or not dominio:
        return "***"
    return f"{local[:1]}***@{dominio}"


def enviar(para: str, assunto: str, html: str, texto: str) -> str | None:
    """Devolve o id do Resend (SEM_ID se 2xx sem id), MODO_SECO sem chave fora de producao, ou None em falha."""
    destino = mascarar_email(para)
    if not (settings.RESEND_API_KEY or "").strip():
        if settings.ENVIRONMENT == "production":
            logger.warning("RESEND_API_KEY ausente em producao; e-mail NAO enviado para %s (%s)", destino, assunto)
            return None
        logger.info("[email seco] para=%s assunto=%s", destino, assunto)
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
        rid = resposta.json().get("id")
    except (ValueError, AttributeError):
        rid = None
    if not rid:
        logger.warning("E-mail para %s aceito (HTTP %s) mas resposta sem id", destino, resposta.status_code)
        return SEM_ID
    return rid
