from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel


class NotificacaoOut(BaseModel):
    id: int
    titulo: str
    mensagem: str
    tipo: str
    municipio_ids: Optional[List[int]] = None
    criado_em: datetime
    expira_em: Optional[datetime] = None
    lida: bool = False

    model_config = {"from_attributes": True}


class NotificacaoAdminOut(BaseModel):
    id: int
    titulo: str
    mensagem: str
    tipo: str
    municipio_ids: Optional[List[int]] = None
    criado_por: int
    criado_em: datetime
    expira_em: Optional[datetime] = None

    model_config = {"from_attributes": True}


class NotificacaoCreate(BaseModel):
    titulo: str
    mensagem: str
    tipo: str = "info"
    municipio_ids: Optional[List[int]] = None
    expira_em: Optional[datetime] = None


class NotificacaoUpdate(BaseModel):
    titulo: Optional[str] = None
    mensagem: Optional[str] = None
    tipo: Optional[str] = None
    municipio_ids: Optional[List[int]] = None
    expira_em: Optional[datetime] = None
