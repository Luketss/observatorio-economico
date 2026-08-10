from app.db.base import Base
from sqlalchemy import DateTime, Integer, LargeBinary, String
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func


class IngestaoArquivo(Base):
    """Arquivo enviado pela tela de coletas para fontes com requer_arquivo
    (hoje só o IPS). API e worker não compartilham filesystem — o blob
    trafega pelo banco; a fonte deleta a linha ao concluir com sucesso e o
    endpoint de upload varre órfãs com mais de 24h."""

    __tablename__ = "ingestao_arquivo"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    nome: Mapped[str] = mapped_column(String(255), nullable=False)
    conteudo: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)
    criado_em: Mapped[object] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )
