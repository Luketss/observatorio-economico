# UX/UI C3 — Tabelas cruas → DataTable — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Converter as 6 tabelas HTML cruas (RAIS, ESTBAN, FPM, Dinheiro na Mesa, Emendas ×2) para o componente `DataTable` nid, estendido com sort clicável, célula customizada (`render`) e empty state padrão (`emptyMessage`).

**Architecture:** Lógica de ordenação pura em `src/utils/tableSort.js` (testada com vitest); `DataTable.jsx` ganha estado interno de sort, precedência de `render` no `Cell` e `ChartState` para vazio; as 5 páginas trocam `<table>` cru por `<DataTable columns data .../>`. Zero backend.

**Tech Stack:** React 19 + Vite, vitest 2 (`npm run test` = `vitest run`), TailwindCSS + tokens CSS custom (`global.css`). Spec: `docs/superpowers/specs/2026-07-28-uxui-c3-datatable-design.md`.

## Global Constraints

- **Zero backend** — só `frontend-observatorio/`.
- Gates: `npm run test` exit 0 e `npm run build` exit 0 (rodar de `frontend-observatorio/`). **Eslint baseline é sujo e NÃO é gate** (falsos-positivos endêmicos: "motion unused", set-state-in-effect).
- Copy pt-BR; formatação monetária/número via helpers existentes das páginas (`fmtMoneyFull`, `fmtBRL`, `fmtNum`, `fmtBR`, `fmtCurrency`) — não criar formatadores novos.
- Sort: 1º clique **desc** para coluna numérica (primeiro valor não-nulo é `number`, ou `kind: "delta"`), **asc** para texto; 2º clique inverte; 3º restaura ordem original. Nulos sempre por último. Comparação de texto com `localeCompare` pt-BR.
- Enriquecimento (`__delta`/`__trend`/`__heatBg`) sempre calculado na **ordem original** de `data`; sort só reordena a exibição.
- Branch de trabalho: `feat/uxui-c3-datatable` a partir de `main`.
- Commits pequenos e frequentes, mensagens em português no padrão do repo (`feat(uxui): ...`, `test(uxui): ...`).

---

### Task 1: `utils/tableSort.js` — lógica pura de sort (TDD)

**Files:**
- Create: `frontend-observatorio/src/utils/tableSort.js`
- Test: `frontend-observatorio/src/utils/tableSort.test.js`

**Interfaces:**
- Consumes: nada (módulo puro, sem imports).
- Produces (usado pela Task 2):
  - `isColumnSortable(col) → boolean` — `false` p/ `kind:"spark"` ou `sortable:false`; `true` caso contrário.
  - `sortKeyFor(col) → string` — `"__delta"` quando `kind:"delta"`, senão `col.key`.
  - `isNumericColumn(col, rows) → boolean` — `true` p/ `kind:"delta"` ou quando o primeiro valor não-nulo de `rows[i][sortKeyFor(col)]` é `number`.
  - `nextSortState(current, col, rows) → {key, dir:"asc"|"desc"} | null` — ciclo de clique.
  - `applySort(rows, sortState) → rows` — cópia ordenada (ou o próprio array se `sortState == null`); nulos por último; texto `localeCompare("pt-BR", {numeric:true, sensitivity:"base"})`.

- [ ] **Step 1: Criar branch**

```bash
git checkout main
git checkout -b feat/uxui-c3-datatable
```

- [ ] **Step 2: Escrever os testes (falhando)**

Criar `frontend-observatorio/src/utils/tableSort.test.js`:

