# Interatividade dos Gráficos — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add chart interactivity — page-wide "vs ano anterior" comparison on monthly datasets, a dedicated "Impacto de Ações" page (before/after a Timeline marco), and focused drill-down modals on categorical charts.

**Architecture:** Frontend-only logic derived from existing endpoints (séries already return full history). Two pure utils (`splitByYear`, `beforeAfter`) carry the math and are unit-tested with Vitest. A reusable `CompareToggle` + `comparePanelData` power the period mode across pages. A new `/app/impacto` page reuses `/marcos` + `/<dataset>/serie`. Drill-down adds an optional `onSelect` to categorical charts feeding a shared `DetalheModal`. No backend changes except the new page's route/nav/plan module.

**Tech Stack:** React 19 + Vite, Tailwind, existing NID charts (`AreaLineChart`, `MultiLineChart`, `HBarChart`, `DonutChart`), Vitest (new, for pure utils).

## Global Constraints

- Frontend lives in `frontend-observatorio/`; run all `npm`/`npx` from there.
- No backend changes except: route in `AppRouter.jsx`, nav item in `DashboardLayout.jsx`, and the `impacto` key in `PlanoConfigAdminPage.jsx` MODULOS.
- Period-comparison mode applies ONLY to monthly datasets: Arrecadação, CAGED, PIX, ESTBAN, Comex, Bolsa Família, Pé-de-Meia. Annual pages (PIB, VAF, INSS, RAIS) get no toggle.
- Money/number formatters already exist in `components/nid/charts.jsx` (`fmtMoneyShort`, `fmtMoneyFull`, `fmtNumber`, `fmtNumberShort`).
- Validate every task with `npx vite build` (must pass). Pure utils also validated with `npm run test`.
- Commit after each task. Branch is already `feat/admin-data-management`.

---

## File Structure

- Create `frontend-observatorio/src/utils/periodos.js` — pure helpers `splitByYear`, `beforeAfter`, `pctChange`.
- Create `frontend-observatorio/src/utils/periodos.test.js` — Vitest unit tests.
- Create `frontend-observatorio/vitest.config.js` — Vitest config.
- Create `frontend-observatorio/src/components/nid/CompareToggle.jsx` — the page toggle.
- Create `frontend-observatorio/src/pages/impacto/ImpactoPage.jsx` — the Impacto de Ações page.
- Create `frontend-observatorio/src/components/nid/DetalheModal.jsx` — drill-down detail modal.
- Modify the 7 monthly dataset pages (period mode), `AppRouter.jsx` + `DashboardLayout.jsx` + `PlanoConfigAdminPage.jsx` (Impacto page wiring), `charts.jsx` + categorical pages (drill-down).

---

## PHASE 1a — Period comparison

### Task 1: Vitest tooling

**Files:**
- Modify: `frontend-observatorio/package.json`
- Create: `frontend-observatorio/vitest.config.js`

- [ ] **Step 1: Add Vitest dev dependency**

Run (from `frontend-observatorio/`): `npm install -D vitest@^2.1.0`

- [ ] **Step 2: Add the test script**

In `package.json` `"scripts"`, add: `"test": "vitest run"` (keep existing scripts).

- [ ] **Step 3: Create `vitest.config.js`**

```js
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { environment: "node", include: ["src/**/*.test.{js,jsx}"] },
});
```

- [ ] **Step 4: Verify the runner works**

Run: `npx vitest run`
Expected: exits 0 with "No test files found" (no tests yet).

- [ ] **Step 5: Commit**

```bash
git add frontend-observatorio/package.json frontend-observatorio/package-lock.json frontend-observatorio/vitest.config.js
git commit -m "chore(front): add Vitest for pure-logic unit tests"
```

---

### Task 2: `splitByYear` util (TDD)

**Files:**
- Create: `frontend-observatorio/src/utils/periodos.js`
- Test: `frontend-observatorio/src/utils/periodos.test.js`

**Interfaces:**
- Produces: `splitByYear(serie, { valueKey, anoKey = "ano", mesKey = "mes" })` →
  `{ anoAtual: number|null, anoAnterior: number|null, meses: [{ label, atual, anterior }] }`
  where `meses` has 12 entries (Jan..Dez), `atual`/`anterior` are the value for
  that month in the latest year and the year before (null when absent).
