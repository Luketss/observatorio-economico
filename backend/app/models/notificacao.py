from app.db.base import Base
from sqlalchemy import DateTime, ForeignKey, Integer, JSON, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func


class Notificacao(Base):
    __tablename__ = "notificacoes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    titulo: Mapped[str] = mapped_column(String(100), nullable=False)
    mensagem: Mapped[str] = mapped_column(Text, nullable=False)
    tipo: Mapped[str] = mapped_column(String(20), nullable=False, default="info")
    # null = platform-wide; [1, 2, 3] = specific municipio ids
    municipio_ids: Mapped[list | None] = mapped_column(JSON, nullable=True)
    criado_por: Mapped[int] = mapped_column(
        Integer, ForeignKey("usuarios.id"), nullable=False
    )
    criado_em: Mapped[object] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    expira_em: Mapped[object | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )


class NotificacaoLida(Base):
    __tablename__ = "notificacoes_lidas"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    notificacao_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("notificacoes.id", ondelete="CASCADE"), nullable=False
    )
    usuario_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("usuarios.id", ondelete="CASCADE"), nullable=False
    )
    lida_em: Mapped[object] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    __table_args__ = (
        UniqueConstraint("notificacao_id", "usuario_id", name="uq_notif_usuario"),
    )
