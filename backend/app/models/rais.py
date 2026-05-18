from app.db.base import Base
from sqlalchemy import BigInteger, Float, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship


class RaisVinculo(Base):
    __tablename__ = "rais_vinculos"
    __table_args__ = (
        UniqueConstraint("municipio_id", "ano", name="uq_rais_vinculos_municipio_ano"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)

    municipio_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("municipios.id"),
        nullable=False,
        index=True,
    )

    ano: Mapped[int] = mapped_column(Integer, index=True)

    total_vinculos: Mapped[int] = mapped_column(Integer)
    remuneracao_media: Mapped[float | None] = mapped_column(Float, nullable=True)

    municipio = relationship("Municipio")


class RaisPorSexo(Base):
    __tablename__ = "rais_por_sexo"
    __table_args__ = (
        UniqueConstraint("municipio_id", "ano", "sexo", name="uq_rais_por_sexo_municipio_ano_sexo"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    municipio_id: Mapped[int] = mapped_column(Integer, ForeignKey("municipios.id"), nullable=False, index=True)
    ano: Mapped[int] = mapped_column(Integer, index=True)
    sexo: Mapped[str] = mapped_column(String(30), nullable=False)
    total_vinculos: Mapped[int] = mapped_column(Integer)
    remuneracao_media: Mapped[float | None] = mapped_column(Float, nullable=True)

    municipio = relationship("Municipio")


class RaisPorRaca(Base):
    __tablename__ = "rais_por_raca"
    __table_args__ = (
        UniqueConstraint("municipio_id", "ano", "raca_cor", name="uq_rais_por_raca_municipio_ano_raca"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    municipio_id: Mapped[int] = mapped_column(Integer, ForeignKey("municipios.id"), nullable=False, index=True)
    ano: Mapped[int] = mapped_column(Integer, index=True)
    raca_cor: Mapped[str] = mapped_column(String(50), nullable=False)
    total_vinculos: Mapped[int] = mapped_column(Integer)
    remuneracao_media: Mapped[float | None] = mapped_column(Float, nullable=True)

    municipio = relationship("Municipio")


class RaisPorCnae(Base):
    __tablename__ = "rais_por_cnae"
    __table_args__ = (
        UniqueConstraint("municipio_id", "ano", "secao", name="uq_rais_por_cnae_municipio_ano_secao"),
    )

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
    __table_args__ = (
        UniqueConstraint("municipio_id", "ano", "faixa_etaria", name="uq_rais_por_faixa_etaria_municipio_ano_faixa"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    municipio_id: Mapped[int] = mapped_column(Integer, ForeignKey("municipios.id"), nullable=False, index=True)
    ano: Mapped[int] = mapped_column(Integer, index=True)
    faixa_etaria: Mapped[str] = mapped_column(String(50), nullable=False)
    total_vinculos: Mapped[int] = mapped_column(Integer)
    remuneracao_media: Mapped[float | None] = mapped_column(Float, nullable=True)

    municipio = relationship("Municipio")


class RaisPorEscolaridade(Base):
    __tablename__ = "rais_por_escolaridade"
    __table_args__ = (
        UniqueConstraint("municipio_id", "ano", "grau_instrucao", name="uq_rais_por_escolaridade_municipio_ano_grau"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    municipio_id: Mapped[int] = mapped_column(Integer, ForeignKey("municipios.id"), nullable=False, index=True)
    ano: Mapped[int] = mapped_column(Integer, index=True)
    grau_instrucao: Mapped[str] = mapped_column(String(80), nullable=False)
    total_vinculos: Mapped[int] = mapped_column(Integer)
    remuneracao_media: Mapped[float | None] = mapped_column(Float, nullable=True)

    municipio = relationship("Municipio")


class RaisPorFaixaRemuneracao(Base):
    __tablename__ = "rais_por_faixa_remuneracao"
    __table_args__ = (
        UniqueConstraint("municipio_id", "ano", "faixa_remuneracao_sm", name="uq_rais_por_faixa_remuneracao_municipio_ano_faixa"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    municipio_id: Mapped[int] = mapped_column(Integer, ForeignKey("municipios.id"), nullable=False, index=True)
    ano: Mapped[int] = mapped_column(Integer, index=True)
    faixa_remuneracao_sm: Mapped[str] = mapped_column(String(50), nullable=False)
    total_vinculos: Mapped[int] = mapped_column(Integer)

    municipio = relationship("Municipio")


class RaisPorFaixaTempoEmprego(Base):
    __tablename__ = "rais_por_faixa_tempo_emprego"
    __table_args__ = (
        UniqueConstraint("municipio_id", "ano", "faixa_tempo_emprego", name="uq_rais_por_faixa_tempo_emprego_municipio_ano_faixa"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    municipio_id: Mapped[int] = mapped_column(Integer, ForeignKey("municipios.id"), nullable=False, index=True)
    ano: Mapped[int] = mapped_column(Integer, index=True)
    faixa_tempo_emprego: Mapped[str] = mapped_column(String(50), nullable=False)
    total_vinculos: Mapped[int] = mapped_column(Integer)

    municipio = relationship("Municipio")


class RaisMetricasAnuais(Base):
    """Aggregate annual metrics: PCD, outro municipio, afastamento, plus contract-type indicators."""
    __tablename__ = "rais_metricas_anuais"
    __table_args__ = (
        UniqueConstraint("municipio_id", "ano", name="uq_rais_metricas_anuais_municipio_ano"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    municipio_id: Mapped[int] = mapped_column(Integer, ForeignKey("municipios.id"), nullable=False, index=True)
    ano: Mapped[int] = mapped_column(Integer, index=True)
    total_vinculos: Mapped[int] = mapped_column(Integer, default=0)
    total_pcd: Mapped[int] = mapped_column(Integer, default=0)
    total_outro_municipio: Mapped[int] = mapped_column(Integer, default=0)
    media_dias_afastamento: Mapped[float | None] = mapped_column(Float, nullable=True)

    # New (added 2026-05): contract-type and December-31 active indicators.
    total_ativo_dezembro: Mapped[int] = mapped_column(Integer, default=0)
    total_parcial: Mapped[int] = mapped_column(Integer, default=0)
    total_intermitente: Mapped[int] = mapped_column(Integer, default=0)
    total_simples: Mapped[int] = mapped_column(Integer, default=0)
    total_aprendiz_estimado: Mapped[int] = mapped_column(Integer, default=0)

    municipio = relationship("Municipio")


# ──────────────────────────────────────────────────────────────────
# New aggregates (added 2026-05) — surface CSV columns previously dropped
# ──────────────────────────────────────────────────────────────────

class RaisPorMotivoDesligamento(Base):
    """Why people leave (motivo_desligamento). Only counts rows with mes_desligamento > 0."""
    __tablename__ = "rais_por_motivo_desligamento"
    __table_args__ = (
        UniqueConstraint("municipio_id", "ano", "motivo", name="uq_rais_por_motivo_desligamento_municipio_ano_motivo"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    municipio_id: Mapped[int] = mapped_column(Integer, ForeignKey("municipios.id"), nullable=False, index=True)
    ano: Mapped[int] = mapped_column(Integer, index=True)
    motivo: Mapped[str] = mapped_column(String(120), nullable=False)
    total_desligamentos: Mapped[int] = mapped_column(Integer, default=0)

    municipio = relationship("Municipio")


class RaisPorTipoAdmissao(Base):
    """How people are hired (tipo_admissao). Only counts rows with mes_admissao > 0."""
    __tablename__ = "rais_por_tipo_admissao"
    __table_args__ = (
        UniqueConstraint("municipio_id", "ano", "tipo", name="uq_rais_por_tipo_admissao_municipio_ano_tipo"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    municipio_id: Mapped[int] = mapped_column(Integer, ForeignKey("municipios.id"), nullable=False, index=True)
    ano: Mapped[int] = mapped_column(Integer, index=True)
    tipo: Mapped[str] = mapped_column(String(120), nullable=False)
    total_admissoes: Mapped[int] = mapped_column(Integer, default=0)

    municipio = relationship("Municipio")


class RaisPorCbo(Base):
    """Top occupations by CBO 2002 family code (first 4 digits)."""
    __tablename__ = "rais_por_cbo"
    __table_args__ = (
        UniqueConstraint("municipio_id", "ano", "cbo_familia", name="uq_rais_por_cbo_municipio_ano_cbo"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    municipio_id: Mapped[int] = mapped_column(Integer, ForeignKey("municipios.id"), nullable=False, index=True)
    ano: Mapped[int] = mapped_column(Integer, index=True)
    cbo_familia: Mapped[str] = mapped_column(String(8), nullable=False)
    descricao: Mapped[str | None] = mapped_column(String(160), nullable=True)
    total_vinculos: Mapped[int] = mapped_column(Integer, default=0)
    remuneracao_media: Mapped[float | None] = mapped_column(Float, nullable=True)

    municipio = relationship("Municipio")


class RaisPorTamanhoEstabelecimento(Base):
    """Workforce share by establishment size band (tamanho_estabelecimento)."""
    __tablename__ = "rais_por_tamanho_estabelecimento"
    __table_args__ = (
        UniqueConstraint("municipio_id", "ano", "tamanho", name="uq_rais_por_tamanho_estabelecimento_municipio_ano_tamanho"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    municipio_id: Mapped[int] = mapped_column(Integer, ForeignKey("municipios.id"), nullable=False, index=True)
    ano: Mapped[int] = mapped_column(Integer, index=True)
    tamanho: Mapped[str] = mapped_column(String(60), nullable=False)
    total_vinculos: Mapped[int] = mapped_column(Integer, default=0)
    remuneracao_media: Mapped[float | None] = mapped_column(Float, nullable=True)

    municipio = relationship("Municipio")


class RaisPorNaturezaJuridica(Base):
    """Public / private / nonprofit / individual workforce composition."""
    __tablename__ = "rais_por_natureza_juridica"
    __table_args__ = (
        UniqueConstraint("municipio_id", "ano", "grupo", name="uq_rais_por_natureza_juridica_municipio_ano_grupo"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    municipio_id: Mapped[int] = mapped_column(Integer, ForeignKey("municipios.id"), nullable=False, index=True)
    ano: Mapped[int] = mapped_column(Integer, index=True)
    grupo: Mapped[str] = mapped_column(String(80), nullable=False)
    total_vinculos: Mapped[int] = mapped_column(Integer, default=0)

    municipio = relationship("Municipio")


class RaisTurnoverMensal(Base):
    """Monthly admissions and desligamentos derived from mes_admissao / mes_desligamento.
    Used to render a turnover/saldo time series across months of a given year."""
    __tablename__ = "rais_turnover_mensal"
    __table_args__ = (
        UniqueConstraint("municipio_id", "ano", "mes", name="uq_rais_turnover_mensal_municipio_ano_mes"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    municipio_id: Mapped[int] = mapped_column(Integer, ForeignKey("municipios.id"), nullable=False, index=True)
    ano: Mapped[int] = mapped_column(Integer, index=True)
    mes: Mapped[int] = mapped_column(Integer, index=True)
    total_admissoes: Mapped[int] = mapped_column(Integer, default=0)
    total_desligamentos: Mapped[int] = mapped_column(Integer, default=0)

    municipio = relationship("Municipio")