```js
import { describe, it, expect } from "vitest";
import {
  isColumnSortable, sortKeyFor, isNumericColumn, nextSortState, applySort,
} from "./tableSort";

const numRows = [{ v: 30, n: "Caio" }, { v: null, n: "ávila" }, { v: 10, n: "Bruno" }];

describe("isColumnSortable", () => {
  it("spark nunca é ordenável; sortable:false desliga; default é ordenável", () => {
    expect(isColumnSortable({ key: "t", kind: "spark" })).toBe(false);
    expect(isColumnSortable({ key: "t", sortable: false })).toBe(false);
    expect(isColumnSortable({ key: "t" })).toBe(true);
    expect(isColumnSortable({ key: "t", kind: "delta" })).toBe(true);
  });
});

describe("sortKeyFor", () => {
  it("delta ordena pelo __delta computado; demais pela própria key", () => {
    expect(sortKeyFor({ key: "x", kind: "delta" })).toBe("__delta");
    expect(sortKeyFor({ key: "x" })).toBe("x");
  });
});

describe("isNumericColumn", () => {
  it("detecta pelo primeiro valor não-nulo (ignora nulls à frente)", () => {
    const rows = [{ v: null }, { v: 5 }];
    expect(isNumericColumn({ key: "v" }, rows)).toBe(true);
    expect(isNumericColumn({ key: "n" }, numRows)).toBe(false);
  });
  it("kind delta é sempre numérica; coluna sem valores não é", () => {
    expect(isNumericColumn({ key: "x", kind: "delta" }, [])).toBe(true);
    expect(isNumericColumn({ key: "z" }, numRows)).toBe(false);
  });
});

describe("nextSortState", () => {
  it("numérica cicla null → desc → asc → null", () => {
    const col = { key: "v" };
    const s1 = nextSortState(null, col, numRows);
    expect(s1).toEqual({ key: "v", dir: "desc" });
    const s2 = nextSortState(s1, col, numRows);
    expect(s2).toEqual({ key: "v", dir: "asc" });
    expect(nextSortState(s2, col, numRows)).toBeNull();
  });
  it("texto cicla null → asc → desc → null", () => {
    const col = { key: "n" };
    const s1 = nextSortState(null, col, numRows);
    expect(s1).toEqual({ key: "n", dir: "asc" });
    const s2 = nextSortState(s1, col, numRows);
    expect(s2).toEqual({ key: "n", dir: "desc" });
    expect(nextSortState(s2, col, numRows)).toBeNull();
  });
  it("trocar de coluna reinicia o ciclo na direção inicial da nova coluna", () => {
    const atual = { key: "v", dir: "desc" };
    expect(nextSortState(atual, { key: "n" }, numRows)).toEqual({ key: "n", dir: "asc" });
  });
});

describe("applySort", () => {
  it("desc numérico com nulos por último; não muta o array original", () => {
    const out = applySort(numRows, { key: "v", dir: "desc" });
    expect(out.map((r) => r.v)).toEqual([30, 10, null]);
    expect(numRows.map((r) => r.v)).toEqual([30, null, 10]);
  });
  it("asc numérico mantém nulos por último", () => {
    const out = applySort(numRows, { key: "v", dir: "asc" });
    expect(out.map((r) => r.v)).toEqual([10, 30, null]);
  });
  it("texto pt-BR: acentos não vão para o fim", () => {
    const out = applySort(numRows, { key: "n", dir: "asc" });
    expect(out.map((r) => r.n)).toEqual(["ávila", "Bruno", "Caio"]);
  });
  it("sortState null devolve o próprio array na ordem original", () => {
    expect(applySort(numRows, null)).toBe(numRows);
  });
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run (de `frontend-observatorio/`): `npx vitest run src/utils/tableSort.test.js`
Expected: FAIL — "Cannot find module './tableSort'" (ou equivalente).

- [ ] **Step 4: Implementar `tableSort.js`**

```js
// tableSort — lógica pura de ordenação do DataTable (UX/UI C3).
// Estado de sort: null (ordem original) ou { key, dir: "asc" | "desc" }.

export function isColumnSortable(col) {
  if (col.kind === "spark") return false;
  return col.sortable !== false;
}

export function sortKeyFor(col) {
  return col.kind === "delta" ? "__delta" : col.key;
}

export function isNumericColumn(col, rows) {
  if (col.kind === "delta") return true;
  const key = sortKeyFor(col);
  const first = (rows || []).find((r) => r?.[key] != null);
  return typeof first?.[key] === "number";
}

