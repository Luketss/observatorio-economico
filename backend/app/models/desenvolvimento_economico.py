from datetime import date, datetime, timezone

from sqlalchemy import Date, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


# ── 3.1 Funil de Investimentos ─────────────────────────────────────────────

class InvestimentoFunil(Base):
    __tablename__ = "investimento_funil"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    municipio_id: Mapped[int] = mapped_column(Integer, ForeignKey("municipios.id"), nullable=False, index=True)
    criado_por: Mapped[int | None] = mapped_column(Integer, ForeignKey("usuarios.id"), nullable=True)

    empresa_nome: Mapped[str] = mapped_column(String(200), nullable=False)
    setor: Mapped[str | None] = mapped_column(String(100), nullable=True)
    valor_estimado: Mapped[float | None] = mapped_column(Float, nullable=True)
    estagio: Mapped[str] = mapped_column(String(30), nullable=False, default="lead")
    responsavel: Mapped[str | None] = mapped_column(String(150), nullable=True)
    proxima_acao: Mapped[str | None] = mapped_column(Text, nullable=True)
    proxima_acao_data: Mapped[date | None] = mapped_column(Date, nullable=True)
    descricao: Mapped[str | None] = mapped_column(Text, nullable=True)

    criado_em: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    atualizado_em: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    municipio = relationship("Municipio")


# ── 3.2 Retenção & Expansão ────────────────────────────────────────────────

class EmpresaRetencao(Base):
    __tablename__ = "empresa_retencao"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    municipio_id: Mapped[int] = mapped_column(Integer, ForeignKey("municipios.id"), nullable=False, index=True)
    criado_por: Mapped[int | None] = mapped_column(Integer, ForeignKey("usuarios.id"), nullable=True)

    nome: Mapped[str] = mapped_column(String(200), nullable=False)
    cnpj: Mapped[str | None] = mapped_column(String(18), nullable=True)
    cnpj_basico: Mapped[str | None] = mapped_column(String(8), nullable=True, index=True)  # raiz normalizada — vínculo lógico com `empresas`
    setor: Mapped[str | None] = mapped_column(String(100), nullable=True)
    num_empregos: Mapped[int | None] = mapped_column(Integer, nullable=True)
    status_risco: Mapped[str] = mapped_column(String(10), nullable=False, default="baixo")
    potencial_expansao: Mapped[str] = mapped_column(String(10), nullable=False, default="baixo")
    responsavel: Mapped[str | None] = mapped_column(String(150), nullable=True)
    proxima_acao: Mapped[str | None] = mapped_column(Text, nullable=True)
    proxima_acao_data: Mapped[date | None] = mapped_column(Date, nullable=True)

    criado_em: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    atualizado_em: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    municipio = relationship("Municipio")
    visitas = relationship("VisitaRetencao", back_populates="empresa", cascade="all, delete-orphan")
    contatos = relationship("ContatoEmpresa", back_populates="empresa", cascade="all, delete-orphan")
    demandas = relationship("DemandaEmpresa", back_populates="empresa", cascade="all, delete-orphan")


class VisitaRetencao(Base):
    __tablename__ = "visita_retencao"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    empresa_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("empresa_retencao.id", ondelete="CASCADE"), nullable=False, index=True
    )
    municipio_id: Mapped[int] = mapped_column(Integer, ForeignKey("municipios.id"), nullable=False, index=True)

    data_visita: Mapped[date] = mapped_column(Date, nullable=False)
    responsavel: Mapped[str | None] = mapped_column(String(150), nullable=True)
    observacoes: Mapped[str | None] = mapped_column(Text, nullable=True)
    foto_base64: Mapped[str | None] = mapped_column(Text, nullable=True)

    criado_em: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    empresa = relationship("EmpresaRetencao", back_populates="visitas")
    municipio = relationship("Municipio")


class ContatoEmpresa(Base):
    """Registro de contato/reunião com a empresa (Gestão Empresarial)."""
    __tablename__ = "contato_empresa"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    empresa_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("empresa_retencao.id", ondelete="CASCADE"), nullable=False, index=True
    )
    municipio_id: Mapped[int] = mapped_column(Integer, ForeignKey("municipios.id"), nullable=False, index=True)
    criado_por: Mapped[int | None] = mapped_column(Integer, ForeignKey("usuarios.id"), nullable=True)

    data: Mapped[date] = mapped_column(Date, nullable=False)
    tipo: Mapped[str] = mapped_column(String(20), nullable=False, default="reuniao")  # reuniao|ligacao|email|visita_tecnica|outro
    responsavel: Mapped[str | None] = mapped_column(String(150), nullable=True)
    observacoes: Mapped[str | None] = mapped_column(Text, nullable=True)

    criado_em: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    atualizado_em: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    empresa = relationship("EmpresaRetencao", back_populates="contatos")


