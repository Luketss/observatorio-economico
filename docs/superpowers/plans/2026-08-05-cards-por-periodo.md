# Cards de dados por período (default 12 meses) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** As 12 páginas de dados (9 com FilterBar + RAIS/CAGED + Empresas) abrem com default de 12 meses ANCORADOS NO ÚLTIMO DADO da série (Empresas: 12 meses de calendário — cadastro corrente); cards de FLUXO recalculam pelo período filtrado derivando da MESMA série dos gráficos; cards de SNAPSHOT ficam com subtítulo explícito. Nenhum card muda de valor sem o sub dizer o que ele significa.

**Architecture:** Helper puro `utils/periodoCards.js` (`janela12m`, `janela12mAnos`, `dentroDoFiltro`, e na Task 4 `janela12mCalendario`/`intervaloISO`) + diffs pequenos na `FilterBar` (`detectPreset` reconhece a janela ancorada; `describeFilter` vira mês-aware). As derivações de card ficam nos `useMemo` das páginas. Único backend: `resumo_empresas` ganha `abertas_de`/`abertas_ate` opcionais + campo `abertas_periodo` (COUNT por `data_inicio`; zero migração). Spec: `docs/superpowers/specs/2026-08-05-cards-por-periodo-design.md`.

**Tech Stack:** React 19 + Vite/Vitest (frontend-observatorio), FastAPI + Pydantic + pytest (backend).

## Global Constraints

- **Zero migração de schema, zero dependência nova, zero testes de componente React** (só funções puras — vitest importa `describeFilter`/`detectPreset` da FilterBar, que são puros).
- Gates por task: em `frontend-observatorio/` → `npm run test` e `npm run build` exit 0; da RAIZ → `venv/Scripts/python -m pytest backend/tests -q` exit 0 (269 atuais + novos).
- Branch: `feat/cards-periodo`, criada na Task 1 a partir da `main`.
- WIP do usuário — NÃO commitar: `.claude/settings.local.json`, `dados/`, `docs/superpowers/plans/2026-05-06-ips-feature.md`; `README.md` conferir `git status` antes (se modificado, não incluir nos commits).
- Default aplicado **UMA vez** no primeiro fetch, com guard `filtroTocado` (ref): interação do usuário que chegue antes da resposta NUNCA é sobrescrita. Empresas não precisa de guard (default síncrono no `useState`).
- Semântica de janela: quando ano+mês estão presentes dos dois lados, o filtro é uma JANELA composta (`ano*12+mes`) — o filtro antigo das páginas (mês como faixa independente do ano) excluiria TUDO numa janela que cruza o ano (ex.: Ago/2023–Jul/2024). Páginas mensais migram para `dentroDoFiltro`; páginas só-de-ano mantêm o filtro atual (janela só de anos, semântica idêntica).
- Filtro sem interseção com a série → cards de fluxo mostram "—" (mesma série vazia dos gráficos); snapshots não mudam. Limpar o filtro ("Tudo") → fluxo soma tudo, com sub coerente.

---

## File Map

| File | Action |
|---|---|
| `frontend-observatorio/src/utils/periodoCards.js` | Create (T1; T4 acrescenta 2 helpers) |
| `frontend-observatorio/src/utils/periodoCards.test.js` | Create (T1; T4 acrescenta) |
| `frontend-observatorio/src/components/FilterBar.jsx` | Modify (T1 — `detectPreset` + `describeFilter`) |
| `frontend-observatorio/src/pages/arrecadacao/ArrecadacaoPage.jsx` | Modify (T2) |
| `frontend-observatorio/src/pages/pix/PixPage.jsx` | Modify (T2) |
| `frontend-observatorio/src/pages/beneficios/BolsaFamiliaPage.jsx` | Modify (T2) |
| `frontend-observatorio/src/pages/beneficios/PeDeMeiaPage.jsx` | Modify (T2 — + chip no header) |
| `frontend-observatorio/src/pages/inss/InssPage.jsx` | Modify (T2) |
| `frontend-observatorio/src/pages/comex/ComexPage.jsx` | Modify (T3) |
| `frontend-observatorio/src/pages/estban/EstbanPage.jsx` | Modify (T3) |
| `frontend-observatorio/src/pages/pib/PibPage.jsx` | Modify (T3) |
| `frontend-observatorio/src/pages/vaf/VafPage.jsx` | Modify (T3) |
| `frontend-observatorio/src/pages/rais/RaisPage.jsx` | Modify (T3) |
| `frontend-observatorio/src/pages/caged/CagedPage.jsx` | **Sem mudança** (T3 — verificação de rótulos apenas) |
| `frontend-observatorio/src/pages/empresas/EmpresasPage.jsx` | Modify (T4) |
| `backend/app/api/v1/routers/empresas.py` | Modify (T4) |
| `backend/app/schemas/empresa.py` | Modify (T4) |
| `backend/tests/test_empresas_resumo_periodo.py` | Create (T4) |

---

## Classificação card a card — labels/subs FINAIS das 12 páginas

(exigência da spec: "nenhum card muda de valor sem o sub dizer o que ele significa". `{filtro}` = `describeFilter(filters)`, ex.: "Ago/2023 – Jul/2024", "Ano 2024", "2023–2024".)

| Página | Card (label final) | Tipo | Valor | Sub/foot FINAL |
|---|---|---|---|---|
| Arrecadação | Total Arrecadado | FLUXO | soma de `total` da série filtrada | `{filtro}` \|\| "Todos os períodos" |
| Arrecadação | Último Ano | SNAPSHOT | `resumo.total_ultimo_ano` | "Ano {último da rawSerie} · último da série" |
| Arrecadação | Média Mensal | FLUXO | soma/nº de meses filtrados | "Por mês · {filtro}" \|\| "Por mês em toda a série" |
| Arrecadação | Crescimento | SNAPSHOT | `resumo.crescimento_percentual` | "vs ano anterior · última variação da série" |
| PIX | Volume PF (Pagamentos) | FLUXO | soma `vl_pagador_pf` | `{filtro}` \|\| "Total acumulado" |
| PIX | Volume PJ (Pagamentos) | FLUXO | soma `vl_pagador_pj` | `{filtro}` \|\| "Total acumulado" |
| PIX | Total de Transações | FLUXO | soma `qt_pagador_pf+qt_pagador_pj` | "PF + PJ (pagadores) · {filtro}" \|\| "PF + PJ (pagadores)" |
| Bolsa Família | Beneficiários por Mês | FLUXO (média) | média mensal `total_beneficiarios` | "Média mensal · {filtro}" \|\| "Média mensal · toda a série" |
| Bolsa Família | Valor Total | FLUXO (soma) | soma `valor_total` | "Repasses · {filtro}" \|\| "Repasses de toda a série" |
| Bolsa Família | Benef. Primeira Infância | FLUXO (média) | média mensal `beneficiarios_primeira_infancia` | "Crianças até 7 anos · média/mês · {filtro}" \|\| "Crianças até 7 anos · média/mês" |
| Pé-de-Meia | Estudantes por Mês | FLUXO (média) | média mensal `total_estudantes` | "Média mensal · {filtro}" \|\| "Média mensal · toda a série" |
| Pé-de-Meia | Valor Total | FLUXO (soma) | soma `valor_total` | "Repasses · {filtro}" \|\| "Repasses totais" |
| INSS | Total Benefícios | FLUXO | soma `quantidade_beneficios` | `{filtro}` \|\| "Toda a série" |
| INSS | Valor Total | FLUXO | soma `valor_anual` | "Pagamentos · {filtro}" \|\| "Pagamentos totais" |
| Comex | Total Exportado | FLUXO | soma `exportacoes` do `chartSerie` | `{filtro}` \|\| "Todo o período" (agora VERDADEIRO) |
| Comex | Total Importado | FLUXO | soma `importacoes` do `chartSerie` | `{filtro}` \|\| "Todo o período" |
| Comex | Balança Comercial | FLUXO | exp − imp do período | "Exportações − Importações · {filtro}" \|\| "Exportações − Importações" |
| ESTBAN | Agências | SNAPSHOT | `resumo.qtd_agencias` | "Unidades ativas · último mês da série" |
| ESTBAN | Operações de Crédito | SNAPSHOT | `resumo.total_operacoes_credito` | "Saldo no último mês da série" |
| ESTBAN | Total Depósitos | SNAPSHOT | `resumo.total_depositos` | "Vista + Poupança + Prazo · último mês da série" |
| PIB | PIB Último Ano | SNAPSHOT | `resumo.pib_ultimo_ano` | "Ano {resumo.ultimo_ano} · último da série" |
| PIB | Crescimento | SNAPSHOT | `resumo.crescimento_percentual` | "Variação vs ano anterior · última da série" |
| PIB | Anos na Série | derivado do filtro (continua) | `serie.length` | "{primeiro} – {último}" (sem mudança) |
| VAF | IPM Último Ano | SNAPSHOT | `resumo.ipm_ultimo_ano` | "Ano-base {resumo.ultimo_ano} · último da série" |
| VAF | Variação do IPM | SNAPSHOT | `resumo.variacao_ipm_percentual` | "Variação vs ano anterior · última da série" |
| VAF | Anos na Série | derivado do filtro (continua) | `serie.length` | "{primeiro} – {último}" (sem mudança) |
| RAIS | Total de Vínculos | ano ativo (continua) | derivado da série | badge último ano; foot "vs ano anterior" (sem mudança) |
| RAIS | Ativos em 31/12 | ano ativo (continua) | `metricasAtual` | foot "estoque ao final do ano" (sem mudança) |
| RAIS | Remuneração Média | **passa a ANO ATIVO** | média client-side da série no `anoAtivo` | badge `{anoAtivo}`; foot **"no ano selecionado"** |
| RAIS | PCD | ano ativo (continua) | `metricasAtual` | foot "participação no estoque" (sem mudança) |
| CAGED | Saldo · Acumulado | SNAPSHOT histórico | `resumo.saldo_total` | badge "histórico" (JÁ rotulado — sem mudança) |
| CAGED | Admissões | ano ativo | `totaisAno.admissoes` | foot "X no histórico" (JÁ rotulado — sem mudança) |
| CAGED | Desligamentos | ano ativo | `totaisAno.desligamentos` | foot "X no histórico" (JÁ rotulado — sem mudança) |
| CAGED | Salário Médio · Admissão | derivado de `/caged/salario` | fora do escopo (sem mudança) | — |
| Empresas | **Abertas no Período** (NOVO) | FLUXO | `resumo.abertas_periodo` (re-fetch) | "Por data de abertura · {filtro}" \|\| "Por data de abertura · todo o histórico" |
| Empresas | Total Empresas | SNAPSHOT | `resumo.total_empresas` | "Cadastro atual" |
| Empresas | Empresas Ativas | SNAPSHOT | `resumo.total_ativas` | "{pct} do total · cadastro atual" |
| Empresas | MEI | SNAPSHOT | `resumo.total_mei` | "{pct} do total · cadastro atual" |
| Empresas | Simples Nacional | SNAPSHOT | `resumo.total_simples` | "{pct} do total · cadastro atual" |

**Defaults por página:** PIX, Bolsa Família, Pé-de-Meia, Comex → `janela12m` mensal (12 meses ancorados no último dado). INSS, PIB, VAF → `janela12m` anual (último ano com dado — o "12m" de série anual). Arrecadação, ESTBAN → `janela12mAnos` (FilterBar só tem ano sobre série mensal: `{anoMax-1..anoMax}`, exatamente o range do botão "12m" da FilterBar, ancorado no último ano COM DADO). RAIS/CAGED → pills de ano já defaultam no último ano (sem mudança de default). Empresas → `janela12mCalendario` (cadastro corrente — aqui calendário é correto).

---

### Task 1: Helper puro `periodoCards` + FilterBar reconhece a janela ancorada (TDD)

**Files:**
- Create: `frontend-observatorio/src/utils/periodoCards.js`
- Create: `frontend-observatorio/src/utils/periodoCards.test.js`
- Modify: `frontend-observatorio/src/components/FilterBar.jsx`

**Interfaces:**
- Consumes: nada (puro). Os testes importam `describeFilter`/`detectPreset` de `../components/FilterBar` (funções puras; vitest usa o pipeline do Vite com `@vitejs/plugin-react`, então importar um `.jsx` sem renderizar componente funciona).
- Produces (T2/T3/T4 dependem): `janela12m(serie, extrair) -> {yearFrom, monthFrom, yearTo, monthTo}` (strings, shape do estado da FilterBar), `janela12mAnos(serie, extrairAno) -> idem`, `dentroDoFiltro(item, filtro, extrair) -> boolean`; `detectPreset` exportado; `describeFilter` mês-aware.

- [ ] **Step 0: Criar a branch**

```bash
cd c:\Users\lucas\Documents\projetos\dashboard_prefeituras
git checkout main && git checkout -b feat/cards-periodo
```

- [ ] **Step 1: Escrever os testes que falham**

