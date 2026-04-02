from app.db.base import Base
from sqlalchemy import Boolean, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship


class DashboardCardCustom(Base):
    __tablename__ = "dashboard_cards_custom"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    municipio_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("municipios.id"), nullable=False, index=True
    )
    titulo: Mapped[str] = mapped_column(String(100), nullable=False)
    valor: Mapped[str] = mapped_column(String(100), nullable=False)
    subtitulo: Mapped[str | None] = mapped_column(String(150), nullable=True)
    icone: Mapped[str] = mapped_column(String(50), nullable=False, default="StarIcon")
    cor: Mapped[str] = mapped_column(String(20), nullable=False, default="blue")
    ordem: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    ativo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    municipio = relationship("Municipio")
