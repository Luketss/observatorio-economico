from app.db.base import Base
from sqlalchemy import Float, ForeignKey, Integer
from sqlalchemy.orm import Mapped, mapped_column, relationship


class BolsaFamiliaResumo(Base):
    __tablename__ = "bolsa_familia_resumo"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)

    municipio_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("municipios.id"),
        nullable=False,
        index=True,
    )

    ano: Mapped[int] = mapped_column(Integer, index=True)
    mes: Mapped[int] = mapped_column(Integer, index=True)

    total_beneficiarios: Mapped[int] = mapped_column(Integer)
    valor_total: Mapped[float] = mapped_column(Float)
    valor_bolsa: Mapped[float] = mapped_column(Float)
    valor_primeira_infancia: Mapped[float | None] = mapped_column(Float, nullable=True)
    beneficiarios_primeira_infancia: Mapped[int | None] = mapped_column(Integer, nullable=True)

    municipio = relationship("Municipio")
