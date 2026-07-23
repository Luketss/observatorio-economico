from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, Field, field_validator


# ── Cover-image presets (gallery) ──────────────────────────────────────────────

class ImagemPresetOut(BaseModel):
    id: int
    titulo: Optional[str] = None
    imagem: str
    ordem: int

    class Config:
        from_attributes = True


class ImagemPresetCreate(BaseModel):
    titulo: Optional[str] = None
    imagem: str  # base64 data URL
    ordem: int = 0


# ── Eixos ─────────────────────────────────────────────────────────────────────

class EixoOut(BaseModel):
    id: int
    nome: str
    descricao: Optional[str] = None
    ordem: int
    imagem_id: Optional[int] = None

    class Config:
        from_attributes = True


class EixoCreate(BaseModel):
    nome: str
    descricao: Optional[str] = None
    ordem: int = 0
    imagem_id: Optional[int] = None


class EixoUpdate(BaseModel):
    nome: Optional[str] = None
    descricao: Optional[str] = None
    ordem: Optional[int] = None
    imagem_id: Optional[int] = None


# ── Templates (Acervo) ────────────────────────────────────────────────────────

class ProjetoTemplateOut(BaseModel):
    id: int
    eixo_id: Optional[int] = None
    titulo: str
    descricao: Optional[str] = None
    conteudo: Optional[str] = None
    criado_em: datetime
    atualizado_em: datetime

    class Config:
        from_attributes = True


class ProjetoTemplateCreate(BaseModel):
    eixo_id: Optional[int] = None
    titulo: str
    descricao: Optional[str] = None
    conteudo: Optional[str] = None


class ProjetoTemplateUpdate(BaseModel):
    eixo_id: Optional[int] = None
    titulo: Optional[str] = None
    descricao: Optional[str] = None
    conteudo: Optional[str] = None


# ── Tarefas (checklist do projeto) ────────────────────────────────────────────

class TarefaOut(BaseModel):
    id: int
    titulo: str
    prazo: Optional[date] = None
    concluida: bool

    class Config:
        from_attributes = True


class TarefaCreate(BaseModel):
    titulo: str = Field(max_length=255)
    prazo: Optional[date] = None

    @field_validator("titulo")
    @classmethod
    def titulo_nao_vazio(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("titulo é obrigatório")
        return v


class TarefaUpdate(BaseModel):
    titulo: Optional[str] = Field(default=None, max_length=255)
    prazo: Optional[date] = None
    concluida: Optional[bool] = None

    @field_validator("titulo", "concluida", mode="before")
    @classmethod
    def rejeita_null_explicito(cls, v):
        if v is None:
            raise ValueError("não pode ser null")
        return v

    @field_validator("titulo")
    @classmethod
    def titulo_nao_vazio(cls, v):
        v = v.strip()
        if not v:
            raise ValueError("titulo é obrigatório")
        return v


# ── Projetos (Acompanhamento) ─────────────────────────────────────────────────

class ProjetoOut(BaseModel):
    id: int
    eixo_id: int
    municipio_id: int
    template_id: Optional[int] = None
    titulo: str
    descricao: Optional[str] = None
    status: str
    data_inicio: Optional[date] = None
    data_prazo: Optional[date] = None
    departamento: Optional[str] = None
    responsavel: Optional[str] = None
    conteudo: Optional[str] = None
    tarefas: list[TarefaOut] = []
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
    responsavel: Optional[str] = None
    conteudo: Optional[str] = None


class ProjetoUpdate(BaseModel):
    titulo: Optional[str] = None
    descricao: Optional[str] = None
    status: Optional[str] = None
    data_inicio: Optional[date] = None
    data_prazo: Optional[date] = None
    departamento: Optional[str] = None
    responsavel: Optional[str] = None
    conteudo: Optional[str] = None
