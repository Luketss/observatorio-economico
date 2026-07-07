from pydantic import BaseModel


class EmendaItem(BaseModel):
    ano: int
    codigo: str
    numero: str | None = None
    autor: str
    tipo: str
    funcao: str | None = None
    empenhado: float = 0.0
    liquidado: float = 0.0
    pago: float = 0.0
    resto_pago: float = 0.0
    pago_total: float = 0.0
    pct_pago: float | None = None


class AutorItem(BaseModel):
    autor: str
    num_emendas: int
    empenhado: float
    pago_total: float
    pct_pago: float | None = None


class FuncaoItem(BaseModel):
    funcao: str
    empenhado: float


class RadarKpis(BaseModel):
    total_empenhado: float
    pago_total: float
    pct_pago: float | None = None
    num_emendas: int
    num_parlamentares: int
    top_autor: str | None = None
    top_autor_valor: float | None = None


class EmendasRadar(BaseModel):
    disponivel: bool
    motivo: str | None = None      # selecione_municipio
    anos: list[int] = []
    kpis: RadarKpis | None = None
    por_autor: list[AutorItem] = []
    por_funcao: list[FuncaoItem] = []
    emendas: list[EmendaItem] = []


class EmendasResumo(BaseModel):
    """Headline livre (card do Painel do Prefeito)."""
    disponivel: bool
    motivo: str | None = None
    ano: int | None = None
    total_empenhado: float | None = None
    num_parlamentares: int | None = None
    top_autor: str | None = None
