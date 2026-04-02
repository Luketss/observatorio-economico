from app.db.base import Base
from sqlalchemy import Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column


class PlanoConfig(Base):
    __tablename__ = "plano_config"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    plano: Mapped[str] = mapped_column(String(10), nullable=False, unique=True)
    modulos: Mapped[str] = mapped_column(Text, nullable=False)  # JSON array string
