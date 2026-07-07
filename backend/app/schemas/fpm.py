from pydantic import BaseModel


class FaixaFpmOut(BaseModel):
    pop_min: int
    pop_max: int | None = None
    coeficiente: float
    atual: bool = False


class AlertaFpm(BaseModel):
    """Payload do Alerta de Faixa do FPM. Coeficiente sempre ESTIMADO pela
    população; `divergencia=True` sinaliza que o oficial (TCU) deve diferir."""
    disponivel: bool
    motivo: str | None = None          # sem_codigo_ibge | sem_populacao | fpm_capitais | selecione_municipio
    nao_aplicavel: bool = False        # capital (regime FPM-Capitais)
    populacao: int | None = None
    ano_populacao: int | None = None
    fonte_populacao: str | None = None
    coeficiente: float | None = None
    status: str | None = None          # oportunidade | risco | estavel | teto
    hab_para_subir: int | None = None
    hab_para_cair: int | None = None
    fpm_12m: float | None = None
    fpm_12m_parcial: bool = False
    valor_por_ponto: float | None = None
    ganho_proxima_faixa: float | None = None
    perda_faixa_anterior: float | None = None
    divergencia: bool | None = None
    faixas: list[FaixaFpmOut] = []


class FpmMesItem(BaseModel):
    ano: int
    mes: int
    valor: float


class FpmAnoItem(BaseModel):
    ano: int
    valor_total: float
    meses: int


class PopulacaoAnoItem(BaseModel):
    ano: int
    populacao: int
    fonte: str


class FpmSerie(BaseModel):
    mensal: list[FpmMesItem] = []
    anual: list[FpmAnoItem] = []
    populacao: list[PopulacaoAnoItem] = []
