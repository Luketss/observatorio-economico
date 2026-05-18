from app.db.base import Base
from sqlalchemy import Float, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship


class InssAnual(Base):
    __tablename__ = "inss_anual"
    __table_args__ = (
        UniqueConstraint("municipio_id", "ano", "categoria", name="uq_inss_anual_municipio_ano_categoria"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)

    municipio_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("municipios.id"),
        nullable=False,
        index=True,
    )

    ano: Mapped[int] = mapped_column(Integer, index=True)
    categoria: Mapped[str] = mapped_column(String(150), index=True)

    quantidade_beneficios: Mapped[int] = mapped_column(Integer)
    valor_anual: Mapped[float] = mapped_column(Float)

    municipio = relationship("Municipio")
