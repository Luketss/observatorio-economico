from app.db.base import Base
from sqlalchemy import BigInteger, Float, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship


class PixMensal(Base):
    """PIX transaction aggregates per municipality per month (BCB open data)."""
    __tablename__ = "pix_mensal"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    municipio_id: Mapped[int] = mapped_column(Integer, ForeignKey("municipios.id"), nullable=False, index=True)
    ano: Mapped[int] = mapped_column(Integer, index=True)
    mes: Mapped[int] = mapped_column(Integer, index=True)

    # Pagador PF
    vl_pagador_pf: Mapped[float | None] = mapped_column(Float, nullable=True)
    qt_pagador_pf: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    qt_pes_pagador_pf: Mapped[int | None] = mapped_column(BigInteger, nullable=True)

    # Pagador PJ
    vl_pagador_pj: Mapped[float | None] = mapped_column(Float, nullable=True)
    qt_pagador_pj: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    qt_pes_pagador_pj: Mapped[int | None] = mapped_column(BigInteger, nullable=True)

    # Recebedor PF
    vl_recebedor_pf: Mapped[float | None] = mapped_column(Float, nullable=True)
    qt_recebedor_pf: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    qt_pes_recebedor_pf: Mapped[int | None] = mapped_column(BigInteger, nullable=True)

    # Recebedor PJ
    vl_recebedor_pj: Mapped[float | None] = mapped_column(Float, nullable=True)
    qt_recebedor_pj: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    qt_pes_recebedor_pj: Mapped[int | None] = mapped_column(BigInteger, nullable=True)

    municipio = relationship("Municipio")
