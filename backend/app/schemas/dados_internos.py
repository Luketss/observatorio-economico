from datetime import date, datetime, time
from typing import List, Optional

from pydantic import BaseModel


# ── Indicador Interno ─────────────────────────────────────────────────────────

class IndicadorInternoOut(BaseModel):
    id: int
    municipio_id: int
    area: str
    nome_metrica: str
    valor: float
    unidade: str
    periodo_tipo: str
    periodo_ano: int
    periodo_mes: Optional[int] = None
    fonte: Optional[str] = None
    observacoes: Optional[str] = None
    criado_em: datetime

    class Config:
        from_attributes = True


class IndicadorInternoCreate(BaseModel):
    area: str
    nome_metrica: str
    valor: float
    unidade: str
    periodo_tipo: str
    periodo_ano: int
    periodo_mes: Optional[int] = None
    fonte: Optional[str] = None
    observacoes: Optional[str] = None


class IndicadorInternoUpdate(BaseModel):
    area: Optional[str] = None
    nome_metrica: Optional[str] = None
    valor: Optional[float] = None
    unidade: Optional[str] = None
    periodo_tipo: Optional[str] = None
    periodo_ano: Optional[int] = None
    periodo_mes: Optional[int] = None
    fonte: Optional[str] = None
    observacoes: Optional[str] = None


# ── Plano de Governo ──────────────────────────────────────────────────────────

class PlanoGovAcaoOut(BaseModel):
    id: int
    municipio_id: int
    departamento: str
    titulo: str
    descricao: Optional[str] = None
    status: str
    data_inicio: Optional[date] = None
    data_prazo: Optional[date] = None
    responsavel: Optional[str] = None
    departamentos_envolvidos: Optional[List[str]] = None
    criado_em: datetime
    atualizado_em: datetime

    class Config:
        from_attributes = True


class PlanoGovAcaoCreate(BaseModel):
    departamento: str
    titulo: str
    descricao: Optional[str] = None
    status: str = "nao_iniciado"
    data_inicio: Optional[date] = None
    data_prazo: Optional[date] = None
    responsavel: Optional[str] = None
    departamentos_envolvidos: Optional[List[str]] = None


class PlanoGovAcaoUpdate(BaseModel):
    departamento: Optional[str] = None
    titulo: Optional[str] = None
    descricao: Optional[str] = None
    status: Optional[str] = None
    data_inicio: Optional[date] = None
    data_prazo: Optional[date] = None
    responsavel: Optional[str] = None
    departamentos_envolvidos: Optional[List[str]] = None


# ── Evento Município ──────────────────────────────────────────────────────────

class EventoMunicipioOut(BaseModel):
    id: int
    municipio_id: int
    titulo: str
    descricao: Optional[str] = None
    data_inicio: date
    data_fim: Optional[date] = None
    horario_inicio: Optional[time] = None
    horario_fim: Optional[time] = None
    local: Optional[str] = None
    tipo: str
    criado_em: datetime

    class Config:
        from_attributes = True


class EventoMunicipioCreate(BaseModel):
    titulo: str
    descricao: Optional[str] = None
    data_inicio: date
    data_fim: Optional[date] = None
    horario_inicio: Optional[time] = None
    horario_fim: Optional[time] = None
    local: Optional[str] = None
    tipo: str = "outro"


class EventoMunicipioUpdate(BaseModel):
    titulo: Optional[str] = None
    descricao: Optional[str] = None
    data_inicio: Optional[date] = None
    data_fim: Optional[date] = None
    horario_inicio: Optional[time] = None
    horario_fim: Optional[time] = None
    local: Optional[str] = None
    tipo: Optional[str] = None
