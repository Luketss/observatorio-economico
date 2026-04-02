from typing import Optional

from pydantic import BaseModel


class MunicipioBase(BaseModel):
    nome: str
    estado: str
    codigo_ibge: Optional[str] = None
    ativo: bool = True


class MunicipioCreate(MunicipioBase):
    pass


class MunicipioUpdate(BaseModel):
    nome: Optional[str] = None
    estado: Optional[str] = None
    codigo_ibge: Optional[str] = None
    ativo: Optional[bool] = None
    plano: Optional[str] = None
    brasao: Optional[str] = None


class MunicipioOut(BaseModel):
    id: int
    nome: str
    estado: str
    codigo_ibge: Optional[str]
    ativo: bool
    plano: str = "paid"
    brasao: Optional[str] = None

    class Config:
        from_attributes = True
