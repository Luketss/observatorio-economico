from typing import Optional
from pydantic import BaseModel


class DashboardCardCustomCreate(BaseModel):
    municipio_id: int
    titulo: str
    valor: str
    subtitulo: Optional[str] = None
    icone: str = "StarIcon"
    cor: str = "blue"
    ordem: int = 0


class DashboardCardCustomUpdate(BaseModel):
    titulo: Optional[str] = None
    valor: Optional[str] = None
    subtitulo: Optional[str] = None
    icone: Optional[str] = None
    cor: Optional[str] = None
    ordem: Optional[int] = None
    ativo: Optional[bool] = None


class DashboardCardCustomOut(BaseModel):
    id: int
    municipio_id: int
    titulo: str
    valor: str
    subtitulo: Optional[str]
    icone: str
    cor: str
    ordem: int
    ativo: bool

    class Config:
        from_attributes = True
