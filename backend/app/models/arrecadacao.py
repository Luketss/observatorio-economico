from app.db.base import Base
from sqlalchemy import Date, Float, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship


class ArrecadacaoMensal(Base):
    __tablename__ = "arrecadacao_mensal"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)

    municipio_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("municipios.id"),
        nullable=False,
        index=True,
    )

    ano: Mapped[int] = mapped_column(Integer, index=True)
    mes: Mapped[int] = mapped_column(Integer, index=True)
    nome_mes: Mapped[str] = mapped_column(String(20))
    data_base: Mapped[Date] = mapped_column(Date)

    valor_icms: Mapped[float] = mapped_column(Float)
    valor_ipva: Mapped[float] = mapped_column(Float)
    valor_ipi: Mapped[float] = mapped_column(Float)
    valor_total: Mapped[float] = mapped_column(Float)

    municipio = relationship("Municipio")
