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