```js
// frontend-observatorio/src/utils/periodoCards.test.js
import { describe, it, expect } from "vitest";
import { janela12m, janela12mAnos, dentroDoFiltro } from "./periodoCards";
import { describeFilter, detectPreset } from "../components/FilterBar";

const mensal = (d) => ({ ano: d.ano, mes: d.mes });

describe("janela12m (série mensal)", () => {
  it("ancora no último dado, não no calendário (dataset com defasagem)", () => {
    const serie = [];
    for (let m = 1; m <= 12; m++) serie.push({ ano: 2023, mes: m });
    for (let m = 1; m <= 7; m++) serie.push({ ano: 2024, mes: m });
    expect(janela12m(serie, mensal)).toEqual({
      yearFrom: "2023", monthFrom: "8", yearTo: "2024", monthTo: "7",
    });
  });

  it("último dado em dezembro → janela dentro do mesmo ano", () => {
    const serie = Array.from({ length: 24 }, (_, i) => ({
      ano: 2023 + Math.floor(i / 12), mes: (i % 12) + 1,
    }));
    expect(janela12m(serie, mensal)).toEqual({
      yearFrom: "2024", monthFrom: "1", yearTo: "2024", monthTo: "12",
    });
  });

  it("clampa o início no primeiro ponto (série curta; 1 ponto → o próprio ponto)", () => {
    expect(janela12m([{ ano: 2024, mes: 3 }, { ano: 2024, mes: 7 }], mensal)).toEqual({
      yearFrom: "2024", monthFrom: "3", yearTo: "2024", monthTo: "7",
    });
    expect(janela12m([{ ano: 2024, mes: 7 }], mensal)).toEqual({
      yearFrom: "2024", monthFrom: "7", yearTo: "2024", monthTo: "7",
    });
  });

  it("série vazia → filtro vazio (Tudo)", () => {
    expect(janela12m([], mensal)).toEqual({
      yearFrom: "", monthFrom: "", yearTo: "", monthTo: "",
    });
  });

  it("normaliza competência AAAAMM e data_referencia via extrator", () => {
    const porCompetencia = (d) => ({
      ano: +String(d.competencia).slice(0, 4),
      mes: +String(d.competencia).slice(4, 6),
    });
    expect(janela12m([{ competencia: "202407" }], porCompetencia)).toEqual({
      yearFrom: "2024", monthFrom: "7", yearTo: "2024", monthTo: "7",
    });
    const porData = (d) => ({
      ano: +String(d.data_referencia).slice(0, 4),
      mes: +String(d.data_referencia).slice(5, 7),
    });
    expect(janela12m([{ data_referencia: "2024-07-01" }], porData).yearTo).toBe("2024");
  });
});

describe("janela12m (série anual)", () => {
  it("último ano com dado — o '12m' de uma série anual", () => {
    const serie = [{ ano: 2019 }, { ano: 2020 }, { ano: 2021 }];
    expect(janela12m(serie, (d) => ({ ano: d.ano }))).toEqual({
      yearFrom: "2021", monthFrom: "", yearTo: "2021", monthTo: "",
    });
  });
});

describe("janela12mAnos (FilterBar só de ano sobre série mensal)", () => {
  it("último ano com dado e o anterior — mesmo range do botão 12m", () => {
    const serie = [{ data_referencia: "2023-01-01" }, { data_referencia: "2025-01-01" }];
    const extrair = (d) => parseInt(String(d.data_referencia).substring(0, 4));
    expect(janela12mAnos(serie, extrair)).toEqual({
      yearFrom: "2024", monthFrom: "", yearTo: "2025", monthTo: "",
    });
  });

  it("um ano só → o próprio ano; vazia → Tudo", () => {
    expect(janela12mAnos([{ ano: 2024 }], (d) => d.ano).yearFrom).toBe("2024");
    expect(janela12mAnos([], (d) => d.ano)).toEqual({
      yearFrom: "", monthFrom: "", yearTo: "", monthTo: "",
    });
  });
});

describe("dentroDoFiltro", () => {
  const f = { yearFrom: "2023", monthFrom: "8", yearTo: "2024", monthTo: "7" };

  it("janela cruzando o ano inclui meses 'menores' do ano seguinte", () => {
    expect(dentroDoFiltro({ ano: 2024, mes: 1 }, f, mensal)).toBe(true);
    expect(dentroDoFiltro({ ano: 2023, mes: 8 }, f, mensal)).toBe(true);
    expect(dentroDoFiltro({ ano: 2024, mes: 7 }, f, mensal)).toBe(true);
    expect(dentroDoFiltro({ ano: 2023, mes: 7 }, f, mensal)).toBe(false);
    expect(dentroDoFiltro({ ano: 2024, mes: 8 }, f, mensal)).toBe(false);
  });

  it("só anos → semântica atual preservada", () => {
    const g = { yearFrom: "2023", yearTo: "2024", monthFrom: "", monthTo: "" };
    expect(dentroDoFiltro({ ano: 2022, mes: 12 }, g, mensal)).toBe(false);
    expect(dentroDoFiltro({ ano: 2024, mes: 12 }, g, mensal)).toBe(true);
  });

  it("só meses (sem ano) → faixa de meses em todos os anos (legado)", () => {
    const g = { yearFrom: "", yearTo: "", monthFrom: "3", monthTo: "6" };
    expect(dentroDoFiltro({ ano: 2020, mes: 4 }, g, mensal)).toBe(true);
    expect(dentroDoFiltro({ ano: 2024, mes: 7 }, g, mensal)).toBe(false);
  });

  it("filtro vazio deixa tudo passar", () => {
    const vazio = { yearFrom: "", yearTo: "", monthFrom: "", monthTo: "" };
    expect(dentroDoFiltro({ ano: 1999, mes: 1 }, vazio, mensal)).toBe(true);
  });
});

describe("FilterBar — detectPreset/describeFilter com a janela ancorada", () => {
  it("último ano sozinho (span 1 terminando no maxYear) é reconhecido como 12m", () => {
    expect(detectPreset("2024", "2024", 2024)).toBe("12m");
  });

  it("presets existentes preservados", () => {
    expect(detectPreset("2023", "2024", 2024)).toBe("12m");
    expect(detectPreset("2020", "2024", 2024)).toBe("5a");
    expect(detectPreset("2015", "2024", 2024)).toBe("10a");
    expect(detectPreset("", "", 2024)).toBe("tudo");
    expect(detectPreset("2020", "2023", 2024)).toBe("personalizar");
    expect(detectPreset("2020", "2020", 2024)).toBe("personalizar"); // span 1 fora do maxYear
  });

  it("describeFilter com janela completa mostra Mês/Ano – Mês/Ano", () => {
    expect(describeFilter({ yearFrom: "2023", monthFrom: "8", yearTo: "2024", monthTo: "7" }))
      .toBe("Ago/2023 – Jul/2024");
  });

  it("describeFilter de ano único mostra 'Ano X'", () => {
    expect(describeFilter({ yearFrom: "2024", yearTo: "2024" })).toBe("Ano 2024");
  });

  it("describeFilter sem meses continua igual", () => {
    expect(describeFilter({ yearFrom: "2023", yearTo: "2024" })).toBe("2023–2024");
    expect(describeFilter({ yearFrom: "", yearTo: "" })).toBe(null);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falham**

```bash
cd frontend-observatorio && npm run test
```

Expected: FAIL — `periodoCards.js` não existe; `detectPreset` não é exportado; `describeFilter` sem meses/ano-único.

- [ ] **Step 3: Criar `periodoCards.js`**

```js
// frontend-observatorio/src/utils/periodoCards.js
/**
 * Janela de período para os KPI cards ("12 meses ancorados no último dado").
 *
 * Shape de retorno = estado da FilterBar (strings):
 *   { yearFrom, monthFrom, yearTo, monthTo }   — "" = sem restrição ("Tudo").
 *
 * A janela NUNCA é ancorada no calendário: datasets com defasagem (PIB/VAF
 * ~2 anos) abririam vazios. Exceção deliberada: Empresas (cadastro corrente)
 * usa janela12mCalendario — lá o calendário é o correto (Task 4).
 */

const VAZIO = { yearFrom: "", monthFrom: "", yearTo: "", monthTo: "" };

// Chave linear de mês (ano*12 + mes-1) — permite janela que cruza o ano.
const chaveMes = (ano, mes) => ano * 12 + (mes - 1);

/**
 * Janela de 12 meses terminando no ÚLTIMO ponto da série.
 * `extrair(item)` → { ano, mes } (mensal) ou { ano } (anual) ou null (ignora).
 *  - Mensal: 12 meses ancorados no último dado; início clampado no primeiro
 *    ponto da série (série de 1 ponto → o próprio ponto).
 *  - Anual (nenhum ponto tem mes): { yearFrom: anoUltimo, yearTo: anoUltimo }.
 *  - Série vazia: filtro vazio ("Tudo").
 */
export function janela12m(serie, extrair) {
  const pontos = (serie || []).map(extrair).filter((p) => p && p.ano != null);
  if (!pontos.length) return { ...VAZIO };

  const mensais = pontos.filter((p) => p.mes != null && !Number.isNaN(+p.mes));
  if (!mensais.length) {
    const anoUltimo = Math.max(...pontos.map((p) => +p.ano));
    return { yearFrom: String(anoUltimo), monthFrom: "", yearTo: String(anoUltimo), monthTo: "" };
  }

  const chaves = mensais.map((p) => chaveMes(+p.ano, +p.mes));
  const fim = Math.max(...chaves);
  const inicio = Math.max(Math.min(...chaves), fim - 11);
  return {
    yearFrom: String(Math.floor(inicio / 12)),
    monthFrom: String((inicio % 12) + 1),
    yearTo: String(Math.floor(fim / 12)),
    monthTo: String((fim % 12) + 1),
  };
}

/**
 * Aproximação de "12m" para páginas cuja FilterBar só tem ANO mas cuja série
 * é mensal (Arrecadação, ESTBAN): { anoMax-1 .. anoMax } — exatamente o range
 * que o botão "12m" da FilterBar produz (presetRange), ancorado no último ano
 * COM DADO. Início clampado no primeiro ano da série; vazia → "Tudo".
 */
export function janela12mAnos(serie, extrairAno) {
  const anos = (serie || [])
    .map(extrairAno)
    .filter((a) => a != null && !Number.isNaN(+a))
    .map(Number);
  if (!anos.length) return { ...VAZIO };
  const max = Math.max(...anos);
  const min = Math.min(...anos);
  return { yearFrom: String(Math.max(min, max - 1)), monthFrom: "", yearTo: String(max), monthTo: "" };
}

/**
 * Filtro client-side compartilhado com semântica de JANELA:
 *  - ano+mês presentes no mesmo lado → comparação composta (ano*12+mes),
 *    permitindo janelas que cruzam o ano (Ago/2023 – Jul/2024). O filtro
 *    antigo das páginas (mês como faixa independente do ano) excluía TUDO
 *    nesse caso.
 *  - só ano → comportamento atual (ano >= / <=).
 *  - só mês (sem ano) → comportamento atual (faixa de meses em todos os anos).
 * `extrair(item)` → { ano, mes } (mes opcional).
 */
export function dentroDoFiltro(item, filtro, extrair) {
  const { yearFrom = "", yearTo = "", monthFrom = "", monthTo = "" } = filtro || {};
  const p = extrair(item);
  if (!p || p.ano == null) return true;
  const ano = +p.ano;
  const mes = p.mes != null ? +p.mes : null;
  const k = mes != null ? chaveMes(ano, mes) : null;

  if (yearFrom) {
    if (monthFrom && k != null) {
      if (k < chaveMes(+yearFrom, +monthFrom)) return false;
    } else if (ano < +yearFrom) {
      return false;
    }
  }
  if (yearTo) {
    if (monthTo && k != null) {
      if (k > chaveMes(+yearTo, +monthTo)) return false;
    } else if (ano > +yearTo) {
      return false;
    }
  }
  if (!yearFrom && monthFrom && mes != null && mes < +monthFrom) return false;
  if (!yearTo && monthTo && mes != null && mes > +monthTo) return false;
  return true;
}
```

- [ ] **Step 4: Diff na FilterBar (2 funções, nada de UI)**

Em `frontend-observatorio/src/components/FilterBar.jsx`.

**Edit 1 — `describeFilter` mês-aware + "Ano X":**

ANTES:
```jsx
export function describeFilter(filter) {
  if (!filter) return null;
  const { yearFrom, yearTo, _preset } = filter;

  // Named presets take priority for the chip label
  if (_preset === "12m") return "Últimos 12 meses";
  if (_preset === "5a")  return "Últimos 5 anos";
  if (_preset === "10a") return "Últimos 10 anos";
  if (_preset === "tudo") return null; // no chip when "Tudo" is active

  if (!yearFrom && !yearTo) return null;
  if (yearFrom && yearTo) return `${yearFrom}–${yearTo}`;
  if (yearFrom) return `desde ${yearFrom}`;
  return `até ${yearTo}`;
}
```

DEPOIS:
```jsx
export function describeFilter(filter) {
  if (!filter) return null;
  const { yearFrom, yearTo, monthFrom, monthTo, _preset } = filter;

  // Named presets take priority for the chip label
  if (_preset === "12m") return "Últimos 12 meses";
  if (_preset === "5a")  return "Últimos 5 anos";
  if (_preset === "10a") return "Últimos 10 anos";
  if (_preset === "tudo") return null; // no chip when "Tudo" is active

  // Janela completa ano+mês (default "12m ancorado"): "Ago/2023 – Jul/2024".
  // MONTHS é declarado mais abaixo no módulo, mas só é lido em runtime
  // (describeFilter é chamada depois da avaliação do módulo).
  if (yearFrom && yearTo && monthFrom && monthTo) {
    const de = MONTHS[+monthFrom - 1]?.label ?? monthFrom;
    const ate = MONTHS[+monthTo - 1]?.label ?? monthTo;
    return `${de}/${yearFrom} – ${ate}/${yearTo}`;
  }

  if (!yearFrom && !yearTo) return null;
  if (yearFrom && yearTo && yearFrom === yearTo) return `Ano ${yearFrom}`;
  if (yearFrom && yearTo) return `${yearFrom}–${yearTo}`;
  if (yearFrom) return `desde ${yearFrom}`;
  return `até ${yearTo}`;
}
```

**Edit 2 — `detectPreset` exportado + span 1 = "12m":**

ANTES:
```jsx
function detectPreset(yearFrom, yearTo, maxYear) {
  const cy = maxYear;
  if (!yearFrom && !yearTo) return "tudo";
  if (!yearFrom || !yearTo) return "personalizar";
  const from = Number(yearFrom);
  const to   = Number(yearTo);
  if (to === cy) {
    const span = to - from + 1;
    if (span === 2)  return "12m";
    if (span === 5)  return "5a";
    if (span === 10) return "10a";
  }
  return "personalizar";
}
```

DEPOIS:
```jsx
export function detectPreset(yearFrom, yearTo, maxYear) {
  const cy = maxYear;
  if (!yearFrom && !yearTo) return "tudo";
  if (!yearFrom || !yearTo) return "personalizar";
  const from = Number(yearFrom);
  const to   = Number(yearTo);
  if (to === cy) {
    const span = to - from + 1;
    // span 1 terminando no último ano com dado = janela "12m" ancorada
    // (jan..dez do último ano, ou série anual reduzida ao último ano).
    // Sem isso o default cairia em "personalizar" e abriria os selects.
    if (span === 1)  return "12m";
    if (span === 2)  return "12m";
    if (span === 5)  return "5a";
    if (span === 10) return "10a";
  }
  return "personalizar";
}
```

(Nenhuma outra linha da FilterBar muda: `presetRange`, `handlePreset`, UI e props seguem idênticos — clicar "12m" continua produzindo `{cy-1..cy}` sem meses, que `detectPreset` já reconhecia.)

- [ ] **Step 5: Rodar os testes até passarem (suite + build)**

```bash
cd frontend-observatorio && npm run test && npm run build
```

Expected: 17 novos passando; suite completa e build exit 0.

- [ ] **Step 6: Commit**

```bash
git add frontend-observatorio/src/utils/periodoCards.js frontend-observatorio/src/utils/periodoCards.test.js frontend-observatorio/src/components/FilterBar.jsx
git commit -m "feat(periodo): helper janela12m/dentroDoFiltro + FilterBar reconhece janela ancorada (TDD)"
```

---

### Task 2: Lote mensal A — Arrecadação, PIX, Bolsa Família, Pé-de-Meia (+chip), INSS

**Files:**
- Modify: `ArrecadacaoPage.jsx`, `PixPage.jsx`, `BolsaFamiliaPage.jsx`, `PeDeMeiaPage.jsx`, `InssPage.jsx` (em `frontend-observatorio/src/pages/...`)

**Interfaces:**
- Consumes: `janela12m`/`janela12mAnos`/`dentroDoFiltro` (T1), `describeFilter`/`clearFilter` (FilterBar).
- Produces: padrão de página "default 12m com guard" reutilizado na T3/T4: ref `filtroTocado` + wrapper `mudarFiltros` ligado em `FilterBar onChange` e no `onClear` do chip; default aplicado no `.then` do primeiro fetch.
- Sem testes novos (política: sem testes de componente). Gate = suite vitest existente + build.

Em páginas onde TODOS os cards passam a derivar da série (PIX, Bolsa, Pé-de-Meia, INSS), o fetch de `/resumo` fica morto e é REMOVIDO (estado + chamada) — nenhum outro consumidor usa esses endpoints no frontend.

- [ ] **Step 1: ArrecadacaoPage.jsx**

Edit 1a — imports:

ANTES:
```jsx
import { useEffect, useMemo, useState } from "react";
```
DEPOIS:
```jsx
import { useEffect, useMemo, useRef, useState } from "react";
```

ANTES:
```jsx
import FilterBar, { describeFilter, clearFilter } from "../../components/FilterBar";
```
DEPOIS:
```jsx
import FilterBar, { describeFilter, clearFilter } from "../../components/FilterBar";
import { janela12mAnos } from "../../utils/periodoCards";
```

Edit 1b — guard + default no fetch:

ANTES:
```jsx
  const [filters, setFilters] = useState({ yearFrom: "", yearTo: "" });
  const [comparar, setComparar] = useState(false);
  const cmp = useMemo(() => comparePanelData(rawSerie, { valueKey: "total" }), [rawSerie]);

  useEffect(() => {
    Promise.all([api.get("/arrecadacao/serie"), api.get("/arrecadacao/resumo")])
      .then(([serieRes, resumoRes]) => {
        setRawSerie(serieRes.data || []);
        setResumo(resumoRes.data);
      })
      .catch((err) => console.error("Erro ao carregar arrecadação:", err))
      .finally(() => setLoading(false));
  }, []);
