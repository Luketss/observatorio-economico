from app.db.base import Base
from sqlalchemy import ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship


class PopulacaoMunicipio(Base):
    """Estimativa populacional anual do IBGE (agregado 6579), base do cálculo
    de faixa/coeficiente do FPM. `fonte` distingue estimativa de censo."""

    __tablename__ = "populacao_municipio"
    __table_args__ = (
        UniqueConstraint("municipio_id", "ano", name="uq_populacao_municipio_ano"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    municipio_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("municipios.id"), nullable=False, index=True
    )
    ano: Mapped[int] = mapped_column(Integer, index=True)
    populacao: Mapped[int] = mapped_column(Integer, nullable=False)
    fonte: Mapped[str] = mapped_column(String(60), nullable=False, default="Estimativa IBGE")

    municipio = relationship("Municipio")
