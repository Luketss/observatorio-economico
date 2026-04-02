from typing import List
from pydantic import BaseModel


class PlanoConfigOut(BaseModel):
    plano: str
    modulos: List[str]

    class Config:
        from_attributes = True


class PlanoConfigUpdate(BaseModel):
    modulos: List[str]
