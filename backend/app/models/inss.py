from app.db.base import Base
from sqlalchemy import Float, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship


class InssAnual(Base):
    __tablename__ = "inss_anual"

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
