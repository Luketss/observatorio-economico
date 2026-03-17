from typing import List

from pydantic import BaseModel


class PibItem(BaseModel):
    ano: int
    pib_total: float
    tipo_dado: str


class PibComparativoItem(BaseModel):
    ano: int
    cidade: str
    pib_total: float


class PibResumo(BaseModel):
    ultimo_ano: int
    pib_ultimo_ano: float
    crescimento_percentual: float
