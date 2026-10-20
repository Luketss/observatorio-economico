from app.api.deps import get_current_user, get_db
from app.core.rate_limit import chave_por_usuario, limiter
from app.models.suporte import SuporteTicket, SuporteTicketEvento
from app.models.usuario import Usuario
from app.schemas.suporte import TicketCreate, TicketMeuOut
from fastapi import APIRouter, Depends, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

router = APIRouter(prefix="/suporte", tags=["Suporte"])


@router.post("/tickets", response_model=TicketMeuOut, status_code=201)
@limiter.limit("5/hour", key_func=chave_por_usuario)
def criar_ticket(
    request: Request,
    data: TicketCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """Abre um ticket de suporte com snapshot do usuario e municipio."""
    ticket = SuporteTicket(
        usuario_id=current_user.id,
        usuario_nome=current_user.nome,
        usuario_email=current_user.email,
        usuario_role=current_user.role.nome,
        municipio_id=current_user.municipio_id,
        municipio_nome=current_user.municipio.nome if current_user.municipio else None,
        mensagem=data.mensagem,
        whatsapp=data.whatsapp,
        canal_preferido=data.canal_preferido,
    )
    ticket.eventos.append(
        SuporteTicketEvento(
            tipo="abertura",
            autor_id=current_user.id,
            autor_email=current_user.email,
        )
    )
    db.add(ticket)
    db.commit()
    db.refresh(ticket)
    return ticket


@router.get("/tickets/meus", response_model=list[TicketMeuOut])
def listar_meus_tickets(
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """Lista os tickets do proprio usuario, mais recentes primeiro."""
    stmt = (
        select(SuporteTicket)
        .where(SuporteTicket.usuario_id == current_user.id)
        .order_by(SuporteTicket.criado_em.desc(), SuporteTicket.id.desc())
    )
    return list(db.scalars(stmt).all())