class DemandaEmpresa(Base):
    """Demanda apresentada pela empresa (Gestão Empresarial)."""
    __tablename__ = "demanda_empresa"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    empresa_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("empresa_retencao.id", ondelete="CASCADE"), nullable=False, index=True
    )
    municipio_id: Mapped[int] = mapped_column(Integer, ForeignKey("municipios.id"), nullable=False, index=True)
    criado_por: Mapped[int | None] = mapped_column(Integer, ForeignKey("usuarios.id"), nullable=True)

    descricao: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="aberta")  # aberta|em_andamento|resolvida
    data_registro: Mapped[date] = mapped_column(Date, nullable=False)
    responsavel: Mapped[str | None] = mapped_column(String(150), nullable=True)

    criado_em: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    atualizado_em: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    empresa = relationship("EmpresaRetencao", back_populates="demandas")
    historico = relationship(
        "DemandaStatusHistorico",
        back_populates="demanda",
        cascade="all, delete-orphan",
        order_by="DemandaStatusHistorico.alterado_em",
    )


class DemandaStatusHistorico(Base):
    """Transições de status de uma demanda (Gestão Empresarial, sub-frente C).

    Uma linha na criação (`de` nulo, `para` = status inicial) e uma a cada
    mudança de status. Apagar a demanda apaga o histórico (CASCADE); apagar o
    usuário mantém a linha (SET NULL)."""
    __tablename__ = "demanda_status_historico"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    demanda_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("demanda_empresa.id", ondelete="CASCADE"), nullable=False, index=True
    )
    municipio_id: Mapped[int] = mapped_column(Integer, ForeignKey("municipios.id"), nullable=False, index=True)
    de: Mapped[str | None] = mapped_column(String(20), nullable=True)
    para: Mapped[str] = mapped_column(String(20), nullable=False)
    alterado_por: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("usuarios.id", ondelete="SET NULL"), nullable=True
    )
    alterado_em: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc)
    )

    demanda = relationship("DemandaEmpresa", back_populates="historico")
    usuario = relationship("Usuario")

    @property
    def alterado_por_nome(self) -> str | None:
        return self.usuario.nome if self.usuario is not None else None


# ── 3.3 Captação de Recursos ───────────────────────────────────────────────

class CaptacaoRecurso(Base):
    __tablename__ = "captacao_recurso"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    municipio_id: Mapped[int] = mapped_column(Integer, ForeignKey("municipios.id"), nullable=False, index=True)
    criado_por: Mapped[int | None] = mapped_column(Integer, ForeignKey("usuarios.id"), nullable=True)

    tipo: Mapped[str] = mapped_column(String(20), nullable=False, default="edital")
    titulo: Mapped[str] = mapped_column(String(200), nullable=False)
    entidade_origem: Mapped[str | None] = mapped_column(String(200), nullable=True)
    valor_estimado: Mapped[float | None] = mapped_column(Float, nullable=True)
    prazo: Mapped[date | None] = mapped_column(Date, nullable=True)
    estagio: Mapped[str] = mapped_column(String(30), nullable=False, default="oportunidade")
    descricao: Mapped[str | None] = mapped_column(Text, nullable=True)
    link: Mapped[str | None] = mapped_column(String(500), nullable=True)

    criado_em: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    atualizado_em: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    municipio = relationship("Municipio")
    projetos_escrita = relationship("EscritaProjeto", back_populates="oportunidade_captacao")


# ── 3.4 Escrita de Projetos ────────────────────────────────────────────────

class EscritaProjeto(Base):
    __tablename__ = "escrita_projeto"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    municipio_id: Mapped[int] = mapped_column(Integer, ForeignKey("municipios.id"), nullable=False, index=True)
    criado_por: Mapped[int | None] = mapped_column(Integer, ForeignKey("usuarios.id"), nullable=True)
    oportunidade_captacao_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("captacao_recurso.id"), nullable=True, index=True
    )

    titulo: Mapped[str] = mapped_column(String(200), nullable=False)
    descricao: Mapped[str | None] = mapped_column(Text, nullable=True)
    estagio: Mapped[str] = mapped_column(String(20), nullable=False, default="ideia")
    resultado: Mapped[str | None] = mapped_column(String(20), nullable=True)
    responsavel: Mapped[str | None] = mapped_column(String(150), nullable=True)
    prazo: Mapped[date | None] = mapped_column(Date, nullable=True)
    valor_pleiteado: Mapped[float | None] = mapped_column(Float, nullable=True)

    criado_em: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    atualizado_em: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    municipio = relationship("Municipio")
    oportunidade_captacao = relationship("CaptacaoRecurso", back_populates="projetos_escrita")


# ── 3.5 Premiações ─────────────────────────────────────────────────────────

class Premiacao(Base):
    __tablename__ = "premiacao"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    municipio_id: Mapped[int] = mapped_column(Integer, ForeignKey("municipios.id"), nullable=False, index=True)
    criado_por: Mapped[int | None] = mapped_column(Integer, ForeignKey("usuarios.id"), nullable=True)

    titulo: Mapped[str] = mapped_column(String(200), nullable=False)
    entidade: Mapped[str | None] = mapped_column(String(200), nullable=True)
    descricao: Mapped[str | None] = mapped_column(Text, nullable=True)
    tipo: Mapped[str] = mapped_column(String(20), nullable=False, default="premio")
    prazo: Mapped[date | None] = mapped_column(Date, nullable=True)
    link: Mapped[str | None] = mapped_column(String(500), nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="oportunidade")

    criado_em: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    atualizado_em: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    municipio = relationship("Municipio")
