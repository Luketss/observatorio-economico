from app.db.base import Base
from sqlalchemy import Float, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship


class PibAnual(Base):
    __tablename__ = "pib_anual"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)

    municipio_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("municipios.id"),
        nullable=False,
        index=True,
    )

    ano: Mapped[int] = mapped_column(Integer, index=True)
    tipo_dado: Mapped[str] = mapped_column(String(20))  # REAL / PROJETADO

    pib_total: Mapped[float] = mapped_column(Float)
    va_agropecuaria: Mapped[float | None] = mapped_column(Float, nullable=True)
    va_governo: Mapped[float | None] = mapped_column(Float, nullable=True)
    va_industria: Mapped[float | None] = mapped_column(Float, nullable=True)
    va_servicos: Mapped[float | None] = mapped_column(Float, nullable=True)

    municipio = relationship("Municipio")
