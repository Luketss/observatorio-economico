# Benchmark por Pares (F6-A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reconstruir o módulo Benchmark: endpoint parametrizado `/benchmark/comparativo` com 10 indicadores (envelope de pares + posição nacional/estadual) e página em 2 abas — "Comparação com pares" (nova) e "Ranking nacional" (tela atual preservada).

**Architecture:** Backend ganha um registry `INDICADORES_BENCHMARK` (série anual `(municipio_id, ano, valor)` por indicador, espelhando as agregações dos endpoints comparativos existentes) consumido por um router novo `/benchmark` com `scoped_modulo("benchmark")`, reusando `pares_service` como está. Frontend reconstrói `ComparativoPage` como shell de 2 abas (`NidTabBar`, estado local): a aba nova monta o `MultiLineChart` via `montarComparativo` + 2 KpiCards de posição + strip de leitura derivada pura (`leituraBenchmark.js`); a tela atual vira `RankingTab.jsx` sem mudança de comportamento.

**Tech Stack:** FastAPI + SQLAlchemy 2 + Pydantic v2 + pytest (handlers diretos, sqlite `create_engine("sqlite://")`, sem TestClient); React 19 + Vite + Tailwind tokens + Vitest/Testing Library (`// @vitest-environment jsdom` na 1ª linha de testes DOM).

**Spec:** `docs/superpowers/specs/2026-08-20-benchmark-pares-design.md`

## Global Constraints

- Sem migração de banco. Endpoints comparativos existentes (`/comparativo/*`, `/pib/*`, `/vaf/*`, `/estban/comparativo` etc.) NÃO mudam.
- Rota `/app/benchmark`, chave de plano `benchmark`, export default `BenchmarkPage` e o título "Benchmark Municipal": intocados. `navStructure.test.js` e `titulosPaginas.test.js` não são tocados.
- Git: `git add` caminho a caminho, NUNCA `git add -A` ou `git add .`. Proibido commitar `.claude/settings.local.json`, `dados/`, `node_modules/`.
- Todo commit termina com os trailers:
  `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`
  `Claude-Session: https://claude.ai/code/session_01N95ZNhrEvp4fMuUrkksoaq`
- Suites: backend `venv/Scripts/python -m pytest backend/tests -q` da RAIZ do repo, via Bash/git-bash (nunca PowerShell); frontend `npx vitest run` de `frontend-observatorio/`. Baselines: back 437, front 300 — só podem crescer.
- Lint repo-wide está quebrado (não é gate). Critério: arquivo tocado não ganha erro NOVO vs base (`git show BASE:caminho | npx eslint --stdin --stdin-filename caminho`). Falso-positivos conhecidos aceitos: `motion` "unused" em arquivos que usam `motion.div`.
- **Rulings deste plano** (spec é a autoridade; estes 3 pontos a refinam — já decididos, não rediscutir):
  1. O guard `needsMunicipio` vale só para a aba "Comparação com pares" (que precisa de foco). A aba "Ranking nacional" continua acessível a ADMIN_GLOBAL sem view-as — hoje ela funciona assim e "nada some".
  2. `unidade` ganha o valor `"usd"` (além de `brl|numero|indice`) para COMEX — formatar exportações USD como R$ replicaria um erro da tela antiga na aba nova.
  3. PIB agrega com `func.max(pib_total)` por (município, ano) — a unique key inclui `tipo_dado` (REAL/PROJETADO); `sum` dobraria o valor se ambos coexistissem.

---

## Estrutura de arquivos

| Arquivo | Papel |
|---|---|
| Create `backend/app/services/benchmark_service.py` | Registry dos 10 indicadores + `calcular_posicao` (puro) |
| Create `backend/app/schemas/benchmark.py` | `IndicadorBenchmarkOut`, `RankTotal`, `PosicaoBenchmark`, `BenchmarkItem`, `BenchmarkComparativoOut` |
| Create `backend/app/api/v1/routers/benchmark.py` | `GET /benchmark/indicadores` + `GET /benchmark/comparativo` |
| Modify `backend/app/main.py` | import + `include_router` |
| Test `backend/tests/test_benchmark_service.py` | registry + posição |
| Test `backend/tests/test_benchmark_endpoints.py` | envelope, posição, motivos, 400, fixados, demo, OpenAPI |
| Create `frontend-observatorio/src/utils/leituraBenchmark.js` | `montarLeitura` (puro) |
| Test `frontend-observatorio/src/utils/leituraBenchmark.test.js` | unit puro (node) |
| Create `frontend-observatorio/src/pages/comparativo/ComparacaoPares.jsx` | Aba nova |
| Test `frontend-observatorio/src/pages/comparativo/ComparacaoPares.test.jsx` | jsdom, api mockado |
| Create `frontend-observatorio/src/pages/comparativo/RankingTab.jsx` | Tela atual extraída |
| Modify `frontend-observatorio/src/pages/comparativo/ComparativoPage.jsx` | Shell: header + guard + 2 abas |
| Test `frontend-observatorio/src/pages/comparativo/ComparativoPage.test.jsx` | abas + guard |

Branch de trabalho: `feat/benchmark-pares` a partir de `main`.

---

### Task 1: Registry de indicadores + posição (backend service)

**Files:**
- Create: `backend/app/services/benchmark_service.py`
- Test: `backend/tests/test_benchmark_service.py`

**Interfaces:**
- Consumes: models existentes (`PibAnual`, `VafAnual`, `ArrecadacaoMensal`, `CagedMovimentacao`, `RaisVinculo`, `EstbanMensal`, `ComexMensal`, `PixMensal`, `BolsaFamiliaResumo`, `InssAnual`, `Municipio`).
- Produces (Task 2 depende):
  - `IndicadorBenchmark` dataclass com `key: str`, `label: str`, `unidade: str`, `linhas: Callable` — `linhas(db, municipio_ids=None, anos=None) -> list[tuple[int, int, float]]` (município, ano, valor), já sem municípios demo.
  - `INDICADORES_BENCHMARK: dict[str, IndicadorBenchmark]` com exatamente as 10 chaves, nesta ordem: `pib, vaf, arrecadacao, caged, rais, estban, comex, pix, bolsa_familia, inss`.
  - `calcular_posicao(valores: list[tuple[int, float]], estados: dict[int, str], foco_id: int, ano: int) -> dict | None`.

- [ ] **Step 1: Escrever os testes que falham**

Criar `backend/tests/test_benchmark_service.py`:

```python
"""Registry do benchmark: série anual uniforme (municipio, ano, valor) por
indicador — cada consulta espelha o endpoint comparativo homônimo — e o
cálculo puro de posição nacional/estadual."""
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

import app.models  # noqa: F401
from app.db.base import Base
from app.models.caged import CagedMovimentacao
from app.models.comex import ComexMensal
from app.models.estban import EstbanMensal
from app.models.municipio import Municipio
from app.models.pib import PibAnual
from app.models.pix import PixMensal
from app.models.vaf import VafAnual
from app.services.benchmark_service import (
    INDICADORES_BENCHMARK,
    calcular_posicao,
)

from datetime import date


@pytest.fixture()
def ctx():
    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine, tables=[
        Municipio.__table__, PibAnual.__table__, VafAnual.__table__,
        CagedMovimentacao.__table__, EstbanMensal.__table__,
        ComexMensal.__table__, PixMensal.__table__,
    ])
    db = sessionmaker(bind=engine)()
    m1 = Municipio(nome="Alfa", estado="MG")
    m2 = Municipio(nome="Beta", estado="MG")
    demo = Municipio(nome="Demo", estado="MG", is_demo=True)
    db.add_all([m1, m2, demo])
    db.commit()
    yield db, m1, m2, demo
    db.close()


def test_registry_tem_as_10_chaves_na_ordem():
    assert list(INDICADORES_BENCHMARK) == [
        "pib", "vaf", "arrecadacao", "caged", "rais",
        "estban", "comex", "pix", "bolsa_familia", "inss",
    ]
    for ind in INDICADORES_BENCHMARK.values():
        assert ind.unidade in ("brl", "usd", "numero", "indice")


def test_pib_uma_linha_por_ano_e_demo_fora(ctx):
    db, m1, m2, demo = ctx
    db.add_all([
        PibAnual(municipio_id=m1.id, ano=2021, tipo_dado="REAL", pib_total=100.0),
        PibAnual(municipio_id=m1.id, ano=2022, tipo_dado="REAL", pib_total=110.0),
        # REAL e PROJETADO no MESMO ano: max() não pode virar soma (215).
        PibAnual(municipio_id=m1.id, ano=2022, tipo_dado="PROJETADO", pib_total=105.0),
        PibAnual(municipio_id=m2.id, ano=2022, tipo_dado="REAL", pib_total=220.0),
        PibAnual(municipio_id=demo.id, ano=2022, tipo_dado="REAL", pib_total=999.0),
    ])
    db.commit()
    linhas = INDICADORES_BENCHMARK["pib"].linhas(db)
    assert (m1.id, 2022, 110.0) in linhas and (m2.id, 2022, 220.0) in linhas
    assert all(mid != demo.id for mid, _, _ in linhas)


def test_pib_filtros_de_municipio_e_ano(ctx):
    db, m1, m2, _ = ctx
    db.add_all([
        PibAnual(municipio_id=m1.id, ano=2021, tipo_dado="REAL", pib_total=100.0),
        PibAnual(municipio_id=m1.id, ano=2022, tipo_dado="REAL", pib_total=110.0),
        PibAnual(municipio_id=m2.id, ano=2022, tipo_dado="REAL", pib_total=220.0),
    ])
    db.commit()
    ind = INDICADORES_BENCHMARK["pib"]
    assert ind.linhas(db, municipio_ids=[m1.id]) == [(m1.id, 2021, 100.0), (m1.id, 2022, 110.0)]
    assert {t[0] for t in ind.linhas(db, anos={2022})} == {m1.id, m2.id}


def test_vaf_usa_ano_base_e_unidade_indice(ctx):
    db, m1, _, _ = ctx
    db.add(VafAnual(municipio_id=m1.id, ano_base=2021, pct_ipm=0.1234))
    db.commit()
    ind = INDICADORES_BENCHMARK["vaf"]
    assert ind.unidade == "indice"
    assert ind.linhas(db) == [(m1.id, 2021, 0.1234)]


def test_caged_soma_meses_do_ano(ctx):
    db, m1, _, _ = ctx
    db.add_all([
        CagedMovimentacao(municipio_id=m1.id, ano=2022, mes=1, admissoes=10, desligamentos=4, saldo=6),
        CagedMovimentacao(municipio_id=m1.id, ano=2022, mes=2, admissoes=5, desligamentos=8, saldo=-3),
    ])
    db.commit()
    assert INDICADORES_BENCHMARK["caged"].linhas(db) == [(m1.id, 2022, 3.0)]


def test_estban_agrupa_por_ano_da_data_referencia(ctx):
    db, m1, _, _ = ctx
    db.add_all([
        EstbanMensal(municipio_id=m1.id, data_referencia=date(2022, 1, 1), qtd_agencias=1,
                     valor_operacoes_credito=100.0, valor_depositos_vista=0,
                     valor_poupanca=0, valor_depositos_prazo=0),
        EstbanMensal(municipio_id=m1.id, data_referencia=date(2022, 2, 1), qtd_agencias=1,
                     valor_operacoes_credito=50.0, valor_depositos_vista=0,
                     valor_poupanca=0, valor_depositos_prazo=0),
    ])
    db.commit()
    assert INDICADORES_BENCHMARK["estban"].linhas(db) == [(m1.id, 2022, 150.0)]


def test_comex_soma_so_exportacoes_case_insensitive(ctx):
    db, m1, _, _ = ctx
    db.add_all([
        ComexMensal(municipio_id=m1.id, ano=2022, mes=1, tipo_operacao="export", valor_usd=10.0),
        ComexMensal(municipio_id=m1.id, ano=2022, mes=2, tipo_operacao="EXP", valor_usd=5.0),
        ComexMensal(municipio_id=m1.id, ano=2022, mes=3, tipo_operacao="import", valor_usd=99.0),
    ])
    db.commit()
    ind = INDICADORES_BENCHMARK["comex"]
    assert ind.unidade == "usd"
    assert ind.linhas(db) == [(m1.id, 2022, 15.0)]


def test_pix_soma_pf_e_pj_com_nulos(ctx):
    db, m1, _, _ = ctx
    db.add_all([
        PixMensal(municipio_id=m1.id, ano=2022, mes=1, vl_pagador_pf=10.0, vl_pagador_pj=None),
        PixMensal(municipio_id=m1.id, ano=2022, mes=2, vl_pagador_pf=None, vl_pagador_pj=20.0),
    ])
    db.commit()
    assert INDICADORES_BENCHMARK["pix"].linhas(db) == [(m1.id, 2022, 30.0)]


def test_posicao_nacional_e_estadual():
    valores = [(1, 110.0), (2, 220.0), (3, 60.0)]
    estados = {1: "MG", 2: "MG", 3: "SP"}
    pos = calcular_posicao(valores, estados, foco_id=1, ano=2022)
    assert pos == {
        "ano": 2022,
        "nacional": {"rank": 2, "total": 3},
        "estadual": {"rank": 2, "total": 2},
    }


def test_posicao_sem_valor_do_foco_devolve_none():
    assert calcular_posicao([(2, 220.0)], {2: "MG"}, foco_id=1, ano=2022) is None
```

- [ ] **Step 2: Rodar e ver falhar**

Run (Bash, da raiz): `venv/Scripts/python -m pytest backend/tests/test_benchmark_service.py -q`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.services.benchmark_service'`

- [ ] **Step 3: Implementar o service**

Criar `backend/app/services/benchmark_service.py`:

```python
"""Registry do Benchmark: os 10 indicadores comparáveis como série anual
uniforme `(municipio_id, ano, valor)`.

Cada consulta espelha a agregação do endpoint comparativo homônimo já
existente (mesma fonte de verdade dos precedentes F4/F5) — inclusive as
semânticas herdadas: ESTBAN soma saldos mensais do ano (como o
`/estban/comparativo` atual) e COMEX considera só exportações. Municípios
demo ficam fora de TODAS as consultas (dado fabricado não entra em
analytics cross-município).

`calcular_posicao` é puro de propósito — o router passa os valores do
último ano e o mapa de UFs (que já tem via `carregar_refs`)."""
from dataclasses import dataclass
from typing import Callable

from sqlalchemy import extract, func

from app.models.arrecadacao import ArrecadacaoMensal
from app.models.bolsa_familia import BolsaFamiliaResumo
from app.models.caged import CagedMovimentacao
from app.models.comex import ComexMensal
from app.models.estban import EstbanMensal
from app.models.inss import InssAnual
from app.models.municipio import Municipio
from app.models.pib import PibAnual
from app.models.pix import PixMensal
from app.models.rais import RaisVinculo
from app.models.vaf import VafAnual


@dataclass(frozen=True)
class IndicadorBenchmark:
    key: str
    label: str
    unidade: str  # brl | usd | numero | indice
    linhas: Callable  # (db, municipio_ids=None, anos=None) -> [(mid, ano, valor)]


def _linhas_agregadas(col_mid, col_ano, expr_valor, filtros=()):
    """Fábrica da consulta anual agregada. Os filtros de município/ano incidem
    ANTES do group_by (são as chaves do grupo, então o recorte é válido)."""
    def linhas(db, municipio_ids=None, anos=None):
        q = (
            db.query(col_mid.label("mid"), col_ano.label("ano"), expr_valor.label("valor"))
            .join(Municipio, Municipio.id == col_mid)
            .filter(Municipio.is_demo.is_(False))
        )
        for f in filtros:
            q = q.filter(f)
        if municipio_ids is not None:
            q = q.filter(col_mid.in_(municipio_ids))
        if anos is not None:
            q = q.filter(col_ano.in_(anos))
        # extract("year", ...) volta Decimal/str dependendo do backend — int() normaliza.
        return [
            (r.mid, int(r.ano), float(r.valor or 0))
            for r in q.group_by(col_mid, col_ano).order_by(col_mid, col_ano).all()
        ]
    return linhas


# max() no PIB/VAF: a unique key do PIB inclui tipo_dado (REAL/PROJETADO) —
# sum() dobraria o valor se os dois coexistissem num ano.
INDICADORES_BENCHMARK: dict[str, IndicadorBenchmark] = {
    "pib": IndicadorBenchmark("pib", "PIB Total", "brl", _linhas_agregadas(
        PibAnual.municipio_id, PibAnual.ano, func.max(PibAnual.pib_total))),
    "vaf": IndicadorBenchmark("vaf", "VAF · Índice IPM", "indice", _linhas_agregadas(
        VafAnual.municipio_id, VafAnual.ano_base, func.max(VafAnual.pct_ipm))),
    "arrecadacao": IndicadorBenchmark("arrecadacao", "Arrecadação Total", "brl", _linhas_agregadas(
        ArrecadacaoMensal.municipio_id, ArrecadacaoMensal.ano, func.sum(ArrecadacaoMensal.valor_total))),
    "caged": IndicadorBenchmark("caged", "Saldo CAGED", "numero", _linhas_agregadas(
        CagedMovimentacao.municipio_id, CagedMovimentacao.ano, func.sum(CagedMovimentacao.saldo))),
    "rais": IndicadorBenchmark("rais", "Vínculos RAIS", "numero", _linhas_agregadas(
        RaisVinculo.municipio_id, RaisVinculo.ano, func.sum(RaisVinculo.total_vinculos))),
    "estban": IndicadorBenchmark("estban", "Crédito ESTBAN", "brl", _linhas_agregadas(
        EstbanMensal.municipio_id, extract("year", EstbanMensal.data_referencia),
        func.sum(EstbanMensal.valor_operacoes_credito))),
    "comex": IndicadorBenchmark("comex", "Exportações COMEX", "usd", _linhas_agregadas(
        ComexMensal.municipio_id, ComexMensal.ano, func.sum(ComexMensal.valor_usd),
        filtros=(func.lower(ComexMensal.tipo_operacao).in_(("exp", "export")),))),
    "pix": IndicadorBenchmark("pix", "Volume PIX", "brl", _linhas_agregadas(
        PixMensal.municipio_id, PixMensal.ano,
        func.sum(func.coalesce(PixMensal.vl_pagador_pf, 0) + func.coalesce(PixMensal.vl_pagador_pj, 0)))),
    "bolsa_familia": IndicadorBenchmark("bolsa_familia", "Bolsa Família (repasses)", "brl", _linhas_agregadas(
        BolsaFamiliaResumo.municipio_id, BolsaFamiliaResumo.ano, func.sum(BolsaFamiliaResumo.valor_total))),
    "inss": IndicadorBenchmark("inss", "Benefícios INSS", "brl", _linhas_agregadas(
        InssAnual.municipio_id, InssAnual.ano, func.sum(InssAnual.valor_anual))),
}


def calcular_posicao(
    valores: list[tuple[int, float]],
    estados: dict[int, str],
    foco_id: int,
    ano: int,
) -> dict | None:
    """Rank do foco no último ano — nacional e na UF do foco. `valores` já vem
    sem demo (saem das `linhas` do registry). Molde do /ips/ranking: rank =
    quantos têm valor MAIOR + 1; `total` = quem tem dado no ano."""
    por_mid = dict(valores)
    if foco_id not in por_mid:
        return None
    v_foco = por_mid[foco_id]
    uf = estados.get(foco_id)
    todos = list(por_mid.values())
    da_uf = [v for m, v in por_mid.items() if estados.get(m) == uf]
    return {
        "ano": ano,
        "nacional": {"rank": sum(1 for v in todos if v > v_foco) + 1, "total": len(todos)},
        "estadual": {"rank": sum(1 for v in da_uf if v > v_foco) + 1, "total": len(da_uf)},
    }
```

- [ ] **Step 4: Rodar e ver passar**

Run: `venv/Scripts/python -m pytest backend/tests/test_benchmark_service.py -q`
Expected: PASS (10 testes)

- [ ] **Step 5: Suite backend completa**

Run: `venv/Scripts/python -m pytest backend/tests -q`
Expected: 437 + 10 = 447 passed (reportar o número exato)

- [ ] **Step 6: Commit**

```bash
git add backend/app/services/benchmark_service.py backend/tests/test_benchmark_service.py
git commit -m "feat(benchmark): registry de 10 indicadores com serie anual uniforme + posicao pura"
```
(com os trailers das Global Constraints)

---

### Task 2: Schemas + router `/benchmark` + registro no app

**Files:**
- Create: `backend/app/schemas/benchmark.py`
- Create: `backend/app/api/v1/routers/benchmark.py`
- Modify: `backend/app/main.py` (bloco de imports ~L4-37 e bloco include_router ~L113-147)
- Test: `backend/tests/test_benchmark_endpoints.py`

**Interfaces:**
- Consumes (Task 1): `INDICADORES_BENCHMARK`, `IndicadorBenchmark`, `calcular_posicao(valores, estados, foco_id, ano)`.
- Consumes (existentes): `scoped_modulo("benchmark")` de `app.api.deps`; `carregar_refs(db)`, `elegiveis_por_cobertura(linhas, anos_foco)`, `parse_fixados(bruto)`, `resolver_grupo(refs, mid, elegiveis, fixados_ids)` de `app.services.pares_service`; `MunicipioRefOut` de `app.schemas.pares`.
- Produces (front, Tasks 4): `GET /benchmark/indicadores` → `[{key, label, unidade}]`; `GET /benchmark/comparativo?indicador=&fixados=` → `{indicador, foco, pares, fixados, criterio_pares, motivo, posicao, itens}` com `itens: [{ano, municipio_id, cidade, valor}]` e `posicao: {ano, nacional: {rank, total}, estadual: {rank, total}} | null`.

- [ ] **Step 1: Escrever os testes que falham**

Criar `backend/tests/test_benchmark_endpoints.py`:

```python
"""/benchmark/* — envelope de pares uniforme + posição. Handlers chamados
direto (padrão do repo, sem TestClient); contrato da rota via OpenAPI."""
import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

import app.models  # noqa: F401
from app.api.v1.routers.benchmark import comparativo_benchmark, listar_indicadores
from app.db.base import Base
from app.models.municipio import Municipio
from app.models.pib import PibAnual
from app.models.populacao import PopulacaoMunicipio
from app.models.vaf import VafAnual


@pytest.fixture()
def ctx():
    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine, tables=[
        Municipio.__table__, PopulacaoMunicipio.__table__,
        PibAnual.__table__, VafAnual.__table__,
    ])
    db = sessionmaker(bind=engine)()
    m1 = Municipio(nome="Alfa", estado="MG")
    m2 = Municipio(nome="Beta", estado="MG")
    m3 = Municipio(nome="Gama", estado="SP")
    demo = Municipio(nome="Demo", estado="MG", is_demo=True)
    db.add_all([m1, m2, m3, demo])
    db.flush()
    # Mesma faixa FPM (10k hab) para a cascata de pares escolher m2 e m3.
    for m in (m1, m2, m3, demo):
        db.add(PopulacaoMunicipio(municipio_id=m.id, ano=2024, populacao=10_000))
    db.commit()
    yield db, m1, m2, m3, demo
    db.close()


def _seed_pib(db, *linhas):
    for mid, ano, valor in linhas:
        db.add(PibAnual(municipio_id=mid, ano=ano, tipo_dado="REAL", pib_total=valor))
    db.commit()


def test_listar_indicadores_devolve_os_10():
    out = listar_indicadores(_mid=None)
    assert [i.key for i in out] == [
        "pib", "vaf", "arrecadacao", "caged", "rais",
        "estban", "comex", "pix", "bolsa_familia", "inss",
    ]
    assert out[0].label and out[0].unidade


def test_sem_municipio_devolve_envelope_vazio():
    out = comparativo_benchmark(indicador="pib", fixados=None, mid=None, db=object())
    assert out.motivo == "sem_municipio"
    assert out.indicador.key == "pib"
    assert out.posicao is None and out.itens == []


def test_indicador_desconhecido_da_400():
    with pytest.raises(HTTPException) as exc:
        comparativo_benchmark(indicador="nao_existe", fixados=None, mid=1, db=object())
    assert exc.value.status_code == 400


def test_municipio_sem_dado_devolve_sem_serie(ctx):
    db, m1, *_ = ctx
    out = comparativo_benchmark(indicador="pib", fixados=None, mid=m1.id, db=db)
    assert out.motivo == "sem_serie"
    assert out.itens == []


def test_envelope_com_pares_posicao_e_itens_uniformes(ctx):
    db, m1, m2, m3, demo = ctx
    _seed_pib(db, (m1.id, 2021, 100.0), (m1.id, 2022, 110.0),
              (m2.id, 2021, 200.0), (m2.id, 2022, 220.0),
              (m3.id, 2021, 50.0), (m3.id, 2022, 60.0),
              (demo.id, 2021, 999.0), (demo.id, 2022, 999.0))
    out = comparativo_benchmark(indicador="pib", fixados=None, mid=m1.id, db=db)
    assert out.foco.nome == "Alfa"
    assert {p.nome for p in out.pares} == {"Beta", "Gama"}
    # Posição no último ano (2022): nacional 110 < 220 → #2 de 3; MG: #2 de 2.
    assert out.posicao.ano == 2022
    assert out.posicao.nacional.rank == 2 and out.posicao.nacional.total == 3
    assert out.posicao.estadual.rank == 2 and out.posicao.estadual.total == 2
    ids = {i.municipio_id for i in out.itens}
    assert demo.id not in ids and ids == {m1.id, m2.id, m3.id}
    primeiro = out.itens[0]
    assert {"ano", "municipio_id", "cidade", "valor"} <= set(primeiro.model_dump())
    assert [i.ano for i in out.itens] == sorted(i.ano for i in out.itens)


def test_fixado_sai_dos_pares_e_entra_em_fixados(ctx):
    db, m1, m2, m3, _ = ctx
    _seed_pib(db, (m1.id, 2022, 100.0), (m2.id, 2022, 200.0), (m3.id, 2022, 50.0))
    out = comparativo_benchmark(indicador="pib", fixados=str(m3.id), mid=m1.id, db=db)
    assert [f.municipio_id for f in out.fixados] == [m3.id]
    assert all(p.municipio_id != m3.id for p in out.pares)


def test_vaf_serie_por_ano_base(ctx):
    db, m1, m2, *_ = ctx
    db.add_all([
        VafAnual(municipio_id=m1.id, ano_base=2021, pct_ipm=0.5),
        VafAnual(municipio_id=m1.id, ano_base=2022, pct_ipm=0.6),
        VafAnual(municipio_id=m2.id, ano_base=2021, pct_ipm=0.4),
        VafAnual(municipio_id=m2.id, ano_base=2022, pct_ipm=0.7),
    ])
    db.commit()
    out = comparativo_benchmark(indicador="vaf", fixados=None, mid=m1.id, db=db)
    assert out.indicador.unidade == "indice"
    assert {i.ano for i in out.itens} == {2021, 2022}
    assert out.posicao.nacional.rank == 2  # 0.6 < 0.7 em 2022


def _openapi():
    from app.main import app
    return app.openapi()


def test_rota_expoe_envelope_e_parametros():
    schema = _openapi()
    op = schema["paths"]["/api/v1/benchmark/comparativo"]["get"]
    ref = op["responses"]["200"]["content"]["application/json"]["schema"]["$ref"]
    assert ref.endswith("BenchmarkComparativoOut")
    props = schema["components"]["schemas"]["BenchmarkComparativoOut"]["properties"]
    assert {"indicador", "foco", "pares", "fixados", "criterio_pares",
            "motivo", "posicao", "itens"} <= set(props)
    params = {p["name"] for p in op.get("parameters", [])}
    assert {"municipio_id", "indicador", "fixados"} <= params


def test_rota_de_indicadores_registrada():
    assert "/api/v1/benchmark/indicadores" in _openapi()["paths"]
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `venv/Scripts/python -m pytest backend/tests/test_benchmark_endpoints.py -q`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.api.v1.routers.benchmark'`

- [ ] **Step 3: Criar os schemas**

Criar `backend/app/schemas/benchmark.py`:

```python
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
```

- [ ] **Step 4: Criar o router**

Criar `backend/app/api/v1/routers/benchmark.py`:

```python
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

    linhas_foco = ind.linhas(db, municipio_ids=[mid])
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
    serie = ind.linhas(db, municipio_ids=ids)

    # Posição sai da cobertura já carregada (sem query extra): valores de todos
    # os municípios não-demo no último ano do foco.
    ultimo_ano = max(anos_foco)
    valores_ano = [(m, v) for m, a, v in cobertura if a == ultimo_ano]
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
```

- [ ] **Step 5: Registrar no app**

Em `backend/app/main.py`, adicionar no bloco de imports de routers (junto dos `import app.api.v1.routers.X as X`, ~L8):

```python
import app.api.v1.routers.benchmark as benchmark
```

E no bloco de `include_router` (após a linha do `ips.router`, ~L147):

```python
app.include_router(benchmark.router, prefix=API_PREFIX)
```

- [ ] **Step 6: Rodar e ver passar**

Run: `venv/Scripts/python -m pytest backend/tests/test_benchmark_endpoints.py -q`
Expected: PASS (10 testes)

- [ ] **Step 7: Suite backend completa**

Run: `venv/Scripts/python -m pytest backend/tests -q`
Expected: 447 + 10 = 457 passed (reportar o número exato)

- [ ] **Step 8: Commit**

```bash
git add backend/app/schemas/benchmark.py backend/app/api/v1/routers/benchmark.py backend/app/main.py backend/tests/test_benchmark_endpoints.py
git commit -m "feat(benchmark): endpoint /benchmark/comparativo com scoped_modulo, envelope de pares e posicao"
```
(com os trailers das Global Constraints)

---

### Task 3: Leitura derivada pura (`leituraBenchmark.js`)

**Files:**
- Create: `frontend-observatorio/src/utils/leituraBenchmark.js`
- Test: `frontend-observatorio/src/utils/leituraBenchmark.test.js`

**Interfaces:**
- Produces (Task 4 depende): `montarLeitura({ posicao, itens, foco, pares }) -> [{ kind: "up"|"down"|"info", texto: string }]` — até 3 itens; item sem dado suficiente é OMITIDO (nunca vem com placeholder).

- [ ] **Step 1: Escrever os testes que falham**

Criar `frontend-observatorio/src/utils/leituraBenchmark.test.js` (puro, SEM jsdom):

```js
import { describe, it, expect } from "vitest";
import { montarLeitura } from "./leituraBenchmark";

const FOCO = { municipio_id: 1, nome: "Alfa", estado: "MG" };
const PARES = [
  { municipio_id: 2, nome: "Beta", estado: "MG" },
  { municipio_id: 3, nome: "Gama", estado: "SP" },
];
const POSICAO = {
  ano: 2023,
  nacional: { rank: 12, total: 5000 },
  estadual: { rank: 3, total: 400 },
};
// foco: 100 → 110 → 121 (alta); pares em 2023: 100 e 200 (mediana 150)
const ITENS = [
  { ano: 2021, municipio_id: 1, cidade: "Alfa", valor: 100 },
  { ano: 2022, municipio_id: 1, cidade: "Alfa", valor: 110 },
  { ano: 2023, municipio_id: 1, cidade: "Alfa", valor: 121 },
  { ano: 2023, municipio_id: 2, cidade: "Beta", valor: 100 },
  { ano: 2023, municipio_id: 3, cidade: "Gama", valor: 200 },
];

describe("montarLeitura", () => {
  it("gera as 3 leituras com dados completos", () => {
    const out = montarLeitura({ posicao: POSICAO, itens: ITENS, foco: FOCO, pares: PARES });
    expect(out).toHaveLength(3);
    expect(out[0].texto).toContain("#12 de 5000");
    expect(out[0].texto).toContain("#3 de 400");
    // 121 vs mediana 150 → 19.3% abaixo
    expect(out[1].kind).toBe("down");
    expect(out[1].texto).toContain("19,3%");
    expect(out[1].texto).toContain("abaixo");
    expect(out[2].kind).toBe("up");
    expect(out[2].texto).toContain("2021–2023");
    expect(out[2].texto).toContain("alta");
  });

  it("acima da mediana vira kind up", () => {
    const itens = ITENS.map((i) =>
      i.municipio_id === 1 && i.ano === 2023 ? { ...i, valor: 300 } : i
    );
    const out = montarLeitura({ posicao: null, itens, foco: FOCO, pares: PARES });
    const mediana = out.find((l) => l.texto.includes("mediana"));
    expect(mediana.kind).toBe("up");
    expect(mediana.texto).toContain("acima");
  });

  it("sem posição, omite a leitura de posição", () => {
    const out = montarLeitura({ posicao: null, itens: ITENS, foco: FOCO, pares: PARES });
    expect(out.some((l) => l.texto.includes("#"))).toBe(false);
  });

  it("com menos de 3 anos do foco, omite a tendência", () => {
    const itens = ITENS.filter((i) => i.municipio_id !== 1 || i.ano >= 2022);
    const out = montarLeitura({ posicao: null, itens, foco: FOCO, pares: PARES });
    expect(out.some((l) => l.texto.includes("Tendência"))).toBe(false);
  });

  it("mediana zero é omitida (sem divisão por zero)", () => {
    const itens = [
      { ano: 2023, municipio_id: 1, cidade: "Alfa", valor: 10 },
      { ano: 2023, municipio_id: 2, cidade: "Beta", valor: 0 },
    ];
    const out = montarLeitura({ posicao: null, itens, foco: FOCO, pares: [PARES[0]] });
    expect(out.some((l) => l.texto.includes("mediana"))).toBe(false);
  });

  it("série estável vira kind info", () => {
    const itens = [
      { ano: 2021, municipio_id: 1, cidade: "Alfa", valor: 100 },
      { ano: 2022, municipio_id: 1, cidade: "Alfa", valor: 90 },
      { ano: 2023, municipio_id: 1, cidade: "Alfa", valor: 100 },
    ];
    const out = montarLeitura({ posicao: null, itens, foco: FOCO, pares: [] });
    const trend = out.find((l) => l.texto.includes("Tendência"));
    expect(trend.kind).toBe("info");
    expect(trend.texto).toContain("estável");
  });

  it("sem foco devolve lista vazia", () => {
    expect(montarLeitura({ posicao: null, itens: ITENS, foco: null, pares: PARES })).toEqual([]);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run (de `frontend-observatorio/`): `npx vitest run src/utils/leituraBenchmark.test.js`
Expected: FAIL — módulo inexistente

- [ ] **Step 3: Implementar**

Criar `frontend-observatorio/src/utils/leituraBenchmark.js`:

```js
/**
 * Leitura derivada do benchmark — frases curtas calculadas do envelope, sem
 * IA: posição no ranking, distância à mediana dos pares no último ano e
 * tendência dos últimos 3 anos do foco. Item sem dado suficiente é OMITIDO
 * (a strip encolhe; nunca renderiza placeholder).
 */

const fmtPct = (v) => `${Math.abs(v).toFixed(1).replace(".", ",")}%`;

function mediana(valores) {
  const v = [...valores].sort((a, b) => a - b);
  const meio = Math.floor(v.length / 2);
  return v.length % 2 ? v[meio] : (v[meio - 1] + v[meio]) / 2;
}

export function montarLeitura({ posicao, itens, foco, pares }) {
  if (!foco) return [];
  const leituras = [];

  if (posicao?.nacional?.total) {
    const estadual = posicao.estadual?.total
      ? ` e #${posicao.estadual.rank} de ${posicao.estadual.total} no estado`
      : "";
    leituras.push({
      kind: "info",
      texto: `Em ${posicao.ano}: #${posicao.nacional.rank} de ${posicao.nacional.total} municípios no Brasil${estadual}.`,
    });
  }

  const doFoco = (itens || [])
    .filter((i) => i.municipio_id === foco.municipio_id)
    .sort((a, b) => a.ano - b.ano);
  const ultimo = doFoco[doFoco.length - 1];
  const idsPares = new Set((pares || []).map((p) => p.municipio_id));

  if (ultimo && idsPares.size) {
    const valoresPares = (itens || [])
      .filter((i) => i.ano === ultimo.ano && idsPares.has(i.municipio_id))
      .map((i) => i.valor);
    if (valoresPares.length) {
      const m = mediana(valoresPares);
      if (m !== 0) {
        const pct = ((ultimo.valor - m) / Math.abs(m)) * 100;
        const acima = pct >= 0;
        leituras.push({
          kind: acima ? "up" : "down",
          texto: `Em ${ultimo.ano}, ficou ${fmtPct(pct)} ${acima ? "acima" : "abaixo"} da mediana dos ${idsPares.size} pares.`,
        });
      }
    }
  }

  if (doFoco.length >= 3) {
    const [a, b, c] = doFoco.slice(-3);
    const dir =
      c.valor > b.valor && b.valor > a.valor ? "em alta"
      : c.valor < b.valor && b.valor < a.valor ? "em queda"
      : "estável";
    leituras.push({
      kind: dir === "em alta" ? "up" : dir === "em queda" ? "down" : "info",
      texto: `Tendência ${a.ano}–${c.ano}: ${dir}.`,
    });
  }

  return leituras;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/utils/leituraBenchmark.test.js`
Expected: PASS (7 testes)

- [ ] **Step 5: Commit**

```bash
git add frontend-observatorio/src/utils/leituraBenchmark.js frontend-observatorio/src/utils/leituraBenchmark.test.js
git commit -m "feat(benchmark): leitura derivada pura (posicao, mediana dos pares, tendencia 3 anos)"
```
(com os trailers das Global Constraints)

---

### Task 4: Aba "Comparação com pares" (`ComparacaoPares.jsx`)

**Files:**
- Create: `frontend-observatorio/src/pages/comparativo/ComparacaoPares.jsx`
- Test: `frontend-observatorio/src/pages/comparativo/ComparacaoPares.test.jsx`

**Interfaces:**
- Consumes: `GET /benchmark/indicadores` e `GET /benchmark/comparativo` (Task 2); `montarLeitura` (Task 3); `montarComparativo`/`descreverPares` de `utils/seriesComparativo`; `MultiLineChart`, `fmtMoneyShort`, `fmtMoneyFull`, `fmtNumber`, `fmtNumberShort` de `components/nid/charts`; `KpiCard`, `NidSelect`, `NidPanel`, `NidInsight`, `ComparadorMunicipios`.
- Produces (Task 5 depende): default export `ComparacaoPares` sem props (o guard de município fica no shell da página — Task 5 — que só monta este componente quando há foco).

- [ ] **Step 1: Escrever os testes que falham**

Criar `frontend-observatorio/src/pages/comparativo/ComparacaoPares.test.jsx`:

```jsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";

vi.mock("../../context/AuthContext", () => ({
  useAuth: () => ({ user: { role: "PREFEITO" } }),
}));
vi.mock("../../components/nid/charts", () => ({
  MultiLineChart: (props) => (
    <div data-testid="chart" data-series={(props.series || []).join("|")} />
  ),
  Sparkline: () => null,
  fmtMoneyShort: (v) => `R$ ${v}`,
  fmtMoneyFull: (v) => `R$ ${v}`,
  fmtNumber: (v) => String(v),
  fmtNumberShort: (v) => String(v),
}));

const ENVELOPE = {
  indicador: { key: "pib", label: "PIB Total", unidade: "brl" },
  foco: { municipio_id: 1, nome: "Alfa", estado: "MG" },
  pares: [{ municipio_id: 2, nome: "Beta", estado: "MG" }],
  fixados: [],
  criterio_pares: "mesma UF · faixa FPM 10.189–13.584 hab",
  motivo: null,
  posicao: { ano: 2023, nacional: { rank: 2, total: 10 }, estadual: { rank: 1, total: 3 } },
  itens: [
    { ano: 2021, municipio_id: 1, cidade: "Alfa", valor: 100 },
    { ano: 2022, municipio_id: 1, cidade: "Alfa", valor: 110 },
    { ano: 2023, municipio_id: 1, cidade: "Alfa", valor: 121 },
    { ano: 2023, municipio_id: 2, cidade: "Beta", valor: 90 },
  ],
};
const INDICADORES = [
  { key: "pib", label: "PIB Total", unidade: "brl" },
  { key: "caged", label: "Saldo CAGED", unidade: "numero" },
];

vi.mock("../../services/api", () => ({
  default: {
    get: vi.fn((url) =>
      Promise.resolve({ data: url.endsWith("/indicadores") ? INDICADORES : ENVELOPE })
    ),
  },
}));

import api from "../../services/api";
import ComparacaoPares from "./ComparacaoPares";

beforeEach(() => vi.clearAllMocks());

describe("ComparacaoPares", () => {
  it("mostra posição nacional e estadual e o subtítulo dos pares", async () => {
    render(<ComparacaoPares />);
    expect(await screen.findByText("#2 de 10")).toBeInTheDocument();
    expect(screen.getByText("#1 de 3")).toBeInTheDocument();
    expect(screen.getByText(/Alfa vs\. 1 par/)).toBeInTheDocument();
  });

  it("monta o gráfico com foco e par e a leitura derivada", async () => {
    render(<ComparacaoPares />);
    const chart = await screen.findByTestId("chart");
    expect(chart.dataset.series).toBe("Alfa|Beta");
    expect(screen.getByText(/acima da mediana/)).toBeInTheDocument();
  });

  it("trocar o indicador refaz a busca com a chave nova", async () => {
    render(<ComparacaoPares />);
    await screen.findByText("#2 de 10");
    fireEvent.change(screen.getByLabelText("Escolher indicador"), {
      target: { value: "caged" },
    });
    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith("/benchmark/comparativo", {
        params: { indicador: "caged" },
      })
    );
  });

  it("posição ausente mostra travessão", async () => {
    api.get.mockImplementation((url) =>
      Promise.resolve({
        data: url.endsWith("/indicadores")
          ? INDICADORES
          : { ...ENVELOPE, posicao: null, motivo: "sem_serie", foco: null, pares: [], itens: [] },
      })
    );
    render(<ComparacaoPares />);
    expect((await screen.findAllByText("—")).length).toBeGreaterThanOrEqual(2);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/pages/comparativo/ComparacaoPares.test.jsx`
Expected: FAIL — módulo inexistente

- [ ] **Step 3: Implementar o componente**

Criar `frontend-observatorio/src/pages/comparativo/ComparacaoPares.jsx`:

```jsx
import { useEffect, useMemo, useState } from "react";
import api from "../../services/api";
import KpiCard from "../../components/KpiCard";
import NidSelect from "../../components/nid/NidSelect";
import { NidPanel, NidInsight } from "../../components/nid/Panel";
import ComparadorMunicipios from "../../components/nid/ComparadorMunicipios";
import {
  MultiLineChart,
  fmtMoneyShort,
  fmtMoneyFull,
  fmtNumber,
  fmtNumberShort,
} from "../../components/nid/charts";
import { montarComparativo, descreverPares } from "../../utils/seriesComparativo";
import { montarLeitura } from "../../utils/leituraBenchmark";

const VAZIO = {
  indicador: null, foco: null, pares: [], fixados: [],
  criterio_pares: null, motivo: null, posicao: null, itens: [],
};

const fmtIndice = (v) => Number(v).toFixed(4);
const fmtUsdFull = (v) =>
  `US$ ${Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`;
const fmtUsdShort = (v) => {
  const a = Math.abs(v);
  if (a >= 1e9) return `US$ ${(v / 1e9).toFixed(1)}B`;
  if (a >= 1e6) return `US$ ${(v / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `US$ ${(v / 1e3).toFixed(0)}k`;
  return `US$ ${v}`;
};
// COMEX é USD — formatar como R$ replicaria o erro da tela de ranking antiga.
const FMT = {
  brl: { eixo: fmtMoneyShort, tip: fmtMoneyFull },
  usd: { eixo: fmtUsdShort, tip: fmtUsdFull },
  numero: { eixo: fmtNumberShort, tip: fmtNumber },
  indice: { eixo: fmtIndice, tip: fmtIndice },
};

// Paleta dos fixados — mesma regra do PIB/VAF: fora de --accent-2 (foco) e
// --accent-1 (hover de par), senão o fixado se confunde com os dois.
const CORES_FIXADOS = ["var(--accent-4)", "var(--accent-5)", "var(--accent-3)"];

export default function ComparacaoPares() {
  const [indicadores, setIndicadores] = useState([]);
  const [indicador, setIndicador] = useState("pib");
  const [fixadosIds, setFixadosIds] = useState([]);
  const [data, setData] = useState(VAZIO);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/benchmark/indicadores")
      .then((r) => setIndicadores(r.data || []))
      .catch(() => setIndicadores([]));
  }, []);

  useEffect(() => {
    setLoading(true);
    api.get("/benchmark/comparativo", {
      params: {
        indicador,
        ...(fixadosIds.length ? { fixados: fixadosIds.join(",") } : {}),
      },
    })
      .then((r) => setData(r.data || VAZIO))
      .catch(() => setData(VAZIO))
      .finally(() => setLoading(false));
  }, [indicador, fixadosIds]);

  const cmp = useMemo(
    () => montarComparativo({
      itens: data.itens, foco: data.foco, pares: data.pares, fixados: data.fixados,
      anoKey: "ano", valorKey: "valor",
    }),
    [data]
  );
  const series = useMemo(
    () => (cmp.focusSeries ? [cmp.focusSeries, ...cmp.peerSeries, ...cmp.pinnedSeries] : []),
    [cmp]
  );
  const cores = useMemo(
    () => series.map((s) => {
      const iFix = cmp.pinnedSeries.indexOf(s);
      return iFix >= 0 ? CORES_FIXADOS[iFix % CORES_FIXADOS.length] : "var(--accent-1)";
    }),
    [series, cmp.pinnedSeries]
  );

  const fmt = FMT[data.indicador?.unidade] || FMT.numero;
  const leituras = useMemo(
    () => montarLeitura({ posicao: data.posicao, itens: data.itens, foco: data.foco, pares: data.pares }),
    [data]
  );
  const pos = data.posicao;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-[var(--text-dim)]">Indicador:</span>
        <NidSelect
          value={indicador}
          onChange={(e) => setIndicador(e.target.value)}
          ariaLabel="Escolher indicador"
        >
          {indicadores.map((i) => (
            <option key={i.key} value={i.key}>{i.label}</option>
          ))}
        </NidSelect>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <KpiCard
          label="Posição no Brasil"
          period={pos ? String(pos.ano) : undefined}
          value={pos ? `#${pos.nacional.rank} de ${pos.nacional.total}` : "—"}
        />
        <KpiCard
          label={`Posição em ${data.foco?.estado ?? "sua UF"}`}
          period={pos ? String(pos.ano) : undefined}
          value={pos ? `#${pos.estadual.rank} de ${pos.estadual.total}` : "—"}
        />
      </div>

      {(cmp.focusSeries || data.motivo) && (
        <NidPanel
          title={`Evolução — ${data.indicador?.label ?? ""}`}
          sub={descreverPares(data)}
        >
          <ComparadorMunicipios fixados={data.fixados} onChange={setFixadosIds} />
          <MultiLineChart
            data={cmp.data}
            series={series}
            colors={cores}
            height={280}
            yFmt={fmt.eixo}
            tipFmt={fmt.tip}
            focusSeries={cmp.focusSeries}
            pinnedSeries={cmp.pinnedSeries}
            peerCount={cmp.peerSeries.length}
            showMedian
            showBand
            legend
          />
        </NidPanel>
      )}

      {!loading && leituras.length > 0 && (
        <div className="nid-insights">
          {leituras.map((l) => (
            <NidInsight key={l.texto} kind={l.kind}>{l.texto}</NidInsight>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/pages/comparativo/ComparacaoPares.test.jsx`
Expected: PASS (4 testes). Se o `getByLabelText("Escolher indicador")` não encontrar o select, verificar como `NidSelect` propaga `ariaLabel` (deve virar `aria-label` do `<select>`) e ajustar a query para `screen.getByRole("combobox", { name: "Escolher indicador" })` — o copy NÃO muda.

- [ ] **Step 5: Commit**

```bash
git add frontend-observatorio/src/pages/comparativo/ComparacaoPares.jsx frontend-observatorio/src/pages/comparativo/ComparacaoPares.test.jsx
git commit -m "feat(benchmark): aba comparacao com pares — posicao, evolucao com fixados e leitura derivada"
```
(com os trailers das Global Constraints)

---

### Task 5: `RankingTab` extraído + página em 2 abas com guard

**Files:**
- Create: `frontend-observatorio/src/pages/comparativo/RankingTab.jsx`
- Modify: `frontend-observatorio/src/pages/comparativo/ComparativoPage.jsx` (reescrita completa — 228 linhas hoje)
- Test: `frontend-observatorio/src/pages/comparativo/ComparativoPage.test.jsx`

**Interfaces:**
- Consumes: `ComparacaoPares` (Task 4), `NidPageHeader` de `components/nid/Panel`, `NidTabBar`, `SelecioneMunicipio` de `components/nid/SelecioneMunicipio`, `useAuth`/`useViewAs`.
- Produces: default export `BenchmarkPage` (nome mantido); `RankingTab` default export sem props.

**Regras da extração (RankingTab):** o conteúdo atual da página migra INTEIRO
menos o bloco do `<h1>` (vira `NidPageHeader` no shell) e o wrapper
`motion.div` (vai para o shell). Três correções permitidas, NADA além delas:
(1) pills de dataset trocam `bg-blue-600`/`hover:border-blue-400` por tokens;
(2) `tooltipFormatter` (morto — não é passado a nenhum componente) é removido;
(3) `fmtBRL`/`fmtNum` locais são substituídos por `fmtMoneyFull`/`fmtNumber`
de `components/nid/charts` (implementações equivalentes; `valor` nunca chega
null aos formatadores — o map usa `?? 0`). O highlight âmbar da linha "seu
município", o catálogo de 11 DATASETS, filtros de UF/ano, `HBarChart` com
`showPosition` e a tabela completa ficam como estão.

- [ ] **Step 1: Escrever o teste da página (falha)**

Criar `frontend-observatorio/src/pages/comparativo/ComparativoPage.test.jsx`:

```jsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const authState = { user: { role: "ADMIN_GLOBAL" } };
const viewAsState = { viewAsId: null };
vi.mock("../../context/AuthContext", () => ({ useAuth: () => authState }));
vi.mock("../../context/ViewAsContext", () => ({ useViewAs: () => viewAsState }));
vi.mock("./ComparacaoPares", () => ({ default: () => <div data-testid="aba-pares" /> }));
vi.mock("./RankingTab", () => ({ default: () => <div data-testid="aba-ranking" /> }));

import BenchmarkPage from "./ComparativoPage";

beforeEach(() => {
  vi.clearAllMocks();
  authState.user = { role: "ADMIN_GLOBAL" };
  viewAsState.viewAsId = null;
});

describe("BenchmarkPage — shell de abas", () => {
  it("header e as 2 abas presentes; pares é a default", () => {
    viewAsState.viewAsId = 42;
    render(<BenchmarkPage />);
    expect(screen.getByText("Benchmark Municipal")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Comparação com pares" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Ranking nacional" })).toBeInTheDocument();
    expect(screen.getByTestId("aba-pares")).toBeInTheDocument();
  });

  it("global sem view-as: aba pares mostra SelecioneMunicipio, sem montar o componente", () => {
    render(<BenchmarkPage />);
    expect(screen.getByText("Selecione um município")).toBeInTheDocument();
    expect(screen.queryByTestId("aba-pares")).toBeNull();
  });

  it("ranking nacional continua acessível para global sem view-as", () => {
    render(<BenchmarkPage />);
    fireEvent.click(screen.getByRole("tab", { name: "Ranking nacional" }));
    expect(screen.getByTestId("aba-ranking")).toBeInTheDocument();
    expect(screen.queryByText("Selecione um município")).toBeNull();
  });

  it("usuário municipal vê a aba pares direto", () => {
    authState.user = { role: "PREFEITO" };
    render(<BenchmarkPage />);
    expect(screen.getByTestId("aba-pares")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/pages/comparativo/ComparativoPage.test.jsx`
Expected: FAIL — `./RankingTab` inexistente (e a página atual não tem abas)

- [ ] **Step 3: Criar `RankingTab.jsx`**

Criar `frontend-observatorio/src/pages/comparativo/RankingTab.jsx` movendo o conteúdo de `ComparativoPage.jsx` conforme as regras da extração acima. Esqueleto exato (corpo do JSX idêntico ao atual, exceto o marcado):

```jsx
import { useEffect, useState, useMemo } from "react";
import api from "../../services/api";
import { useAuth } from "../../context/AuthContext";
import { HBarChart, fmtMoneyFull, fmtNumber } from "../../components/nid/charts";
import NidSelect from "../../components/nid/NidSelect";

const DATASETS = [
  { key: "arrecadacao", label: "Arrecadação", endpoint: "/comparativo/arrecadacao", metrica: "total", fmt: fmtMoneyFull, hasAno: true },
  { key: "pib", label: "PIB", endpoint: "/pib/ranking", metrica: "pib_total", fmt: fmtMoneyFull, hasAno: true },
  { key: "caged", label: "CAGED", endpoint: "/comparativo/caged", metrica: "saldo_total", fmt: fmtNumber, hasAno: true },
  { key: "rais", label: "RAIS", endpoint: "/comparativo/rais", metrica: "total_vinculos", fmt: fmtNumber, hasAno: true },
  { key: "estban", label: "Bancos", endpoint: "/estban/comparativo", metrica: "credito_total", fmt: fmtMoneyFull, hasAno: true },
  { key: "comex", label: "Comex", endpoint: "/comex/comparativo", metrica: "exportacoes", fmt: fmtMoneyFull, hasAno: true },
  { key: "empresas", label: "Empresas", endpoint: "/empresas/comparativo", metrica: "total_empresas", fmt: fmtNumber, hasAno: false },
  { key: "bolsa_familia", label: "Bolsa Família", endpoint: "/bolsa_familia/comparativo", metrica: "valor_total", fmt: fmtMoneyFull, hasAno: true },
  { key: "inss", label: "INSS", endpoint: "/inss/comparativo", metrica: "valor_total", fmt: fmtMoneyFull, hasAno: true },
  { key: "pix", label: "PIX", endpoint: "/pix/comparativo", metrica: "volume_total", fmt: fmtMoneyFull, hasAno: true },
  { key: "pe_de_meia", label: "Pé-de-Meia", endpoint: "/pe_de_meia/comparativo", metrica: "total_estudantes", fmt: fmtNumber, hasAno: true },
];

// METRIC_LABELS, CURRENT_YEAR e YEAR_OPTIONS: copiar EXATAMENTE da página atual.

export default function RankingTab() {
  // Estados, os 2 useEffect de fetch, chartData e myId: copiar EXATAMENTE da
  // página atual (linhas 48-90). NÃO copiar tooltipFormatter (morto).
  // JSX: copiar da página atual a partir da row de filtros (linha 111) até o
  // fechamento da tabela (linha 223), SEM o motion.div externo e SEM o bloco
  // do <h1> (linhas 101-108) — envolver em:
  //   <div className="space-y-8"> ... </div>
  // Única mudança dentro do JSX — as pills de dataset:
  //   className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
  //     activeKey === ds.key
  //       ? "text-white shadow bg-[var(--accent-1)]"
  //       : "bg-[var(--panel)] text-[var(--text-dim)] border border-[var(--border)] hover:border-[var(--accent-1)]"
  //   }`}
}
```

(As instruções em comentário acima são para o implementador — o arquivo final
não carrega esses comentários; carrega o código copiado.)

- [ ] **Step 4: Reescrever `ComparativoPage.jsx`**

Substituir TODO o conteúdo por:

```jsx
import { useState } from "react";
import { motion } from "framer-motion";
import { useAuth } from "../../context/AuthContext";
import { useViewAs } from "../../context/ViewAsContext";
import { NidPageHeader } from "../../components/nid/Panel";
import NidTabBar from "../../components/nid/NidTabBar";
import SelecioneMunicipio from "../../components/nid/SelecioneMunicipio";
import ComparacaoPares from "./ComparacaoPares";
import RankingTab from "./RankingTab";

const ABAS = [
  { key: "pares", label: "Comparação com pares" },
  { key: "ranking", label: "Ranking nacional" },
];

export default function BenchmarkPage() {
  const { user } = useAuth();
  const { viewAsId } = useViewAs();
  // Guard só na aba de pares (ela precisa de um foco). O ranking nacional é
  // uma visão do país inteiro e continua acessível sem view-as.
  const needsMunicipio = user?.role === "ADMIN_GLOBAL" && viewAsId == null;
  const [aba, setAba] = useState("pares");

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      <NidPageHeader
        title="Benchmark Municipal"
        sub="Seu município comparado aos pares e ao país."
      />
      <NidTabBar tabs={ABAS} value={aba} onChange={setAba} ariaLabel="Abas do benchmark" />
      {aba === "pares"
        ? (needsMunicipio ? <SelecioneMunicipio /> : <ComparacaoPares />)
        : <RankingTab />}
    </motion.div>
  );
}
```

- [ ] **Step 5: Rodar os testes da pasta e ver passar**

Run: `npx vitest run src/pages/comparativo`
Expected: PASS (testes de página + ComparacaoPares)

- [ ] **Step 6: Suite frontend completa**

Run (de `frontend-observatorio/`): `npx vitest run`
Expected: 300 + 15 = 315 passed (reportar o número exato; `navStructure.test.js` e `titulosPaginas.test.js` intocados e verdes)

- [ ] **Step 7: Lint dos arquivos tocados (sem erro novo vs base)**

Run: `npx eslint src/pages/comparativo/ComparativoPage.jsx src/pages/comparativo/RankingTab.jsx src/pages/comparativo/ComparacaoPares.jsx src/utils/leituraBenchmark.js`
Expected: nenhum erro além dos falso-positivos conhecidos (`motion` unused). Comparar `ComparativoPage.jsx` com a base via `git show`.

- [ ] **Step 8: Commit**

```bash
git add frontend-observatorio/src/pages/comparativo/RankingTab.jsx frontend-observatorio/src/pages/comparativo/ComparativoPage.jsx frontend-observatorio/src/pages/comparativo/ComparativoPage.test.jsx
git commit -m "feat(benchmark): pagina em 2 abas — comparacao com pares (default) e ranking nacional preservado"
```
(com os trailers das Global Constraints)
