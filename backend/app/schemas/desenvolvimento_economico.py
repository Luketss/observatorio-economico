from datetime import date, datetime
from typing import List, Literal, Optional

from pydantic import BaseModel, Field

from app.schemas.empresa import EmpresaOut


# ── 3.1 Funil de Investimentos ─────────────────────────────────────────────

class InvestimentoFunilCreate(BaseModel):
    empresa_nome: str
    setor: Optional[str] = None
    valor_estimado: Optional[float] = None
    estagio: str = "lead"
    responsavel: Optional[str] = None
    proxima_acao: Optional[str] = None
    proxima_acao_data: Optional[date] = None
    descricao: Optional[str] = None


class InvestimentoFunilUpdate(BaseModel):
    empresa_nome: Optional[str] = None
    setor: Optional[str] = None
    valor_estimado: Optional[float] = None
    estagio: Optional[str] = None
    responsavel: Optional[str] = None
    proxima_acao: Optional[str] = None
    proxima_acao_data: Optional[date] = None
    descricao: Optional[str] = None


class InvestimentoFunilOut(BaseModel):
    id: int
    municipio_id: int
    empresa_nome: str
    setor: Optional[str] = None
    valor_estimado: Optional[float] = None
    estagio: str
    responsavel: Optional[str] = None
    proxima_acao: Optional[str] = None
    proxima_acao_data: Optional[date] = None
    descricao: Optional[str] = None
    criado_em: datetime
    atualizado_em: datetime

    class Config:
        from_attributes = True


class FunilResumo(BaseModel):
    por_estagio: dict
    valor_total_estimado: float
    taxa_conversao: float


# ── 3.2 Retenção & Expansão ────────────────────────────────────────────────

class VisitaRetencaoCreate(BaseModel):
    data_visita: date
    responsavel: Optional[str] = None
    observacoes: Optional[str] = None
    foto_base64: Optional[str] = None


class VisitaRetencaoOut(BaseModel):
    id: int
    empresa_id: int
    data_visita: date
    responsavel: Optional[str] = None
    observacoes: Optional[str] = None
    foto_base64: Optional[str] = None
    criado_em: datetime

    class Config:
        from_attributes = True


TipoContato = Literal["reuniao", "ligacao", "email", "visita_tecnica", "outro"]
StatusDemanda = Literal["aberta", "em_andamento", "resolvida"]


class ContatoEmpresaCreate(BaseModel):
    data: date
    tipo: TipoContato = "reuniao"
    responsavel: Optional[str] = None
    observacoes: Optional[str] = None


class ContatoEmpresaUpdate(BaseModel):
    data: Optional[date] = None
    tipo: Optional[TipoContato] = None
    responsavel: Optional[str] = None
    observacoes: Optional[str] = None


class ContatoEmpresaOut(BaseModel):
    id: int
    empresa_id: int
    data: date
    tipo: str
    responsavel: Optional[str] = None
    observacoes: Optional[str] = None
    criado_em: datetime
    atualizado_em: datetime

    class Config:
        from_attributes = True


class DemandaEmpresaCreate(BaseModel):
    descricao: str
    status: StatusDemanda = "aberta"
    data_registro: date
    responsavel: Optional[str] = None


class DemandaEmpresaUpdate(BaseModel):
    descricao: Optional[str] = None
    status: Optional[StatusDemanda] = None
    data_registro: Optional[date] = None
    responsavel: Optional[str] = None


class DemandaStatusOut(BaseModel):
    de: Optional[str] = None
    para: str
    alterado_em: datetime
    alterado_por_nome: Optional[str] = None

    class Config:
        from_attributes = True


class DemandaEmpresaOut(BaseModel):
    id: int
    empresa_id: int
    descricao: str
    status: str
    data_registro: date
    responsavel: Optional[str] = None
    criado_em: datetime
    atualizado_em: datetime
    historico: List[DemandaStatusOut] = []

    class Config:
        from_attributes = True


class EmpresaRetencaoCreate(BaseModel):
    nome: str
    cnpj: Optional[str] = None
    setor: Optional[str] = None
    num_empregos: Optional[int] = None
    status_risco: str = "baixo"
    potencial_expansao: str = "baixo"
    responsavel: Optional[str] = None
    cnpj_basico: Optional[str] = Field(default=None, pattern=r"^\d{8}$")
    proxima_acao: Optional[str] = None
    proxima_acao_data: Optional[date] = None


