from app.db.base import Base
from sqlalchemy import Boolean, Date, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship


class Marco(Base):
    __tablename__ = "marcos_mandato"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)

    municipio_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("municipios.id"),
        nullable=False,
        index=True,
    )

    data: Mapped[Date] = mapped_column(Date, nullable=False, index=True)
    titulo: Mapped[str] = mapped_column(String(100), nullable=False)
    descricao: Mapped[str | None] = mapped_column(Text, nullable=True)

    # inicio_mandato | obras | politica | evento
    tipo: Mapped[str] = mapped_column(String(30), nullable=False, default="evento")

    ativo: Mapped[bool] = mapped_column(Boolean, default=True)

    municipio = relationship("Municipio")
