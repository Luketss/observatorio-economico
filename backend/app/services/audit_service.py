"""Trilha de auditoria de ações administrativas e leituras de dados pessoais.

Regra de ouro (mesma do LoginAudit em auth_service): falha de auditoria
NUNCA quebra a operação principal — logar, rollback e seguir.
"""
import logging
from datetime import datetime, timedelta, timezone

from app.models.acao_audit import AcaoAudit
from app.models.login_audit import LoginAudit

logger = logging.getLogger("app.audit")

# Prazos de retenção — docs/lgpd.md referencia estes nomes; mudar lá junto.
RETENCAO_ACESSOS_MESES = 12  # login_audit + acao_audit categoria 'leitura'
RETENCAO_ACOES_ANOS = 5      # acao_audit categoria 'acao'


def origem_do_request(request) -> tuple[str | None, str | None]:
    """(ip, user_agent) — x-forwarded-for do proxy primeiro, fallback para o
    peer do socket. Mesma regra do login (router auth)."""
    if request is None:
        return None, None
    fwd = request.headers.get("x-forwarded-for")
    ip = fwd.split(",")[0].strip() if fwd else (
        request.client.host if request.client else None
    )
    return ip, request.headers.get("user-agent")


def montar_detalhe_atualizacao(
    campos: list[str],
    *,
    role_de: str | None = None,
    role_para: str | None = None,
    ativo_de: bool | None = None,
    ativo_para: bool | None = None,
) -> str:
    """Diff legível do PUT de usuário. NUNCA inclui valores — só nomes de
    campos; exceções não sensíveis: role e ativo ganham de→para."""
    partes = []
    if campos:
        partes.append(f"campos: {', '.join(sorted(campos))}")
    if role_de is not None and role_para is not None and role_de != role_para:
        partes.append(f"role: {role_de} → {role_para}")
    if ativo_de is not None and ativo_para is not None and ativo_de != ativo_para:
        partes.append(f"ativo: {ativo_de} → {ativo_para}")
    return " | ".join(partes)


def registrar_acao(
    db,
    *,
    categoria: str,
    acao: str,
    ator,
    alvo=None,
    alvo_email: str | None = None,
    municipio_id: int | None = None,
    detalhe: str | None = None,
    request=None,
) -> None:
    """Persiste uma linha de auditoria. `alvo` (Usuario vivo) tem precedência;
    para alvo já excluído, passar só `alvo_email`/`municipio_id` (o id não
    pode ser referenciado — a linha registra o vínculo pelo snapshot)."""
    try:
        ip, user_agent = origem_do_request(request)
        db.add(AcaoAudit(
            categoria=categoria,
            acao=acao,
            ator_id=ator.id,
            ator_email=ator.email,
            alvo_usuario_id=alvo.id if alvo is not None else None,
            alvo_email=alvo.email if alvo is not None else alvo_email,
            municipio_id=(
                municipio_id if municipio_id is not None
                else (alvo.municipio_id if alvo is not None else None)
            ),
            detalhe=detalhe,
            ip=ip,
            user_agent=user_agent,
        ))
        db.commit()
    except Exception:
        logger.exception("Falha ao registrar auditoria (%s/%s)", categoria, acao)
        try:
            db.rollback()
        except Exception:
            pass


def cortes_retencao(agora: datetime | None = None) -> tuple[datetime, datetime]:
    """(corte_acessos, corte_acoes): registros ANTERIORES ao corte são
    purgados. 12 meses ≈ 365 dias, 5 anos ≈ 5×365 — aproximação declarada
    em docs/lgpd.md."""
    agora = agora or datetime.now(timezone.utc)
    return agora - timedelta(days=365), agora - timedelta(days=5 * 365)


def purgar_auditoria(db, agora: datetime | None = None) -> dict:
    """Aplica a retenção (RETENCAO_ACESSOS_MESES / RETENCAO_ACOES_ANOS).
    Devolve contagens por classe; {} em falha (logada, nunca propaga)."""
    try:
        corte_acessos, corte_acoes = cortes_retencao(agora)
        n_login = (
            db.query(LoginAudit)
            .filter(LoginAudit.criado_em < corte_acessos)
            .delete(synchronize_session=False)
        )
        n_leituras = (
            db.query(AcaoAudit)
            .filter(AcaoAudit.categoria == "leitura",
                    AcaoAudit.criado_em < corte_acessos)
            .delete(synchronize_session=False)
        )
        n_acoes = (
            db.query(AcaoAudit)
            .filter(AcaoAudit.categoria == "acao",
                    AcaoAudit.criado_em < corte_acoes)
            .delete(synchronize_session=False)
        )
        db.commit()
        if n_login or n_leituras or n_acoes:
            logger.info(
                "Purga de auditoria: login=%s leituras=%s acoes=%s",
                n_login, n_leituras, n_acoes,
            )
        return {"login_audit": n_login, "leituras": n_leituras, "acoes": n_acoes}
    except Exception:
        logger.exception("Purga de auditoria falhou")
        try:
            db.rollback()
        except Exception:
            pass
        return {}