class EmpresaRetencaoUpdate(BaseModel):
    nome: Optional[str] = None
    cnpj: Optional[str] = None
    setor: Optional[str] = None
    num_empregos: Optional[int] = None
    status_risco: Optional[str] = None
    potencial_expansao: Optional[str] = None
    responsavel: Optional[str] = None
    cnpj_basico: Optional[str] = Field(default=None, pattern=r"^\d{8}$")
    proxima_acao: Optional[str] = None
    proxima_acao_data: Optional[date] = None


# ── relevância e risco calculados (derivados na leitura) ──────────────────

class FatorOut(BaseModel):
    chave: str
    rotulo: str
    pontos: int
    maximo: int
    origem: Literal["cadastro", "rfb"]


class RelevanciaOut(BaseModel):
    score: int
    faixa: Literal["alta", "media", "baixa"]
    parcial: bool
    fatores: List[FatorOut]


class SinalOut(BaseModel):
    chave: str
    rotulo: str
    desde: Optional[date] = None


class RiscoOut(BaseModel):
    nivel: Literal["alto", "atencao", "nenhum"]
    sinais: List[SinalOut]


class EmpresaRetencaoOut(BaseModel):
    id: int
    municipio_id: int
    nome: str
    cnpj: Optional[str] = None
    setor: Optional[str] = None
    num_empregos: Optional[int] = None
    status_risco: str
    potencial_expansao: str
    responsavel: Optional[str] = None
    criado_em: datetime
    atualizado_em: datetime
    visitas: List[VisitaRetencaoOut] = []
    cnpj_basico: Optional[str] = None
    proxima_acao: Optional[str] = None
    proxima_acao_data: Optional[date] = None
    contatos: List[ContatoEmpresaOut] = []
    demandas: List[DemandaEmpresaOut] = []
    perfil_rfb: Optional[EmpresaOut] = None
    relevancia: RelevanciaOut
    risco: RiscoOut

    class Config:
        from_attributes = True


class EmpresaRetencaoLeanOut(BaseModel):
    id: int
    municipio_id: int
    nome: str
    cnpj: Optional[str] = None
    setor: Optional[str] = None
    num_empregos: Optional[int] = None
    status_risco: str
    potencial_expansao: str
    responsavel: Optional[str] = None
    criado_em: datetime
    atualizado_em: datetime
    cnpj_basico: Optional[str] = None
    proxima_acao: Optional[str] = None
    proxima_acao_data: Optional[date] = None
    relevancia: RelevanciaOut
    risco: RiscoOut

    class Config:
        from_attributes = True


# ── 3.3 Captação de Recursos ───────────────────────────────────────────────

class CaptacaoRecursoCreate(BaseModel):
    tipo: str = "edital"
    titulo: str
    entidade_origem: Optional[str] = None
    valor_estimado: Optional[float] = None
    prazo: Optional[date] = None
    estagio: str = "oportunidade"
    descricao: Optional[str] = None
    link: Optional[str] = None


class CaptacaoRecursoUpdate(BaseModel):
    tipo: Optional[str] = None
    titulo: Optional[str] = None
    entidade_origem: Optional[str] = None
    valor_estimado: Optional[float] = None
    prazo: Optional[date] = None
    estagio: Optional[str] = None
    descricao: Optional[str] = None
    link: Optional[str] = None


class CaptacaoRecursoOut(BaseModel):
    id: int
    municipio_id: int
    tipo: str
    titulo: str
    entidade_origem: Optional[str] = None
    valor_estimado: Optional[float] = None
    prazo: Optional[date] = None
    estagio: str
    descricao: Optional[str] = None
    link: Optional[str] = None
    criado_em: datetime
    atualizado_em: datetime

    class Config:
        from_attributes = True


# ── 3.4 Escrita de Projetos ────────────────────────────────────────────────

class EscritaProjetoCreate(BaseModel):
    titulo: str
    descricao: Optional[str] = None
    estagio: str = "ideia"
    resultado: Optional[str] = None
    responsavel: Optional[str] = None
    prazo: Optional[date] = None
    valor_pleiteado: Optional[float] = None
    oportunidade_captacao_id: Optional[int] = None


