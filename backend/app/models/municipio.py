from app.db.base import Base
from sqlalchemy import Boolean, Integer, String, Text, text
from sqlalchemy.orm import Mapped, mapped_column, relationship


class Municipio(Base):
    __tablename__ = "municipios"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    nome: Mapped[str] = mapped_column(String(150), nullable=False)
    estado: Mapped[str] = mapped_column(String(2), nullable=False)
    codigo_ibge: Mapped[str] = mapped_column(String(10), nullable=True)
    ativo: Mapped[bool] = mapped_column(Boolean, default=True)
    plano: Mapped[str] = mapped_column(String(10), nullable=False, default="free")
    brasao: Mapped[str | None] = mapped_column(Text, nullable=True)
    # When True, this município is hidden from cross-município analytics
    # (benchmark, ranking, comparativo) but stays visible in admin
    # management surfaces. Used for "demo" municípios created via cloning.
    is_demo: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
        server_default=text("false"),
        index=True,
    )

    usuarios = relationship("Usuario", back_populates="municipio")
