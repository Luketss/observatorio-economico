from app.db.base import Base
from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func


class SuporteTicket(Base):
    """Ticket de atendimento aberto pelo usuario pelo formulario de suporte.

    Spec 2026-10-19-suporte-tickets, secao Modelo de dados. Os campos usuario_*
    e municipio_nome sao snapshots: o ticket continua legivel se o usuario ou o
    municipio for excluido (FK SET NULL, mesma filosofia de AcaoAudit).
    """

    __tablename__ = "suporte_tickets"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    usuario_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("usuarios.id", ondelete="SET NULL"),
        nullable=True, index=True,
    )
    usuario_nome: Mapped[str] = mapped_column(String(150), nullable=False)
    usuario_email: Mapped[str] = mapped_column(String(150), nullable=False)
    # snapshot de role.nome
    usuario_role: Mapped[str] = mapped_column(String(50), nullable=False)
    municipio_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("municipios.id", ondelete="SET NULL"),
        nullable=True, index=True,
    )
    municipio_nome: Mapped[str | None] = mapped_column(String(150), nullable=True)
    mensagem: Mapped[str] = mapped_column(Text, nullable=False)
    # so digitos, sempre com DDI 55
    whatsapp: Mapped[str | None] = mapped_column(String(20), nullable=True)
    # 'email' | 'whatsapp'
    canal_preferido: Mapped[str] = mapped_column(
        String(10), nullable=False, default="email"
    )
    # 'aberto' | 'em_atendimento' | 'resolvido'
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="aberto", index=True
    )
    criado_em: Mapped[object] = mapped_column(
        DateTime(timezone=True), server_default=func.now(),
        nullable=False, index=True,
    )
    atualizado_em: Mapped[object] = mapped_column(
        DateTime(timezone=True), server_default=func.now(),
        onupdate=func.now(), nullable=False,
    )
    primeiro_contato_em: Mapped[object | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    resolvido_em: Mapped[object | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    eventos = relationship(
        "SuporteTicketEvento",
        back_populates="ticket",
        order_by="SuporteTicketEvento.id",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    usuario = relationship("Usuario")


class SuporteTicketEvento(Base):
    """Evento append-only do ticket: abertura, mudanca de status ou anotacao."""

    __tablename__ = "suporte_ticket_eventos"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    ticket_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("suporte_tickets.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    # 'abertura' | 'status' | 'anotacao'
    tipo: Mapped[str] = mapped_column(String(20), nullable=False)
    status_de: Mapped[str | None] = mapped_column(String(20), nullable=True)
    status_para: Mapped[str | None] = mapped_column(String(20), nullable=True)
    texto: Mapped[str | None] = mapped_column(Text, nullable=True)
    autor_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("usuarios.id", ondelete="SET NULL"), nullable=True
    )
    autor_email: Mapped[str] = mapped_column(String(150), nullable=False)
    criado_em: Mapped[object] = mapped_column(
        DateTime(timezone=True), server_default=func.now(),
        nullable=False, index=True,
    )

    ticket = relationship("SuporteTicket", back_populates="eventos")
