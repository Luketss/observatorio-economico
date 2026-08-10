"""Envelope compartilhado dos comparativos por pares (PIB, VAF).

`motivo` é o que impede descarte silencioso: quando a lista de pares vem vazia,
a página sabe dizer por quê em vez de simplesmente não desenhar nada."""
from pydantic import BaseModel


class MunicipioRefOut(BaseModel):
    municipio_id: int
    nome: str
    estado: str


class ParesMeta(BaseModel):
    foco: MunicipioRefOut | None = None
    pares: list[MunicipioRefOut] = []
    fixados: list[MunicipioRefOut] = []
    criterio_pares: str | None = None
    motivo: str | None = None      # sem_municipio | sem_serie | sem_populacao | sem_pares
