from app.db.base import Base
from sqlalchemy import Date, Float, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship


class EstbanMensal(Base):
    __tablename__ = "estban_mensal"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)

    municipio_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("municipios.id"),
        nullable=False,
        index=True,
    )

    data_referencia: Mapped[Date] = mapped_column(Date, index=True)

    qtd_agencias: Mapped[int] = mapped_column(Integer)
    valor_operacoes_credito: Mapped[float] = mapped_column(Float)
    valor_depositos_vista: Mapped[float] = mapped_column(Float)
    valor_poupanca: Mapped[float] = mapped_column(Float)
    valor_depositos_prazo: Mapped[float] = mapped_column(Float)

    municipio = relationship("Municipio")


class EstbanPorInstituicao(Base):
    __tablename__ = "estban_por_instituicao"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    municipio_id: Mapped[int] = mapped_column(Integer, ForeignKey("municipios.id"), nullable=False, index=True)
    data_referencia: Mapped[Date] = mapped_column(Date, index=True)
    nome_instituicao: Mapped[str] = mapped_column(String(150), index=True)
    qtd_agencias: Mapped[int] = mapped_column(Integer)
    valor_operacoes_credito: Mapped[float] = mapped_column(Float)
    valor_depositos_vista: Mapped[float] = mapped_column(Float)
    valor_poupanca: Mapped[float] = mapped_column(Float)
    valor_depositos_prazo: Mapped[float] = mapped_column(Float)
    municipio = relationship("Municipio")
