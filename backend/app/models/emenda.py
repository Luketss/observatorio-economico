from app.db.base import Base
from sqlalchemy import Float, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship


class EmendaParlamentar(Base):
    """Emenda parlamentar destinada ao município (Portal da Transparência,
    download-de-dados/emendas-parlamentares — inclui emendas Pix desde mai/2026).

    Uma linha por (município, código da emenda); os valores agregam as linhas do
    CSV por ação orçamentária. `valor_pago` é o pago no exercício; o pago total
    de fato é `valor_pago + valor_resto_pago` (restos a pagar pagos) — calculado
    no service, não armazenado. `funcao` é a função dominante (maior empenho)."""

    __tablename__ = "emenda_parlamentar"
    __table_args__ = (
        UniqueConstraint("municipio_id", "codigo_emenda", name="uq_emenda_municipio_codigo"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    municipio_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("municipios.id"), nullable=False, index=True
    )
    ano: Mapped[int] = mapped_column(Integer, index=True)
    codigo_emenda: Mapped[str] = mapped_column(String(60), nullable=False)
    numero_emenda: Mapped[str | None] = mapped_column(String(20), nullable=True)
    autor: Mapped[str] = mapped_column(String(120), nullable=False)
    tipo_emenda: Mapped[str] = mapped_column(String(120), nullable=False)
    funcao: Mapped[str | None] = mapped_column(String(80), nullable=True)
    valor_empenhado: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    valor_liquidado: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    valor_pago: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    valor_resto_pago: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)

    municipio = relationship("Municipio")
