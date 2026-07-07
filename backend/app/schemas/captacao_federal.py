from pydantic import BaseModel


class CaptacaoAnoItem(BaseModel):
    ano: int
    voce: float = 0.0
    media_pares: float | None = None
    via_emenda: float = 0.0
    desembolsado: float = 0.0
    qtd_convenios: int = 0
    parcial: bool = False


class CaptacaoResumo(BaseModel):
    """Headline livre (card do Painel do Prefeito) — decisão de produto: o
    teaser é livre; o detalhe é gateado pelo módulo `captacao_federal`."""
    disponivel: bool
    motivo: str | None = None   # selecione_municipio | municipio_nao_encontrado | sem_codigo_ibge | capital | sem_populacao | sem_dados
    ano_referencia: int | None = None
    voce_firmado: float | None = None
    media_pares: float | None = None
    dinheiro_na_mesa: float | None = None
    acima_da_media: bool | None = None
    total_grupo: int | None = None


class CaptacaoDiagnostico(CaptacaoResumo):
    nao_aplicavel: bool = False
    via_emenda: float | None = None
    desembolsado: float | None = None
    qtd_convenios: int | None = None
    media_nacional: float | None = None
    posicao: int | None = None
    pares_com_dados: int | None = None
    uf: str | None = None
    faixa_pop_min: int | None = None
    faixa_pop_max: int | None = None
    coeficiente: float | None = None
    serie: list[CaptacaoAnoItem] = []


class CaptacaoSerie(BaseModel):
    serie: list[CaptacaoAnoItem] = []