```
DEPOIS:
```jsx
  const [filters, setFilters] = useState({ yearFrom: "", yearTo: "" });
  const [comparar, setComparar] = useState(false);
  const cmp = useMemo(() => comparePanelData(rawSerie, { valueKey: "total" }), [rawSerie]);

  // Default "12m ancorado no último dado": aplicado UMA vez no primeiro fetch;
  // interação do usuário que chegue antes (filtroTocado) tem prioridade.
  const filtroTocado = useRef(false);
  const mudarFiltros = (v) => { filtroTocado.current = true; setFilters(v); };

  useEffect(() => {
    Promise.all([api.get("/arrecadacao/serie"), api.get("/arrecadacao/resumo")])
      .then(([serieRes, resumoRes]) => {
        const raw = serieRes.data || [];
        setRawSerie(raw);
        setResumo(resumoRes.data);
        if (!filtroTocado.current) setFilters(janela12mAnos(raw, (d) => d.ano));
      })
      .catch((err) => console.error("Erro ao carregar arrecadação:", err))
      .finally(() => setLoading(false));
  }, []);
```

Edit 1c — cards (fluxo deriva da série filtrada):

ANTES:
```jsx
  const cards = [
    {
      label: "Total Arrecadado",
      value: resumo ? fmtBRL(resumo.total_geral) : "—",
      sub: "Todos os períodos",
      dataset: "arrecadacao",
      indicadorKey: "total_arrecadado",
    },
    {
      label: "Último Ano",
      value: resumo ? fmtBRL(resumo.total_ultimo_ano) : "—",
      sub: serie.length ? `Ano ${serie[serie.length - 1].ano}` : null,
      dataset: "arrecadacao",
      indicadorKey: "ultimo_ano",
    },
    {
      label: "Média Mensal",
      value: resumo ? fmtBRL(resumo.media_mensal) : "—",
      sub: "Por mês no período",
      dataset: "arrecadacao",
      indicadorKey: "media_mensal",
    },
    {
      label: "Crescimento",
      value:
        resumo?.crescimento_percentual != null
          ? `${resumo.crescimento_percentual > 0 ? "+" : ""}${resumo.crescimento_percentual.toFixed(1)}%`
          : "—",
      sub: "vs ano anterior",
      dataset: "arrecadacao",
      indicadorKey: "crescimento_anual",
    },
  ];
```
DEPOIS:
```jsx
  // Fluxo: somas derivadas da MESMA série filtrada dos gráficos (linhas mensais).
  const totalPeriodo = useMemo(
    () => serie.reduce((s, d) => s + (d.total || 0), 0),
    [serie]
  );
  const filtroLabel = describeFilter(filters);

  const cards = [
    {
      label: "Total Arrecadado",
      value: serie.length ? fmtBRL(totalPeriodo) : "—",
      sub: filtroLabel || "Todos os períodos",
      dataset: "arrecadacao",
      indicadorKey: "total_arrecadado",
    },
    {
      label: "Último Ano",
      value: resumo ? fmtBRL(resumo.total_ultimo_ano) : "—",
      sub: rawSerie.length ? `Ano ${rawSerie[rawSerie.length - 1].ano} · último da série` : null,
      dataset: "arrecadacao",
      indicadorKey: "ultimo_ano",
    },
    {
      label: "Média Mensal",
      value: serie.length ? fmtBRL(totalPeriodo / serie.length) : "—",
      sub: filtroLabel ? `Por mês · ${filtroLabel}` : "Por mês em toda a série",
      dataset: "arrecadacao",
      indicadorKey: "media_mensal",
    },
    {
      label: "Crescimento",
      value:
        resumo?.crescimento_percentual != null
          ? `${resumo.crescimento_percentual > 0 ? "+" : ""}${resumo.crescimento_percentual.toFixed(1)}%`
          : "—",
      sub: "vs ano anterior · última variação da série",
      dataset: "arrecadacao",
      indicadorKey: "crescimento_anual",
    },
  ];
```

Edit 1d — guard no chip e na FilterBar:

ANTES:
```jsx
          onClear: () => setFilters(clearFilter()),
```
DEPOIS:
```jsx
          onClear: () => mudarFiltros(clearFilter()),
```

ANTES:
```jsx
      <FilterBar id="filter-bar-arrecadacao" years={years} value={filters} onChange={setFilters} />
```
DEPOIS:
```jsx
      <FilterBar id="filter-bar-arrecadacao" years={years} value={filters} onChange={mudarFiltros} />
```

- [ ] **Step 2: PixPage.jsx**

Edit 2a — imports:

ANTES:
```jsx
import { useEffect, useMemo, useState } from "react";
```
DEPOIS:
```jsx
import { useEffect, useMemo, useRef, useState } from "react";
```

ANTES:
```jsx
import FilterBar, { describeFilter, clearFilter } from "../../components/FilterBar";
```
DEPOIS:
```jsx
import FilterBar, { describeFilter, clearFilter } from "../../components/FilterBar";
import { janela12m, dentroDoFiltro } from "../../utils/periodoCards";
```

Edit 2b — estado (remove `resumo`) + guard:

ANTES:
```jsx
  const [rawSerie, setRawSerie] = useState([]);
  const [resumo, setResumo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ yearFrom: "", yearTo: "", monthFrom: "", monthTo: "" });
```
DEPOIS:
```jsx
  const [rawSerie, setRawSerie] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ yearFrom: "", yearTo: "", monthFrom: "", monthTo: "" });

  // Default "12m ancorado no último dado" (guard contra sobrescrever o usuário).
  const filtroTocado = useRef(false);
  const mudarFiltros = (v) => { filtroTocado.current = true; setFilters(v); };
```

Edit 2c — fetch (sem `/pix/resumo`, com default):

ANTES:
```jsx
  useEffect(() => {
    Promise.all([api.get("/pix/serie"), api.get("/pix/resumo")])
      .then(([serieRes, resumoRes]) => {
        setRawSerie(serieRes.data || []);
        setResumo(resumoRes.data);
      })
      .catch((err) => console.error("Erro ao carregar PIX:", err))
      .finally(() => setLoading(false));
  }, []);
```
DEPOIS:
```jsx
  useEffect(() => {
    api.get("/pix/serie")
      .then((serieRes) => {
        const raw = serieRes.data || [];
        setRawSerie(raw);
        if (!filtroTocado.current) {
          setFilters(janela12m(raw, (d) => ({ ano: d.ano, mes: d.mes })));
        }
      })
      .catch((err) => console.error("Erro ao carregar PIX:", err))
      .finally(() => setLoading(false));
  }, []);
```

Edit 2d — filtro client-side com semântica de janela:

ANTES:
```jsx
  const serie = useMemo(() => {
    const { yearFrom, yearTo, monthFrom, monthTo } = filters;
    return rawSerie
      .filter((d) => {
        if (yearFrom && d.ano < +yearFrom) return false;
        if (yearTo && d.ano > +yearTo) return false;
        if (monthFrom && d.mes < +monthFrom) return false;
        if (monthTo && d.mes > +monthTo) return false;
        return true;
      })
      .map((d) => ({
        ...d,
        periodo: `${d.ano}-${String(d.mes).padStart(2, "0")}`,
      }))
      .sort((a, b) => a.periodo.localeCompare(b.periodo));
  }, [rawSerie, filters]);
```
DEPOIS:
```jsx
  const serie = useMemo(() => {
    return rawSerie
      .filter((d) => dentroDoFiltro(d, filters, (x) => ({ ano: x.ano, mes: x.mes })))
      .map((d) => ({
        ...d,
        periodo: `${d.ano}-${String(d.mes).padStart(2, "0")}`,
      }))
      .sort((a, b) => a.periodo.localeCompare(b.periodo));
  }, [rawSerie, filters]);
```

Edit 2e — cards:

ANTES:
```jsx
  const cards = [
    {
      label: "Volume PF (Pagamentos)",
      value: resumo ? fmtBRL(resumo.volume_total_pf) : "—",
      sub: "Total acumulado",
      accent: "var(--accent-1)",
      dataset: "pix",
      indicadorKey: "volume_pf",
    },
    {
      label: "Volume PJ (Pagamentos)",
      value: resumo ? fmtBRL(resumo.volume_total_pj) : "—",
      sub: "Total acumulado",
      accent: "var(--accent-5)",
      dataset: "pix",
      indicadorKey: "volume_pj",
    },
    {
      label: "Total de Transações",
      value: resumo ? fmtNum(resumo.total_transacoes) : "—",
      sub: "PF + PJ (pagadores)",
      accent: "var(--accent-3)",
      dataset: "pix",
      indicadorKey: "volume_total",
    },
  ];
```
DEPOIS:
```jsx
  // Fluxo: somas do período filtrado (mesma série dos gráficos).
  const totais = useMemo(
    () =>
      serie.reduce(
        (acc, d) => ({
          pf: acc.pf + (d.vl_pagador_pf || 0),
          pj: acc.pj + (d.vl_pagador_pj || 0),
          qt: acc.qt + (d.qt_pagador_pf || 0) + (d.qt_pagador_pj || 0),
        }),
        { pf: 0, pj: 0, qt: 0 }
      ),
    [serie]
  );
  const filtroLabel = describeFilter(filters);

  const cards = [
    {
      label: "Volume PF (Pagamentos)",
      value: serie.length ? fmtBRL(totais.pf) : "—",
      sub: filtroLabel || "Total acumulado",
      accent: "var(--accent-1)",
      dataset: "pix",
      indicadorKey: "volume_pf",
    },
    {
      label: "Volume PJ (Pagamentos)",
      value: serie.length ? fmtBRL(totais.pj) : "—",
      sub: filtroLabel || "Total acumulado",
      accent: "var(--accent-5)",
      dataset: "pix",
      indicadorKey: "volume_pj",
    },
    {
      label: "Total de Transações",
      value: serie.length ? fmtNum(totais.qt) : "—",
      sub: filtroLabel ? `PF + PJ (pagadores) · ${filtroLabel}` : "PF + PJ (pagadores)",
      accent: "var(--accent-3)",
      dataset: "pix",
      indicadorKey: "volume_total",
    },
  ];
```

Edit 2f — guard no chip e na FilterBar:

ANTES:
```jsx
          onClear: () => setFilters(clearFilter()),
```
DEPOIS:
```jsx
          onClear: () => mudarFiltros(clearFilter()),
```

ANTES:
```jsx
      <FilterBar id="filter-bar-pix" years={years} showMonths value={filters} onChange={setFilters} />
```
DEPOIS:
```jsx
      <FilterBar id="filter-bar-pix" years={years} showMonths value={filters} onChange={mudarFiltros} />
