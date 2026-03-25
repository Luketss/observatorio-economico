from pydantic import BaseModel


class PeDeMeiaResumoItem(BaseModel):
    ano: int
    mes: int
    total_estudantes: int
    valor_total: float


class PeDeMeiaResumo(BaseModel):
    total_estudantes: int
    valor_total: float


class PeDeMeiaEtapaItem(BaseModel):
    etapa_ensino: str
    total_estudantes: int
    valor_total: float


class PeDeMeiaIncentivo(BaseModel):
    tipo_incentivo: str
    total_estudantes: int
    valor_total: float