export function nextSortState(current, col, rows) {
  const key = sortKeyFor(col);
  const firstDir = isNumericColumn(col, rows) ? "desc" : "asc";
  if (!current || current.key !== key) return { key, dir: firstDir };
  if (current.dir === firstDir) {
    return { key, dir: firstDir === "desc" ? "asc" : "desc" };
  }
  return null;
}

function compareValues(a, b, dir) {
  const aNull = a == null || a === "";
  const bNull = b == null || b === "";
  if (aNull && bNull) return 0;
  if (aNull) return 1; // nulos por último em qualquer direção
  if (bNull) return -1;
  const cmp =
    typeof a === "number" && typeof b === "number"
      ? a - b
      : String(a).localeCompare(String(b), "pt-BR", { numeric: true, sensitivity: "base" });
  return dir === "desc" ? -cmp : cmp;
}

export function applySort(rows, sortState) {
  if (!sortState) return rows;
  const { key, dir } = sortState;
  return [...rows].sort((ra, rb) => compareValues(ra?.[key], rb?.[key], dir));
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `npx vitest run src/utils/tableSort.test.js`
Expected: PASS (10 testes).

- [ ] **Step 6: Suite completa + commit**

Run: `npm run test` — exit 0 (nenhuma regressão).

```bash
git add frontend-observatorio/src/utils/tableSort.js frontend-observatorio/src/utils/tableSort.test.js
git commit -m "test(uxui): logica pura de sort do DataTable (tableSort.js)"
```

---

### Task 2: `DataTable.jsx` — render por coluna, sort clicável, emptyMessage

**Files:**
- Modify: `frontend-observatorio/src/components/nid/DataTable.jsx`
- Modify: `frontend-observatorio/src/styles/global.css` (bloco `.nid-data-table`, após a regra `th` ~linha 408)

**Interfaces:**
- Consumes (Task 1): `isColumnSortable`, `sortKeyFor`, `isNumericColumn` (via `nextSortState`), `nextSortState`, `applySort` de `../../utils/tableSort`; `ChartState` (default export de `./ChartState`, props `kind/height/message`).
- Produces (Tasks 3–5): descritor de coluna aceita `render?: (row, index) => node` (precedência sobre `kind`/`fmt`), `sortable?: false`, `ariaLabel?: string` (no `<th>`); prop nova `emptyMessage?: string` (frame `ChartState` 240px quando `data` vazio; sem a prop, retorna `null` como hoje).

- [ ] **Step 1: Estender o componente**

Em `DataTable.jsx`:

1. Imports novos:

```js
import ChartState from "./ChartState";
import { applySort, isColumnSortable, nextSortState, sortKeyFor } from "../../utils/tableSort";
```

2. Assinatura: `export default function DataTable({ columns, data, ownIndex, pageSize, emptyMessage })`.

3. Estado novo, junto do `page`:

```js
const [sort, setSort] = useState(null);
```

4. No `useMemo` de `enriched`: marcar a linha própria ANTES do sort (a tag "você" precisa viajar com a linha ao ordenar). No retorno de cada row acrescentar `__own: i === ownIndex`, e nas duas saídas (`valueKey` ausente e normal). Deps passam a `[data, columns, ownIndex]`.

5. Sort aplicado sobre o dataset enriquecido completo, antes do slice de página:

```js
const sorted = useMemo(() => applySort(enriched, sort), [enriched, sort]);
```

Trocar as referências de `enriched` para `sorted` em `pageCount`, `visible` e no `nid-pager-info` (`{startIdx + 1}–{startIdx + visible.length} de {sorted.length}`).

6. Empty state (substitui o `return null` atual):

```js
if (!data || data.length === 0) {
  return emptyMessage
    ? <ChartState kind="empty" height={240} message={emptyMessage} />
    : null;
}
```

(Manter este early-return DEPOIS dos hooks, como hoje.)

7. Handler de sort (reseta página):

```js
const handleSort = (col) => {
  setSort((s) => nextSortState(s, col, enriched));
  setPage(0);
};
```

8. `<th>` — coluna ordenável vira botão (teclado grátis), com `aria-sort` e indicador só na ativa:

```jsx
{columns.map((c) => {
  const sortable = isColumnSortable(c);
  const active = sort && sortable && sort.key === sortKeyFor(c);
  return (
    <th
      key={c.key}
      style={{ textAlign: c.align || "left", width: c.width }}
      aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : undefined}
      aria-label={c.ariaLabel}
    >
      {sortable ? (
        <button type="button" className="nid-th-sort" onClick={() => handleSort(c)}>
          {c.label}
          <span className="sort-ind" aria-hidden="true">
            {active ? (sort.dir === "asc" ? "▲" : "▼") : ""}
          </span>
        </button>
      ) : (
        c.label
      )}
    </th>
  );
})}
```

9. `Cell` — precedência do `render` e tag "você" pela linha (não pela posição). Assinatura vira `function Cell({ row, col, index })`; no corpo do map das linhas, `<Cell row={row} col={c} index={absIdx} />` (remover a prop `isOwn`). Primeira linha do `Cell`:

```js
if (col.render) return <>{col.render(row, index)}</>;
```

E nos dois pontos que usavam `isOwn` (`col.fmt` e valor cru), trocar por `row.__own`:

```jsx
{row.__own && <span className="own-tag">você</span>}
```

10. Atualizar o comentário-cabeçalho do arquivo: acrescentar `render?`, `sortable?`, `ariaLabel?` no shape do descritor e `emptyMessage` na descrição das props.

- [ ] **Step 2: CSS do header ordenável**

Em `global.css`, logo após a regra `.nid-data-table th { ... }` (~linha 408), inserir:

```css
.nid-data-table .nid-th-sort {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 0;
  border: 0;
  background: none;
  cursor: pointer;
  font: inherit;
  color: inherit;
  text-transform: inherit;
  letter-spacing: inherit;
}
.nid-data-table .nid-th-sort:hover {
  color: var(--text-dim);
}
.nid-data-table th[aria-sort] .nid-th-sort {
  color: var(--text);
}
.nid-data-table .nid-th-sort .sort-ind {
  font-size: 8px;
  line-height: 1;
  min-width: 8px;
}
```

- [ ] **Step 3: Gates**

Run (de `frontend-observatorio/`): `npm run test` → exit 0; `npm run build` → exit 0.
Sanidade visual rápida (opcional): as 4 páginas que já usam DataTable (PIB, Arrecadação, INSS, VAF) ganham sort sem mudança de código.

- [ ] **Step 4: Commit**

```bash
git add frontend-observatorio/src/components/nid/DataTable.jsx frontend-observatorio/src/styles/global.css
git commit -m "feat(uxui): DataTable com sort clicavel, render por coluna e emptyMessage"
```

---

### Task 3: FPM + Dinheiro na Mesa → DataTable

**Files:**
- Modify: `frontend-observatorio/src/pages/fpm/FpmPage.jsx` (painel "Total anual", ~linhas 224–248)
- Modify: `frontend-observatorio/src/pages/dinheiro-na-mesa/DinheiroNaMesaPage.jsx` (painel "Detalhe anual", ~linhas 140–170)

**Interfaces:**
- Consumes (Task 2): `DataTable` com `columns` (`fmt`, `mono`, `align`, `render`), `emptyMessage`.
- Produces: nada (folhas).

- [ ] **Step 1: FPM — substituir a tabela crua**

Adicionar o import (junto aos imports de componentes nid existentes):

```js
import DataTable from "../../components/nid/DataTable";
```

Substituir TODO o conteúdo do `<NidPanel title="Total anual" ...>` (o `<div className="overflow-x-auto">` inteiro, incl. a row de empty com `colSpan={3}`) por:

```jsx
<NidPanel title="Total anual" sub="Soma dos repasses por ano">
  <DataTable
    columns={[
      { key: "ano", label: "Ano", width: 80 },
      { key: "valor_total", label: "Total (R$)", align: "right", mono: true, fmt: fmtMoneyFull },
      { key: "meses", label: "Meses com dado", align: "right", mono: true },
    ]}
    data={anualDesc}
    emptyMessage="Sem dados de repasse."
  />
</NidPanel>
```

(`fmtMoneyFull` já é importado na página; `anualDesc` já existe.)

- [ ] **Step 2: Dinheiro na Mesa — substituir a tabela crua**

Mesmo import de `DataTable`. Substituir o conteúdo do `<NidPanel title="Detalhe anual" ...>` por:

```jsx
<NidPanel title="Detalhe anual" sub="Valores firmados, via emenda e desembolsados">
  <DataTable
    columns={[
      { key: "ano", label: "Ano", width: 80, render: (i) => `${i.ano}${i.parcial ? "*" : ""}` },
      { key: "voce", label: "Você (R$)", align: "right", mono: true, fmt: fmtMoneyFull },
      { key: "media_pares", label: "Média pares (R$)", align: "right", mono: true, fmt: fmtMoneyFull },
      { key: "via_emenda", label: "Via emenda (R$)", align: "right", mono: true, fmt: fmtMoneyFull },
      { key: "desembolsado", label: "Desembolsado (R$)", align: "right", mono: true, fmt: fmtMoneyFull },
      { key: "qtd_convenios", label: "Convênios", align: "right", mono: true },
    ]}
    data={serieDesc}
    emptyMessage="Sem dados de captação."
  />
</NidPanel>
```

(`media_pares` nulo vira "—" pelo caminho `fmt` do próprio DataTable; o sort de "Ano" continua numérico porque `i.ano` é number — o `render` só afeta a exibição.)

- [ ] **Step 3: Gates**

Run: `npm run test` → exit 0; `npm run build` → exit 0.

- [ ] **Step 4: Commit**

```bash
git add frontend-observatorio/src/pages/fpm/FpmPage.jsx frontend-observatorio/src/pages/dinheiro-na-mesa/DinheiroNaMesaPage.jsx
git commit -m "feat(uxui): tabelas de FPM e Dinheiro na Mesa no DataTable padrao"
```

---

### Task 4: RAIS + ESTBAN → DataTable

**Files:**
- Modify: `frontend-observatorio/src/pages/rais/RaisPage.jsx` (painel "Top 10 Ocupações", ~linhas 645–670; consts `thStyle`/`tdStyle` ~690–704)
- Modify: `frontend-observatorio/src/pages/estban/EstbanPage.jsx` (bloco "Detalhamento por Instituição", ~linhas 332–398)

**Interfaces:**
- Consumes (Task 2): `DataTable` com `columns`, `pageSize`, `emptyMessage`.
- Produces: nada (folhas).

- [ ] **Step 1: RAIS — substituir a tabela inline-styled**

Adicionar import:

```js
import DataTable from "../../components/nid/DataTable";
```

Substituir o conteúdo do `<NidPanel title="Top 10 Ocupações (CBO 2002)" ...>` (o ternário `cboAno.length > 0 ? <div className="table-wrap">... : <EmptyMsg/>` inteiro) por:

```jsx
<NidPanel title="Top 10 Ocupações (CBO 2002)" sub={`Família ocupacional · ${anoAtivo || ""}`}>
  <DataTable
    columns={[
      { key: "cbo_familia", label: "CBO", width: 70, mono: true },
      { key: "descricao", label: "Descrição" },
      { key: "total_vinculos", label: "Vínculos", align: "right", mono: true, fmt: fmtBR },
      { key: "remuneracao_media", label: "Rem. média", align: "right", mono: true, fmt: fmtCurrency },
    ]}
    data={cboAno}
    emptyMessage="Sem dados disponíveis"
  />
</NidPanel>
```

Remover as consts `thStyle` e `tdStyle` (ficam órfãs). **Manter** `EmptyMsg` — ainda é usado pelos outros painéis da página (ex.: "Motivos de Desligamento", linha ~642). `fmtBR`/`fmtCurrency` são locais da página e continuam usados.

- [ ] **Step 2: ESTBAN — painel cru → NidPanel + DataTable**

`NidPanel` já é importado na página. Substituir o bloco inteiro do painel cru (do `<div className="bg-[var(--panel)] p-6 rounded-2xl ...">` até seu fechamento, ~linhas 333–398 — o bloco fica DENTRO do `<PlanGate planKey="estban.por_instituicao">` existente) por:

```jsx
<NidPanel title="Detalhamento por Instituição">
  {loading ? (
    <div className="animate-pulse h-40 bg-slate-50 rounded-xl" />
  ) : (
    <DataTable
      columns={[
        { key: "nome_instituicao", label: "Instituição" },
        { key: "qtd_agencias", label: "Agências", align: "right", mono: true, fmt: fmtNum },
        { key: "valor_operacoes_credito", label: "Operações Crédito", align: "right", mono: true, fmt: fmtBRL },
        { key: "valor_depositos_vista", label: "Depósitos Vista", align: "right", mono: true, fmt: fmtBRL },
        { key: "valor_poupanca", label: "Poupança", align: "right", mono: true, fmt: fmtBRL },
        { key: "valor_depositos_prazo", label: "Dep. Prazo", align: "right", mono: true, fmt: fmtBRL },
      ]}
      data={porInstituicao}
      pageSize={12}
      emptyMessage="Sem dados disponíveis"
    />
  )}
</NidPanel>
```

Adicionar o import de `DataTable`. `fmtNum`/`fmtBRL` são locais da página. O `PlanGate` em volta não muda. (Deltas esperados e aceitos no spec: some o hover de linha e a borda `border-slate-50`; a lista passa a paginar de 12 em 12.)

- [ ] **Step 3: Gates**

Run: `npm run test` → exit 0; `npm run build` → exit 0.

- [ ] **Step 4: Commit**

```bash
git add frontend-observatorio/src/pages/rais/RaisPage.jsx frontend-observatorio/src/pages/estban/EstbanPage.jsx
git commit -m "feat(uxui): tabelas de RAIS e ESTBAN no DataTable padrao"
```

---

### Task 5: Emendas — as 2 tabelas → DataTable

**Files:**
- Modify: `frontend-observatorio/src/pages/emendas/EmendasPage.jsx` (Ranking ~linhas 94–121; Emendas destinadas ~linhas 132–169)

**Interfaces:**
- Consumes (Task 2): `DataTable` com `render` (BarraExecucao, botão de ação, rank), `sortable: false`, `ariaLabel`, `pageSize`, `emptyMessage`.
- Produces: nada (folha).

- [ ] **Step 1: Pré-computar o rank do Ranking**

O rank precisa sobreviver ao sort, então vira campo do dado (ordem vinda do backend). Junto aos outros hooks (antes dos early-returns), adicionar:

```js
const porAutorRankeado = useMemo(
  () => (radar?.por_autor || []).map((a, i) => ({ ...a, rank: i + 1 })),
  [radar]
);
```

(Import de `useMemo` junto ao `useEffect`/`useState` da linha 1.)

- [ ] **Step 2: Ranking por parlamentar → DataTable**

Adicionar import:

```js
import DataTable from "../../components/nid/DataTable";
```

Substituir o conteúdo do `<NidPanel title="Ranking por parlamentar" ...>` (o `overflow-x-auto` + `<table>` inteiros) por:

```jsx
<NidPanel title="Ranking por parlamentar" sub="Total destinado e execução — quem manda (e quem não manda) recurso">
  <DataTable
    columns={[
      { key: "rank", label: "#", width: 50, sortable: false, render: (a) => <span className="muted">{a.rank}º</span> },
      { key: "autor", label: "Parlamentar" },
      { key: "num_emendas", label: "Emendas", align: "right", mono: true },
      { key: "empenhado", label: "Destinado (R$)", align: "right", mono: true, fmt: fmtMoneyFull },
      { key: "pago_total", label: "Pago (R$)", align: "right", mono: true, fmt: fmtMoneyFull },
      { key: "pct_pago", label: "Execução", width: 170, render: (a) => <BarraExecucao pct={a.pct_pago} /> },
    ]}
    data={porAutorRankeado}
    pageSize={12}
    emptyMessage="Sem emendas no período."
  />
</NidPanel>
```

- [ ] **Step 3: Emendas destinadas ao município → DataTable**

Substituir o conteúdo do `<NidPanel title="Emendas destinadas ao município" ...>` por:

```jsx
<NidPanel title="Emendas destinadas ao município" sub="Funil de execução: empenhado → liquidado → pago (inclui restos a pagar pagos)">
  <DataTable
    columns={[
      { key: "ano", label: "Ano", width: 70 },
      { key: "autor", label: "Autor" },
      { key: "tipo", label: "Tipo", render: (e) => <span className="muted" title={e.tipo}>{tipoCurto(e.tipo)}</span> },
      { key: "funcao", label: "Área" },
      { key: "empenhado", label: "Empenhado (R$)", align: "right", mono: true, fmt: fmtMoneyFull },
      { key: "pago_total", label: "Pago (R$)", align: "right", mono: true, fmt: fmtMoneyFull },
      { key: "pct_pago", label: "Execução", width: 170, render: (e) => <BarraExecucao pct={e.pct_pago} /> },
      {
        key: "acoes", label: "", sortable: false, align: "right", ariaLabel: "Ações",
        render: (e) => (
          <CriarOportunidadeCaptacao
            compact
            label="Criar oportunidade no funil a partir desta emenda"
            payload={emendaParaCaptacaoPayload(e)}
          />
        ),
      },
    ]}
    data={radar.emendas}
    pageSize={12}
    emptyMessage="Sem emendas no período."
  />
</NidPanel>
```

(`tipoCurto`, `BarraExecucao`, `CriarOportunidadeCaptacao` e `emendaParaCaptacaoPayload` já são importados/definidos na página. `funcao` nula vira "—" pelo caminho padrão do Cell. Empty state é NOVO — hoje a tabela renderiza `tbody` vazio.)

- [ ] **Step 4: Gates**

Run: `npm run test` → exit 0; `npm run build` → exit 0.

- [ ] **Step 5: Commit**

```bash
git add frontend-observatorio/src/pages/emendas/EmendasPage.jsx
git commit -m "feat(uxui): tabelas de Emendas no DataTable (rank, execucao e acao por linha)"
```

---

### Task 6: Verificação final

**Files:** nenhum (só verificação; correções pontuais se algo falhar).

- [ ] **Step 1: Gates completos**

De `frontend-observatorio/`: `npm run test` → exit 0 (suite antiga + 10 novos); `npm run build` → exit 0.

- [ ] **Step 2: Greps de limpeza**

- `grep -rn "table-wrap" frontend-observatorio/src/` → 0 ocorrências (classe morta removida com a conversão da RAIS).
- `grep -rn "<table" frontend-observatorio/src/pages/rais frontend-observatorio/src/pages/estban frontend-observatorio/src/pages/fpm frontend-observatorio/src/pages/dinheiro-na-mesa frontend-observatorio/src/pages/emendas` → 0 ocorrências.
- `grep -n "thStyle\|tdStyle" frontend-observatorio/src/pages/rais/RaisPage.jsx` → 0 ocorrências.
- Conferir que `EmptyMsg` segue usado na RaisPage (painéis de gráfico) — não remover.

- [ ] **Step 3: Checklist visual (fica para o usuário)**

Anotar no resumo final para o usuário conferir no browser: 6 tabelas novas + 4 antigas com visual nid uniforme; sort desc-first em coluna numérica com ▲/▼ e 3º clique restaurando; paginação em ESTBAN/Emendas; botão "criar oportunidade" funcionando dentro da tabela; empty states padronizados; delta/spark de PIB/Arrecadação/VAF continuam cronológicos após ordenar.

- [ ] **Step 4: Commit final (se houve correções) e merge**

Sem correções → nada a commitar. Integração ao `main` segue o fluxo padrão do projeto (superpowers:finishing-a-development-branch) após review.
