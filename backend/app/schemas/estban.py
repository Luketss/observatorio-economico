from pydantic import BaseModel
from datetime import date


class EstbanSerieItem(BaseModel):
    data_referencia: date
    qtd_agencias: int
    valor_operacoes_credito: float
    valor_depositos_vista: float
    valor_poupanca: float
    valor_depositos_prazo: float


class EstbanPorInstituicaoItem(BaseModel):
    nome_instituicao: str
    qtd_agencias: int
    valor_operacoes_credito: float
    valor_depositos_vista: float
    valor_poupanca: float
    valor_depositos_prazo: float


class EstbanResumo(BaseModel):
    total_operacoes_credito: float
    total_depositos: float
    qtd_agencias: int