- Produces: `pctChange(novo, velho)` → number|null (percentage change, null if velho is 0/null).

- [ ] **Step 1: Write the failing tests**

```js
import { describe, it, expect } from "vitest";
import { splitByYear, pctChange } from "./periodos";

const MES = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

describe("splitByYear", () => {
  it("aligns latest year vs previous year by month", () => {
    const serie = [
      { ano: 2024, mes: 1, total: 10 },
      { ano: 2024, mes: 2, total: 20 },
      { ano: 2025, mes: 1, total: 15 },
    ];
    const r = splitByYear(serie, { valueKey: "total" });
    expect(r.anoAtual).toBe(2025);
    expect(r.anoAnterior).toBe(2024);
    expect(r.meses[0]).toEqual({ label: "Jan", atual: 15, anterior: 10 });
    expect(r.meses[1]).toEqual({ label: "Fev", atual: null, anterior: 20 });
  });

  it("returns null years when only one year present", () => {
    const r = splitByYear([{ ano: 2025, mes: 1, total: 5 }], { valueKey: "total" });
    expect(r.anoAtual).toBe(2025);
    expect(r.anoAnterior).toBe(null);
  });

  it("is empty-safe", () => {
    const r = splitByYear([], { valueKey: "total" });
    expect(r.anoAtual).toBe(null);
    expect(r.meses).toHaveLength(12);
  });
});

describe("pctChange", () => {
  it("computes percentage change", () => {
    expect(pctChange(150, 100)).toBeCloseTo(50);
  });
  it("returns null when base is 0 or null", () => {
    expect(pctChange(10, 0)).toBe(null);
    expect(pctChange(10, null)).toBe(null);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/utils/periodos.test.js`
Expected: FAIL ("Failed to resolve import './periodos'").

- [ ] **Step 3: Implement `periodos.js`**

```js
export const MES_LABEL = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

export function pctChange(novo, velho) {
  if (velho == null || velho === 0) return null;
  return ((novo - velho) / Math.abs(velho)) * 100;
}

export function splitByYear(serie, { valueKey, anoKey = "ano", mesKey = "mes" }) {
  const anos = [...new Set((serie || []).map((d) => d[anoKey]))].sort((a, b) => a - b);
  const anoAtual = anos.length ? anos[anos.length - 1] : null;
  const anoAnterior = anos.length > 1 ? anos[anos.length - 2] : null;
  const valAt = (ano, mes) => {
    const row = (serie || []).find((d) => d[anoKey] === ano && d[mesKey] === mes);
    return row ? (row[valueKey] ?? 0) : null;
  };
  const meses = MES_LABEL.map((label, i) => ({
    label,
    atual: anoAtual != null ? valAt(anoAtual, i + 1) : null,
    anterior: anoAnterior != null ? valAt(anoAnterior, i + 1) : null,
  }));
  return { anoAtual, anoAnterior, meses };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/utils/periodos.test.js`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend-observatorio/src/utils/periodos.js frontend-observatorio/src/utils/periodos.test.js
git commit -m "feat(front): splitByYear/pctChange period utils (tested)"
```

---

### Task 3: `comparePanelData` helper + `CompareToggle` component

**Files:**
- Modify: `frontend-observatorio/src/utils/periodos.js`
- Test: `frontend-observatorio/src/utils/periodos.test.js`
- Create: `frontend-observatorio/src/components/nid/CompareToggle.jsx`

**Interfaces:**
- Produces: `comparePanelData(serie, { valueKey })` →
  `{ chartData: [{label, [anoAtual]: n, [anoAnterior]: n}], series: [string,string], temAnterior: boolean, totalAtual, totalAnterior, deltaPct }`.
  `series` are the year labels as strings (e.g. `["2025","2024"]`); `chartData`
  keys each row by those labels. `temAnterior` is false when there's no previous year.
- Produces (component): `<CompareToggle active={bool} onChange={fn} disabled={bool} />`.

- [ ] **Step 1: Add the failing test**

Append to `periodos.test.js`:

```js
import { comparePanelData } from "./periodos";

