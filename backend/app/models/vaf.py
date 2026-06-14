from app.db.base import Base
from sqlalchemy import Float, ForeignKey, Integer, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship


class VafAnual(Base):
    __tablename__ = "vaf_anual"
    __table_args__ = (
        UniqueConstraint("municipio_id", "ano_base", name="uq_vaf_anual_municipio_ano"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)

    municipio_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("municipios.id"),
        nullable=False,
        index=True,
    )

    ano_base: Mapped[int] = mapped_column(Integer, index=True)
    ano_aplicacao: Mapped[int | None] = mapped_column(Integer, nullable=True)

    vaf_individual: Mapped[float | None] = mapped_column(Float, nullable=True)
    pct_vaf_individual: Mapped[float | None] = mapped_column(Float, nullable=True)
    vaf_estado: Mapped[float | None] = mapped_column(Float, nullable=True)
    pct_vaf_estado: Mapped[float | None] = mapped_column(Float, nullable=True)
    indice: Mapped[float | None] = mapped_column(Float, nullable=True)
    pct_indice: Mapped[float | None] = mapped_column(Float, nullable=True)
    indice_medio: Mapped[float | None] = mapped_column(Float, nullable=True)
    pct_indice_medio: Mapped[float | None] = mapped_column(Float, nullable=True)
    indice_participacao_municipal: Mapped[float | None] = mapped_column(Float, nullable=True)
    pct_ipm: Mapped[float | None] = mapped_column(Float, nullable=True)

    municipio = relationship("Municipio")
