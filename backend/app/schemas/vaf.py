from pydantic import BaseModel


class VafItem(BaseModel):
    ano_base: int
    ano_aplicacao: int | None = None
    vaf_individual: float | None = None
    pct_vaf_individual: float | None = None
    vaf_estado: float | None = None
    pct_vaf_estado: float | None = None
    indice: float | None = None
    pct_indice: float | None = None
    indice_medio: float | None = None
    pct_indice_medio: float | None = None
    indice_participacao_municipal: float | None = None
    pct_ipm: float | None = None


class VafComparativoItem(VafItem):
    cidade: str


class VafResumo(BaseModel):
    ultimo_ano: int
    ipm_ultimo_ano: float
    variacao_ipm_percentual: float


class IcmsProjetadoItem(BaseModel):
    """ICMS repasse projected from the IPM trend, anchored on realized ICMS.

    projetado(ano_aplicacao) = ICMS_realizado_baseline × (IPM_ano / IPM_baseline).
    `realizado` is filled for years we already have actual ICMS receipts."""
    ano_base: int
    ano_aplicacao: int | None = None
    ipm: float | None = None
    icms_projetado: float
    realizado: float | None = None
