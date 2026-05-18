from app.db.base import Base
from sqlalchemy import Float, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship


class CagedMovimentacao(Base):
    __tablename__ = "caged_movimentacao"
    __table_args__ = (
        UniqueConstraint("municipio_id", "ano", "mes", name="uq_caged_movimentacao_municipio_ano_mes"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)

    municipio_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("municipios.id"),
        nullable=False,
        index=True,
    )

    ano: Mapped[int] = mapped_column(Integer, index=True)
    mes: Mapped[int] = mapped_column(Integer, index=True)

    admissoes: Mapped[int] = mapped_column(Integer)
    desligamentos: Mapped[int] = mapped_column(Integer)
    saldo: Mapped[int] = mapped_column(Integer)

    municipio = relationship("Municipio")


class CagedPorSexo(Base):
    __tablename__ = "caged_por_sexo"
    __table_args__ = (
        UniqueConstraint("municipio_id", "ano", "mes", "sexo", name="uq_caged_por_sexo_municipio_ano_mes_sexo"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    municipio_id: Mapped[int] = mapped_column(Integer, ForeignKey("municipios.id"), nullable=False, index=True)
    ano: Mapped[int] = mapped_column(Integer, index=True)
    mes: Mapped[int] = mapped_column(Integer, index=True)
    sexo: Mapped[str] = mapped_column(String(30), nullable=False)
    admissoes: Mapped[int] = mapped_column(Integer)
    desligamentos: Mapped[int] = mapped_column(Integer)
    saldo: Mapped[int] = mapped_column(Integer)

    municipio = relationship("Municipio")


class CagedPorRaca(Base):
    __tablename__ = "caged_por_raca"
    __table_args__ = (
        UniqueConstraint("municipio_id", "ano", "mes", "raca_cor", name="uq_caged_por_raca_municipio_ano_mes_raca"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    municipio_id: Mapped[int] = mapped_column(Integer, ForeignKey("municipios.id"), nullable=False, index=True)
    ano: Mapped[int] = mapped_column(Integer, index=True)
    mes: Mapped[int] = mapped_column(Integer, index=True)
    raca_cor: Mapped[str] = mapped_column(String(50), nullable=False)
    admissoes: Mapped[int] = mapped_column(Integer)
    desligamentos: Mapped[int] = mapped_column(Integer)
    saldo: Mapped[int] = mapped_column(Integer)

    municipio = relationship("Municipio")


class CagedSalario(Base):
    __tablename__ = "caged_salario"
    __table_args__ = (
        UniqueConstraint("municipio_id", "ano", "mes", name="uq_caged_salario_municipio_ano_mes"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    municipio_id: Mapped[int] = mapped_column(Integer, ForeignKey("municipios.id"), nullable=False, index=True)
    ano: Mapped[int] = mapped_column(Integer, index=True)
    mes: Mapped[int] = mapped_column(Integer, index=True)
    salario_medio_admissoes: Mapped[float | None] = mapped_column(Float, nullable=True)
    salario_medio_desligamentos: Mapped[float | None] = mapped_column(Float, nullable=True)

    municipio = relationship("Municipio")


class CagedPorCnae(Base):
    __tablename__ = "caged_por_cnae"
    __table_args__ = (
        UniqueConstraint("municipio_id", "ano", "mes", "secao", name="uq_caged_por_cnae_municipio_ano_mes_secao"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    municipio_id: Mapped[int] = mapped_column(Integer, ForeignKey("municipios.id"), nullable=False, index=True)
    ano: Mapped[int] = mapped_column(Integer, index=True)
    mes: Mapped[int] = mapped_column(Integer, index=True)
    secao: Mapped[str] = mapped_column(String(5), nullable=False)
    descricao_secao: Mapped[str] = mapped_column(String(150), nullable=False)
    admissoes: Mapped[int] = mapped_column(Integer)
    desligamentos: Mapped[int] = mapped_column(Integer)
    saldo: Mapped[int] = mapped_column(Integer)

    municipio = relationship("Municipio")


class CagedPorEscolaridade(Base):
    __tablename__ = "caged_por_escolaridade"
    __table_args__ = (
        UniqueConstraint("municipio_id", "ano", "mes", "grau_instrucao", name="uq_caged_por_escolaridade_municipio_ano_mes_grau"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    municipio_id: Mapped[int] = mapped_column(Integer, ForeignKey("municipios.id"), nullable=False, index=True)
    ano: Mapped[int] = mapped_column(Integer, index=True)
    mes: Mapped[int] = mapped_column(Integer, index=True)
    grau_instrucao: Mapped[str] = mapped_column(String(80), nullable=False)
    admissoes: Mapped[int] = mapped_column(Integer)
    desligamentos: Mapped[int] = mapped_column(Integer)
    saldo: Mapped[int] = mapped_column(Integer)

    municipio = relationship("Municipio")


class CagedPorFaixaEtaria(Base):
    __tablename__ = "caged_por_faixa_etaria"
    __table_args__ = (
        UniqueConstraint("municipio_id", "ano", "mes", "faixa_etaria", name="uq_caged_por_faixa_etaria_municipio_ano_mes_faixa"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    municipio_id: Mapped[int] = mapped_column(Integer, ForeignKey("municipios.id"), nullable=False, index=True)
    ano: Mapped[int] = mapped_column(Integer, index=True)
    mes: Mapped[int] = mapped_column(Integer, index=True)
    faixa_etaria: Mapped[str] = mapped_column(String(30), nullable=False)
    admissoes: Mapped[int] = mapped_column(Integer)
    desligamentos: Mapped[int] = mapped_column(Integer)
    saldo: Mapped[int] = mapped_column(Integer)

    municipio = relationship("Municipio")


class CagedPorTipoMovimentacao(Base):
    __tablename__ = "caged_por_tipo_movimentacao"
    __table_args__ = (
        UniqueConstraint("municipio_id", "ano", "mes", "tipo_movimentacao", name="uq_caged_por_tipo_movimentacao_municipio_ano_mes_tipo"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    municipio_id: Mapped[int] = mapped_column(Integer, ForeignKey("municipios.id"), nullable=False, index=True)
    ano: Mapped[int] = mapped_column(Integer, index=True)
    mes: Mapped[int] = mapped_column(Integer, index=True)
    tipo_movimentacao: Mapped[str] = mapped_column(String(80), nullable=False)
    admissoes: Mapped[int] = mapped_column(Integer)
    desligamentos: Mapped[int] = mapped_column(Integer)
    saldo: Mapped[int] = mapped_column(Integer)

    municipio = relationship("Municipio")


# ──────────────────────────────────────────────────────────────────
# New aggregates (added 2026-05) — surface CSV columns previously dropped
# ──────────────────────────────────────────────────────────────────

class CagedPorTipoDeficiencia(Base):
    """Movimentações por tipo de deficiência (somente vínculos PCD)."""
    __tablename__ = "caged_por_tipo_deficiencia"
    __table_args__ = (
        UniqueConstraint("municipio_id", "ano", "mes", "tipo_deficiencia", name="uq_caged_por_tipo_deficiencia_municipio_ano_mes_tipo"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    municipio_id: Mapped[int] = mapped_column(Integer, ForeignKey("municipios.id"), nullable=False, index=True)
    ano: Mapped[int] = mapped_column(Integer, index=True)
    mes: Mapped[int] = mapped_column(Integer, index=True)
    tipo_deficiencia: Mapped[str] = mapped_column(String(60), nullable=False)
    admissoes: Mapped[int] = mapped_column(Integer, default=0)
    desligamentos: Mapped[int] = mapped_column(Integer, default=0)
    saldo: Mapped[int] = mapped_column(Integer, default=0)

    municipio = relationship("Municipio")


class CagedPorTamanhoEstabelecimento(Base):
    """Movimentações por tamanho do estabelecimento (em janeiro do ano de referência)."""
    __tablename__ = "caged_por_tamanho_estabelecimento"
    __table_args__ = (
        UniqueConstraint("municipio_id", "ano", "mes", "tamanho", name="uq_caged_por_tamanho_estabelecimento_municipio_ano_mes_tamanho"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    municipio_id: Mapped[int] = mapped_column(Integer, ForeignKey("municipios.id"), nullable=False, index=True)
    ano: Mapped[int] = mapped_column(Integer, index=True)
    mes: Mapped[int] = mapped_column(Integer, index=True)
    tamanho: Mapped[str] = mapped_column(String(60), nullable=False)
    admissoes: Mapped[int] = mapped_column(Integer, default=0)
    desligamentos: Mapped[int] = mapped_column(Integer, default=0)
    saldo: Mapped[int] = mapped_column(Integer, default=0)

    municipio = relationship("Municipio")


class CagedPorTipoEmpregador(Base):
    """Movimentações por tipo de empregador (CNPJ, CPF, particular, rural CEI...)."""
    __tablename__ = "caged_por_tipo_empregador"
    __table_args__ = (
        UniqueConstraint("municipio_id", "ano", "mes", "tipo_empregador", name="uq_caged_por_tipo_empregador_municipio_ano_mes_tipo"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    municipio_id: Mapped[int] = mapped_column(Integer, ForeignKey("municipios.id"), nullable=False, index=True)
    ano: Mapped[int] = mapped_column(Integer, index=True)
    mes: Mapped[int] = mapped_column(Integer, index=True)
    tipo_empregador: Mapped[str] = mapped_column(String(80), nullable=False)
    admissoes: Mapped[int] = mapped_column(Integer, default=0)
    desligamentos: Mapped[int] = mapped_column(Integer, default=0)
    saldo: Mapped[int] = mapped_column(Integer, default=0)

    municipio = relationship("Municipio")


class CagedPorTipoEstabelecimento(Base):
    """Movimentações por tipo de estabelecimento (privado, público, doméstico...)."""
    __tablename__ = "caged_por_tipo_estabelecimento"
    __table_args__ = (
        UniqueConstraint("municipio_id", "ano", "mes", "tipo_estabelecimento", name="uq_caged_por_tipo_estabelecimento_municipio_ano_mes_tipo"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    municipio_id: Mapped[int] = mapped_column(Integer, ForeignKey("municipios.id"), nullable=False, index=True)
    ano: Mapped[int] = mapped_column(Integer, index=True)
    mes: Mapped[int] = mapped_column(Integer, index=True)
    tipo_estabelecimento: Mapped[str] = mapped_column(String(80), nullable=False)
    admissoes: Mapped[int] = mapped_column(Integer, default=0)
    desligamentos: Mapped[int] = mapped_column(Integer, default=0)
    saldo: Mapped[int] = mapped_column(Integer, default=0)

    municipio = relationship("Municipio")


class CagedIndicadoresContrato(Base):
    """Aggregate annual counts for contract-quality indicators
    (parcial / intermitente / aprendiz / PCD / fora-do-prazo)."""
    __tablename__ = "caged_indicadores_contrato"
    __table_args__ = (
        UniqueConstraint("municipio_id", "ano", name="uq_caged_indicadores_contrato_municipio_ano"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    municipio_id: Mapped[int] = mapped_column(Integer, ForeignKey("municipios.id"), nullable=False, index=True)
    ano: Mapped[int] = mapped_column(Integer, index=True)
    total_movimentacoes: Mapped[int] = mapped_column(Integer, default=0)
    total_parcial: Mapped[int] = mapped_column(Integer, default=0)
    total_intermitente: Mapped[int] = mapped_column(Integer, default=0)
    total_aprendiz: Mapped[int] = mapped_column(Integer, default=0)
    total_pcd: Mapped[int] = mapped_column(Integer, default=0)
    total_fora_prazo: Mapped[int] = mapped_column(Integer, default=0)

    municipio = relationship("Municipio")
