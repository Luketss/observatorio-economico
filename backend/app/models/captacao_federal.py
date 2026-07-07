from app.db.base import Base
from sqlalchemy import Float, ForeignKey, Integer, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship


class CaptacaoFederalAnual(Base):
    """Captação federal (SICONV/Transferegov) agregada por município/ano.

    `valor_firmado` = soma de VL_REPASSE_CONV dos convênios ASSINADOS no ano
    (parcela federal, sem contrapartida local). `valor_via_emenda` é a parte do
    firmado originada de emenda parlamentar (siconv_emenda). `valor_desembolsado`
    vem de siconv_desembolso por ANO_DESEMBOLSO (dinheiro que entrou no ano,
    inclusive de convênios antigos). Carregada para todos os municípios ativos —
    é a base do comparativo com pares. Ausência de linha = captação zero."""

    __tablename__ = "captacao_federal_anual"
    __table_args__ = (
        UniqueConstraint("municipio_id", "ano", name="uq_captacao_federal_municipio_ano"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    municipio_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("municipios.id"), nullable=False, index=True
    )
    ano: Mapped[int] = mapped_column(Integer, index=True)
    valor_firmado: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    valor_desembolsado: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    valor_via_emenda: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    qtd_convenios: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    municipio = relationship("Municipio")
