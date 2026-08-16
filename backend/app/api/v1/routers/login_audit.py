from datetime import datetime, timedelta, timezone

from app.api.deps import get_db, require_role
from app.api.pagination import PaginatedResponse
from app.api.response import SuccessResponse
from app.models.acao_audit import AcaoAudit
from app.models.login_audit import LoginAudit
from app.models.role import Role
from app.models.usuario import Usuario
from app.schemas.acao_audit import AcaoAuditOut
from app.schemas.login_audit import (
    AdminLoginSummary,
    AdminLoginSummaryItem,
    LoginAuditOut,
)
from app.services.audit_service import registrar_acao
from fastapi import APIRouter, Depends, Request
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

router = APIRouter(prefix="/admin/login-audit", tags=["Admin - Login Audit"])
router_acoes = APIRouter(prefix="/admin/auditoria", tags=["Admin - Auditoria"])


def _admin_global_users(db: Session) -> list[Usuario]:
    stmt = (
        select(Usuario)
        .join(Role, Usuario.role_id == Role.id)
        .where(Role.nome == "ADMIN_GLOBAL")
    )
    return list(db.scalars(stmt).all())


@router.get("", response_model=PaginatedResponse[LoginAuditOut])
def listar_login_audit(
    request: Request,
    skip: int = 0,
    limit: int = 20,
    sucesso: bool | None = None,
    email: str | None = None,
    role: str | None = None,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_role("ADMIN_GLOBAL")),
):
    # Login activity for ALL accounts (the page itself is ADMIN_GLOBAL-only).
    # LEFT join the account so each row carries the user's name + role;
    # usuario_id is null for attempts on unknown emails.
    query = (
        db.query(LoginAudit, Usuario.nome, Role.nome)
        .outerjoin(Usuario, LoginAudit.usuario_id == Usuario.id)
        .outerjoin(Role, Usuario.role_id == Role.id)
    )

    if sucesso is not None:
        query = query.filter(LoginAudit.sucesso == sucesso)
    if email:
        query = query.filter(LoginAudit.email_tentado.ilike(f"%{email}%"))
    if role:
        # Filtering by role naturally excludes unknown-email rows (no account).
        query = query.filter(Role.nome == role)

    total = query.count()
    rows = (
        query.order_by(LoginAudit.criado_em.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )

    items = [
        LoginAuditOut(
            id=la.id,
            usuario_id=la.usuario_id,
            email_tentado=la.email_tentado,
            sucesso=la.sucesso,
            motivo=la.motivo,
            ip=la.ip,
            user_agent=la.user_agent,
            criado_em=la.criado_em,
            nome=nome,
            papel=papel,
        )
        for la, nome, papel in rows
    ]

    registrar_acao(db, categoria="leitura", acao="auditoria_consultada",
                   ator=current_user, detalhe="logins", request=request)
    return PaginatedResponse(items=items, total=total, skip=skip, limit=limit)


@router.get("/summary", response_model=SuccessResponse[AdminLoginSummary])
def resumo_login_audit(
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_role("ADMIN_GLOBAL")),
):
    admins = _admin_global_users(db)
    since = datetime.now(timezone.utc) - timedelta(hours=24)

    items: list[AdminLoginSummaryItem] = []
    for u in admins:
        failed_24h = (
            db.query(func.count(LoginAudit.id))
            .filter(
                LoginAudit.email_tentado == u.email,
                LoginAudit.sucesso.is_(False),
                LoginAudit.criado_em >= since,
            )
            .scalar()
        ) or 0

        items.append(
            AdminLoginSummaryItem(
                usuario_id=u.id,
                nome=u.nome,
                email=u.email,
                last_login=u.last_login,
                failed_24h=failed_24h,
            )
        )

    return SuccessResponse(data=AdminLoginSummary(items=items))


@router_acoes.get("/acoes", response_model=PaginatedResponse[AcaoAuditOut])
def listar_acoes_audit(
    request: Request,
    skip: int = 0,
    limit: int = 20,
    categoria: str | None = None,
    acao: str | None = None,
    email: str | None = None,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_role("ADMIN_GLOBAL")),
):
    query = (
        db.query(AcaoAudit, Usuario.nome)
        .outerjoin(Usuario, AcaoAudit.ator_id == Usuario.id)
    )
    if categoria:
        query = query.filter(AcaoAudit.categoria == categoria)
    if acao:
        query = query.filter(AcaoAudit.acao == acao)
    if email:
        like = f"%{email}%"
        query = query.filter(or_(
            AcaoAudit.ator_email.ilike(like),
            AcaoAudit.alvo_email.ilike(like),
        ))

    total = query.count()
    rows = (
        query.order_by(AcaoAudit.criado_em.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )
    items = [
        AcaoAuditOut(
            id=a.id, categoria=a.categoria, acao=a.acao,
            ator_id=a.ator_id, ator_email=a.ator_email, ator_nome=nome,
            alvo_usuario_id=a.alvo_usuario_id, alvo_email=a.alvo_email,
            municipio_id=a.municipio_id, detalhe=a.detalhe, ip=a.ip,
            criado_em=a.criado_em,
        )
        for a, nome in rows
    ]

    registrar_acao(db, categoria="leitura", acao="auditoria_consultada",
                   ator=current_user, detalhe="acoes", request=request)
    return PaginatedResponse(items=items, total=total, skip=skip, limit=limit)
