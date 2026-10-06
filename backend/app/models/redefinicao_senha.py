from datetime import datetime, timezone

from app.db.base import Base
from sqlalchemy import DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column


def _agora_utc() -> datetime:
    return datetime.now(timezone.utc)


class RedefinicaoSenha(Base):
    """Token de "esqueci minha senha": guardado so como SHA-256; 30 min; uso unico.
    Purgado 24 h depois de criado (audit_service.purgar_auditoria)."""

    __tablename__ = "redefinicao_senha"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    usuario_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("usuarios.id", ondelete="CASCADE"), nullable=False, index=True
    )
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True, index=True)
    expira_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    usado_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ip: Mapped[str | None] = mapped_column(String(64), nullable=True)
    # default em Python (alem do server_default): as consultas por janela de tempo
    # comparam com datetime.now(timezone.utc) e o SQLite dos testes nao converte CURRENT_TIMESTAMP.
    criado_em: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_agora_utc, server_default=func.now()
    )
