from app.db.base import Base
from sqlalchemy import ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship


class RaisVinculo(Base):
    __tablename__ = "rais_vinculos"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)

    municipio_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("municipios.id"),
        nullable=False,
        index=True,
    )

    ano: Mapped[int] = mapped_column(Integer, index=True)

    total_vinculos: Mapped[int] = mapped_column(Integer)
    setor: Mapped[str | None] = mapped_column(String(100), nullable=True)

    municipio = relationship("Municipio")
