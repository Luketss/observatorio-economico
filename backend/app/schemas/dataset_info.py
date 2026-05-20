from typing import Optional

from pydantic import BaseModel


class DatasetInfoOut(BaseModel):
    dataset: str
    titulo: str
    conteudo: str
    fonte: Optional[str] = None
    data_atualizacao: Optional[str] = None

    class Config:
        from_attributes = True


class DatasetInfoUpdate(BaseModel):
    titulo: Optional[str] = None
    conteudo: Optional[str] = None
    fonte: Optional[str] = None
    data_atualizacao: Optional[str] = None
