from app.db.base import Base
from sqlalchemy import JSON, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func


class IngestaoJob(Base):
    """Execução (job) de uma fonte automática em background. O estado vive no
    banco para que qualquer worker gunicorn responda o polling, independente de
    qual processo roda a thread. `atualizado_em` é o heartbeat — job
    'executando' sem heartbeat recente é órfão de deploy/restart."""

    __tablename__ = "ingestao_job"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    dataset: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    # 'pendente' | 'executando' | 'concluido' | 'erro' | 'abortado'
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pendente", index=True)
    # {"estado": str|None, "municipio_ids": [int]|None, "anos": [int]|None, "notificar": bool}
    filtros: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    progresso_atual: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    progresso_total: Mapped[int | None] = mapped_column(Integer, nullable=True)
    etapa: Mapped[str | None] = mapped_column(String(100), nullable=True)
    resumo: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    erro: Mapped[str | None] = mapped_column(Text, nullable=True)
    usuario_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("usuarios.id"), nullable=True, index=True
    )
    criado_em: Mapped[object] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )
    iniciado_em: Mapped[object] = mapped_column(DateTime(timezone=True), nullable=True)
    atualizado_em: Mapped[object] = mapped_column(DateTime(timezone=True), nullable=True)
    finalizado_em: Mapped[object] = mapped_column(DateTime(timezone=True), nullable=True)
