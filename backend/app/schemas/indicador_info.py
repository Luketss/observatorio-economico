from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class IndicadorInfoOut(BaseModel):
    dataset: str
    indicador_key: str
    tooltip: str
    descricao: str
    fonte: Optional[str] = None
    atualizado_em: Optional[datetime] = None

    model_config = {"from_attributes": True}


class IndicadorInfoUpdate(BaseModel):
    tooltip: str = ""
    descricao: str = ""
    fonte: Optional[str] = None