class EscritaProjetoUpdate(BaseModel):
    titulo: Optional[str] = None
    descricao: Optional[str] = None
    estagio: Optional[str] = None
    resultado: Optional[str] = None
    responsavel: Optional[str] = None
    prazo: Optional[date] = None
    valor_pleiteado: Optional[float] = None
    oportunidade_captacao_id: Optional[int] = None


class EscritaProjetoOut(BaseModel):
    id: int
    municipio_id: int
    oportunidade_captacao_id: Optional[int] = None
    titulo: str
    descricao: Optional[str] = None
    estagio: str
    resultado: Optional[str] = None
    responsavel: Optional[str] = None
    prazo: Optional[date] = None
    valor_pleiteado: Optional[float] = None
    criado_em: datetime
    atualizado_em: datetime

    class Config:
        from_attributes = True


# ── 3.5 Premiações ─────────────────────────────────────────────────────────

class PremiacaoCreate(BaseModel):
    titulo: str
    entidade: Optional[str] = None
    descricao: Optional[str] = None
    tipo: str = "premio"
    prazo: Optional[date] = None
    link: Optional[str] = None
    status: str = "oportunidade"


class PremiacaoUpdate(BaseModel):
    titulo: Optional[str] = None
    entidade: Optional[str] = None
    descricao: Optional[str] = None
    tipo: Optional[str] = None
    prazo: Optional[date] = None
    link: Optional[str] = None
    status: Optional[str] = None


class PremiacaoOut(BaseModel):
    id: int
    municipio_id: int
    titulo: str
    entidade: Optional[str] = None
    descricao: Optional[str] = None
    tipo: str
    prazo: Optional[date] = None
    link: Optional[str] = None
    status: str
    criado_em: datetime
    atualizado_em: datetime

    class Config:
        from_attributes = True


# ── descoberta na base RFB (sub-frente B) ──────────────────────────────────

class DescobertaItem(BaseModel):
    cnpj_basico: str
    razao_social: str
    nome_fantasia: Optional[str] = None
    situacao: Optional[str] = None
    porte: Optional[str] = None
    cnae_fiscal: Optional[str] = None
    divisao: Optional[str] = None
    divisao_descricao: Optional[str] = None
    capital_social: Optional[float] = None
    data_inicio: Optional[date] = None
    score: int


class DescobertaPage(BaseModel):
    total: int
    itens: List[DescobertaItem]


class DivisaoCnaeOut(BaseModel):
    divisao: str
    descricao: str
    total: int


# ── agenda do gestor (sub-frente C) ────────────────────────────────────────

class ItemAcaoOut(BaseModel):
    empresa_id: int
    empresa_nome: str
    proxima_acao: str
    proxima_acao_data: Optional[date] = None
    dias: Optional[int] = None
    responsavel: Optional[str] = None


class ItemDemandaOut(BaseModel):
    demanda_id: int
    empresa_id: int
    empresa_nome: str
    descricao: str
    status: str
    data_registro: date
    dias_em_aberto: int
    status_desde: date
    responsavel: Optional[str] = None
    sinal_30d: bool


class ItemSemContatoOut(BaseModel):
    empresa_id: int
    empresa_nome: str
    desde: Optional[date] = None
    dias: Optional[int] = None


class ItemContatoOut(BaseModel):
    empresa_id: int
    empresa_nome: str
    tipo: Literal["contato", "visita"]
    subtipo: Optional[str] = None
    data: date
    responsavel: Optional[str] = None
    observacoes: Optional[str] = None


class AgendaKpisOut(BaseModel):
    vencidas: int
    proximas: int
    sem_data: int
    demandas_abertas: int
    sem_contato: int


class AgendaOut(BaseModel):
    hoje: date
    dias: int
    kpis: AgendaKpisOut
    vencidas: List[ItemAcaoOut]
    proximas: List[ItemAcaoOut]
    sem_data: List[ItemAcaoOut]
    demandas: List[ItemDemandaOut]
    sem_contato: List[ItemSemContatoOut]
    contatos_recentes: List[ItemContatoOut]
