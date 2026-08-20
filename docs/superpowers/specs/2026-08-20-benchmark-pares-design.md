# Benchmark por Pares (F6-A — melhorias por módulo) — Design

**Data:** 2026-08-20
**Status:** aprovado pelo usuário (2026-08-20 — front + backend p/ mais indicadores; 10 indicadores; página em 2 abas)

## Objetivo

Entregar o módulo 04 do documento do cliente ("Melhorar" o Benchmark):
posição do município, evolução, diferenças em relação a comparáveis e
leitura interpretada — substituindo a página atual (ranking plano de um ano)
por uma leitura por pares, generalizando a infraestrutura que já existe para
PIB/VAF.

## Decisões aprovadas

- **Escopo front + backend** (sem migração): endpoint único parametrizado de
  benchmark com registry de **10 indicadores** — PIB, VAF (IPM),
  Arrecadação, Saldo CAGED, Vínculos RAIS, Crédito ESTBAN, Exportações
  COMEX, Volume PIX, Bolsa Família (valor), INSS (valor).
- **Página em 2 abas** (`NidTabBar`, estado local): "Comparação com pares"
  (nova, default) e "Ranking nacional" (a tela atual preservada — nada
  some). IA do benchmark fica fora (futuro).
- **Gate de plano no servidor**: o endpoint novo usa
  `scoped_modulo("benchmark")` — a chave que hoje só existe na sidebar
  passa a valer na API. Endpoints comparativos existentes não mudam.

## Arquitetura — Backend (sem migração)

### 1. Router novo `backend/app/api/v1/routers/benchmark.py`

- `GET /benchmark/indicadores` → lista `[{key, label, unidade}]` do registry
  (para o front montar o seletor sem hardcode).
- `GET /benchmark/comparativo?indicador=<key>&fixados=<ids-csv>` — deps
  `scoped_modulo("benchmark")` + `get_db`. Resposta:

```
{
  indicador: { key, label, unidade },          # unidade: "brl" | "numero" | "indice"
  foco, pares, fixados, criterio_pares, motivo # envelope ParesMeta existente
  posicao: { ano, nacional: {rank, total}, estadual: {rank, total} } | null,
  itens: [ { ano, municipio_id, cidade, valor } ]
}
```

- Fluxo espelha `comparativo_pib` (`pib.py:103-166`): anos do foco →
  `sem_serie` → `elegiveis_por_cobertura` → `resolver_grupo(carregar_refs,
  ...)` → séries de foco+pares+fixados. `pares_service` reusado como está
  (`parse_fixados` máx. 3).
- **`posicao`** (molde do `/ips/ranking`): no último ano do foco, rank =
  count(municípios não-demo com valor maior) + 1, nacional e na UF do foco;
  `total` = municípios com dado naquele ano. `null` quando `motivo` impede.
- Registry `INDICADORES_BENCHMARK` (no próprio router ou
  `services/benchmark_service.py` se crescer): cada entrada
  `{ label, unidade, serie(db, municipio_ids, anos=None) }` devolvendo
  linhas `(municipio_id, ano, valor)` com agregação anual:
  - `pib`: `PibAnual.pib_total` por ano
  - `vaf`: `VafAnual.pct_ipm` por `ano_base` (unidade "indice")
  - `arrecadacao`: `SUM(ArrecadacaoMensal.valor_total)` por ano
  - `caged`: `SUM(CagedMovimentacao.saldo)` por ano
  - `rais`: total de vínculos por ano (espelhar a agregação do
    `/comparativo/rais` existente)
  - `estban`: `SUM(valor_operacoes_credito)` por `extract(year,
    data_referencia)`
  - `comex`: `SUM(valor_usd)` das exportações por ano (mesmo filtro
    case-insensitive validado na F5)
  - `pix`: `SUM(vl_pagador_pf + vl_pagador_pj)` por ano
  - `bolsa_familia`: `SUM(valor_total)` por ano
  - `inss`: `SUM(valor_total)` por ano
  (Cada consulta espelha o endpoint comparativo/branch homônimo existente —
  mesma fonte de verdade in-file dos precedentes F4/F5.)
- `indicador` desconhecido → 400 legível. Municípios demo sempre fora.

### 2. Schemas