```

- [ ] **Step 3: BolsaFamiliaPage.jsx**

Edit 3a — imports (mesmo par de edits do PIX):

ANTES:
```jsx
import { useEffect, useMemo, useState } from "react";
```
DEPOIS:
```jsx
import { useEffect, useMemo, useRef, useState } from "react";
```

ANTES:
```jsx
import FilterBar, { describeFilter, clearFilter } from "../../components/FilterBar";
```
DEPOIS:
```jsx
import FilterBar, { describeFilter, clearFilter } from "../../components/FilterBar";
import { janela12m, dentroDoFiltro } from "../../utils/periodoCards";
```

Edit 3b — estado (remove `resumo`) + guard:

ANTES:
```jsx
  const [rawSerie, setRawSerie] = useState([]);
  const [resumo, setResumo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ yearFrom: "", yearTo: "", monthFrom: "", monthTo: "" });
```
DEPOIS:
```jsx
  const [rawSerie, setRawSerie] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ yearFrom: "", yearTo: "", monthFrom: "", monthTo: "" });

  // Default "12m ancorado no último dado" (guard contra sobrescrever o usuário).
  const filtroTocado = useRef(false);
  const mudarFiltros = (v) => { filtroTocado.current = true; setFilters(v); };
```

Edit 3c — fetch:

ANTES:
```jsx
  useEffect(() => {
    Promise.all([
      api.get("/bolsa_familia/serie"),
      api.get("/bolsa_familia/resumo"),
    ])
      .then(([serieRes, resumoRes]) => {
        const raw = (serieRes.data || []).map((item) => ({
          ...item,
          periodo: `${item.ano}-${String(item.mes).padStart(2, "0")}`,
        }));
        raw.sort((a, b) => a.periodo.localeCompare(b.periodo));
        setRawSerie(raw);
        setResumo(resumoRes.data);
      })
      .catch((err) => console.error("Erro ao carregar Bolsa Família:", err))
      .finally(() => setLoading(false));
  }, []);
```
DEPOIS:
```jsx
  useEffect(() => {
    api.get("/bolsa_familia/serie")
      .then((serieRes) => {
        const raw = (serieRes.data || []).map((item) => ({
          ...item,
          periodo: `${item.ano}-${String(item.mes).padStart(2, "0")}`,
        }));
        raw.sort((a, b) => a.periodo.localeCompare(b.periodo));
        setRawSerie(raw);
        if (!filtroTocado.current) {
          setFilters(janela12m(raw, (d) => ({ ano: d.ano, mes: d.mes })));
        }
      })
      .catch((err) => console.error("Erro ao carregar Bolsa Família:", err))
      .finally(() => setLoading(false));
  }, []);
```

Edit 3d — filtro com janela:

ANTES:
```jsx
  const serie = useMemo(() => {
    const { yearFrom, yearTo, monthFrom, monthTo } = filters;
    return rawSerie.filter((d) => {
      if (yearFrom && d.ano < +yearFrom) return false;
      if (yearTo && d.ano > +yearTo) return false;
      if (monthFrom && d.mes < +monthFrom) return false;
      if (monthTo && d.mes > +monthTo) return false;
      return true;
    });
  }, [rawSerie, filters]);
```
DEPOIS:
```jsx
  const serie = useMemo(
    () => rawSerie.filter((d) => dentroDoFiltro(d, filters, (x) => ({ ano: x.ano, mes: x.mes }))),
    [rawSerie, filters]
  );
```

Edit 3e — cards:

ANTES:
```jsx
  const cards = [
    {
      label: "Total Beneficiários",
      value: fmtNum(resumo?.total_beneficiarios),
      sub: "No período",
      accent: "var(--accent-1)",
      dataset: "bolsa_familia",
      indicadorKey: "total_beneficiarios",
    },
    {
      label: "Valor Total",
      value: fmtBRL(resumo?.valor_total),
      sub: "Repasses totais",
      accent: "var(--accent-5)",
      dataset: "bolsa_familia",
      indicadorKey: "valor_total",
    },
    {
      label: "Benef. Primeira Infância",
      value: fmtNum(resumo?.beneficiarios_primeira_infancia),
      sub: "Crianças até 7 anos",
      accent: "var(--accent-3)",
      dataset: "bolsa_familia",
      indicadorKey: "media_por_beneficiario",
    },
  ];
```
DEPOIS:
```jsx
  // Fluxo: contagens mensais viram MÉDIA no período (somar duplicaria famílias);
  // valores em R$ são SOMA do período. Mesma série filtrada dos gráficos.
  const totaisPeriodo = useMemo(() => {
    if (!serie.length) return null;
    const soma = serie.reduce(
      (acc, d) => ({
        benef: acc.benef + (d.total_beneficiarios || 0),
        valor: acc.valor + (d.valor_total || 0),
        pi: acc.pi + (d.beneficiarios_primeira_infancia || 0),
      }),
      { benef: 0, valor: 0, pi: 0 }
    );
    return {
      mediaBenef: soma.benef / serie.length,
      valorTotal: soma.valor,
      mediaPi: soma.pi / serie.length,
    };
  }, [serie]);
  const filtroLabel = describeFilter(filters);

  const cards = [
    {
      label: "Beneficiários por Mês",
      value: totaisPeriodo ? fmtNum(Math.round(totaisPeriodo.mediaBenef)) : "—",
      sub: filtroLabel ? `Média mensal · ${filtroLabel}` : "Média mensal · toda a série",
      accent: "var(--accent-1)",
      dataset: "bolsa_familia",
      indicadorKey: "total_beneficiarios",
    },
    {
      label: "Valor Total",
      value: totaisPeriodo ? fmtBRL(totaisPeriodo.valorTotal) : "—",
      sub: filtroLabel ? `Repasses · ${filtroLabel}` : "Repasses de toda a série",
      accent: "var(--accent-5)",
      dataset: "bolsa_familia",
      indicadorKey: "valor_total",
    },
    {
      label: "Benef. Primeira Infância",
      value: totaisPeriodo ? fmtNum(Math.round(totaisPeriodo.mediaPi)) : "—",
      sub: filtroLabel
        ? `Crianças até 7 anos · média/mês · ${filtroLabel}`
        : "Crianças até 7 anos · média/mês",
      accent: "var(--accent-3)",
      dataset: "bolsa_familia",
      indicadorKey: "media_por_beneficiario",
    },
  ];
```

Edit 3f — guard no chip e na FilterBar:

ANTES:
```jsx
          onClear: () => setFilters(clearFilter()),
```
DEPOIS:
```jsx
          onClear: () => mudarFiltros(clearFilter()),
```

ANTES:
```jsx
      <FilterBar id="filter-bar-bolsafamilia" years={years} showMonths value={filters} onChange={setFilters} />
```
DEPOIS:
```jsx
      <FilterBar id="filter-bar-bolsafamilia" years={years} showMonths value={filters} onChange={mudarFiltros} />
```

- [ ] **Step 4: PeDeMeiaPage.jsx (+ chip no header — única página de FilterBar sem)**

Edit 4a — imports:

ANTES:
```jsx
import { useEffect, useMemo, useState } from "react";
```
DEPOIS:
```jsx
import { useEffect, useMemo, useRef, useState } from "react";
```

ANTES:
```jsx
import FilterBar from "../../components/FilterBar";
```
DEPOIS:
```jsx
import FilterBar, { describeFilter, clearFilter } from "../../components/FilterBar";
import { janela12m, dentroDoFiltro } from "../../utils/periodoCards";
```

Edit 4b — estado (remove `resumo`) + guard:

ANTES:
```jsx
  const [rawSerie, setRawSerie] = useState([]);
  const [resumo, setResumo] = useState(null);
  const [porEtapa, setPorEtapa] = useState([]);
  const [porIncentivo, setPorIncentivo] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ yearFrom: "", yearTo: "", monthFrom: "", monthTo: "" });
```
DEPOIS:
```jsx
  const [rawSerie, setRawSerie] = useState([]);
  const [porEtapa, setPorEtapa] = useState([]);
  const [porIncentivo, setPorIncentivo] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ yearFrom: "", yearTo: "", monthFrom: "", monthTo: "" });

  // Default "12m ancorado no último dado" (guard contra sobrescrever o usuário).
  const filtroTocado = useRef(false);
  const mudarFiltros = (v) => { filtroTocado.current = true; setFilters(v); };
