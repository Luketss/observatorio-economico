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

    admissões: Mapped[int] = mapped_column(Integer)
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
