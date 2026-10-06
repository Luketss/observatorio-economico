from typing import Literal

from pydantic import BaseModel, Field, model_validator

LIMITE_CELULAS = 50_000


class ColunaExport(BaseModel):
    chave: str = Field(min_length=1, max_length=80)
    rotulo: str = Field(min_length=1, max_length=120)
    tipo: Literal["texto", "numero", "ano"] = "texto"


class ExportXlsxIn(BaseModel):
    titulo: str = Field(min_length=1, max_length=200)
    subtitulo: str | None = Field(default=None, max_length=300)
    fonte: str | None = Field(default=None, max_length=200)
    municipio: str | None = Field(default=None, max_length=150)
    dataset: str | None = Field(default=None, max_length=60)
    colunas: list[ColunaExport] = Field(min_length=1, max_length=50)
    linhas: list[dict[str, str | int | float | None]] = Field(default_factory=list, max_length=5000)

    @model_validator(mode="after")
    def _limite_de_celulas(self):
        if len(self.colunas) * len(self.linhas) > LIMITE_CELULAS:
            raise ValueError(
                f"Tabela grande demais para exportar (limite de {LIMITE_CELULAS} celulas)"
            )
        return self
