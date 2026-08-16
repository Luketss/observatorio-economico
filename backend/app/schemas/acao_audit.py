from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict


class AcaoAuditOut(BaseModel):
    id: int
    categoria: str
    acao: str
    ator_id: Optional[int] = None
    ator_email: str
    ator_nome: Optional[str] = None  # nome atual, se a conta ainda existe
    alvo_usuario_id: Optional[int] = None
    alvo_email: Optional[str] = None
    municipio_id: Optional[int] = None
    detalhe: Optional[str] = None
    ip: Optional[str] = None
    criado_em: datetime

    model_config = ConfigDict(from_attributes=True)