describe("comparePanelData", () => {
  const serie = [
    { ano: 2024, mes: 1, total: 100 },
    { ano: 2025, mes: 1, total: 150 },
  ];
  it("builds two labeled series + delta", () => {
    const r = comparePanelData(serie, { valueKey: "total" });
    expect(r.series).toEqual(["2025", "2024"]);
    expect(r.temAnterior).toBe(true);
    expect(r.chartData[0]).toEqual({ label: "Jan", "2025": 150, "2024": 100 });
    expect(r.totalAtual).toBe(150);
    expect(r.totalAnterior).toBe(100);
    expect(r.deltaPct).toBeCloseTo(50);
  });
  it("flags no previous year", () => {
    const r = comparePanelData([{ ano: 2025, mes: 1, total: 5 }], { valueKey: "total" });
    expect(r.temAnterior).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/utils/periodos.test.js`
Expected: FAIL ("comparePanelData is not a function").

- [ ] **Step 3: Implement `comparePanelData` in `periodos.js`**

```js
export function comparePanelData(serie, { valueKey }) {
  const { anoAtual, anoAnterior, meses } = splitByYear(serie, { valueKey });
  const kA = String(anoAtual ?? "atual");
  const kP = String(anoAnterior ?? "anterior");
  const sum = (k) => meses.reduce((s, m) => s + (m[k] || 0), 0);
  const totalAtual = sum("atual");
  const totalAnterior = sum("anterior");
  return {
    chartData: meses.map((m) => ({ label: m.label, [kA]: m.atual, [kP]: m.anterior })),
    series: [kA, kP],
    temAnterior: anoAnterior != null,
    totalAtual,
    totalAnterior,
    deltaPct: pctChange(totalAtual, totalAnterior),
  };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/utils/periodos.test.js`
Expected: PASS (all tests).

- [ ] **Step 5: Create `CompareToggle.jsx`**

```jsx
import { ArrowsRightLeftIcon } from "@heroicons/react/24/outline";

export default function CompareToggle({ active, onChange, disabled }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!active)}
      disabled={disabled}
      title={disabled ? "Sem ano anterior para comparar" : "Comparar com o ano anterior"}
      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
      style={{
        background: active ? "var(--accent-1)" : "var(--panel-2)",
        color: active ? "#fff" : "var(--text-dim)",
        border: "1px solid var(--border)",
      }}
    >
      <ArrowsRightLeftIcon className="w-4 h-4" />
      Comparar com ano anterior
    </button>
  );
}
```

- [ ] **Step 6: Build + commit**

```bash
npx vite build
git add frontend-observatorio/src/utils/periodos.js frontend-observatorio/src/utils/periodos.test.js frontend-observatorio/src/components/nid/CompareToggle.jsx
git commit -m "feat(front): comparePanelData + CompareToggle"
```

---

### Task 4: Wire period mode into Arrecadação (reference page)

**Files:**
- Modify: `frontend-observatorio/src/pages/arrecadacao/ArrecadacaoPage.jsx`

**Interfaces:**
- Consumes: `comparePanelData` (Task 3), `CompareToggle` (Task 3), `MultiLineChart` (existing).

- [ ] **Step 1: Add imports**

The page already imports charts via a destructured line like
`import { AreaLineChart, fmtMoneyShort, fmtMoneyFull } from "../../components/nid/charts";`.
Add `MultiLineChart` to that existing destructured list (do not add a second
import from the same module), then add two new import lines:
```jsx
import CompareToggle from "../../components/nid/CompareToggle";
import { comparePanelData } from "../../utils/periodos";
```

- [ ] **Step 2: Add comparison state + derived data**

After the existing `const [filters, setFilters] = useState(...)`:
```jsx
const [comparar, setComparar] = useState(false);
const cmp = useMemo(() => comparePanelData(rawSerie, { valueKey: "total" }), [rawSerie]);
```
(`rawSerie` items have `ano`, `mes`, `total` — confirmed by the existing `/arrecadacao/serie` shape.)

- [ ] **Step 3: Render the toggle next to the FilterBar**

Just above `<FilterBar ... />`, wrap in a flex row:
```jsx
<div className="flex items-center justify-end">
  <CompareToggle active={comparar} onChange={setComparar} disabled={!cmp.temAnterior} />
</div>
```

- [ ] **Step 4: Swap the série chart when comparing**

In the "Série Histórica Mensal" `NidPanel`, replace the lone `<AreaLineChart .../>` with:
```jsx
{comparar && cmp.temAnterior ? (
  <>
    <NidLegend items={[
      { name: cmp.series[0], color: "var(--accent-1)" },
      { name: cmp.series[1], color: "var(--accent-3)" },
    ]} />
    <MultiLineChart
      data={cmp.chartData}
      series={cmp.series}
      colors={["var(--accent-1)", "var(--accent-3)"]}
      height={280}
      yFmt={fmtMoneyShort}
      tipFmt={fmtMoneyFull}
    />
  </>
) : (
  <AreaLineChart data={areaData} height={280} color="var(--accent-3)" label="Total Arrecadado" yFmt={fmtMoneyShort} tipFmt={fmtMoneyFull} forecast={{ steps: 2, method: "linear-6" }} />
)}
```
(Import `NidLegend` from `"../../components/nid/Panel"` if not already imported.)

- [ ] **Step 5: Show YoY delta on the panel sub when comparing**

Change the panel header sub so, when comparing, it reads the delta:
```jsx
sub={comparar && cmp.temAnterior
  ? `${cmp.series[0]} vs ${cmp.series[1]} · ${cmp.deltaPct >= 0 ? "+" : ""}${cmp.deltaPct.toFixed(1)}% no acumulado`
  : "receita total por período"}
```

- [ ] **Step 6: Build + manual verify + commit**

```bash
npx vite build
```
Manual: open Arrecadação for a município with ≥2 years; toggle on → two lines + delta sub; toggle disabled when only one year.
```bash
git add frontend-observatorio/src/pages/arrecadacao/ArrecadacaoPage.jsx
git commit -m "feat(arrecadacao): period comparison mode"
```

---

### Task 5: Replicate period mode to the other monthly pages

**Files (modify each):**
- `frontend-observatorio/src/pages/caged/CagedPage.jsx`
- `frontend-observatorio/src/pages/pix/PixPage.jsx`
- `frontend-observatorio/src/pages/estban/EstbanPage.jsx`
- `frontend-observatorio/src/pages/comex/ComexPage.jsx`
- `frontend-observatorio/src/pages/beneficios/BolsaFamiliaPage.jsx`
- `frontend-observatorio/src/pages/beneficios/PeDeMeiaPage.jsx`

**Recipe (identical to Task 4) per page** — add `comparar` state + `cmp = useMemo(() => comparePanelData(<rawSerie>, { valueKey }), [...])`, a `<CompareToggle>` near the filter row, and swap the main monthly série chart for the `MultiLineChart` overlay when `comparar && cmp.temAnterior`. Per-page specifics:

| Page | série state var | valueKey | headline série panel |
|------|------|----------|------|
| CAGED | the monthly `serie` (has `saldo`) | `saldo` | "Saldo Mensal/Anual" area |
| PIX | `rawSerie`/serie | derive `total = vl_pagador_pf+vl_pagador_pj` (map before split) | PIX volume série |
| ESTBAN | série (data_referencia) — use `ano`/`mes` derived from `data_referencia` | `valor_operacoes_credito` | crédito série |
| Comex | série (ano,mes) | derive `saldo = export-import` per month | série mensal |
| Bolsa Família | série (ano,mes) | `total_beneficiarios` | série mensal |
| Pé-de-Meia | `rawSerie` (ano,mes) | `total_estudantes` | série mensal |

For PIX/Comex where the value is derived, map the série to add the field before calling `comparePanelData` (e.g. `rawSerie.map(d => ({...d, _v: (d.vl_pagador_pf||0)+(d.vl_pagador_pj||0)}))` and use `valueKey:"_v"`). For ESTBAN, derive `ano`/`mes` from `data_referencia` (`new Date(d.data_referencia)`), passing `anoKey`/`mesKey` accordingly or pre-mapping.

- [ ] **Step 1:** Apply the recipe to CAGED; `npx vite build`; commit `feat(caged): period comparison mode`.
- [ ] **Step 2:** Apply to PIX (derived value); build; commit.
- [ ] **Step 3:** Apply to ESTBAN (derive ano/mes from data_referencia); build; commit.
- [ ] **Step 4:** Apply to Comex (derived saldo); build; commit.
- [ ] **Step 5:** Apply to Bolsa Família; build; commit.
- [ ] **Step 6:** Apply to Pé-de-Meia; build; commit.

Each step: read the page's série fetch to confirm the field names, wire the toggle + overlay exactly as Task 4, `npx vite build` (must pass), then `git commit`.

---

## PHASE 1b — Impacto de Ações page

### Task 6: `beforeAfter` util (TDD)

**Files:**
- Modify: `frontend-observatorio/src/utils/periodos.js`
- Test: `frontend-observatorio/src/utils/periodos.test.js`

**Interfaces:**
- Produces: `beforeAfter(serie, markerDate, { valueKey, anoKey="ano", mesKey="mes", janela=12 })` →
  `{ antes: { media, n }, depois: { media, n }, deltaPct }`. `markerDate` is a
  `Date` or ISO string. Splits points strictly before vs on/after the marker
  month, takes up to `janela` months on each side, returns the mean and count.

- [ ] **Step 1: Add the failing test**

```js
import { beforeAfter } from "./periodos";

describe("beforeAfter", () => {
  const serie = [
    { ano: 2024, mes: 10, v: 100 },
    { ano: 2024, mes: 11, v: 100 },
    { ano: 2024, mes: 12, v: 100 },
    { ano: 2025, mes: 1, v: 150 },
    { ano: 2025, mes: 2, v: 150 },
  ];
  it("splits at the marker month and averages each side", () => {
    const r = beforeAfter(serie, "2025-01-15", { valueKey: "v" });
    expect(r.antes.media).toBeCloseTo(100);
    expect(r.antes.n).toBe(3);
    expect(r.depois.media).toBeCloseTo(150);
    expect(r.depois.n).toBe(2);
    expect(r.deltaPct).toBeCloseTo(50);
  });
  it("respects the janela window", () => {
    const r = beforeAfter(serie, "2025-01-15", { valueKey: "v", janela: 1 });
    expect(r.antes.n).toBe(1);
    expect(r.depois.n).toBe(1);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/utils/periodos.test.js` → FAIL ("beforeAfter is not a function").

- [ ] **Step 3: Implement `beforeAfter`**

```js
export function beforeAfter(serie, markerDate, { valueKey, anoKey = "ano", mesKey = "mes", janela = 12 }) {
  const d = markerDate instanceof Date ? markerDate : new Date(markerDate);
  const markKey = d.getUTCFullYear() * 12 + d.getUTCMonth(); // months since year 0, marker month index
  const pts = (serie || [])
    .map((r) => ({ key: r[anoKey] * 12 + (r[mesKey] - 1), v: r[valueKey] ?? 0 }))
    .sort((a, b) => a.key - b.key);
  const antesPts = pts.filter((p) => p.key < markKey).slice(-janela);
  const depoisPts = pts.filter((p) => p.key >= markKey).slice(0, janela);
  const mean = (arr) => (arr.length ? arr.reduce((s, p) => s + p.v, 0) / arr.length : null);
  const mAntes = mean(antesPts);
  const mDepois = mean(depoisPts);
  return {
    antes: { media: mAntes, n: antesPts.length },
    depois: { media: mDepois, n: depoisPts.length },
    deltaPct: pctChange(mDepois, mAntes),
  };
}
```

- [ ] **Step 4: Run to verify it passes** → `npx vitest run src/utils/periodos.test.js` PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend-observatorio/src/utils/periodos.js frontend-observatorio/src/utils/periodos.test.js
git commit -m "feat(front): beforeAfter util (tested)"
```

---

### Task 7: Register the Impacto page (plan module, nav, route)

**Files:**
- Modify: `frontend-observatorio/src/pages/admin/PlanoConfigAdminPage.jsx` (MODULOS)
- Modify: `frontend-observatorio/src/app/layouts/DashboardLayout.jsx` (nav + NAV_FLAT covers it automatically)
- Modify: `frontend-observatorio/src/app/router/AppRouter.jsx` (route + import)

**Interfaces:**
- Consumes: `ImpactoPage` (Task 8) — create a minimal placeholder first so the route resolves, fully built in Task 8.

- [ ] **Step 1: Add the module to MODULOS**

In `PlanoConfigAdminPage.jsx` `MODULOS`, after the `projetos` entry add:
```js
  { key: "impacto", label: "Impacto de Ações" },
```

- [ ] **Step 2: Add the nav item**

In `DashboardLayout.jsx` NAV_STRUCTURE, right after the Timeline link, add:
```js
  { type: "link", to: "/app/impacto", label: "Impacto de Ações", icon: BoltIcon, modulo: "impacto" },
```
Add `BoltIcon` to the `@heroicons/react/24/outline` import block.

- [ ] **Step 3: Add the route + import**

In `AppRouter.jsx`, add `import ImpactoPage from "../../pages/impacto/ImpactoPage";` near the other page imports, and inside the `/app` routes add:
```jsx
<Route path="impacto" element={<ImpactoPage />} />
```

- [ ] **Step 4: Minimal placeholder page so build passes**

Create `frontend-observatorio/src/pages/impacto/ImpactoPage.jsx`:
```jsx
export default function ImpactoPage() {
  return <div className="p-6">Impacto de Ações</div>;
}
```

- [ ] **Step 5: Build + commit**

```bash
npx vite build
git add frontend-observatorio/src/app/router/AppRouter.jsx frontend-observatorio/src/app/layouts/DashboardLayout.jsx frontend-observatorio/src/pages/admin/PlanoConfigAdminPage.jsx frontend-observatorio/src/pages/impacto/ImpactoPage.jsx
git commit -m "feat(impacto): route, nav item and plan module"
```

---

### Task 8: Build the Impacto de Ações page

**Files:**
- Modify: `frontend-observatorio/src/pages/impacto/ImpactoPage.jsx`

**Interfaces:**
- Consumes: `beforeAfter` (Task 6), `AreaLineChart`/`Annotation` + formatters (existing), `useAuth`/`useViewAs` (existing), `api` (existing).

**Indicator registry** (curated headline metrics, monthly):
```js
const INDICADORES = [
  { key: "arrecadacao", label: "Arrecadação total", endpoint: "/arrecadacao/serie", valueKey: "total", fmt: fmtMoneyShort },
  { key: "caged", label: "Saldo de empregos (CAGED)", endpoint: "/caged/serie", valueKey: "saldo", fmt: fmtNumber },
  { key: "pix", label: "Volume PIX", endpoint: "/pix/serie", derive: (d) => (d.vl_pagador_pf||0)+(d.vl_pagador_pj||0), fmt: fmtMoneyShort },
  { key: "estban", label: "Crédito (ESTBAN)", endpoint: "/estban/serie", valueKey: "valor_operacoes_credito", fmt: fmtMoneyShort, dateFromRef: true },
  { key: "comex", label: "Saldo comercial (Comex)", endpoint: "/comex/serie", derive: (d) => (d.valor_usd_export||0)-(d.valor_usd_import||0), fmt: fmtMoneyShort },
  { key: "bolsa_familia", label: "Beneficiários Bolsa Família", endpoint: "/bolsa_familia/serie", valueKey: "total_beneficiarios", fmt: fmtNumber },
  { key: "pe_de_meia", label: "Estudantes Pé-de-Meia", endpoint: "/pe_de_meia/serie", valueKey: "total_estudantes", fmt: fmtNumber },
];
```
(When the chosen indicator has `derive`, map the série to a normalized `{ano,mes,_v}` and use `valueKey:"_v"`. For `comex` confirm the export/import field shape from `/comex/serie` at implementation; adjust `derive` to the real field names.)

- [ ] **Step 1: Implement the page**

Page behavior: dropdown of `INDICADORES`; dropdown of marcos (`GET /marcos`, scoped to município); on both selected, fetch the indicator série, normalize to `{ano,mes,value}`, render `AreaLineChart` with an `Annotation` at the marco's month, and two "Antes / Depois" cards from `beforeAfter(serie, marco.data, { valueKey, janela: 12 })` plus the `deltaPct` badge. Reuse the `needsMunicipio` empty-state pattern (ADMIN_GLOBAL without view-as) used on dataset pages. Show "dados insuficientes" when a side has `n === 0`.

```jsx
import { useEffect, useMemo, useState } from "react";
import api from "../../services/api";
import { NidPanel, NidPageHeader } from "../../components/nid/Panel";
import { AreaLineChart, Annotation, fmtMoneyShort, fmtNumber } from "../../components/nid/charts";
import { useAuth } from "../../context/AuthContext";
import { useViewAs } from "../../context/ViewAsContext";
import { beforeAfter } from "../../utils/periodos";

const INDICADORES = [ /* …registry above… */ ];

export default function ImpactoPage() {
  const { user } = useAuth();
  const { viewAsId } = useViewAs();
  const needsMunicipio = user?.role === "ADMIN_GLOBAL" && viewAsId == null;

  const [marcos, setMarcos] = useState([]);
  const [indKey, setIndKey] = useState(INDICADORES[0].key);
  const [marcoId, setMarcoId] = useState("");
  const [serie, setSerie] = useState([]);

  const ind = INDICADORES.find((i) => i.key === indKey);
  const marco = marcos.find((m) => String(m.id) === String(marcoId));

  useEffect(() => { api.get("/marcos").then((r) => setMarcos(r.data || [])).catch(() => {}); }, []);
  useEffect(() => {
    if (needsMunicipio) return;
    api.get(ind.endpoint).then((r) => {
      const rows = (r.data || []).map((d) => {
        const ano = ind.dateFromRef ? new Date(d.data_referencia).getUTCFullYear() : d.ano;
        const mes = ind.dateFromRef ? new Date(d.data_referencia).getUTCMonth() + 1 : d.mes;
        const value = ind.derive ? ind.derive(d) : d[ind.valueKey];
        return { ano, mes, value };
      }).filter((d) => d.ano && d.mes);
      setSerie(rows);
    }).catch(() => setSerie([]));
  }, [indKey, needsMunicipio]);

  const ba = useMemo(
    () => (marco ? beforeAfter(serie, marco.data, { valueKey: "value", janela: 12 }) : null),
    [serie, marco]
  );
  const areaData = useMemo(
    () => serie.slice().sort((a,b)=> a.ano-b.ano || a.mes-b.mes)
      .map((d) => ({ label: `${String(d.ano).slice(2)}/${String(d.mes).padStart(2,"0")}`, value: d.value || 0 })),
    [serie]
  );
  const marcoLabel = marco ? `${String(new Date(marco.data).getUTCFullYear()).slice(2)}/${String(new Date(marco.data).getUTCMonth()+1).padStart(2,"0")}` : null;

  // …render: header, needsMunicipio empty-state, two <select>s (indicador, marco),
  // AreaLineChart with <Annotation x={marcoLabel} kind="positive">{marco.titulo}</Annotation>,
  // and Antes/Depois cards from `ba` (média + deltaPct, or "dados insuficientes" when n===0).
}
```

Implement the JSX fully following the existing page conventions (`NidPageHeader`, `NidPanel`, the `needsMunicipio` dashed empty-state copied from `ArrecadacaoPage`, two styled `<select>`s, the `AreaLineChart` with the annotation, and two cards rendering `ind.fmt(ba.antes.media)` / `ind.fmt(ba.depois.media)` + a `+/-{deltaPct}%` badge).

- [ ] **Step 2: Build + manual verify + commit**

```bash
npx vite build
```
Manual: `/app/impacto` (with a município in view-as) → pick indicator + marco → vertical annotation at marco month, Antes/Depois cards with %.
```bash
git add frontend-observatorio/src/pages/impacto/ImpactoPage.jsx
git commit -m "feat(impacto): marco-based before/after analysis page"
```

---

## PHASE 2 — Drill-down focado

### Task 9: `onSelect` callback on categorical charts

**Files:**
- Modify: `frontend-observatorio/src/components/nid/charts.jsx` (`HBarChart`, `DonutChartCore`, `PercentBarChart`)

**Interfaces:**
- Produces: each of `HBarChart`, `DonutChart`, falls through `onSelect(item)` where
  `item` is the datum (`{label, value, ...}`); when `onSelect` is provided, rows/
  slices/segments become clickable (cursor pointer + role button).

- [ ] **Step 1: Add `onSelect` to `HBarChart`** — accept `onSelect` prop; on each row add `onClick={() => onSelect?.(d)}` and `style={{ cursor: onSelect ? "pointer" : undefined }}`.
- [ ] **Step 2: Add `onSelect` to `DonutChart` → `DonutChartCore`** — thread the prop; on each slice `<g onClick={() => onSelect?.(s)} style={{cursor: onSelect?"pointer":undefined}}>`.
- [ ] **Step 3: Add `onSelect` to `PercentBarChart`** — on each segment + legend row `onClick`.
- [ ] **Step 4: Build + commit**

```bash
npx vite build
git add frontend-observatorio/src/components/nid/charts.jsx
git commit -m "feat(charts): optional onSelect for drill-down"
```

---

### Task 10: `DetalheModal` component

**Files:**
- Create: `frontend-observatorio/src/components/nid/DetalheModal.jsx`

**Interfaces:**
- Produces: `<DetalheModal open onClose titulo serie fmt valor />` — reuse the
  existing `NidModal` (`components/nid/NidModal.jsx`) as the shell. Props:
  `open` (bool), `onClose` (fn), `titulo` (string), `serie` (optional array of
  `{label, value}` for the time series), `fmt` (formatter fn), `valor` (optional
  single number when there's no series). Renders an `AreaLineChart` of `serie`
  when `serie?.length`, otherwise a small stat block showing `fmt(valor)`.

- [ ] **Step 1: Implement** a thin wrapper over `NidModal` with props `{ open, onClose, titulo, serie, fmt, valor }`; if `serie?.length`, render an `AreaLineChart` of it; else render `fmt(valor)` as a stat. Follow the `NidModal` usage already in `DatasetsAdminPage.jsx`.
- [ ] **Step 2: Build + commit** `feat(charts): DetalheModal for drill-down`.

---

### Task 11: Wire drill-down on CAGED/RAIS (CNAE) and Empresas (porte)

**Files:**
- Modify: `frontend-observatorio/src/pages/caged/CagedPage.jsx`
- Modify: `frontend-observatorio/src/pages/rais/RaisPage.jsx`
- Modify: `frontend-observatorio/src/pages/empresas/EmpresasPage.jsx`

**Interfaces:**
- Consumes: `onSelect` (Task 9), `DetalheModal` (Task 10).

- [ ] **Step 1: CAGED** — on the CNAE/sector chart pass `onSelect={(d) => setDetalhe(d)}`; build a per-sector série from the already-loaded `porCnae` (filter by `d.label`/secao) and open `DetalheModal` with it. `npx vite build`; commit.
- [ ] **Step 2: RAIS** — same on the "Top Setores (CNAE)" chart using the loaded RAIS por_cnae data; build; commit.
- [ ] **Step 3: Empresas** — on "Distribuição por Porte" donut, `onSelect` opens `DetalheModal` showing the porte's count/share (no time series); build; commit.

---

## Self-Review notes
- Spec coverage: 1a (Tasks 1–5), 1b (Tasks 6–8), 2 (Tasks 9–11) — all covered. Edge cases (one-year → toggle disabled; insufficient before/after → "dados insuficientes"; no series → numbers only) are in Tasks 4/8/11.
- Plan gating for the Impacto page: Task 7 adds the `impacto` module + nav `modulo`, which automatically flows through the existing lock/teaser (`isLocked`/`PlanLockedView`) and `NAV_FLAT` route gating — no extra work.
- Verification: pure utils via Vitest (Tasks 2,3,6); everything else via `npx vite build` + the manual checks listed.
