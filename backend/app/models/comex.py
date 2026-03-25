from app.db.base import Base
from sqlalchemy import Float, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship


class ComexMensal(Base):
    __tablename__ = "comex_mensal"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)

    municipio_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("municipios.id"),
        nullable=False,
        index=True,
    )

    ano: Mapped[int] = mapped_column(Integer, index=True)
    mes: Mapped[int] = mapped_column(Integer, index=True)
    tipo_operacao: Mapped[str] = mapped_column(String(10), index=True)  # export / import

    valor_usd: Mapped[float] = mapped_column(Float)
    peso_kg: Mapped[float] = mapped_column(Float)

    municipio = relationship("Municipio")


class ComexPorProduto(Base):
    __tablename__ = "comex_por_produto"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    municipio_id: Mapped[int] = mapped_column(Integer, ForeignKey("municipios.id"), nullable=False, index=True)
    ano: Mapped[int] = mapped_column(Integer, index=True)
    tipo_operacao: Mapped[str] = mapped_column(String(10), index=True)
    produto: Mapped[str] = mapped_column(String(300))
    valor_usd: Mapped[float] = mapped_column(Float)
    peso_kg: Mapped[float] = mapped_column(Float)
    municipio = relationship("Municipio")


class ComexPorPais(Base):
    __tablename__ = "comex_por_pais"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    municipio_id: Mapped[int] = mapped_column(Integer, ForeignKey("municipios.id"), nullable=False, index=True)
    ano: Mapped[int] = mapped_column(Integer, index=True)
    tipo_operacao: Mapped[str] = mapped_column(String(10), index=True)
    pais: Mapped[str] = mapped_column(String(150))
    valor_usd: Mapped[float] = mapped_column(Float)
    municipio = relationship("Municipio")
