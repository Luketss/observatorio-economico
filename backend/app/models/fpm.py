from app.db.base import Base
from sqlalchemy import Float, ForeignKey, Integer, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship


class FpmMensal(Base):
    """Repasse mensal (bruto) do FPM por município — fonte STN/Tesouro
    Transparente (Transferências Obrigatórias da União - por Município)."""

    __tablename__ = "fpm_mensal"
    __table_args__ = (
        UniqueConstraint("municipio_id", "ano", "mes", name="uq_fpm_mensal_municipio_ano_mes"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    municipio_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("municipios.id"), nullable=False, index=True
    )
    ano: Mapped[int] = mapped_column(Integer, index=True)
    mes: Mapped[int] = mapped_column(Integer, index=True)
    valor: Mapped[float] = mapped_column(Float, nullable=False)

    municipio = relationship("Municipio")
