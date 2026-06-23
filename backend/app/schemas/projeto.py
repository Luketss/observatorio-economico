from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel


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
