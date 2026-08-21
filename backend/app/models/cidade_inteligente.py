from datetime import date, datetime, timezone

from app.db.base import Base
from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship


class CertificacaoCidade(Base):
    """Certificação/selo de cidade que o município acompanha (ISO/ABNT e
    afins). Estrutura genérica de propósito: nada da norma é embutido —
    as listas de indicadores ISO/ABNT são conteúdo protegido."""
    __tablename__ = "certificacao_cidade"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    municipio_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("municipios.id"), nullable=False, index=True
    )

    nome: Mapped[str] = mapped_column(String(150), nullable=False)
    entidade: Mapped[str | None] = mapped_column(String(100), nullable=True)
    descricao: Mapped[str | None] = mapped_column(Text, nullable=True)
    ativo: Mapped[bool] = mapped_column(Boolean, default=True)

    criado_em: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    atualizado_em: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    municipio = relationship("Municipio")
    requisitos = relationship(
        "CertificacaoRequisito", back_populates="certificacao", cascade="all, delete-orphan"
    )


class CertificacaoRequisito(Base):
    """Requisito perseguido dentro de uma certificação."""
    __tablename__ = "certificacao_requisito"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    certificacao_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("certificacao_cidade.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )

    titulo: Mapped[str] = mapped_column(String(200), nullable=False)
    categoria: Mapped[str | None] = mapped_column(String(100), nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pendente")  # pendente|em_andamento|atendido
    responsavel: Mapped[str | None] = mapped_column(String(120), nullable=True)
    evidencia_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    evidencia_nota: Mapped[str | None] = mapped_column(Text, nullable=True)

    criado_em: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    atualizado_em: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    certificacao = relationship("CertificacaoCidade", back_populates="requisitos")
