from pydantic import BaseModel


class RaisItem(BaseModel):
    ano: int
    total_vinculos: int
    setor: str | None
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