`backend/app/schemas/benchmark.py`: `IndicadorBenchmarkOut{key,label,unidade}`,
`PosicaoBenchmark{ano, nacional: RankTotal, estadual: RankTotal}`,
`RankTotal{rank,total}`, `BenchmarkComparativoOut` = ParesMeta (reuso de
`MunicipioRefOut`) + `indicador` + `posicao` + `itens:
[BenchmarkItem{ano, municipio_id, cidade, valor}]`.

## Arquitetura — Frontend

`src/pages/comparativo/ComparativoPage.jsx` reconstruída (export
`BenchmarkPage` mantido; rota/label/chave intocados):

- `NidPageHeader` "Benchmark Municipal" + sub "Seu município comparado aos
  pares e ao país."; guard `needsMunicipio` + `SelecioneMunicipio` (padrão
  F3/F4/F5).
- `NidTabBar` com 2 abas (estado local, não rota):
  1. **"Comparação com pares" (default)** — componente novo
     `src/pages/comparativo/ComparacaoPares.jsx`:
     - Seletor de indicador (`NidSelect` alimentado por
       `GET /benchmark/indicadores`).
     - Fetch `GET /benchmark/comparativo?indicador=&fixados=` (refetch em
       indicador/fixados).
     - **Posição**: 2 `KpiCard` — "#{rank} de {total} · Brasil" e "#{rank}
       de {total} · {UF}" (ano no `sub`); `posicao null` → "—".
     - **Evolução**: `NidPanel` com `ComparadorMunicipios
       fixados={data.fixados}` + `MultiLineChart` via `montarComparativo`
       (`anoKey: "ano"`, `valorKey: "valor"`) com
       `focusSeries/pinnedSeries/peerCount/showMedian/showBand/legend`;
       `sub={descreverPares(data)}`; formato do eixo/tooltip por `unidade`
       (brl → fmtMoneyShort/Full; numero → fmtNumber; indice → 4 casas).
     - **Leitura derivada**: strip de até 3 `NidInsight` gerados por helper
       puro novo `src/utils/leituraBenchmark.js` →
       `montarLeitura({posicao, itens, foco, pares, unidade})`:
       (a) posição nacional/UF em frase; (b) distância % à mediana dos
       pares no último ano (acima/abaixo); (c) tendência do foco nos
       últimos 3 anos (subindo/caindo/estável). Sem dado suficiente → item
       omitido.
  2. **"Ranking nacional"** — componente `src/pages/comparativo/RankingTab.jsx`
     extraído da página atual SEM mudanças de comportamento além de:
     cores hardcoded `bg-blue-600` → tokens (`.nid-tab`/accents), remoção
     do `tooltipFormatter` morto, e os formatadores locais trocados pelos
     de `charts.jsx`. Seletor de 11 datasets, UF/ano, HBar `showPosition`,
     tabela completa: preservados.
- `PlanGate` interno não é necessário (a rota já é gateada pelo
  `PlanLockedView` via chave `benchmark`; o endpoint novo agora valida no
  servidor).

## Testes

- Backend `test_benchmark_endpoints.py` (fixture sqlite): registry — os 10
  indicadores listados por `/benchmark/indicadores`; envelope para 2
  indicadores (um brl, um indice) com foco+pares+valores; `posicao` (rank
  nacional/estadual corretos com 3 municípios semeados); `motivo=sem_serie`
  sem dados; `indicador` inválido → 400; fixados respeitados; demo fora.
- Front: `leituraBenchmark.test.js` (unit puro — 3 leituras, omissões);
  `ComparacaoPares.test.jsx` (jsdom, api mockado — posição, seletor troca
  indicador, descreverPares no sub); página (abas + guard).
- Invariantes de navegação/títulos intocados. Suites completas verdes
  (baselines: back 437, front 300).

## Fora de escopo

- IA do benchmark (dataset de insights novo) — melhoria futura.
- Paginação/virtualização da tabela de ranking; indicadores per capita;
  mudanças nos endpoints comparativos existentes; alterar as páginas
  PIB/VAF.

## Riscos

- **Semânticas anuais distintas por indicador** (VAF por ano-base; ESTBAN
  crédito acumulado do ano; COMEX só exportações): mitigado pelo `label`/
  `unidade` do registry e subtítulos explícitos; cada consulta espelha o
  endpoint homônimo existente.
- **Custo das queries cross-município**: mesmas agregações dos comparativos
  existentes (sem limit hoje); o endpoint novo restringe a
  foco+pares+fixados (≤10 municípios) — mais leve que os atuais. A posição
  usa uma agregação nacional de UM ano (aceitável; o /ips/ranking já faz
  igual).
