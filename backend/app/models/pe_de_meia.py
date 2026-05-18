from app.db.base import Base
from sqlalchemy import Float, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship


class PeDeMeiaResumo(Base):
    __tablename__ = "pe_de_meia_resumo"
    __table_args__ = (
        UniqueConstraint("municipio_id", "ano", "mes", name="uq_pe_de_meia_resumo_municipio_ano_mes"),
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

    total_estudantes: Mapped[int] = mapped_column(Integer)
    valor_total: Mapped[float] = mapped_column(Float)

    municipio = relationship("Municipio")


class PeDeMeiaEtapa(Base):
    __tablename__ = "pe_de_meia_etapa"
    __table_args__ = (
        UniqueConstraint(
            "municipio_id", "ano", "mes", "etapa_ensino", "tipo_incentivo",
            name="uq_pe_de_meia_etapa_municipio_ano_mes_etapa_tipo",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    municipio_id: Mapped[int] = mapped_column(Integer, ForeignKey("municipios.id"), nullable=False, index=True)
    ano: Mapped[int] = mapped_column(Integer, index=True)
    mes: Mapped[int] = mapped_column(Integer, index=True)
    etapa_ensino: Mapped[str] = mapped_column(String(150), index=True)
    tipo_incentivo: Mapped[str] = mapped_column(String(100), index=True)
    total_estudantes: Mapped[int] = mapped_column(Integer)
    valor_total: Mapped[float] = mapped_column(Float)
    municipio = relationship("Municipio")
