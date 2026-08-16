from app.db.base import Base
from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func


class AcaoAudit(Base):
    """Trilha de ações administrativas e leituras de dados pessoais.

    Espelha LoginAudit/IngestaoAudit: quem fez o quê, sobre quem, quando.
    `categoria` dirige a retenção (acao = 5 anos, leitura = 12 meses).
    Snapshots de e-mail sobrevivem ao hard delete de ator/alvo (FK SET NULL).
    """

    __tablename__ = "acao_audit"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    # 'acao' | 'leitura'
    categoria: Mapped[str] = mapped_column(String(10), nullable=False, index=True)
    # 'usuario_criado' | 'usuario_atualizado' | 'usuario_excluido'
    # | 'usuarios_listados' | 'auditoria_consultada'
    acao: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    ator_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("usuarios.id", ondelete="SET NULL"),
        nullable=True, index=True,
    )
    ator_email: Mapped[str] = mapped_column(String(150), nullable=False)
    alvo_usuario_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("usuarios.id", ondelete="SET NULL"),
        nullable=True, index=True,
    )
    alvo_email: Mapped[str | None] = mapped_column(String(150), nullable=True)
    municipio_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("municipios.id", ondelete="SET NULL"), nullable=True
    )
    detalhe: Mapped[str | None] = mapped_column(Text, nullable=True)
    ip: Mapped[str | None] = mapped_column(String(64), nullable=True)
    user_agent: Mapped[str | None] = mapped_column(String(512), nullable=True)
    criado_em: Mapped[object] = mapped_column(
        DateTime(timezone=True), server_default=func.now(),
        nullable=False, index=True,
    )
