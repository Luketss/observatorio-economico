"""Benchmark por pares — endpoint único parametrizado pelos 10 indicadores do
registry. Primeiro uso da chave `benchmark` no servidor: até aqui ela só
existia na sidebar, e os endpoints comparativos ficavam sem gate de plano."""
from app.api.deps import get_db, scoped_modulo
from app.schemas.benchmark import (
    BenchmarkComparativoOut,
    BenchmarkItem,
    IndicadorBenchmarkOut,
    PosicaoBenchmark,
)
from app.schemas.pares import MunicipioRefOut
from app.services.benchmark_service import INDICADORES_BENCHMARK, calcular_posicao
from app.services.pares_service import (
    MunicipioRef,
    carregar_refs,
    elegiveis_por_cobertura,
    parse_fixados,
    resolver_grupo,
)
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

router = APIRouter(prefix="/benchmark", tags=["Benchmark"])


def _ind_out(ind) -> IndicadorBenchmarkOut:
    return IndicadorBenchmarkOut(key=ind.key, label=ind.label, unidade=ind.unidade)


def _ref_out(r: MunicipioRef) -> MunicipioRefOut:
    return MunicipioRefOut(municipio_id=r.id, nome=r.nome, estado=r.estado)


@router.get("/indicadores", response_model=list[IndicadorBenchmarkOut])
def listar_indicadores(_mid: int | None = Depends(scoped_modulo("benchmark"))):
    return [_ind_out(i) for i in INDICADORES_BENCHMARK.values()]


@router.get("/comparativo", response_model=BenchmarkComparativoOut)
def comparativo_benchmark(
    indicador: str = Query(..., description="chave do registry, ex. pib"),
    fixados: str | None = Query(default=None, description="ids separados por vírgula, máx. 3"),
    mid: int | None = Depends(scoped_modulo("benchmark")),
    db: Session = Depends(get_db),
):
    """Mesmo fluxo do /pib/comparativo (anos do foco → cobertura → pares),
    genérico sobre o registry, mais o bloco de posição (molde /ips/ranking)."""
    ind = INDICADORES_BENCHMARK.get(indicador)
    if ind is None:
        raise HTTPException(status_code=400, detail=f"indicador desconhecido: {indicador}")

    if mid is None:
        # ADMIN_GLOBAL sem município selecionado — front exibe "selecione um município".
        return BenchmarkComparativoOut(indicador=_ind_out(ind), motivo="sem_municipio")

    linhas_foco = ind.linhas(db, municipio_ids=[mid], incluir_demo=True)
    anos_foco = {ano for _, ano, _ in linhas_foco}
    if not anos_foco:
        return BenchmarkComparativoOut(indicador=_ind_out(ind), motivo="sem_serie")

    cobertura = ind.linhas(db, anos=anos_foco)
    elegiveis = elegiveis_por_cobertura([(m, a) for m, a, _ in cobertura], anos_foco)

    refs = carregar_refs(db)
    grupo = resolver_grupo(refs, mid, elegiveis, parse_fixados(fixados))
    if grupo.foco is None:
        return BenchmarkComparativoOut(indicador=_ind_out(ind), motivo=grupo.motivo or "sem_municipio")

    ids = [grupo.foco.id] + [p.id for p in grupo.pares] + [f.id for f in grupo.fixados]
    serie = ind.linhas(db, municipio_ids=ids, incluir_demo=True)

    # Posição sai da cobertura já carregada (sem query extra): valores de todos
    # os municípios não-demo no último ano do foco.
    ultimo_ano = max(anos_foco)
    valores_ano = [(m, v) for m, a, v in cobertura if a == ultimo_ano and m in refs]
    estados = {r.id: r.estado for r in refs.values()}
    pos = calcular_posicao(valores_ano, estados, mid, ultimo_ano)

    nome_de = {r.id: r.nome for r in refs.values()}
    return BenchmarkComparativoOut(
        indicador=_ind_out(ind),
        foco=_ref_out(grupo.foco),
        pares=[_ref_out(p) for p in grupo.pares],
        fixados=[_ref_out(f) for f in grupo.fixados],
        criterio_pares=grupo.criterio,
        motivo=grupo.motivo,
        posicao=PosicaoBenchmark(**pos) if pos else None,
        itens=[
            BenchmarkItem(ano=a, municipio_id=m, cidade=nome_de.get(m, ""), valor=v)
            for m, a, v in sorted(serie, key=lambda t: (t[1], t[0]))
        ],
    )
