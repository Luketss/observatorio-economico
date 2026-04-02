from app.db.base import Base
from sqlalchemy import Boolean, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship


class Municipio(Base):
    __tablename__ = "municipios"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    nome: Mapped[str] = mapped_column(String(150), nullable=False)
    estado: Mapped[str] = mapped_column(String(2), nullable=False)
    codigo_ibge: Mapped[str] = mapped_column(String(10), nullable=True)
    ativo: Mapped[bool] = mapped_column(Boolean, default=True)
    plano: Mapped[str] = mapped_column(String(10), nullable=False, default="paid")
    brasao: Mapped[str | None] = mapped_column(Text, nullable=True)

    usuarios = relationship("Usuario", back_populates="municipio")
