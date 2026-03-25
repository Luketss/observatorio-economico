from app.db.base import Base
from sqlalchemy import Float, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship


class RaisVinculo(Base):
    __tablename__ = "rais_vinculos"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)

    municipio_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("municipios.id"),
        nullable=False,
        index=True,
    )

    ano: Mapped[int] = mapped_column(Integer, index=True)

    total_vinculos: Mapped[int] = mapped_column(Integer)
    setor: Mapped[str | None] = mapped_column(String(100), nullable=True)
    remuneracao_media: Mapped[float | None] = mapped_column(Float, nullable=True)

    municipio = relationship("Municipio")


class RaisPorSexo(Base):
    __tablename__ = "rais_por_sexo"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    municipio_id: Mapped[int] = mapped_column(Integer, ForeignKey("municipios.id"), nullable=False, index=True)
    ano: Mapped[int] = mapped_column(Integer, index=True)
    sexo: Mapped[str] = mapped_column(String(30), nullable=False)
    total_vinculos: Mapped[int] = mapped_column(Integer)
    remuneracao_media: Mapped[float | None] = mapped_column(Float, nullable=True)

    municipio = relationship("Municipio")


class RaisPorRaca(Base):
    __tablename__ = "rais_por_raca"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    municipio_id: Mapped[int] = mapped_column(Integer, ForeignKey("municipios.id"), nullable=False, index=True)
    ano: Mapped[int] = mapped_column(Integer, index=True)
    raca_cor: Mapped[str] = mapped_column(String(50), nullable=False)
    total_vinculos: Mapped[int] = mapped_column(Integer)
    remuneracao_media: Mapped[float | None] = mapped_column(Float, nullable=True)

    municipio = relationship("Municipio")


class RaisPorCnae(Base):
    __tablename__ = "rais_por_cnae"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    municipio_id: Mapped[int] = mapped_column(Integer, ForeignKey("municipios.id"), nullable=False, index=True)
    ano: Mapped[int] = mapped_column(Integer, index=True)
    secao: Mapped[str] = mapped_column(String(5), nullable=False)
    descricao_secao: Mapped[str] = mapped_column(String(150), nullable=False)
    total_vinculos: Mapped[int] = mapped_column(Integer)
    remuneracao_media: Mapped[float | None] = mapped_column(Float, nullable=True)

    municipio = relationship("Municipio")
