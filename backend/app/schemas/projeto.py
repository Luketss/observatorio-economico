from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel


class EixoOut(BaseModel):
    id: int
    nome: str
    descricao: Optional[str] = None
    ordem: int

    class Config:
        from_attributes = True


class EixoCreate(BaseModel):
    nome: str
    descricao: Optional[str] = None
    ordem: int = 0


class EixoUpdate(BaseModel):
    nome: Optional[str] = None
    descricao: Optional[str] = None
    ordem: Optional[int] = None


class ProjetoOut(BaseModel):
    id: int
    eixo_id: int
    municipio_id: int
    titulo: str
    descricao: Optional[str] = None
    status: str
    data_inicio: Optional[date] = None
    data_prazo: Optional[date] = None
    departamento: Optional[str] = None
    conteudo: Optional[str] = None
    criado_em: datetime
    atualizado_em: datetime

    class Config:
        from_attributes = True


class ProjetoCreate(BaseModel):
    eixo_id: int
    titulo: str
    descricao: Optional[str] = None
    status: str = "nao_iniciado"
    data_inicio: Optional[date] = None
    data_prazo: Optional[date] = None
    departamento: Optional[str] = None
    conteudo: Optional[str] = None


class ProjetoUpdate(BaseModel):
    titulo: Optional[str] = None
    descricao: Optional[str] = None
    status: Optional[str] = None
    data_inicio: Optional[date] = None
    data_prazo: Optional[date] = None
    departamento: Optional[str] = None
    conteudo: Optional[str] = None
