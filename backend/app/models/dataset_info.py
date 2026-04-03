from app.db.base import Base
from sqlalchemy import DateTime, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column


class DatasetInfo(Base):
    __tablename__ = "dataset_info"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    dataset: Mapped[str] = mapped_column(String(50), nullable=False, unique=True)
    titulo: Mapped[str] = mapped_column(String(150), nullable=False, default="")
    conteudo: Mapped[str] = mapped_column(Text, nullable=False, default="")
    atualizado_em: Mapped[DateTime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
