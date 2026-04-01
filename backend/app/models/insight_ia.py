from app.db.base import Base
from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship


class InsightIA(Base):
    __tablename__ = "insights_ia"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)

    municipio_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("municipios.id"),
        nullable=False,
        index=True,
    )

    dataset: Mapped[str] = mapped_column(String(50), nullable=False)
    periodo: Mapped[str] = mapped_column(String(20), nullable=False)
    conteudo: Mapped[str] = mapped_column(Text, nullable=False)
    modelo: Mapped[str] = mapped_column(String(50), nullable=False)
    gerado_em: Mapped[DateTime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    municipio = relationship("Municipio")

    __table_args__ = (
        UniqueConstraint("municipio_id", "dataset", "periodo", name="uq_insight_municipio_dataset_periodo"),
    )
