from pydantic import BaseModel
from datetime import date
from typing import Optional


class EstbanSerieItem(BaseModel):
    data_referencia: date
    qtd_agencias: int
    valor_operacoes_credito: float
    valor_depositos_vista: float
    valor_poupanca: float
    valor_depositos_prazo: float
    emprestimos_titulos_descontados: Optional[float] = None
    financiamentos_gerais: Optional[float] = None
    financiamento_agropecuario: Optional[float] = None
    financiamentos_imobiliarios: Optional[float] = None
    arrendamento_mercantil: Optional[float] = None
    emprestimos_setor_publico: Optional[float] = None
    outros_creditos: Optional[float] = None


class EstbanPorInstituicaoItem(BaseModel):
    nome_instituicao: str
    qtd_agencias: int
    valor_operacoes_credito: float
    valor_depositos_vista: float
    valor_poupanca: float
    valor_depositos_prazo: float
    emprestimos_titulos_descontados: Optional[float] = None
    financiamentos_gerais: Optional[float] = None
    financiamento_agropecuario: Optional[float] = None
    financiamentos_imobiliarios: Optional[float] = None
    arrendamento_mercantil: Optional[float] = None
    emprestimos_setor_publico: Optional[float] = None
    outros_creditos: Optional[float] = None


class EstbanResumo(BaseModel):
    total_operacoes_credito: float
    total_depositos: float
    qtd_agencias: int