```

Edit 4c — fetch (sem `/pe_de_meia/resumo`):

ANTES:
```jsx
  useEffect(() => {
    Promise.all([
      api.get("/pe_de_meia/serie"),
      api.get("/pe_de_meia/resumo"),
      api.get("/pe_de_meia/por_etapa"),
      api.get("/pe_de_meia/por_incentivo"),
    ])
      .then(([serieRes, resumoRes, etapaRes, incentivoRes]) => {
        const raw = (serieRes.data || []).map((item) => ({
          ...item,
          periodo: `${item.ano}-${String(item.mes).padStart(2, "0")}`,
        }));
        raw.sort((a, b) => a.periodo.localeCompare(b.periodo));
        setRawSerie(raw);
        setResumo(resumoRes.data);
```
DEPOIS:
```jsx
  useEffect(() => {
    Promise.all([
      api.get("/pe_de_meia/serie"),
      api.get("/pe_de_meia/por_etapa"),
      api.get("/pe_de_meia/por_incentivo"),
    ])
      .then(([serieRes, etapaRes, incentivoRes]) => {
        const raw = (serieRes.data || []).map((item) => ({
          ...item,
          periodo: `${item.ano}-${String(item.mes).padStart(2, "0")}`,
        }));
        raw.sort((a, b) => a.periodo.localeCompare(b.periodo));
        setRawSerie(raw);
        if (!filtroTocado.current) {
          setFilters(janela12m(raw, (d) => ({ ano: d.ano, mes: d.mes })));
        }
```
(o restante do `.then` — `setPorEtapa`/`setPorIncentivo` — fica intacto.)

Edit 4d — filtro com janela:

ANTES:
```jsx
  const serie = useMemo(() => {
    const { yearFrom, yearTo, monthFrom, monthTo } = filters;
    return rawSerie.filter((d) => {
      if (yearFrom && d.ano < +yearFrom) return false;
      if (yearTo && d.ano > +yearTo) return false;
      if (monthFrom && d.mes < +monthFrom) return false;
      if (monthTo && d.mes > +monthTo) return false;
      return true;
    });
  }, [rawSerie, filters]);
```
DEPOIS:
```jsx
  const serie = useMemo(
    () => rawSerie.filter((d) => dentroDoFiltro(d, filters, (x) => ({ ano: x.ano, mes: x.mes }))),
    [rawSerie, filters]
  );
```

Edit 4e — cards:

ANTES:
```jsx
  const cards = [
    {
      label: "Total Estudantes",
      value: fmtNum(resumo?.total_estudantes),
      sub: "No período",
      accent: "var(--accent-1)",
      dataset: "pe_de_meia",
      indicadorKey: "total_estudantes",
    },
    {
      label: "Valor Total",
      value: fmtBRL(resumo?.valor_total),
      sub: "Repasses totais",
      accent: "var(--accent-5)",
      dataset: "pe_de_meia",
      indicadorKey: "valor_total",
    },
  ];
```
DEPOIS:
```jsx
  // Fluxo: estudantes/mês = MÉDIA no período (somar duplicaria pessoas);
  // valor = SOMA do período. Mesma série filtrada dos gráficos.
  const totaisPeriodo = useMemo(() => {
    if (!serie.length) return null;
    const soma = serie.reduce(
      (acc, d) => ({
        estudantes: acc.estudantes + (d.total_estudantes || 0),
        valor: acc.valor + (d.valor_total || 0),
      }),
      { estudantes: 0, valor: 0 }
    );
    return { mediaEstudantes: soma.estudantes / serie.length, valorTotal: soma.valor };
  }, [serie]);
  const filtroLabel = describeFilter(filters);

  const cards = [
    {
      label: "Estudantes por Mês",
      value: totaisPeriodo ? fmtNum(Math.round(totaisPeriodo.mediaEstudantes)) : "—",
      sub: filtroLabel ? `Média mensal · ${filtroLabel}` : "Média mensal · toda a série",
      accent: "var(--accent-1)",
      dataset: "pe_de_meia",
      indicadorKey: "total_estudantes",
    },
    {
      label: "Valor Total",
      value: totaisPeriodo ? fmtBRL(totaisPeriodo.valorTotal) : "—",
      sub: filtroLabel ? `Repasses · ${filtroLabel}` : "Repasses totais",
      accent: "var(--accent-5)",
      dataset: "pe_de_meia",
      indicadorKey: "valor_total",
    },
  ];
```

Edit 4f — chip no header + id/guard na FilterBar:

ANTES:
```jsx
      <NidPageHeader
        title={<>Pé-de-Meia <InfoTooltip dataset="pe_de_meia" /></>}
        sub="Incentivos financeiros a estudantes do ensino médio público."
      />
```
DEPOIS:
```jsx
      <NidPageHeader
        title={<>Pé-de-Meia <InfoTooltip dataset="pe_de_meia" /></>}
        sub="Incentivos financeiros a estudantes do ensino médio público."
        chips={describeFilter(filters) ? [{
          label: describeFilter(filters),
          active: true,
          onClick: () => document.getElementById("filter-bar-pedemeia")?.scrollIntoView({ block: "center", behavior: "smooth" }),
          onClear: () => mudarFiltros(clearFilter()),
        }] : null}
      />
```

ANTES:
```jsx
      <FilterBar years={years} showMonths value={filters} onChange={setFilters} />
```
DEPOIS:
```jsx
      <FilterBar id="filter-bar-pedemeia" years={years} showMonths value={filters} onChange={mudarFiltros} />
```

- [ ] **Step 5: InssPage.jsx**

Edit 5a — imports:

ANTES:
```jsx
import { useEffect, useMemo, useState } from "react";
```
DEPOIS:
```jsx
import { useEffect, useMemo, useRef, useState } from "react";
```

ANTES:
```jsx
import FilterBar, { describeFilter, clearFilter } from "../../components/FilterBar";
```
DEPOIS:
```jsx
import FilterBar, { describeFilter, clearFilter } from "../../components/FilterBar";
import { janela12m } from "../../utils/periodoCards";
```

Edit 5b — estado (remove `resumo`) + guard:

ANTES:
```jsx
  const [rawSerie, setRawSerie] = useState([]);
  const [resumo, setResumo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ yearFrom: "", yearTo: "" });
```
DEPOIS:
```jsx
  const [rawSerie, setRawSerie] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ yearFrom: "", yearTo: "" });

  // Default "12m ancorado" = último ano com dado (série anual).
  const filtroTocado = useRef(false);
  const mudarFiltros = (v) => { filtroTocado.current = true; setFilters(v); };
```

Edit 5c — fetch (sem `/inss/resumo`):

ANTES:
```jsx
  useEffect(() => {
    Promise.all([api.get("/inss/serie"), api.get("/inss/resumo")])
      .then(([serieRes, resumoRes]) => {
        setRawSerie(serieRes.data || []);
        setResumo(resumoRes.data);
      })
      .catch((err) => console.error("Erro ao carregar INSS:", err))
      .finally(() => setLoading(false));
  }, []);
```
DEPOIS:
```jsx
  useEffect(() => {
    api.get("/inss/serie")
      .then((serieRes) => {
        const raw = serieRes.data || [];
        setRawSerie(raw);
        if (!filtroTocado.current) {
          setFilters(janela12m(raw, (d) => ({ ano: d.ano })));
        }
      })
      .catch((err) => console.error("Erro ao carregar INSS:", err))
      .finally(() => setLoading(false));
  }, []);
```

Edit 5d — cards:

ANTES:
```jsx
  const cards = [
    {
      label: "Total Benefícios",
      value: fmtNum(resumo?.total_beneficios),
      sub: "No período",
      accent: "var(--accent-1)",
      dataset: "inss",
      indicadorKey: "total_beneficios",
    },
    {
      label: "Valor Total",
      value: fmtBRL(resumo?.valor_total),
      sub: "Pagamentos totais",
      accent: "var(--accent-5)",
      dataset: "inss",
      indicadorKey: "valor_total",
    },
  ];
```
DEPOIS:
```jsx
  // Fluxo: somas da série filtrada (linhas anuais por categoria).
  const totaisInss = useMemo(
    () =>
      serie.reduce(
        (acc, d) => ({
          beneficios: acc.beneficios + (d.quantidade_beneficios || 0),
          valor: acc.valor + (d.valor_anual || 0),
        }),
        { beneficios: 0, valor: 0 }
      ),
    [serie]
  );
  const filtroLabel = describeFilter(filters);

  const cards = [
    {
      label: "Total Benefícios",
      value: serie.length ? fmtNum(totaisInss.beneficios) : "—",
      sub: filtroLabel || "Toda a série",
      accent: "var(--accent-1)",
      dataset: "inss",
      indicadorKey: "total_beneficios",
    },
    {
      label: "Valor Total",
      value: serie.length ? fmtBRL(totaisInss.valor) : "—",
      sub: filtroLabel ? `Pagamentos · ${filtroLabel}` : "Pagamentos totais",
      accent: "var(--accent-5)",
      dataset: "inss",
      indicadorKey: "valor_total",
    },
  ];
```

Edit 5e — guard no chip e na FilterBar:

ANTES:
```jsx
          onClear: () => setFilters(clearFilter()),
```
DEPOIS:
```jsx
          onClear: () => mudarFiltros(clearFilter()),
```

ANTES:
```jsx
      <FilterBar id="filter-bar-inss" years={years} value={filters} onChange={setFilters} />
```
DEPOIS:
```jsx
      <FilterBar id="filter-bar-inss" years={years} value={filters} onChange={mudarFiltros} />
```

- [ ] **Step 6: Gates**

```bash
cd frontend-observatorio && npm run test && npm run build
```

Expected: exit 0 nos dois (nenhum teste novo neste task).

- [ ] **Step 7: Commit**

```bash
git add frontend-observatorio/src/pages/arrecadacao/ArrecadacaoPage.jsx \
        frontend-observatorio/src/pages/pix/PixPage.jsx \
        frontend-observatorio/src/pages/beneficios/BolsaFamiliaPage.jsx \
        frontend-observatorio/src/pages/beneficios/PeDeMeiaPage.jsx \
        frontend-observatorio/src/pages/inss/InssPage.jsx
git commit -m "feat(periodo): default 12m ancorado + cards de fluxo (arrecadacao, pix, bolsa, pe-de-meia, inss)"
```

---

### Task 3: Lote B — Comex, ESTBAN, PIB, VAF + RAIS (ano ativo) + CAGED (verificação)

**Files:**
- Modify: `ComexPage.jsx`, `EstbanPage.jsx`, `PibPage.jsx`, `VafPage.jsx`, `RaisPage.jsx`
- CagedPage.jsx: **verificação apenas, sem edit**

**Interfaces:**
- Consumes: helpers da T1 + padrão `filtroTocado`/`mudarFiltros` da T2.
- Produces: nada novo para outras tasks.

- [ ] **Step 1: ComexPage.jsx (fluxo com describeFilter passa a ser VERDADEIRO)**

Edit 1a — imports:

ANTES:
```jsx
import { useEffect, useState, useMemo } from "react";
```
DEPOIS:
```jsx
import { useEffect, useState, useMemo, useRef } from "react";
```

ANTES:
```jsx
import FilterBar, { describeFilter, clearFilter } from "../../components/FilterBar";
```
DEPOIS:
```jsx
import FilterBar, { describeFilter, clearFilter } from "../../components/FilterBar";
import { janela12m, dentroDoFiltro } from "../../utils/periodoCards";
```

Edit 1b — estado (remove `resumo`) + guard:

ANTES:
```jsx
  const [serie, setSerie] = useState([]);
  const [resumo, setResumo] = useState(null);
  const [porProduto, setPorProduto] = useState([]);
```
DEPOIS:
```jsx
  const [serie, setSerie] = useState([]);
  const [porProduto, setPorProduto] = useState([]);
```

ANTES:
```jsx
  const [filters, setFilters] = useState({ yearFrom: "", yearTo: "", monthFrom: "", monthTo: "" });
  const [comparar, setComparar] = useState(false);
```
DEPOIS:
```jsx
  const [filters, setFilters] = useState({ yearFrom: "", yearTo: "", monthFrom: "", monthTo: "" });
  const [comparar, setComparar] = useState(false);

  // Default "12m ancorado no último dado" (guard contra sobrescrever o usuário).
  const filtroTocado = useRef(false);
  const mudarFiltros = (v) => { filtroTocado.current = true; setFilters(v); };
```

Edit 1c — fetch inicial (sem `/comex/resumo`, com default):

ANTES:
```jsx
  // Initial load: serie + resumo
  useEffect(() => {
    Promise.all([api.get("/comex/serie"), api.get("/comex/resumo")])
      .then(([serieRes, resumoRes]) => {
        const raw = serieRes.data || [];
        setSerie(raw);
        setResumo(resumoRes.data);
        // Set default year to most recent
        const years = [...new Set(raw.map((d) => d.ano))].sort((a, b) => b - a);
        if (years.length > 0) setAnoSelecionado(String(years[0]));
      })
      .catch((err) => console.error("Erro ao carregar Comex:", err))
      .finally(() => setLoading(false));
  }, []);
```
DEPOIS:
```jsx
  // Initial load: serie (cards de fluxo derivam dela — /comex/resumo não é mais usado)
  useEffect(() => {
    api.get("/comex/serie")
      .then((serieRes) => {
        const raw = serieRes.data || [];
        setSerie(raw);
        if (!filtroTocado.current) {
          setFilters(janela12m(raw, (d) => ({ ano: d.ano, mes: d.mes })));
        }
        // Set default year to most recent
        const years = [...new Set(raw.map((d) => d.ano))].sort((a, b) => b - a);
        if (years.length > 0) setAnoSelecionado(String(years[0]));
      })
      .catch((err) => console.error("Erro ao carregar Comex:", err))
      .finally(() => setLoading(false));
  }, []);
```

Edit 1d — `chartSerie` com semântica de janela:

ANTES:
```jsx
  const chartSerie = useMemo(() => {
    const { yearFrom, yearTo, monthFrom, monthTo } = filters;
    const map = {};
    serie.forEach((item) => {
      if (yearFrom && item.ano < +yearFrom) return;
      if (yearTo && item.ano > +yearTo) return;
      if (monthFrom && item.mes < +monthFrom) return;
      if (monthTo && item.mes > +monthTo) return;
      const key = `${item.ano}-${String(item.mes).padStart(2, "0")}`;
```
DEPOIS:
```jsx
  const chartSerie = useMemo(() => {
    const map = {};
    serie.forEach((item) => {
      if (!dentroDoFiltro(item, filters, (x) => ({ ano: x.ano, mes: x.mes }))) return;
      const key = `${item.ano}-${String(item.mes).padStart(2, "0")}`;
```
(o corpo restante do `useMemo` — agregação exp/imp/peso e o `return` ordenado — fica intacto; deps `[serie, filters]` inalteradas.)

Edit 1e — cards derivados do período:

ANTES:
```jsx
  const balancaPositiva = (resumo?.balanca_comercial ?? 0) >= 0;

  const cards = [
    {
      label: "Total Exportado",
      value: fmtUSD(resumo?.total_exportado_usd),
      sub: describeFilter(filters) || "Todo o período",
      accent: "var(--accent-5)",
      dataset: "comex",
      indicadorKey: "exportacoes",
    },
    {
      label: "Total Importado",
      value: fmtUSD(resumo?.total_importado_usd),
      sub: describeFilter(filters) || "Todo o período",
      accent: "var(--accent-4)",
      dataset: "comex",
      indicadorKey: "importacoes",
    },
    {
      label: "Balança Comercial",
      value: fmtUSD(resumo?.balanca_comercial),
      sub: "Exportações − Importações",
      accent: balancaPositiva ? "var(--accent-5)" : "var(--accent-2)",
      dataset: "comex",
      indicadorKey: "saldo",
    },
  ];
```
DEPOIS:
```jsx
  // Fluxo: totais do período filtrado (mesma agregação dos gráficos) — o sub
  // describeFilter agora descreve o VALOR de verdade.
  const totaisComex = useMemo(
    () =>
      chartSerie.reduce(
        (acc, d) => ({ exp: acc.exp + d.exportacoes, imp: acc.imp + d.importacoes }),
        { exp: 0, imp: 0 }
      ),
    [chartSerie]
  );
  const balancaPositiva = totaisComex.exp - totaisComex.imp >= 0;
  const filtroLabel = describeFilter(filters);

  const cards = [
    {
      label: "Total Exportado",
      value: chartSerie.length ? fmtUSD(totaisComex.exp) : "—",
      sub: filtroLabel || "Todo o período",
      accent: "var(--accent-5)",
      dataset: "comex",
      indicadorKey: "exportacoes",
    },
    {
      label: "Total Importado",
      value: chartSerie.length ? fmtUSD(totaisComex.imp) : "—",
      sub: filtroLabel || "Todo o período",
      accent: "var(--accent-4)",
      dataset: "comex",
      indicadorKey: "importacoes",
    },
    {
      label: "Balança Comercial",
      value: chartSerie.length ? fmtUSD(totaisComex.exp - totaisComex.imp) : "—",
      sub: filtroLabel ? `Exportações − Importações · ${filtroLabel}` : "Exportações − Importações",
      accent: balancaPositiva ? "var(--accent-5)" : "var(--accent-2)",
      dataset: "comex",
      indicadorKey: "saldo",
    },
  ];
```

Edit 1f — guard no chip e na FilterBar:

ANTES:
```jsx
            onClear: () => setFilters(clearFilter()),
```
DEPOIS:
```jsx
            onClear: () => mudarFiltros(clearFilter()),
```

ANTES:
```jsx
      <FilterBar id="filter-bar-comex" years={anos.slice().sort()} showMonths value={filters} onChange={setFilters} />
```
DEPOIS:
```jsx
      <FilterBar id="filter-bar-comex" years={anos.slice().sort()} showMonths value={filters} onChange={mudarFiltros} />
```

(O dropdown `anoSelecionado` de por_produto/por_pais é mecanismo independente e NÃO muda.)

- [ ] **Step 2: EstbanPage.jsx (só default + subs — sem fluxo)**

Edit 2a — imports:

ANTES:
```jsx
import { useEffect, useMemo, useState } from "react";
```
DEPOIS:
```jsx
import { useEffect, useMemo, useRef, useState } from "react";
```

ANTES:
```jsx
import FilterBar, { describeFilter, clearFilter } from "../../components/FilterBar";
```
DEPOIS:
```jsx
import FilterBar, { describeFilter, clearFilter } from "../../components/FilterBar";
import { janela12mAnos } from "../../utils/periodoCards";
```

Edit 2b — guard (depois do estado de filtros):

ANTES:
```jsx
  const [filters, setFilters] = useState({ yearFrom: "", yearTo: "" });
  const [comparar, setComparar] = useState(false);
```
DEPOIS:
```jsx
  const [filters, setFilters] = useState({ yearFrom: "", yearTo: "" });
  const [comparar, setComparar] = useState(false);

  // Default "12m" = últimos 2 anos com dado (FilterBar só de ano; mesma
  // semântica do botão 12m). Guard contra sobrescrever o usuário.
  const filtroTocado = useRef(false);
  const mudarFiltros = (v) => { filtroTocado.current = true; setFilters(v); };
```

Edit 2c — default no fetch:

ANTES:
```jsx
        const raw = (serieRes.data || []).sort((a, b) =>
          String(a.data_referencia).localeCompare(String(b.data_referencia))
        );
        setRawSerie(raw);
```
DEPOIS:
```jsx
        const raw = (serieRes.data || []).sort((a, b) =>
          String(a.data_referencia).localeCompare(String(b.data_referencia))
        );
        setRawSerie(raw);
        if (!filtroTocado.current) {
          setFilters(janela12mAnos(raw, (d) => parseInt(String(d.data_referencia).substring(0, 4))));
        }
```

Edit 2d — subs dos cards (snapshot explícito; valores intactos):

ANTES:
```jsx
  const cards = [
    {
      label: "Agências",
      value: fmtNum(resumo?.qtd_agencias),
      sub: "Unidades ativas",
      accent: "var(--accent-1)",
      dataset: "estban",
      indicadorKey: "agencias",
    },
    {
      label: "Operações de Crédito",
      value: fmtBRL(resumo?.total_operacoes_credito),
      sub: "Saldo total",
      accent: "var(--accent-5)",
      dataset: "estban",
      indicadorKey: "credito_total",
    },
    {
      label: "Total Depósitos",
      value: fmtBRL(resumo?.total_depositos),
      sub: "Vista + Poupança + Prazo",
      accent: "var(--accent-3)",
      dataset: "estban",
      indicadorKey: "depositos_total",
    },
  ];
```
DEPOIS:
```jsx
  // Snapshot: saldos do último mês publicado — NÃO reagem ao filtro (o sub diz).
  const cards = [
    {
      label: "Agências",
      value: fmtNum(resumo?.qtd_agencias),
      sub: "Unidades ativas · último mês da série",
      accent: "var(--accent-1)",
      dataset: "estban",
      indicadorKey: "agencias",
    },
    {
      label: "Operações de Crédito",
      value: fmtBRL(resumo?.total_operacoes_credito),
      sub: "Saldo no último mês da série",
      accent: "var(--accent-5)",
      dataset: "estban",
      indicadorKey: "credito_total",
    },
    {
      label: "Total Depósitos",
      value: fmtBRL(resumo?.total_depositos),
      sub: "Vista + Poupança + Prazo · último mês da série",
      accent: "var(--accent-3)",
      dataset: "estban",
      indicadorKey: "depositos_total",
    },
  ];
```

Edit 2e — guard no chip e na FilterBar:

ANTES:
```jsx
          onClear: () => setFilters(clearFilter()),
```
DEPOIS:
```jsx
          onClear: () => mudarFiltros(clearFilter()),
```

ANTES:
```jsx
      <FilterBar id="filter-bar-estban" years={years} value={filters} onChange={setFilters} />
```
DEPOIS:
```jsx
      <FilterBar id="filter-bar-estban" years={years} value={filters} onChange={mudarFiltros} />
```

- [ ] **Step 3: PibPage.jsx (anual: default último ano; subs "último da série")**

Edit 3a — imports:

ANTES:
```jsx
import { useEffect, useMemo, useState } from "react";
```
DEPOIS:
```jsx
import { useEffect, useMemo, useRef, useState } from "react";
```

ANTES:
```jsx
import FilterBar, { describeFilter, clearFilter } from "../../components/FilterBar";
```
DEPOIS:
```jsx
import FilterBar, { describeFilter, clearFilter } from "../../components/FilterBar";
import { janela12m } from "../../utils/periodoCards";
```

Edit 3b — guard + default:

ANTES:
```jsx
  const [filters, setFilters] = useState({ yearFrom: "", yearTo: "" });

  useEffect(() => {
    Promise.all([
      api.get("/pib/serie"),
      api.get("/pib/resumo"),
      api.get("/pib/comparativo"),
    ])
      .then(([serieRes, resumoRes, compRes]) => {
        setRawSerie(serieRes.data || []);
        setResumo(resumoRes.data);
        setComparativo(compRes.data || []);
      })
      .catch((err) => console.error("Erro ao carregar PIB:", err))
      .finally(() => setLoading(false));
  }, []);
```
DEPOIS:
```jsx
  const [filters, setFilters] = useState({ yearFrom: "", yearTo: "" });

  // Default "12m" de série anual = último ano com dado (guard p/ o usuário).
  const filtroTocado = useRef(false);
  const mudarFiltros = (v) => { filtroTocado.current = true; setFilters(v); };

  useEffect(() => {
    Promise.all([
      api.get("/pib/serie"),
      api.get("/pib/resumo"),
      api.get("/pib/comparativo"),
    ])
      .then(([serieRes, resumoRes, compRes]) => {
        const raw = serieRes.data || [];
        setRawSerie(raw);
        setResumo(resumoRes.data);
        setComparativo(compRes.data || []);
        if (!filtroTocado.current) {
          setFilters(janela12m(raw, (d) => ({ ano: d.ano })));
        }
      })
      .catch((err) => console.error("Erro ao carregar PIB:", err))
      .finally(() => setLoading(false));
  }, []);
```

Edit 3c — subs dos 2 cards de resumo (o 3º, "Anos na Série", já deriva do filtro e fica igual):

ANTES:
```jsx
    {
      label: "PIB Último Ano",
      value: resumo ? fmtBRL(resumo.pib_ultimo_ano) : "—",
      sub: resumo?.ultimo_ano ? `Ano ${resumo.ultimo_ano}` : null,
      dataset: "pib",
      indicadorKey: "ultimo_ano",
    },
    {
      label: "Crescimento",
      value:
        resumo?.crescimento_percentual != null
          ? `${resumo.crescimento_percentual > 0 ? "+" : ""}${resumo.crescimento_percentual.toFixed(1)}%`
          : "—",
      sub: "Variação vs ano anterior",
      dataset: "pib",
      indicadorKey: "crescimento",
    },
```
DEPOIS:
```jsx
    {
      label: "PIB Último Ano",
      value: resumo ? fmtBRL(resumo.pib_ultimo_ano) : "—",
      sub: resumo?.ultimo_ano ? `Ano ${resumo.ultimo_ano} · último da série` : null,
      dataset: "pib",
      indicadorKey: "ultimo_ano",
    },
    {
      label: "Crescimento",
      value:
        resumo?.crescimento_percentual != null
          ? `${resumo.crescimento_percentual > 0 ? "+" : ""}${resumo.crescimento_percentual.toFixed(1)}%`
          : "—",
      sub: "Variação vs ano anterior · última da série",
      dataset: "pib",
      indicadorKey: "crescimento",
    },
```

Edit 3d — guard no chip e na FilterBar:

ANTES:
```jsx
          onClear: () => setFilters(clearFilter()),
```
DEPOIS:
```jsx
          onClear: () => mudarFiltros(clearFilter()),
```

ANTES:
```jsx
      <FilterBar id="filter-bar-pib" years={years} value={filters} onChange={setFilters} />
```
DEPOIS:
```jsx
      <FilterBar id="filter-bar-pib" years={years} value={filters} onChange={mudarFiltros} />
```

- [ ] **Step 4: VafPage.jsx (idem PIB, campo `ano_base`)**

Edit 4a — imports:

ANTES:
```jsx
import { useEffect, useMemo, useState } from "react";
```
DEPOIS:
```jsx
import { useEffect, useMemo, useRef, useState } from "react";
```

ANTES:
```jsx
import FilterBar, { describeFilter, clearFilter } from "../../components/FilterBar";
```
DEPOIS:
```jsx
import FilterBar, { describeFilter, clearFilter } from "../../components/FilterBar";
import { janela12m } from "../../utils/periodoCards";
```

Edit 4b — guard + default:

ANTES:
```jsx
  const [filters, setFilters] = useState({ yearFrom: "", yearTo: "" });

  useEffect(() => {
    Promise.all([
      api.get("/vaf/serie"),
      api.get("/vaf/resumo"),
      api.get("/vaf/comparativo"),
      api.get("/vaf/icms_projetado").catch(() => ({ data: [] })),
    ])
      .then(([serieRes, resumoRes, compRes, icmsRes]) => {
        setRawSerie(serieRes.data || []);
        setResumo(resumoRes.data);
        setComparativo(compRes.data || []);
        setIcmsProj(icmsRes.data || []);
      })
      .catch((err) => console.error("Erro ao carregar VAF:", err))
      .finally(() => setLoading(false));
  }, []);
```
DEPOIS:
```jsx
  const [filters, setFilters] = useState({ yearFrom: "", yearTo: "" });

  // Default "12m" de série anual = último ano-base com dado (guard p/ usuário).
  const filtroTocado = useRef(false);
  const mudarFiltros = (v) => { filtroTocado.current = true; setFilters(v); };

  useEffect(() => {
    Promise.all([
      api.get("/vaf/serie"),
      api.get("/vaf/resumo"),
      api.get("/vaf/comparativo"),
      api.get("/vaf/icms_projetado").catch(() => ({ data: [] })),
    ])
      .then(([serieRes, resumoRes, compRes, icmsRes]) => {
        const raw = serieRes.data || [];
        setRawSerie(raw);
        setResumo(resumoRes.data);
        setComparativo(compRes.data || []);
        setIcmsProj(icmsRes.data || []);
        if (!filtroTocado.current) {
          setFilters(janela12m(raw, (d) => ({ ano: d.ano_base })));
        }
      })
      .catch((err) => console.error("Erro ao carregar VAF:", err))
      .finally(() => setLoading(false));
  }, []);
```

Edit 4c — subs dos 2 cards de resumo ("Anos na Série" fica igual):

ANTES:
```jsx
    {
      label: "IPM Último Ano",
      value: resumo ? fmtIndice(resumo.ipm_ultimo_ano) : "—",
      sub: resumo?.ultimo_ano ? `Ano-base ${resumo.ultimo_ano}` : null,
      dataset: "vaf",
      indicadorKey: "ipm_ultimo_ano",
    },
    {
      label: "Variação do IPM",
      value:
        resumo?.variacao_ipm_percentual != null
          ? fmtPct(resumo.variacao_ipm_percentual)
          : "—",
      sub: "Variação vs ano anterior",
      dataset: "vaf",
      indicadorKey: "variacao_ipm",
    },
```
DEPOIS:
```jsx
    {
      label: "IPM Último Ano",
      value: resumo ? fmtIndice(resumo.ipm_ultimo_ano) : "—",
      sub: resumo?.ultimo_ano ? `Ano-base ${resumo.ultimo_ano} · último da série` : null,
      dataset: "vaf",
      indicadorKey: "ipm_ultimo_ano",
    },
    {
      label: "Variação do IPM",
      value:
        resumo?.variacao_ipm_percentual != null
          ? fmtPct(resumo.variacao_ipm_percentual)
          : "—",
      sub: "Variação vs ano anterior · última da série",
      dataset: "vaf",
      indicadorKey: "variacao_ipm",
    },
```

Edit 4d — guard no chip e na FilterBar:

ANTES:
```jsx
          onClear: () => setFilters(clearFilter()),
```
DEPOIS:
```jsx
          onClear: () => mudarFiltros(clearFilter()),
```

ANTES:
```jsx
      <FilterBar id="filter-bar-vaf" years={years} value={filters} onChange={setFilters} />
```
DEPOIS:
```jsx
      <FilterBar id="filter-bar-vaf" years={years} value={filters} onChange={mudarFiltros} />
```

- [ ] **Step 5: RaisPage.jsx — "Remuneração Média" do ANO ATIVO (client-side)**

`resumo.remuneracao_media` é agregado plurianual estático; o card passa a mostrar a média do `anoAtivo` derivada da MESMA série da página (idêntica à agregação do `sparkRem`, restrita ao ano). `/rais/resumo` fica sem uso e é removido.

Edit 5a — remove o estado `resumo`:

ANTES:
```jsx
  const [serie, setSerie] = useState([]);
  const [resumo, setResumo] = useState(null);
  const [porSexo, setPorSexo] = useState([]);
```
DEPOIS:
```jsx
  const [serie, setSerie] = useState([]);
  const [porSexo, setPorSexo] = useState([]);
```

Edit 5b — remove o fetch de `/rais/resumo`:

ANTES:
```jsx
    Promise.all([
      safe("/rais/serie"),
      api.get("/rais/resumo").then((r) => r.data).catch(() => null),
      safe("/rais/por_sexo"),
```
DEPOIS:
```jsx
    Promise.all([
      safe("/rais/serie"),
      safe("/rais/por_sexo"),
```

Edit 5c — destructuring e sets do `.then`:

ANTES:
```jsx
    ]).then(([
      serieRes, resumoRes, sexoRes, racaRes, cnaeRes,
      feRes, escRes, frRes, teRes, metRes,
      motRes, tipoRes, cboRes, tamRes, natRes, turnRes,
    ]) => {
      if (!alive) return;
      setSerie(serieRes); setResumo(resumoRes);
      setPorSexo(sexoRes); setPorRaca(racaRes); setPorCnae(cnaeRes);
```
DEPOIS:
```jsx
    ]).then(([
      serieRes, sexoRes, racaRes, cnaeRes,
      feRes, escRes, frRes, teRes, metRes,
      motRes, tipoRes, cboRes, tamRes, natRes, turnRes,
    ]) => {
      if (!alive) return;
      setSerie(serieRes);
      setPorSexo(sexoRes); setPorRaca(racaRes); setPorCnae(cnaeRes);
```

Edit 5d — derivação do ano ativo (inserir logo APÓS o `useMemo` de `sparkRem`):

ANTES:
```jsx
    return Array.from(acc.entries())
      .sort(([a], [b]) => a - b)
      .map(([, vals]) => vals.reduce((s, v) => s + v, 0) / vals.length);
  }, [serie]);
```
DEPOIS:
```jsx
    return Array.from(acc.entries())
      .sort(([a], [b]) => a - b)
      .map(([, vals]) => vals.reduce((s, v) => s + v, 0) / vals.length);
  }, [serie]);

  // Remuneração média do ANO ATIVO — mesma agregação do sparkRem, só o ano
  // selecionado (substitui o avg plurianual do /rais/resumo).
  const remAnoAtivo = useMemo(() => {
    const vals = serie
      .filter((d) => d.ano === anoAtivo && d.remuneracao_media)
      .map((d) => d.remuneracao_media);
    return vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : null;
  }, [serie, anoAtivo]);
```

Edit 5e — o card:

ANTES:
```jsx
          <NidKpiHero
            label="Remuneração Média"
            badge="anual"
            value={fmtCurrency(resumo?.remuneracao_media)}
            unit=""
            delta={null}
            foot="média do período"
            color={A3}
            sparkData={sparkRem}
          />
```
DEPOIS:
```jsx
          <NidKpiHero
            label="Remuneração Média"
            badge={anoAtivo ? String(anoAtivo) : null}
            value={fmtCurrency(remAnoAtivo)}
            unit=""
            delta={null}
            foot="no ano selecionado"
            color={A3}
            sparkData={sparkRem}
          />
```
(`fmtCurrency` já devolve "—" para null; `sparkData` continua a série plurianual — o contexto histórico fica no sparkline.)

- [ ] **Step 6: CagedPage.jsx — VERIFICAÇÃO (sem mudança de código)**

Conferir que todo valor/rodapé vindo de `resumo` está rotulado "histórico" (regra "nenhuma mudança silenciosa" — a spec pede mudança mínima e os rótulos JÁ existem):

```bash
cd frontend-observatorio && grep -n "histórico" src/pages/caged/CagedPage.jsx
```

Expected (4 hits): linha ~367 `badge="histórico"` (Saldo · Acumulado), ~382 e ~391 `` foot={`... no histórico`} `` (Admissões/Desligamentos), ~432 comentário. Se algum hit sumiu (drift), rotular no mesmo padrão antes de seguir. Nenhum outro card do CAGED usa `resumo` (o 4º, Salário Médio, deriva de `/caged/salario` — fora do escopo).

- [ ] **Step 7: Gates**

```bash
cd frontend-observatorio && npm run test && npm run build
```

Expected: exit 0.

- [ ] **Step 8: Commit**

```bash
git add frontend-observatorio/src/pages/comex/ComexPage.jsx \
        frontend-observatorio/src/pages/estban/EstbanPage.jsx \
        frontend-observatorio/src/pages/pib/PibPage.jsx \
        frontend-observatorio/src/pages/vaf/VafPage.jsx \
        frontend-observatorio/src/pages/rais/RaisPage.jsx
git commit -m "feat(periodo): default 12m lote B (comex, estban, pib, vaf) + remuneracao do ano ativo na RAIS"
```

---

### Task 4: Empresas — `abertas_de`/`abertas_ate` no backend (TDD) + FilterBar de cadastro no frontend

**Files:**
- Modify: `backend/app/schemas/empresa.py`, `backend/app/api/v1/routers/empresas.py`
- Create: `backend/tests/test_empresas_resumo_periodo.py`
- Modify: `frontend-observatorio/src/utils/periodoCards.js` (+2 helpers), `frontend-observatorio/src/utils/periodoCards.test.js` (append), `frontend-observatorio/src/pages/empresas/EmpresasPage.jsx`

**Interfaces:**
- Consumes: `Empresa.data_inicio` (`Date | None`, `app/models/empresa.py` — já existe, zero migração); `describeFilter`/`clearFilter`; padrão de teste puro do repo (funções de router chamadas direto, como `test_ibge_validation.py` importa `_csv_ibge_mismatch`).
- Produces: `GET /empresas/resumo?abertas_de=YYYY-MM-DD&abertas_ate=YYYY-MM-DD` → `EmpresaResumo` com `abertas_periodo: int | None`; helpers `janela12mCalendario(hoje?)` e `intervaloISO(filtro) -> {de?, ate?}`.

- [ ] **Step 1: Escrever os pytest que falham**

```python
# backend/tests/test_empresas_resumo_periodo.py
"""Resumo de empresas com período de abertura — schema e branch sem-módulo do
router (padrão do repo: sem TestClient e sem DB — a função é chamada direto;
o caminho mid=None retorna antes de tocar a Session)."""
from datetime import date

from app.api.v1.routers.empresas import resumo_empresas
from app.schemas.empresa import EmpresaResumo


def test_schema_sem_abertas_periodo_retrocompativel():
    r = EmpresaResumo(total_empresas=1, total_ativas=1, total_mei=0, total_simples=0)
    assert r.abertas_periodo is None


def test_schema_com_abertas_periodo():
    r = EmpresaResumo(
        total_empresas=5, total_ativas=3, total_mei=1, total_simples=2,
        abertas_periodo=4,
    )
    assert r.abertas_periodo == 4


def test_router_sem_modulo_devolve_zeros_com_abertas_periodo():
    r = resumo_empresas(abertas_de=None, abertas_ate=None, mid=None, db=None)
    assert r.total_empresas == 0
    assert r.abertas_periodo == 0


def test_router_sem_modulo_com_datas_tambem_zera():
    r = resumo_empresas(
        abertas_de=date(2025, 9, 1), abertas_ate=date(2026, 8, 31),
        mid=None, db=None,
    )
    assert r.abertas_periodo == 0
```

- [ ] **Step 2: Rodar e confirmar que falham**

```bash
venv/Scripts/python -m pytest backend/tests/test_empresas_resumo_periodo.py -q
```

Expected: FAIL — `EmpresaResumo` não tem `abertas_periodo`; `resumo_empresas` não aceita os kwargs.

- [ ] **Step 3: Schema + router**

`backend/app/schemas/empresa.py` — ANTES:
```python
class EmpresaResumo(BaseModel):
    total_empresas: int
    total_ativas: int
    total_mei: int
    total_simples: int
```
DEPOIS:
```python
class EmpresaResumo(BaseModel):
    total_empresas: int
    total_ativas: int
    total_mei: int
    total_simples: int
    # COUNT de empresas com data_inicio dentro de [abertas_de, abertas_ate]
    # (sem datas: todo o histórico). data_inicio NULL fica fora — cadastro
    # legado sem como situar no tempo. None só em payloads antigos
    # (retrocompatibilidade do schema).
    abertas_periodo: Optional[int] = None
```

`backend/app/api/v1/routers/empresas.py` — Edit imports, ANTES:
```python
from typing import List

from app.api.deps import get_current_user, get_db, scoped_modulo
from app.models.empresa import Empresa
from app.schemas.empresa import EmpresaResumo, EmpresaPorPorteItem, EmpresaPorCnaeItem
from fastapi import APIRouter, Depends
from sqlalchemy import func, case
from sqlalchemy.orm import Session
```
DEPOIS:
```python
from datetime import date
from typing import List

from app.api.deps import get_current_user, get_db, scoped_modulo
from app.models.empresa import Empresa
from app.schemas.empresa import EmpresaResumo, EmpresaPorPorteItem, EmpresaPorCnaeItem
from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, case
from sqlalchemy.orm import Session
```

Edit da rota — ANTES:
```python
@router.get("/resumo", response_model=EmpresaResumo)
def resumo_empresas(mid: int | None = Depends(scoped_modulo("empresas")), db: Session = Depends(get_db)):
    if mid is None:
        return EmpresaResumo(total_empresas=0, total_ativas=0, total_mei=0, total_simples=0)
    row = (
        db.query(
            func.count(Empresa.id),
            func.coalesce(func.sum(case((Empresa.situacao == "02", 1), else_=0)), 0),
            func.coalesce(func.sum(case((Empresa.opcao_mei.is_(True), 1), else_=0)), 0),
            func.coalesce(func.sum(case((Empresa.opcao_simples.is_(True), 1), else_=0)), 0),
        )
        .filter(Empresa.municipio_id == mid)
        .one()
    )
    return EmpresaResumo(
        total_empresas=row[0] or 0,
        total_ativas=int(row[1] or 0),
        total_mei=int(row[2] or 0),
        total_simples=int(row[3] or 0),
    )
```
DEPOIS:
```python
@router.get("/resumo", response_model=EmpresaResumo)
def resumo_empresas(
    abertas_de: date | None = Query(None, description="Início do período de abertura (data_inicio >=)"),
    abertas_ate: date | None = Query(None, description="Fim do período de abertura (data_inicio <=)"),
    mid: int | None = Depends(scoped_modulo("empresas")),
    db: Session = Depends(get_db),
):
    """Resumo do cadastro. `abertas_periodo` = COUNT de empresas com
    `data_inicio` dentro de [abertas_de, abertas_ate] (sem datas: todo o
    histórico). Empresas com `data_inicio` NULL ficam FORA dessa contagem —
    cadastro legado, não há como situá-las no tempo (decisão de produto;
    contagem audível não se aplica). Demais campos seguem contando tudo."""
    if mid is None:
        return EmpresaResumo(
            total_empresas=0, total_ativas=0, total_mei=0, total_simples=0,
            abertas_periodo=0,
        )
    row = (
        db.query(
            func.count(Empresa.id),
            func.coalesce(func.sum(case((Empresa.situacao == "02", 1), else_=0)), 0),
            func.coalesce(func.sum(case((Empresa.opcao_mei.is_(True), 1), else_=0)), 0),
            func.coalesce(func.sum(case((Empresa.opcao_simples.is_(True), 1), else_=0)), 0),
        )
        .filter(Empresa.municipio_id == mid)
        .one()
    )
    abertas_q = db.query(func.count(Empresa.id)).filter(
        Empresa.municipio_id == mid,
        Empresa.data_inicio.isnot(None),
    )
    if abertas_de is not None:
        abertas_q = abertas_q.filter(Empresa.data_inicio >= abertas_de)
    if abertas_ate is not None:
        abertas_q = abertas_q.filter(Empresa.data_inicio <= abertas_ate)
    return EmpresaResumo(
        total_empresas=row[0] or 0,
        total_ativas=int(row[1] or 0),
        total_mei=int(row[2] or 0),
        total_simples=int(row[3] or 0),
        abertas_periodo=int(abertas_q.scalar() or 0),
    )
```

- [ ] **Step 4: pytest verde**

```bash
venv/Scripts/python -m pytest backend/tests/test_empresas_resumo_periodo.py -q
venv/Scripts/python -m pytest backend/tests -q
```

Expected: 4 novos passando; suite completa (269 + 4) exit 0.

- [ ] **Step 5: vitest dos helpers novos (falham primeiro)**

Append em `frontend-observatorio/src/utils/periodoCards.test.js` (e no import do topo, trocar a primeira linha de import):

ANTES:
```js
import { janela12m, janela12mAnos, dentroDoFiltro } from "./periodoCards";
```
DEPOIS:
```js
import { janela12m, janela12mAnos, dentroDoFiltro, janela12mCalendario, intervaloISO } from "./periodoCards";
```

Append no fim do arquivo:
```js
describe("janela12mCalendario (Empresas — cadastro corrente)", () => {
  it("12 meses de calendário terminando no mês corrente", () => {
    expect(janela12mCalendario(new Date(2026, 7, 5))).toEqual({
      yearFrom: "2025", monthFrom: "9", yearTo: "2026", monthTo: "8",
    });
  });
  it("vira o ano corretamente em janeiro", () => {
    expect(janela12mCalendario(new Date(2026, 0, 15))).toEqual({
      yearFrom: "2025", monthFrom: "2", yearTo: "2026", monthTo: "1",
    });
  });
});

describe("intervaloISO", () => {
  it("primeiro dia do mês inicial e último dia do mês final", () => {
    expect(intervaloISO({ yearFrom: "2025", monthFrom: "9", yearTo: "2026", monthTo: "2" }))
      .toEqual({ de: "2025-09-01", ate: "2026-02-28" });
  });
  it("sem meses assume ano inteiro; filtro vazio → {}", () => {
    expect(intervaloISO({ yearFrom: "2024", yearTo: "2024", monthFrom: "", monthTo: "" }))
      .toEqual({ de: "2024-01-01", ate: "2024-12-31" });
    expect(intervaloISO({ yearFrom: "", yearTo: "", monthFrom: "", monthTo: "" })).toEqual({});
  });
});
```

Rodar `npm run test` → FAIL (helpers não existem).

- [ ] **Step 6: Implementar os 2 helpers (append em `periodoCards.js`)**

```js
/**
 * 12 meses de CALENDÁRIO terminando no mês corrente — SÓ para cadastros
 * correntes (Empresas), onde o calendário é a âncora correta. `hoje` é
 * injetável para teste.
 */
export function janela12mCalendario(hoje = new Date()) {
  const fim = chaveMes(hoje.getFullYear(), hoje.getMonth() + 1);
  const inicio = fim - 11;
  return {
    yearFrom: String(Math.floor(inicio / 12)),
    monthFrom: String((inicio % 12) + 1),
    yearTo: String(Math.floor(fim / 12)),
    monthTo: String((fim % 12) + 1),
  };
}

/**
 * Converte o filtro da FilterBar em intervalo ISO de datas completas:
 * de = 1º dia de (yearFrom, monthFrom||Jan); ate = último dia de
 * (yearTo, monthTo||Dez). Lado sem ano fica ausente (objeto vazio = "Tudo").
 */
export function intervaloISO(filtro) {
  const { yearFrom = "", monthFrom = "", yearTo = "", monthTo = "" } = filtro || {};
  const out = {};
  if (yearFrom) {
    const m = monthFrom ? +monthFrom : 1;
    out.de = `${yearFrom}-${String(m).padStart(2, "0")}-01`;
  }
  if (yearTo) {
    const m = monthTo ? +monthTo : 12;
    const ultimoDia = new Date(+yearTo, m, 0).getDate();
    out.ate = `${yearTo}-${String(m).padStart(2, "0")}-${String(ultimoDia).padStart(2, "0")}`;
  }
  return out;
}
```

`npm run test` → verde.

- [ ] **Step 7: EmpresasPage.jsx**

Edit 7a — imports:

ANTES:
```jsx
import { useEffect, useState } from "react";
```
DEPOIS:
```jsx
import { useEffect, useMemo, useState } from "react";
```

ANTES:
```jsx
import InfoTooltip from "../../components/InfoTooltip";
import KpiCard from "../../components/KpiCard";
```
DEPOIS:
```jsx
import InfoTooltip from "../../components/InfoTooltip";
import FilterBar, { describeFilter, clearFilter } from "../../components/FilterBar";
import { janela12mCalendario, intervaloISO } from "../../utils/periodoCards";
import KpiCard from "../../components/KpiCard";
```

Edit 7b — estado do filtro (default SÍNCRONO de calendário — sem guard) + anos:

ANTES:
```jsx
  const [loading, setLoading] = useState(true);
  const [detalhe, setDetalhe] = useState(null);
```
DEPOIS:
```jsx
  const [loading, setLoading] = useState(true);
  const [detalhe, setDetalhe] = useState(null);
  // Cadastro corrente: default = 12 meses de CALENDÁRIO (aqui a âncora certa).
  const [filters, setFilters] = useState(() => janela12mCalendario());

  // Não há série para derivar anos: FilterBar recebe anos de calendário (30).
  const anosEmpresas = useMemo(() => {
    const atual = new Date().getFullYear();
    return Array.from({ length: 30 }, (_, i) => atual - 29 + i);
  }, []);
```

Edit 7c — fetch: resumo sai do `Promise.all` (passa a re-buscar por filtro — padrão Emendas, o dado não está no client):

ANTES:
```jsx
  useEffect(() => {
    Promise.all([
      api.get("/empresas/resumo"),
      api.get("/empresas/por_porte"),
      api.get("/empresas/por_situacao"),
      api.get("/empresas/situacao_por_porte"),
      api.get("/empresas/por_cnae_secao"),
      api.get("/empresas/capital_por_porte"),
    ])
      .then(([resumoRes, porteRes, situacaoRes, situPorteRes, cnaeSecaoRes, capitalRes]) => {
        setResumo(resumoRes.data);
        setPorPorte(
```
DEPOIS:
```jsx
  // Resumo reage ao período (abertas_de/ate); demais painéis são cadastrais.
  useEffect(() => {
    const { de, ate } = intervaloISO(filters);
    const params = {};
    if (de) params.abertas_de = de;
    if (ate) params.abertas_ate = ate;
    api.get("/empresas/resumo", { params })
      .then((res) => setResumo(res.data))
      .catch((err) => console.error("Erro ao carregar resumo de empresas:", err));
  }, [filters]);

  useEffect(() => {
    Promise.all([
      api.get("/empresas/por_porte"),
      api.get("/empresas/por_situacao"),
      api.get("/empresas/situacao_por_porte"),
      api.get("/empresas/por_cnae_secao"),
      api.get("/empresas/capital_por_porte"),
    ])
      .then(([porteRes, situacaoRes, situPorteRes, cnaeSecaoRes, capitalRes]) => {
        setPorPorte(
```

Edit 7d — cards (novo card de fluxo + snapshots com "cadastro atual"):

ANTES:
```jsx
  const cards = [
    {
      label: "Total Empresas",
      value: fmtNum(resumo?.total_empresas),
      sub: "Cadastradas",
      accent: "var(--accent-1)",
      dataset: "empresas",
      indicadorKey: "total_empresas",
    },
    {
      label: "Empresas Ativas",
      value: fmtNum(resumo?.total_ativas),
      sub: fmtPct(resumo?.total_ativas, resumo?.total_empresas) + " do total",
      accent: "var(--accent-5)",
      dataset: "empresas",
      indicadorKey: "ativas",
    },
    {
      label: "MEI",
      value: fmtNum(resumo?.total_mei),
      sub: fmtPct(resumo?.total_mei, resumo?.total_empresas) + " do total",
      accent: "var(--accent-3)",
      dataset: "empresas",
      indicadorKey: "mei",
    },
    {
      label: "Simples Nacional",
      value: fmtNum(resumo?.total_simples),
      sub: fmtPct(resumo?.total_simples, resumo?.total_empresas) + " do total",
      accent: "var(--accent-4)",
      dataset: "empresas",
      indicadorKey: "simples",
    },
  ];
```
DEPOIS:
```jsx
  const filtroLabel = describeFilter(filters);

  const cards = [
    {
      label: "Abertas no Período",
      value: fmtNum(resumo?.abertas_periodo),
      sub: filtroLabel
        ? `Por data de abertura · ${filtroLabel}`
        : "Por data de abertura · todo o histórico",
      accent: "var(--accent-2)",
      dataset: "empresas",
      indicadorKey: "abertas_periodo",
    },
    {
      label: "Total Empresas",
      value: fmtNum(resumo?.total_empresas),
      sub: "Cadastro atual",
      accent: "var(--accent-1)",
      dataset: "empresas",
      indicadorKey: "total_empresas",
    },
    {
      label: "Empresas Ativas",
      value: fmtNum(resumo?.total_ativas),
      sub: fmtPct(resumo?.total_ativas, resumo?.total_empresas) + " do total · cadastro atual",
      accent: "var(--accent-5)",
      dataset: "empresas",
      indicadorKey: "ativas",
    },
    {
      label: "MEI",
      value: fmtNum(resumo?.total_mei),
      sub: fmtPct(resumo?.total_mei, resumo?.total_empresas) + " do total · cadastro atual",
      accent: "var(--accent-3)",
      dataset: "empresas",
      indicadorKey: "mei",
    },
    {
      label: "Simples Nacional",
      value: fmtNum(resumo?.total_simples),
      sub: fmtPct(resumo?.total_simples, resumo?.total_empresas) + " do total · cadastro atual",
      accent: "var(--accent-4)",
      dataset: "empresas",
      indicadorKey: "simples",
    },
  ];
```
(`indicadorKey: "abertas_periodo"` é novo — o `KpiCard` tolera indicador inexistente: o GET `/indicadores` cai no `.catch(() => {})`; admin pode cadastrar a descrição pela UI depois.)

Edit 7e — chip no header:

ANTES:
```jsx
      <NidPageHeader
        title={<>Empresas — CNPJ <InfoTooltip dataset="empresas" /></>}
        sub="Perfil e composição do tecido empresarial local."
      />
```
DEPOIS:
```jsx
      <NidPageHeader
        title={<>Empresas — CNPJ <InfoTooltip dataset="empresas" /></>}
        sub="Perfil e composição do tecido empresarial local."
        chips={describeFilter(filters) ? [{
          label: describeFilter(filters),
          active: true,
          onClick: () => document.getElementById("filter-bar-empresas")?.scrollIntoView({ block: "center", behavior: "smooth" }),
          onClear: () => setFilters(clearFilter()),
        }] : null}
      />
```

Edit 7f — FilterBar antes dos KPI cards + 5º skeleton:

ANTES:
```jsx
      <>
      {/* KPI Cards */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          {[...Array(4)].map((_, i) => <KpiSkeleton key={i} />)}
        </div>
```
DEPOIS:
```jsx
      <>
      <FilterBar id="filter-bar-empresas" years={anosEmpresas} showMonths value={filters} onChange={setFilters} />

      {/* KPI Cards */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          {[...Array(5)].map((_, i) => <KpiSkeleton key={i} />)}
        </div>
```
(o grid real `sm:grid-cols-2 xl:grid-cols-4` fica: o 5º card quebra para a segunda linha.)

- [ ] **Step 8: Gates completos**

```bash
cd frontend-observatorio && npm run test && npm run build
cd .. && venv/Scripts/python -m pytest backend/tests -q
```

Expected: tudo exit 0.

- [ ] **Step 9: Commit**

```bash
git add backend/app/schemas/empresa.py backend/app/api/v1/routers/empresas.py \
        backend/tests/test_empresas_resumo_periodo.py \
        frontend-observatorio/src/utils/periodoCards.js \
        frontend-observatorio/src/utils/periodoCards.test.js \
        frontend-observatorio/src/pages/empresas/EmpresasPage.jsx
git commit -m "feat(empresas): abertas no periodo (abertas_de/ate no resumo) + FilterBar de cadastro (TDD)"
```

---

### Task 5: Verificação final — gates, greps e checklist visual

**Files:** nenhum (verificação; nada de commit — conferir que WIP do usuário continua fora do stage).

- [ ] **Step 1: Gates completos da raiz**

```bash
cd frontend-observatorio && npm run test && npm run build
cd .. && venv/Scripts/python -m pytest backend/tests -q
git status
```

Expected: exit 0 nos três; `git status` mostra APENAS o WIP do usuário intocado (`.claude/settings.local.json`, `dados/`, `docs/superpowers/plans/2026-05-06-ips-feature.md`, `node_modules/`; `README.md` se o usuário o tiver mexido).

- [ ] **Step 2: Greps de consistência (nenhum sub órfão; default em todas)**

```bash
cd frontend-observatorio
# 1) Nenhum sub "No período" órfão de filtro sobrou (Bolsa/Pé-de-Meia/INSS tinham):
grep -rn "\"No período\"" src/pages ; # expected: NENHUM hit (exit 1)
# 2) As 9 páginas de FilterBar têm guard+default (filtroTocado):
grep -rln "filtroTocado" src/pages ; # expected: exatamente 9 arquivos (arrecadacao, pix, bolsa, pe-de-meia, inss, comex, estban, pib, vaf)
# 3) Empresas usa o default de calendário:
grep -n "janela12mCalendario" src/pages/empresas/EmpresasPage.jsx ; # expected: 2 hits (import + useState)
# 4) RAIS com foot novo; CAGED com rótulos de histórico:
grep -n "no ano selecionado" src/pages/rais/RaisPage.jsx ; # expected: 1 hit
grep -n "histórico" src/pages/caged/CagedPage.jsx ; # expected: 4 hits (inalterado)
# 5) resumo morto não sobrou nas páginas que migraram para fluxo:
grep -n "resumo" src/pages/pix/PixPage.jsx src/pages/beneficios/BolsaFamiliaPage.jsx src/pages/beneficios/PeDeMeiaPage.jsx src/pages/inss/InssPage.jsx src/pages/comex/ComexPage.jsx src/pages/rais/RaisPage.jsx ; # expected: NENHUM hit (exit 1)
```

- [ ] **Step 3: Checklist visual — ANOTAR PARA O USUÁRIO (não executar aqui)**

Registrar no report/ledger o checklist manual, página a página (12): 
1. Cada página abre com o preset **12m** ativo na FilterBar e chip de período no header (Pé-de-Meia e Empresas agora TÊM chip) — exceto RAIS/CAGED (pills de ano, último ano ativo, sem FilterBar).
2. Cards de fluxo batem com os gráficos no mesmo período (Comex: cards = soma das linhas visíveis).
3. Mudar o filtro recalcula os cards de fluxo; snapshots não mudam e os subs dizem por quê ("cadastro atual", "último mês da série", "último da série", "histórico").
4. Sub de fluxo mostra o período ("Ago/2023 – Jul/2024" / "Ano 2024"); limpar o filtro ("Tudo") volta a somar tudo com sub coerente.
5. Filtro sem interseção (ex.: Personalizar num ano sem dado) → cards de fluxo "—" e gráficos vazios, sem quebrar.
6. Empresas: "Abertas no Período" reage ao filtro (default = últimos 12 meses de calendário) e os 4 cards de cadastro não mudam.
7. RAIS: trocar a pill de ano muda o valor central de "Remuneração Média" (badge = ano), sparkline segue plurianual.

- [ ] **Step 4: Report final**

Reportar: suites (vitest novos ~21; pytest 269+4), páginas alteradas (11 + FilterBar + helper; CAGED intocado), decisões de rótulo (tabela de classificação), e o checklist do Step 3 como pendência do usuário. **Push é do usuário** (main ahead — regra do repo).

---

## Self-review do plano (executado na escrita)

- **Spec coverage:** default 12m ancorado nas 9 páginas de FilterBar → `janela12m`/`janela12mAnos` + guard `filtroTocado` (T2/T3); fluxo recalcula pela MESMA série filtrada dos gráficos com sub `describeFilter` → blocos DEPOIS de Arrecadação/PIX/Bolsa/Pé-de-Meia/INSS/Comex; snapshots com sub explícito → ESTBAN/PIB/VAF/Empresas/Arrecadação(2 cards); Pé-de-Meia ganha chip (T2 Edit 4f); CAGED sem mudança com verificação de rótulos (T3 Step 6); RAIS remuneração do ano ativo client-side com foot "no ano selecionado" (T3 Step 5); Empresas backend `abertas_de/ate` + `abertas_periodo` sem migração com pytest TDD e frontend com FilterBar year+month, chip, card novo e re-fetch (T4); casos de borda (vazia→Tudo, 1 ponto→próprio ponto, sem interseção→"—", `data_inicio` NULL fora e documentado no docstring do router) cobertos por testes ou código; classificação card a card com labels/subs finais transcrita na tabela própria; `detectPreset` reconhece a janela ancorada (span 1) com testes de preservação dos presets existentes.
- **Placeholders:** nenhum — todo edit tem bloco ANTES verbatim (conferido contra os arquivos reais do repo, não só o dossiê) e bloco DEPOIS completo; helpers e testes estão integrais.
- **Consistência entre tasks:** nomes `janela12m`/`janela12mAnos`/`dentroDoFiltro`/`janela12mCalendario`/`intervaloISO` idênticos em T1/T2/T3/T4; `filtroTocado`/`mudarFiltros` é o mesmo padrão nas 9 páginas; extractors por página casam com o shape real da série (PIX/Bolsa/PdM/Comex `{ano,mes}`; INSS/PIB `{ano}`; VAF `{ano_base}`; Arrecadação `d.ano`; ESTBAN `data_referencia.substring(0,4)`); `intervaloISO` devolve `{de, ate}` genérico e a página mapeia para `abertas_de/ate` (helper não acoplado à API); shape `{yearFrom, monthFrom, yearTo, monthTo}` (strings) compatível com FilterBar em todos os retornos.
- **Riscos aceitos (documentados):** (1) semântica de mês em Personalizar muda de "faixa por ano" para "janela composta" quando ano+mês estão preenchidos — necessário para a janela ancorada que cruza o ano, e coerente com a leitura "De → Até"; (2) `detectPreset` passa a marcar "12m" para ano único terminando no `maxYear` (um Personalizar de 1 ano vira chip 12m — deliberado: é o "12m" de série anual); (3) clicar o botão "12m" após o default troca a janela mensal ancorada por `{cy-1..cy}` sem meses (comportamento atual do botão, mantido); (4) remoção dos fetches `/resumo` mortos (PIX, Bolsa, Pé-de-Meia, INSS, Comex, RAIS) — endpoints continuam existindo no backend, nenhum outro consumidor no frontend (grepado); (5) ESTBAN assume que `/estban/resumo` é snapshot do último mês, conforme levantamento da spec (normativa).
- **Gates:** T1/T2/T3 vitest+build; T4 adiciona pytest (269+4) e re-roda tudo; T5 roda os três da raiz + greps de subs órfãos/defaults. Branch criada no Step 0 da T1; WIP do usuário listado e excluído de todos os `git add` explícitos.
