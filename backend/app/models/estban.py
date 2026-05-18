from app.db.base import Base
from sqlalchemy import Date, Float, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship


class EstbanMensal(Base):
    __tablename__ = "estban_mensal"
    __table_args__ = (
        UniqueConstraint("municipio_id", "data_referencia", name="uq_estban_mensal_municipio_data"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)

    municipio_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("municipios.id"),
        nullable=False,
        index=True,
    )

    data_referencia: Mapped[Date] = mapped_column(Date, index=True)

    qtd_agencias: Mapped[int] = mapped_column(Integer)
    valor_operacoes_credito: Mapped[float] = mapped_column(Float)
    valor_depositos_vista: Mapped[float] = mapped_column(Float)
    valor_poupanca: Mapped[float] = mapped_column(Float)
    valor_depositos_prazo: Mapped[float] = mapped_column(Float)
    emprestimos_titulos_descontados: Mapped[float] = mapped_column(Float, nullable=True)
    financiamentos_gerais: Mapped[float] = mapped_column(Float, nullable=True)
    financiamento_agropecuario: Mapped[float] = mapped_column(Float, nullable=True)
    financiamentos_imobiliarios: Mapped[float] = mapped_column(Float, nullable=True)
    arrendamento_mercantil: Mapped[float] = mapped_column(Float, nullable=True)
    emprestimos_setor_publico: Mapped[float] = mapped_column(Float, nullable=True)
    outros_creditos: Mapped[float] = mapped_column(Float, nullable=True)

    municipio = relationship("Municipio")


class EstbanPorInstituicao(Base):
    __tablename__ = "estban_por_instituicao"
    __table_args__ = (
        UniqueConstraint(
            "municipio_id", "data_referencia", "nome_instituicao",
            name="uq_estban_por_instituicao_municipio_data_nome",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    municipio_id: Mapped[int] = mapped_column(Integer, ForeignKey("municipios.id"), nullable=False, index=True)
    data_referencia: Mapped[Date] = mapped_column(Date, index=True)
    nome_instituicao: Mapped[str] = mapped_column(String(150), index=True)
    qtd_agencias: Mapped[int] = mapped_column(Integer)
    valor_operacoes_credito: Mapped[float] = mapped_column(Float)
    valor_depositos_vista: Mapped[float] = mapped_column(Float)
    valor_poupanca: Mapped[float] = mapped_column(Float)
    valor_depositos_prazo: Mapped[float] = mapped_column(Float)
    emprestimos_titulos_descontados: Mapped[float] = mapped_column(Float, nullable=True)
    financiamentos_gerais: Mapped[float] = mapped_column(Float, nullable=True)
    financiamento_agropecuario: Mapped[float] = mapped_column(Float, nullable=True)
    financiamentos_imobiliarios: Mapped[float] = mapped_column(Float, nullable=True)
    arrendamento_mercantil: Mapped[float] = mapped_column(Float, nullable=True)
    emprestimos_setor_publico: Mapped[float] = mapped_column(Float, nullable=True)
    outros_creditos: Mapped[float] = mapped_column(Float, nullable=True)
    municipio = relationship("Municipio")
