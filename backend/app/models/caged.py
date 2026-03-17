from app.db.base import Base
from sqlalchemy import Float, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship


class CagedMovimentacao(Base):
    __tablename__ = "caged_movimentacao"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)

    municipio_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("municipios.id"),
        nullable=False,
        index=True,
    )

    ano: Mapped[int] = mapped_column(Integer, index=True)
    mes: Mapped[int] = mapped_column(Integer, index=True)

    admissões: Mapped[int] = mapped_column(Integer)
    desligamentos: Mapped[int] = mapped_column(Integer)
    saldo: Mapped[int] = mapped_column(Integer)

    setor: Mapped[str | None] = mapped_column(String(100), nullable=True)

    municipio = relationship("Municipio")
