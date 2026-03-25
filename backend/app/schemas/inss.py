from pydantic import BaseModel


class InssItem(BaseModel):
    ano: int
    categoria: str
    quantidade_beneficios: int
    valor_anual: float


class InssResumo(BaseModel):
    total_beneficios: int
    valor_total: float
