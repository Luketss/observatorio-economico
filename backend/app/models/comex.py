from app.db.base import Base
from sqlalchemy import Float, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship


class ComexMensal(Base):
    __tablename__ = "comex_mensal"
    __table_args__ = (
        UniqueConstraint(
            "municipio_id", "ano", "mes", "tipo_operacao",
            name="uq_comex_mensal_municipio_ano_mes_tipo",
        ),
    )

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
    __table_args__ = (
        UniqueConstraint(
            "municipio_id", "ano", "tipo_operacao", "produto",
            name="uq_comex_por_produto_municipio_ano_tipo_produto",
        ),
    )

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
    __table_args__ = (
        UniqueConstraint(
            "municipio_id", "ano", "tipo_operacao", "pais",
            name="uq_comex_por_pais_municipio_ano_tipo_pais",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    municipio_id: Mapped[int] = mapped_column(Integer, ForeignKey("municipios.id"), nullable=False, index=True)
    ano: Mapped[int] = mapped_column(Integer, index=True)
    tipo_operacao: Mapped[str] = mapped_column(String(10), index=True)
    pais: Mapped[str] = mapped_column(String(150))
    valor_usd: Mapped[float] = mapped_column(Float)
    municipio = relationship("Municipio")
