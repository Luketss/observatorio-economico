from datetime import datetime, timedelta, timezone

from app.api.deps import get_db, require_role
from app.api.pagination import PaginatedResponse
from app.api.response import SuccessResponse
from app.models.login_audit import LoginAudit
from app.models.role import Role
from app.models.usuario import Usuario
from app.schemas.login_audit import (
    AdminLoginSummary,
    AdminLoginSummaryItem,
    LoginAuditOut,
)
from fastapi import APIRouter, Depends
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

router = APIRouter(prefix="/admin/login-audit", tags=["Admin - Login Audit"])


def _admin_global_users(db: Session) -> list[Usuario]:
    stmt = (
        select(Usuario)
        .join(Role, Usuario.role_id == Role.id)
        .where(Role.nome == "ADMIN_GLOBAL")
    )
    return list(db.scalars(stmt).all())


@router.get("", response_model=PaginatedResponse[LoginAuditOut])
def listar_login_audit(
    skip: int = 0,
    limit: int = 20,
    sucesso: bool | None = None,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_role("ADMIN_GLOBAL")),
):
    admins = _admin_global_users(db)
    admin_ids = [u.id for u in admins]
    admin_emails = [u.email for u in admins]

    # Scope to ADMIN_GLOBAL activity: either the attempt resolved to an
    # ADMIN_GLOBAL account, or the submitted email belongs to one (failed
    # attempts against an admin account, even with a wrong password).
    scope_conditions = []
    if admin_ids:
        scope_conditions.append(LoginAudit.usuario_id.in_(admin_ids))
    if admin_emails:
        scope_conditions.append(LoginAudit.email_tentado.in_(admin_emails))

    if not scope_conditions:
        # No ADMIN_GLOBAL accounts exist — nothing to show.
        return PaginatedResponse(items=[], total=0, skip=skip, limit=limit)

    query = db.query(LoginAudit).filter(or_(*scope_conditions))

    if sucesso is not None:
        query = query.filter(LoginAudit.sucesso == sucesso)

    total = query.count()
    rows = (
        query.order_by(LoginAudit.criado_em.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )

    items = [LoginAuditOut.model_validate(r) for r in rows]

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
