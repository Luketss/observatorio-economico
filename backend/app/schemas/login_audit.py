from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict


class LoginAuditOut(BaseModel):
    id: int
    usuario_id: Optional[int] = None
    email_tentado: str
    sucesso: bool
    motivo: Optional[str] = None
    ip: Optional[str] = None
    user_agent: Optional[str] = None
    criado_em: datetime
    nome: Optional[str] = None
    papel: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class AdminLoginSummaryItem(BaseModel):
    usuario_id: int
    nome: str
    email: str
    last_login: Optional[datetime] = None
    failed_24h: int


class AdminLoginSummary(BaseModel):
    items: List[AdminLoginSummaryItem]
