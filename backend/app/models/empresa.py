from app.db.base import Base
from sqlalchemy import Boolean, Date, Float, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship


class Empresa(Base):
    __tablename__ = "empresas"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)

    municipio_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("municipios.id"),
        nullable=False,
        index=True,
    )

    cnpj_basico: Mapped[str] = mapped_column(String(8), index=True)
    razao_social: Mapped[str] = mapped_column(String(150))
    nome_fantasia: Mapped[str | None] = mapped_column(String(150), nullable=True)
    situacao: Mapped[str | None] = mapped_column(String(2), nullable=True)
    data_inicio: Mapped[Date | None] = mapped_column(Date, nullable=True)
    cnae_fiscal: Mapped[str | None] = mapped_column(String(7), nullable=True)
    porte: Mapped[str | None] = mapped_column(String(2), nullable=True)
    capital_social: Mapped[float | None] = mapped_column(Float, nullable=True)
    opcao_simples: Mapped[bool] = mapped_column(Boolean, default=False)
    opcao_mei: Mapped[bool] = mapped_column(Boolean, default=False)

    municipio = relationship("Municipio")
