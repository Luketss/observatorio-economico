from typing import List

from pydantic import BaseModel


class ArrecadacaoItem(BaseModel):
    ano: int
    mes: int
    periodo: str
    total: float
    icms: float
    ipva: float
    ipi: float


class ArrecadacaoResumo(BaseModel):
    total_geral: float
    total_ultimo_ano: float
    crescimento_percentual: float
    media_mensal: float
