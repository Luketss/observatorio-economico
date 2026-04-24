from datetime import date, datetime, timezone

from app.db.base import Base
from sqlalchemy import Date, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship


class ProjetoEixo(Base):
    __tablename__ = "projeto_eixos"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    nome: Mapped[str] = mapped_column(String(100), nullable=False)
    descricao: Mapped[str | None] = mapped_column(Text, nullable=True)
    ordem: Mapped[int] = mapped_column(Integer, default=0)
    criado_em: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
    )

    projetos = relationship("Projeto", back_populates="eixo", cascade="all, delete-orphan")
    templates = relationship("ProjetoTemplate", back_populates="eixo")


class ProjetoTemplate(Base):
    """Global catalog of project suggestions managed by ADMIN_GLOBAL."""
    __tablename__ = "projeto_templates"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    eixo_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("projeto_eixos.id"), nullable=True, index=True)
    criado_por: Mapped[int | None] = mapped_column(Integer, ForeignKey("usuarios.id"), nullable=True)

    titulo: Mapped[str] = mapped_column(String(200), nullable=False)
    descricao: Mapped[str | None] = mapped_column(Text, nullable=True)
    conteudo: Mapped[str | None] = mapped_column(Text, nullable=True)

    criado_em: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
    )
    atualizado_em: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    eixo = relationship("ProjetoEixo", back_populates="templates")


class Projeto(Base):
    __tablename__ = "projetos"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    eixo_id: Mapped[int] = mapped_column(Integer, ForeignKey("projeto_eixos.id"), nullable=False, index=True)
    municipio_id: Mapped[int] = mapped_column(Integer, ForeignKey("municipios.id"), nullable=False, index=True)
    criado_por: Mapped[int | None] = mapped_column(Integer, ForeignKey("usuarios.id"), nullable=True)
    template_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("projeto_templates.id"), nullable=True)

    titulo: Mapped[str] = mapped_column(String(200), nullable=False)
    descricao: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="nao_iniciado")
    data_inicio: Mapped[date | None] = mapped_column(Date, nullable=True)
    data_prazo: Mapped[date | None] = mapped_column(Date, nullable=True)
    departamento: Mapped[str | None] = mapped_column(String(150), nullable=True)
    responsavel: Mapped[str | None] = mapped_column(String(150), nullable=True)
    conteudo: Mapped[str | None] = mapped_column(Text, nullable=True)

    criado_em: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
    )
    atualizado_em: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    eixo = relationship("ProjetoEixo", back_populates="projetos")
    municipio = relationship("Municipio")
    template = relationship("ProjetoTemplate")
