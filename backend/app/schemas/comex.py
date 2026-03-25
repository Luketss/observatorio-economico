from pydantic import BaseModel


class ComexSerieItem(BaseModel):
    ano: int
    mes: int
    tipo_operacao: str
    valor_usd: float
    peso_kg: float


class ComexResumo(BaseModel):
    total_exportado_usd: float
    total_importado_usd: float
    balanca_comercial: float


class ComexPorProdutoItem(BaseModel):
    produto: str
    valor_usd: float
    peso_kg: float


class ComexPorPaisItem(BaseModel):
    pais: str
    valor_usd: float
