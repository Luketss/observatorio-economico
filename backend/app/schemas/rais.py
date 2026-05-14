from pydantic import BaseModel


class RaisItem(BaseModel):
    ano: int
    total_vinculos: int
    remuneracao_media: float | None = None


class RaisResumo(BaseModel):
    total_vinculos: int
    remuneracao_media: float | None = None


class RaisSexoItem(BaseModel):
    ano: int
    sexo: str
    total_vinculos: int
    remuneracao_media: float | None


class RaisRacaItem(BaseModel):
    ano: int
    raca_cor: str
    total_vinculos: int
    remuneracao_media: float | None


class RaisCnaeItem(BaseModel):
    ano: int
    secao: str
    descricao_secao: str
    total_vinculos: int
    remuneracao_media: float | None


class RaisFaixaEtariaItem(BaseModel):
    ano: int
    faixa_etaria: str
    total_vinculos: int
    remuneracao_media: float | None = None


class RaisEscolaridadeItem(BaseModel):
    ano: int
    grau_instrucao: str
    total_vinculos: int
    remuneracao_media: float | None = None


class RaisFaixaRemuneracaoItem(BaseModel):
    ano: int
    faixa_remuneracao_sm: str
    total_vinculos: int


class RaisFaixaTempoEmpregoItem(BaseModel):
    ano: int
    faixa_tempo_emprego: str
    total_vinculos: int


class RaisMetricasAnuaisItem(BaseModel):
    ano: int
    total_vinculos: int
    total_pcd: int
    total_outro_municipio: int
    media_dias_afastamento: float | None = None
    # New (2026-05): contract-type and active-on-Dec-31 indicators.
    total_ativo_dezembro: int = 0
    total_parcial: int = 0
    total_intermitente: int = 0
    total_simples: int = 0
    total_aprendiz_estimado: int = 0


class RaisMotivoDesligamentoItem(BaseModel):
    ano: int
    motivo: str
    total_desligamentos: int


class RaisTipoAdmissaoItem(BaseModel):
    ano: int
    tipo: str
    total_admissoes: int


class RaisCboItem(BaseModel):
    ano: int
    cbo_familia: str
    descricao: str | None = None
    total_vinculos: int
    remuneracao_media: float | None = None


class RaisTamanhoEstabelecimentoItem(BaseModel):
    ano: int
    tamanho: str
    total_vinculos: int
    remuneracao_media: float | None = None


class RaisNaturezaJuridicaItem(BaseModel):
    ano: int
    grupo: str
    total_vinculos: int


class RaisTurnoverMensalItem(BaseModel):
    ano: int
    mes: int
    total_admissoes: int
    total_desligamentos: int
