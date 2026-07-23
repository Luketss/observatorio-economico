from typing import Dict, List, Optional

from app.core.permissions import erros_permissoes
from pydantic import BaseModel, field_validator


def _valida_permissoes(v):
    erros = erros_permissoes(v)
    if erros:
        raise ValueError("; ".join(erros))
    return v


class RoleCreate(BaseModel):
    nome: str
    descricao: Optional[str] = None
    municipio_id: Optional[int] = None
    permissoes: Dict[str, List[str]] = {}

    @field_validator("nome")
    @classmethod
    def nome_nao_vazio(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("nome é obrigatório")
        return v

    @field_validator("permissoes")
    @classmethod
    def permissoes_validas(cls, v):
        return _valida_permissoes(v)


class RoleUpdate(BaseModel):
    nome: Optional[str] = None
    descricao: Optional[str] = None
    municipio_id: Optional[int] = None
    permissoes: Optional[Dict[str, List[str]]] = None

    @field_validator("nome")
    @classmethod
    def nome_nao_vazio(cls, v):
        if v is None:
            return v
        v = v.strip()
        if not v:
            raise ValueError("nome é obrigatório")
        return v

    @field_validator("permissoes")
    @classmethod
    def permissoes_validas(cls, v):
        if v is None:
            return v
        return _valida_permissoes(v)


class RoleOut(BaseModel):
    id: int
    nome: str
    descricao: Optional[str]
    municipio_id: Optional[int]
    builtin: bool
    permissoes: Dict[str, List[str]]
    usuarios_count: int = 0

    class Config:
        from_attributes = True
