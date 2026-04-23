from datetime import date, datetime, time, timezone

from app.db.base import Base
from sqlalchemy import Date, DateTime, Float, ForeignKey, Integer, String, Text, Time
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import JSON


class IndicadorInterno(Base):
    __tablename__ = "indicadores_internos"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    municipio_id: Mapped[int] = mapped_column(Integer, ForeignKey("municipios.id"), nullable=False, index=True)

    area: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    nome_metrica: Mapped[str] = mapped_column(String(200), nullable=False)
    valor: Mapped[float] = mapped_column(Float, nullable=False)
    unidade: Mapped[str] = mapped_column(String(50), nullable=False)
    periodo_tipo: Mapped[str] = mapped_column(String(10), nullable=False)  # "mensal" | "anual"
    periodo_ano: Mapped[int] = mapped_column(Integer, nullable=False)
    periodo_mes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    fonte: Mapped[str | None] = mapped_column(String(300), nullable=True)
    observacoes: Mapped[str | None] = mapped_column(Text, nullable=True)

    criado_em: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
    )

    municipio = relationship("Municipio")


class PlanoGovAcao(Base):
    __tablename__ = "plano_gov_acoes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    municipio_id: Mapped[int] = mapped_column(Integer, ForeignKey("municipios.id"), nullable=False, index=True)

    departamento: Mapped[str] = mapped_column(String(150), nullable=False, index=True)
    titulo: Mapped[str] = mapped_column(String(200), nullable=False)
    descricao: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="nao_iniciado", index=True)
    data_inicio: Mapped[date | None] = mapped_column(Date, nullable=True)
    data_prazo: Mapped[date | None] = mapped_column(Date, nullable=True)
    responsavel: Mapped[str | None] = mapped_column(String(150), nullable=True)
    departamentos_envolvidos: Mapped[list | None] = mapped_column(JSON, nullable=True)

    criado_em: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
    )
    atualizado_em: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    municipio = relationship("Municipio")


class EventoMunicipio(Base):
    __tablename__ = "eventos_municipio"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    municipio_id: Mapped[int] = mapped_column(Integer, ForeignKey("municipios.id"), nullable=False, index=True)
    criado_por: Mapped[int | None] = mapped_column(Integer, ForeignKey("usuarios.id"), nullable=True)

    titulo: Mapped[str] = mapped_column(String(200), nullable=False)
    descricao: Mapped[str | None] = mapped_column(Text, nullable=True)
    data_inicio: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    data_fim: Mapped[date | None] = mapped_column(Date, nullable=True)
    horario_inicio: Mapped[time | None] = mapped_column(Time, nullable=True)
    horario_fim: Mapped[time | None] = mapped_column(Time, nullable=True)
    local: Mapped[str | None] = mapped_column(String(200), nullable=True)
    tipo: Mapped[str] = mapped_column(String(20), nullable=False, default="outro")

    criado_em: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
    )

    municipio = relationship("Municipio")
