from app.db.base import Base
from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func


class LoginAudit(Base):
    __tablename__ = "login_audit"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    # null when the submitted email doesn't match any account
    usuario_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("usuarios.id"), nullable=True, index=True
    )
    email_tentado: Mapped[str] = mapped_column(String(150), nullable=False, index=True)
    sucesso: Mapped[bool] = mapped_column(Boolean, nullable=False)
    # 'ok' | 'invalid_credentials' | 'inactive'
    motivo: Mapped[str | None] = mapped_column(String(50), nullable=True)
    ip: Mapped[str | None] = mapped_column(String(64), nullable=True)
    user_agent: Mapped[str | None] = mapped_column(String(512), nullable=True)
    criado_em: Mapped[object] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )
