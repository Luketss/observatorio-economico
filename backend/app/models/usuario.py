from app.db.base import Base
from sqlalchemy import Boolean, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship


class Usuario(Base):
    __tablename__ = "usuarios"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    nome: Mapped[str] = mapped_column(String(150), nullable=False)
    email: Mapped[str] = mapped_column(
        String(150), unique=True, index=True, nullable=False
    )
    senha_hash: Mapped[str] = mapped_column(String(255), nullable=False)

    municipio_id: Mapped[int | None] = mapped_column(
        Integer,
        ForeignKey("municipios.id"),
        nullable=True,
    )

    role_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("roles.id"),
        nullable=False,
    )

    ativo: Mapped[bool] = mapped_column(Boolean, default=True)

    municipio = relationship("Municipio", back_populates="usuarios")
    role = relationship("Role", back_populates="usuarios")
