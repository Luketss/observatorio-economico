from datetime import datetime, timedelta, timezone

from app.api.deps import get_current_user, get_db, require_role
from app.api.pagination import PaginatedResponse
from app.core.exceptions import NotFoundException
from app.core.rate_limit import chave_por_usuario, limiter
from app.models.suporte import SuporteTicket, SuporteTicketEvento
from app.models.usuario import Usuario
from app.schemas.suporte import (
    STATUS_VALIDOS,
    AnotacaoCreate,
    KpisOut,
    StatusUpdate,
    TicketAdminDetalheOut,
    TicketAdminOut,
    TicketCreate,
    TicketMeuOut,
)
from app.services.audit_service import registrar_acao
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import func, select
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


def _horas_entre(a: datetime, b: datetime) -> float:
    """Horas de a ate b; datetimes naive (SQLite) sao tratados como UTC."""
    if a.tzinfo is None:
        a = a.replace(tzinfo=timezone.utc)
    if b.tzinfo is None:
        b = b.replace(tzinfo=timezone.utc)
    return (b - a).total_seconds() / 3600


def _carregar_ticket(db: Session, ticket_id: int) -> SuporteTicket:
    """Busca o ticket pelo id ou levanta 404."""
    ticket = db.get(SuporteTicket, ticket_id)
    if ticket is None:
        raise NotFoundException("Ticket nao encontrado")
    return ticket


def _alvo_do_ticket(ticket: SuporteTicket) -> dict:
    """Alvo da auditoria: usuario vivo ou, se excluido, o e-mail do snapshot."""
    if ticket.usuario is not None:
        return {"alvo": ticket.usuario}
    return {"alvo_email": ticket.usuario_email}


@router.get("/admin/kpis", response_model=KpisOut)
def kpis_suporte(
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_role("ADMIN_GLOBAL")),
):
    """KPIs do atendimento: contagens atuais, volume de 30 dias e tempo medio ate o 1o contato."""
    janela = datetime.now(timezone.utc) - timedelta(days=30)

    def contar(*criterios) -> int:
        return db.scalar(select(func.count(SuporteTicket.id)).where(*criterios)) or 0

    amostra = db.execute(
        select(SuporteTicket.criado_em, SuporteTicket.primeiro_contato_em).where(
            SuporteTicket.criado_em >= janela,
            SuporteTicket.primeiro_contato_em.is_not(None),
        )
    ).all()
    media = None
    if amostra:
        media = round(sum(_horas_entre(c, p) for c, p in amostra) / len(amostra), 1)
    return KpisOut(
        abertos=contar(SuporteTicket.status == "aberto"),
        em_atendimento=contar(SuporteTicket.status == "em_atendimento"),
        abertos_30d=contar(SuporteTicket.criado_em >= janela),
        resolvidos_30d=contar(SuporteTicket.resolvido_em >= janela),
        tempo_medio_primeiro_contato_horas=media,
    )


@router.get("/admin/tickets", response_model=PaginatedResponse[TicketAdminOut])
def listar_tickets_admin(
    request: Request,
    skip: int = 0,
    limit: int = 25,
    status_: str | None = Query(default=None, alias="status"),
    municipio_filtro: int | None = None,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_role("ADMIN_GLOBAL")),
):
    """Lista paginada de tickets (filtros por status e municipio); a leitura e auditada."""
    skip = max(skip, 0)
    limit = min(max(limit, 1), 100)
    if status_ is not None and status_ not in STATUS_VALIDOS:
        raise HTTPException(status_code=422, detail="Status invalido")
    criterios = []
    if status_ is not None:
        criterios.append(SuporteTicket.status == status_)
    if municipio_filtro is not None:
        criterios.append(SuporteTicket.municipio_id == municipio_filtro)
    total = db.scalar(select(func.count(SuporteTicket.id)).where(*criterios)) or 0
    itens = db.scalars(
        select(SuporteTicket)
        .where(*criterios)
        .order_by(SuporteTicket.criado_em.desc(), SuporteTicket.id.desc())
        .offset(skip)
        .limit(limit)
    ).all()
    registrar_acao(
        db,
        categoria="leitura",
        acao="suporte_tickets_listados",
        ator=current_user,
        detalhe=f"status={status_ or 'todos'} municipio={municipio_filtro or 'todos'} skip={skip}",
        request=request,
    )
    return PaginatedResponse(items=list(itens), total=total, skip=skip, limit=limit)


@router.get("/admin/tickets/{ticket_id}", response_model=TicketAdminDetalheOut)
def detalhar_ticket_admin(
    request: Request,
    ticket_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_role("ADMIN_GLOBAL")),
):
    """Detalhe do ticket com eventos; a leitura e auditada (sem o texto da mensagem)."""
    ticket = _carregar_ticket(db, ticket_id)
    registrar_acao(
        db,
        categoria="leitura",
        acao="suporte_ticket_consultado",
        ator=current_user,
        municipio_id=ticket.municipio_id,
        detalhe=f"ticket #{ticket.id}",
        request=request,
        **_alvo_do_ticket(ticket),
    )
    return ticket


@router.patch("/admin/tickets/{ticket_id}/status", response_model=TicketAdminDetalheOut)
def alterar_status_ticket(
    request: Request,
    ticket_id: int,
    data: StatusUpdate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_role("ADMIN_GLOBAL")),
):
    """Muda o status do ticket; registra evento e auditoria (reabrir limpa resolvido_em)."""
    ticket = _carregar_ticket(db, ticket_id)
    status_de = ticket.status
    status_para = data.status
    if status_de == status_para:
        raise HTTPException(status_code=400, detail="O ticket ja esta com esse status")
    agora = datetime.now(timezone.utc)
    ticket.eventos.append(
        SuporteTicketEvento(
            tipo="status",
            status_de=status_de,
            status_para=status_para,
            texto=data.texto,
            autor_id=current_user.id,
            autor_email=current_user.email,
        )
    )
    ticket.status = status_para
    if status_para == "em_atendimento" and ticket.primeiro_contato_em is None:
        ticket.primeiro_contato_em = agora
    if status_para == "resolvido":
        ticket.resolvido_em = agora
    if status_de == "resolvido":
        ticket.resolvido_em = None
    ticket.atualizado_em = agora
    db.commit()
    registrar_acao(
        db,
        categoria="acao",
        acao="suporte_ticket_status",
        ator=current_user,
        municipio_id=ticket.municipio_id,
        detalhe=f"ticket #{ticket.id}: {status_de} -> {status_para}",
        request=request,
        **_alvo_do_ticket(ticket),
    )
    db.refresh(ticket)
    return ticket


@router.post(
    "/admin/tickets/{ticket_id}/anotacoes",
    response_model=TicketAdminDetalheOut,
    status_code=201,
)
def anotar_ticket(
    request: Request,
    ticket_id: int,
    data: AnotacaoCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_role("ADMIN_GLOBAL")),
):
    """Anotacao interna no ticket; a auditoria nao carrega o texto."""
    ticket = _carregar_ticket(db, ticket_id)
    ticket.eventos.append(
        SuporteTicketEvento(
            tipo="anotacao",
            texto=data.texto,
            autor_id=current_user.id,
            autor_email=current_user.email,
        )
    )
    ticket.atualizado_em = datetime.now(timezone.utc)
    db.commit()
    registrar_acao(
        db,
        categoria="acao",
        acao="suporte_ticket_anotacao",
        ator=current_user,
        municipio_id=ticket.municipio_id,
        detalhe=f"ticket #{ticket.id}",
        request=request,
        **_alvo_do_ticket(ticket),
    )
    db.refresh(ticket)
    return ticket
