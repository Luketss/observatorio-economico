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

    admissoes: Mapped[int] = mapped_column(Integer)
    desligamentos: Mapped[int] = mapped_column(Integer)
    saldo: Mapped[int] = mapped_column(Integer)

    municipio = relationship("Municipio")


class CagedPorSexo(Base):
    __tablename__ = "caged_por_sexo"

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

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    municipio_id: Mapped[int] = mapped_column(Integer, ForeignKey("municipios.id"), nullable=False, index=True)
    ano: Mapped[int] = mapped_column(Integer, index=True)
    mes: Mapped[int] = mapped_column(Integer, index=True)
    salario_medio_admissoes: Mapped[float | None] = mapped_column(Float, nullable=True)
    salario_medio_desligamentos: Mapped[float | None] = mapped_column(Float, nullable=True)

    municipio = relationship("Municipio")


class CagedPorCnae(Base):
    __tablename__ = "caged_por_cnae"

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
