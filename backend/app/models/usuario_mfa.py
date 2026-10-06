from datetime import datetime

from app.db.base import Base
from sqlalchemy import JSON, BigInteger, Boolean, DateTime, ForeignKey, Integer, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship


class UsuarioMfa(Base):
    """Segundo fator TOTP do usuario (1:1). Segredo cifrado com Fernet; codigos
    de recuperacao como hashes bcrypt (consumidos ao usar)."""

    __tablename__ = "usuario_mfa"

    usuario_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("usuarios.id", ondelete="CASCADE"), primary_key=True
    )
    segredo_cifrado: Mapped[str] = mapped_column(Text, nullable=False)
    ativo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="0")
    ativado_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ultimo_passo_usado: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    codigos_recuperacao: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    criado_em: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    atualizado_em: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    usuario = relationship("Usuario", back_populates="mfa")
