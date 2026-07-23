from app.db.base import Base
from sqlalchemy import JSON, Boolean, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship


class Role(Base):
    __tablename__ = "roles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    nome: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    descricao: Mapped[str] = mapped_column(String(255), nullable=True)

    # NULL = role do catálogo global; preenchido = role específica do município.
    municipio_id: Mapped[int | None] = mapped_column(
        Integer,
        ForeignKey("municipios.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    # Roles do sistema (ADMIN_GLOBAL etc.): imutáveis e indeletáveis via API.
    builtin: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    # {"area": ["criar", "editar", "excluir"], ...} — ver app.core.permissions.
    permissoes: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)

    usuarios = relationship("Usuario", back_populates="role")
