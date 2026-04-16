from datetime import datetime, timezone
from typing import List

from app.api.deps import get_current_user, get_db, require_role
from app.models.notificacao import Notificacao, NotificacaoLida
from app.schemas.notificacao import (
    NotificacaoAdminOut,
    NotificacaoCreate,
    NotificacaoOut,
    NotificacaoUpdate,
)
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

router = APIRouter(prefix="/notificacoes", tags=["Notificacoes"])


def _is_visible(notif: Notificacao, municipio_id: int | None) -> bool:
    """Check if a notification is visible to the given municipio."""
    if notif.municipio_ids is None:
        return True  # platform-wide
    if municipio_id is None:
        return False  # ADMIN_GLOBAL has no municipio, skip targeted ones
    return municipio_id in notif.municipio_ids


def _is_expired(notif: Notificacao) -> bool:
    if notif.expira_em is None:
        return False
    now = datetime.now(timezone.utc)
    expira = notif.expira_em
    if expira.tzinfo is None:
        expira = expira.replace(tzinfo=timezone.utc)
    return now > expira


# ==============================
# List notifications for current user
# ==============================
@router.get("", response_model=List[NotificacaoOut])
def listar_notificacoes(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    all_notifs = db.query(Notificacao).order_by(Notificacao.criado_em.desc()).all()

    lidas_ids = {
        row.notificacao_id
        for row in db.query(NotificacaoLida)
        .filter(NotificacaoLida.usuario_id == current_user.id)
        .all()
    }

    result = []
    for notif in all_notifs:
        if _is_expired(notif):
            continue
        if not _is_visible(notif, current_user.municipio_id):
            continue
        result.append(
            NotificacaoOut(
                id=notif.id,
                titulo=notif.titulo,
                mensagem=notif.mensagem,
                tipo=notif.tipo,
                municipio_ids=notif.municipio_ids,
                criado_em=notif.criado_em,
                expira_em=notif.expira_em,
                lida=notif.id in lidas_ids,
            )
        )

    return result


# ==============================
# Mark notification as read
# ==============================
@router.post("/{notif_id}/marcar_lida", status_code=status.HTTP_204_NO_CONTENT)
def marcar_lida(
    notif_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    existing = (
        db.query(NotificacaoLida)
        .filter(
            NotificacaoLida.notificacao_id == notif_id,
            NotificacaoLida.usuario_id == current_user.id,
        )
        .first()
    )
    if not existing:
        lida = NotificacaoLida(
            notificacao_id=notif_id,
            usuario_id=current_user.id,
        )
        db.add(lida)
        db.commit()


# ==============================
# Admin: list all notifications
# ==============================
@router.get("/admin", response_model=List[NotificacaoAdminOut])
def listar_admin(
    db: Session = Depends(get_db),
    current_user=Depends(require_role("ADMIN_GLOBAL")),
):
    notifs = db.query(Notificacao).order_by(Notificacao.criado_em.desc()).all()
    return [
        NotificacaoAdminOut(
            id=n.id,
            titulo=n.titulo,
            mensagem=n.mensagem,
            tipo=n.tipo,
            municipio_ids=n.municipio_ids,
            criado_por=n.criado_por,
            criado_em=n.criado_em,
            expira_em=n.expira_em,
        )
        for n in notifs
    ]


# ==============================
# Admin: create notification
# ==============================
@router.post("", response_model=NotificacaoAdminOut, status_code=status.HTTP_201_CREATED)
def criar_notificacao(
    data: NotificacaoCreate,
    db: Session = Depends(get_db),
    current_user=Depends(require_role("ADMIN_GLOBAL")),
):
    notif = Notificacao(
        titulo=data.titulo,
        mensagem=data.mensagem,
        tipo=data.tipo,
        municipio_ids=data.municipio_ids if data.municipio_ids else None,
        criado_por=current_user.id,
        expira_em=data.expira_em,
    )
    db.add(notif)
    db.commit()
    db.refresh(notif)
    return NotificacaoAdminOut(
        id=notif.id,
        titulo=notif.titulo,
        mensagem=notif.mensagem,
        tipo=notif.tipo,
        municipio_ids=notif.municipio_ids,
        criado_por=notif.criado_por,
        criado_em=notif.criado_em,
        expira_em=notif.expira_em,
    )


# ==============================
# Admin: update notification
# ==============================
@router.patch("/{notif_id}", response_model=NotificacaoAdminOut)
def atualizar_notificacao(
    notif_id: int,
    data: NotificacaoUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(require_role("ADMIN_GLOBAL")),
):
    notif = db.query(Notificacao).filter(Notificacao.id == notif_id).first()
    if not notif:
        raise HTTPException(status_code=404, detail="Notificacao nao encontrada")

    if data.titulo is not None:
        notif.titulo = data.titulo
    if data.mensagem is not None:
        notif.mensagem = data.mensagem
    if data.tipo is not None:
        notif.tipo = data.tipo
    if data.municipio_ids is not None:
        notif.municipio_ids = data.municipio_ids if data.municipio_ids else None
    if data.expira_em is not None:
        notif.expira_em = data.expira_em

    db.commit()
    db.refresh(notif)
    return NotificacaoAdminOut(
        id=notif.id,
        titulo=notif.titulo,
        mensagem=notif.mensagem,
        tipo=notif.tipo,
        municipio_ids=notif.municipio_ids,
        criado_por=notif.criado_por,
        criado_em=notif.criado_em,
        expira_em=notif.expira_em,
    )


# ==============================
# Admin: delete notification
# ==============================
@router.delete("/{notif_id}", status_code=status.HTTP_204_NO_CONTENT)
def deletar_notificacao(
    notif_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(require_role("ADMIN_GLOBAL")),
):
    notif = db.query(Notificacao).filter(Notificacao.id == notif_id).first()
    if not notif:
        raise HTTPException(status_code=404, detail="Notificacao nao encontrada")
    db.delete(notif)
    db.commit()
