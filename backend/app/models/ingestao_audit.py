from app.db.base import Base
from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func


class IngestaoAudit(Base):
    """Trail of data-load operations triggered through the app (admin UI):
    re-ingestion (CSV upload), per-dataset wipe and full-ingestion wipe.
    Mirrors LoginAudit in spirit — who did what, to which município, when."""

    __tablename__ = "ingestao_audit"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    municipio_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("municipios.id"), nullable=True, index=True
    )
    usuario_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("usuarios.id"), nullable=True, index=True
    )
    dataset: Mapped[str | None] = mapped_column(String(50), nullable=True, index=True)
    # 'reingest' | 'delete_dataset' | 'delete_ingestao' | 'auto_ingest'
    acao: Mapped[str] = mapped_column(String(30), nullable=False)
    num_linhas: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    # 'ok' | 'erro' | 'aviso'
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="ok")
    detalhe: Mapped[str | None] = mapped_column(Text, nullable=True)
    criado_em: Mapped[object] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )
