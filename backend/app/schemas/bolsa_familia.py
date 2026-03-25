from pydantic import BaseModel
from typing import Optional


class BolsaFamiliaSerieItem(BaseModel):
    ano: int
    mes: int
    total_beneficiarios: int
    valor_total: float
    valor_bolsa: float
    valor_primeira_infancia: Optional[float] = None
    beneficiarios_primeira_infancia: Optional[int] = None


class BolsaFamiliaResumo(BaseModel):
    total_beneficiarios: int
    valor_total: float
    valor_bolsa: float
    valor_primeira_infancia: float
    beneficiarios_primeira_infancia: int
