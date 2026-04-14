from datetime import datetime, timezone

from app.db.base import Base
from sqlalchemy import DateTime, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column


class IndicadorInfo(Base):
    __tablename__ = "indicadores_info"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    dataset: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    indicador_key: Mapped[str] = mapped_column(String(100), nullable=False)
    tooltip: Mapped[str] = mapped_column(String(250), nullable=False, default="")
    descricao: Mapped[str] = mapped_column(Text, nullable=False, default="")
    fonte: Mapped[str | None] = mapped_column(String(200), nullable=True)
    atualizado_em: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    __table_args__ = (
        UniqueConstraint("dataset", "indicador_key", name="uq_indicador_dataset_key"),
    )
