from datetime import datetime

from app.db.base import Base
from sqlalchemy import JSON, BigInteger, Boolean, DateTime, ForeignKey, Integer, String, Text, false, func
from sqlalchemy.orm import Mapped, mapped_column, relationship


class UsuarioMfa(Base):
    """Segundo fator do usuario (1:1): TOTP (segredo cifrado com Fernet) ou codigo por e-mail (hash HMAC, 10 min). Codigos de recuperacao como hashes bcrypt (consumidos ao usar)."""

    __tablename__ = "usuario_mfa"

    usuario_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("usuarios.id", ondelete="CASCADE"), primary_key=True
    )
    # Nulo quando metodo="email" (nao ha segredo TOTP).
    segredo_cifrado: Mapped[str | None] = mapped_column(Text, nullable=True)
    # "totp" (app autenticador) | "email" (codigo de 6 digitos por e-mail). Spec e-mail, secao 3.
    metodo: Mapped[str] = mapped_column(String(10), nullable=False, default="totp", server_default="totp")
    codigo_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)  # HMAC-SHA256(SECRET_KEY, codigo)
    codigo_expira_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    codigo_enviado_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    codigo_tentativas: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    codigo_reenvios: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    ativo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default=false())
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
