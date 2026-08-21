"""Schemas do Cidade Inteligente. Status como Literal: valor fora do enum
morre na validação, não no banco."""
from typing import Literal, Optional

from pydantic import BaseModel

StatusRequisito = Literal["pendente", "em_andamento", "atendido"]


class RequisitoCreate(BaseModel):
    titulo: str
    categoria: Optional[str] = None
    status: StatusRequisito = "pendente"
    responsavel: Optional[str] = None
    evidencia_url: Optional[str] = None
    evidencia_nota: Optional[str] = None


class RequisitoUpdate(BaseModel):
    titulo: Optional[str] = None
    categoria: Optional[str] = None
    status: Optional[StatusRequisito] = None
    responsavel: Optional[str] = None
    evidencia_url: Optional[str] = None
    evidencia_nota: Optional[str] = None


class RequisitoOut(BaseModel):
    id: int
    certificacao_id: int
    titulo: str
    categoria: Optional[str]
    status: str
    responsavel: Optional[str]
    evidencia_url: Optional[str]
    evidencia_nota: Optional[str]

    model_config = {"from_attributes": True}


class CertificacaoCreate(BaseModel):
    nome: str
    entidade: Optional[str] = None
    descricao: Optional[str] = None


class CertificacaoUpdate(BaseModel):
    nome: Optional[str] = None
    entidade: Optional[str] = None
    descricao: Optional[str] = None
    ativo: Optional[bool] = None


class CertificacaoResumoOut(BaseModel):
    id: int
    nome: str
    entidade: Optional[str]
    descricao: Optional[str]
    total: int
    atendidos: int
    em_andamento: int
    pendentes: int

    model_config = {"from_attributes": True}


class CertificacaoOut(CertificacaoResumoOut):
    requisitos: list[RequisitoOut] = []
