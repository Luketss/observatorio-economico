from app.db.base import Base
from sqlalchemy import BigInteger, Float, ForeignKey, Integer, String
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


class RaisPorFaixaEtaria(Base):
    __tablename__ = "rais_por_faixa_etaria"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    municipio_id: Mapped[int] = mapped_column(Integer, ForeignKey("municipios.id"), nullable=False, index=True)
    ano: Mapped[int] = mapped_column(Integer, index=True)
    faixa_etaria: Mapped[str] = mapped_column(String(50), nullable=False)
    total_vinculos: Mapped[int] = mapped_column(Integer)
    remuneracao_media: Mapped[float | None] = mapped_column(Float, nullable=True)

    municipio = relationship("Municipio")


class RaisPorEscolaridade(Base):
    __tablename__ = "rais_por_escolaridade"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    municipio_id: Mapped[int] = mapped_column(Integer, ForeignKey("municipios.id"), nullable=False, index=True)
    ano: Mapped[int] = mapped_column(Integer, index=True)
    grau_instrucao: Mapped[str] = mapped_column(String(80), nullable=False)
    total_vinculos: Mapped[int] = mapped_column(Integer)
    remuneracao_media: Mapped[float | None] = mapped_column(Float, nullable=True)

    municipio = relationship("Municipio")


class RaisPorFaixaRemuneracao(Base):
    __tablename__ = "rais_por_faixa_remuneracao"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    municipio_id: Mapped[int] = mapped_column(Integer, ForeignKey("municipios.id"), nullable=False, index=True)
    ano: Mapped[int] = mapped_column(Integer, index=True)
    faixa_remuneracao_sm: Mapped[str] = mapped_column(String(50), nullable=False)
    total_vinculos: Mapped[int] = mapped_column(Integer)

    municipio = relationship("Municipio")


class RaisPorFaixaTempoEmprego(Base):
    __tablename__ = "rais_por_faixa_tempo_emprego"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    municipio_id: Mapped[int] = mapped_column(Integer, ForeignKey("municipios.id"), nullable=False, index=True)
    ano: Mapped[int] = mapped_column(Integer, index=True)
    faixa_tempo_emprego: Mapped[str] = mapped_column(String(50), nullable=False)
    total_vinculos: Mapped[int] = mapped_column(Integer)

    municipio = relationship("Municipio")


class RaisMetricasAnuais(Base):
    """Aggregate annual metrics: PCD, outro municipio, afastamento."""
    __tablename__ = "rais_metricas_anuais"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    municipio_id: Mapped[int] = mapped_column(Integer, ForeignKey("municipios.id"), nullable=False, index=True)
    ano: Mapped[int] = mapped_column(Integer, index=True)
    total_vinculos: Mapped[int] = mapped_column(Integer, default=0)
    total_pcd: Mapped[int] = mapped_column(Integer, default=0)
    total_outro_municipio: Mapped[int] = mapped_column(Integer, default=0)
    media_dias_afastamento: Mapped[float | None] = mapped_column(Float, nullable=True)

    municipio = relationship("Municipio")
