"""Envelope do /benchmark/comparativo: o ParesMeta dos comparativos (PIB/VAF)
mais o indicador escolhido, a posição no último ano e itens uniformes."""
from pydantic import BaseModel

from app.schemas.pares import MunicipioRefOut


class IndicadorBenchmarkOut(BaseModel):
    key: str
    label: str
    unidade: str  # brl | usd | numero | indice


class RankTotal(BaseModel):
    rank: int
    total: int


class PosicaoBenchmark(BaseModel):
    ano: int
    nacional: RankTotal
    estadual: RankTotal


class BenchmarkItem(BaseModel):
    ano: int
    municipio_id: int
    cidade: str
    valor: float


class BenchmarkComparativoOut(BaseModel):
    indicador: IndicadorBenchmarkOut | None = None
    foco: MunicipioRefOut | None = None
    pares: list[MunicipioRefOut] = []
    fixados: list[MunicipioRefOut] = []
    criterio_pares: str | None = None
    motivo: str | None = None      # sem_municipio | sem_serie | sem_populacao | sem_pares
    posicao: PosicaoBenchmark | None = None
    itens: list[BenchmarkItem] = []
