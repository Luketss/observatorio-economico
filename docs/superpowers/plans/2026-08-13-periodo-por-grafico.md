# Período por Gráfico — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Seletor compacto de presets (12m/5a/10a/Tudo) no header de cada gráfico de série temporal, sobrepondo o filtro da página só naquele gráfico.

**Architecture:** Util puro novo (`periodoGrafico.js`) aplica presets sobre a série **crua** com âncora no último dado da própria série; componente `PeriodoMenu` entra no slot `right` do `NidPanel` (que não muda); cada página guarda `{[chartKey]: preset}` usando os `indicadorKey chart_*` já plugados. Cobertura real (mapeada página a página): **24 painéis candidatos em 9 páginas** — Empresas fica de fora (só snapshots cadastrais) e painéis top-N/comparativo não recebem seletor.

**Tech Stack:** React 18, vitest (node + jsdom), sem mudança de backend.

**Spec:** `docs/superpowers/specs/2026-08-13-periodo-por-grafico-design.md`

## Global Constraints

- Preset aplica sobre a série **CRUA** (não a filtrada da página) — um override 10a amplia além do filtro de 12m da página.
- Semântica dos presets POR SÉRIE (âncora no último dado DAQUELA série, não no `years` da página):
  - `12m`: janela de `janela12m(serie, extrair)` de `utils/periodoCards.js` (12 meses ancorados; série anual → só o último ano).
  - `5a`/`10a`: `{yearFrom: max-4|max-9, yearTo: max}` com `max` = maior ano da própria série; meses vazios.
  - `tudo`: série completa.
  - Filtragem sempre via `dentroDoFiltro(item, filtro, extrair)` existente — nenhuma segunda implementação de calendário.
- `preset` vazio/null → o gráfico segue a série da página (comportamento atual intocado).
- `NidPanel` NÃO muda (usa o slot `right`); `FilterBar` NÃO muda o comportamento (só ganha export se preciso — não é preciso: nada de `presetRange`, a lógica nova vive no util novo).
- Painéis com ramo "comparar" (`CompareToggle`): o `PeriodoMenu` fica OCULTO quando `comparar` está ativo (o modo comparar já ignora filtros hoje).
- Painéis NÃO-candidatos (top-N, snapshot, comparativo, tabelas) não recebem seletor nenhum.
- Testes frontend: `cd frontend-observatorio && npm test`; jsdom via `// @vitest-environment jsdom` na 1ª linha. **`npm run lint` está quebrado — não é gate.**
- Textos pt-BR; UTF-8 intacto; branch `feat/periodo-por-grafico` de `main`; commit só dos arquivos de cada task (nunca `.claude/settings.local.json`).

---

### Task 1: Util puro `periodoGrafico.js`

**Files:**
- Create: `frontend-observatorio/src/utils/periodoGrafico.js`
- Test: `frontend-observatorio/src/utils/periodoGrafico.test.js`

**Interfaces:**
- Consumes: `janela12m`, `dentroDoFiltro` de `./periodoCards` (assinaturas: `janela12m(serie, extrair) -> {yearFrom,yearTo,monthFrom,monthTo}` strings; `dentroDoFiltro(item, filtro, extrair) -> bool`).
- Produces (Tasks 2-6 dependem):
  - `PRESETS_PAINEL = [{ key: "12m", label: "12m" }, { key: "5a", label: "5a" }, { key: "10a", label: "10a" }, { key: "tudo", label: "Tudo" }]`
  - `aplicarPresetSerie(rawSerie, preset, extrair) -> array`
  - `resolverSeriePainel({ rawSerie, seriePagina, preset, extrair }) -> array`

- [ ] **Step 1: Escrever os testes que falham** — criar `frontend-observatorio/src/utils/periodoGrafico.test.js`

```js
import { describe, expect, it } from "vitest";
import {
  PRESETS_PAINEL,
  aplicarPresetSerie,
  resolverSeriePainel,
} from "./periodoGrafico";

// série mensal: 18 meses de jul/2024 a dez/2025
const MENSAL = [];
for (let a = 2024, m = 7; a < 2026; ) {
  MENSAL.push({ ano: a, mes: m, valor: a * 100 + m });
  m += 1;
  if (m > 12) { m = 1; a += 1; }
}
// série anual 2015..2025
const ANUAL = Array.from({ length: 11 }, (_, i) => ({ ano: 2015 + i, valor: i }));
const EX_MENSAL = (d) => ({ ano: d.ano, mes: d.mes });
const EX_ANUAL = (d) => ({ ano: d.ano });

describe("aplicarPresetSerie", () => {
  it("12m em série mensal = 12 meses ancorados no último dado", () => {
    const r = aplicarPresetSerie(MENSAL, "12m", EX_MENSAL);
    expect(r).toHaveLength(12);
    expect(r[0]).toMatchObject({ ano: 2025, mes: 1 });
    expect(r[r.length - 1]).toMatchObject({ ano: 2025, mes: 12 });
  });

  it("12m em série anual = só o último ano", () => {
    const r = aplicarPresetSerie(ANUAL, "12m", EX_ANUAL);
    expect(r.map((d) => d.ano)).toEqual([2025]);
  });

  it("5a e 10a ancoram no maior ano DA SÉRIE", () => {
    expect(aplicarPresetSerie(ANUAL, "5a", EX_ANUAL).map((d) => d.ano)).toEqual([2021, 2022, 2023, 2024, 2025]);
    expect(aplicarPresetSerie(ANUAL, "10a", EX_ANUAL)).toHaveLength(10);
    // série com domínio deslocado (ex.: icms_projetado do VAF)
    const deslocada = [{ ano: 2020 }, { ano: 2021 }, { ano: 2022 }];
    expect(aplicarPresetSerie(deslocada, "5a", EX_ANUAL).map((d) => d.ano)).toEqual([2020, 2021, 2022]);
  });

  it("5a em série mensal traz todos os meses dos 5 anos", () => {
    const r = aplicarPresetSerie(MENSAL, "5a", EX_MENSAL);
    expect(r).toHaveLength(MENSAL.length); // 2021..2025 cobre tudo
  });

  it("tudo devolve a série completa; preset desconhecido idem", () => {
    expect(aplicarPresetSerie(ANUAL, "tudo", EX_ANUAL)).toHaveLength(11);
    expect(aplicarPresetSerie(ANUAL, "xyz", EX_ANUAL)).toHaveLength(11);
  });

  it("série vazia devolve vazia sem quebrar", () => {
    expect(aplicarPresetSerie([], "12m", EX_MENSAL)).toEqual([]);
  });
});

describe("resolverSeriePainel", () => {
  const seriePagina = ANUAL.slice(-2);
  it("sem preset segue a série da página (mesma referência)", () => {
    const r = resolverSeriePainel({ rawSerie: ANUAL, seriePagina, preset: null, extrair: EX_ANUAL });
    expect(r).toBe(seriePagina);
  });
  it("com preset aplica sobre a CRUA (amplia além do filtro da página)", () => {
    const r = resolverSeriePainel({ rawSerie: ANUAL, seriePagina, preset: "10a", extrair: EX_ANUAL });
    expect(r).toHaveLength(10);
  });
});

describe("PRESETS_PAINEL", () => {
  it("são 4 presets na ordem 12m/5a/10a/tudo", () => {
    expect(PRESETS_PAINEL.map((p) => p.key)).toEqual(["12m", "5a", "10a", "tudo"]);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
cd frontend-observatorio
npx vitest run src/utils/periodoGrafico.test.js
```

Expected: FAIL — módulo inexistente.

- [ ] **Step 3: Criar `frontend-observatorio/src/utils/periodoGrafico.js`**

```js
// Preset de período POR GRÁFICO (override do filtro da página).
// Aplica sempre sobre a série CRUA, com âncora no último dado da própria
// série — reusa janela12m/dentroDoFiltro (mesma régua do resto do app).
import { dentroDoFiltro, janela12m } from "./periodoCards";

export const PRESETS_PAINEL = [
  { key: "12m", label: "12m" },
  { key: "5a", label: "5a" },
  { key: "10a", label: "10a" },
  { key: "tudo", label: "Tudo" },
];

function maiorAno(serie, extrair) {
  let max = null;
  for (const d of serie) {
    const { ano } = extrair(d) || {};
    if (ano != null && (max == null || ano > max)) max = ano;
  }
  return max;
}

export function aplicarPresetSerie(rawSerie, preset, extrair) {
  const serie = rawSerie || [];
  if (!serie.length || preset === "tudo") return serie;
  if (preset === "12m") {
    const filtro = janela12m(serie, extrair);
    return serie.filter((d) => dentroDoFiltro(d, filtro, extrair));
  }
  const span = preset === "5a" ? 5 : preset === "10a" ? 10 : null;
  if (span == null) return serie;
  const max = maiorAno(serie, extrair);
  if (max == null) return serie;
  const filtro = {
    yearFrom: String(max - span + 1),
    yearTo: String(max),
    monthFrom: "",
    monthTo: "",
  };
  return serie.filter((d) => dentroDoFiltro(d, filtro, extrair));
}

export function resolverSeriePainel({ rawSerie, seriePagina, preset, extrair }) {
  if (!preset) return seriePagina;
  return aplicarPresetSerie(rawSerie, preset, extrair);
}
```

- [ ] **Step 4: Rodar e ver passar**

```bash
cd frontend-observatorio
npx vitest run src/utils/periodoGrafico.test.js
```

Expected: PASS (9 testes).

- [ ] **Step 5: Commit**

```bash
git add frontend-observatorio/src/utils/periodoGrafico.js frontend-observatorio/src/utils/periodoGrafico.test.js
git commit -m "feat(periodo): util puro de presets por grafico (ancora na propria serie)"
```

---

### Task 2: Componente `PeriodoMenu`

**Files:**
- Create: `frontend-observatorio/src/components/nid/PeriodoMenu.jsx`
- Test: `frontend-observatorio/src/components/nid/PeriodoMenu.test.jsx`

**Interfaces:**
- Consumes: `PRESETS_PAINEL` (Task 1).
- Produces: `<PeriodoMenu value={presetKey|null} onChange={(presetKey|null)=>{}} />` — pills no estilo `nid-tab` (mesmas classes dos tabs do NidPanel); nenhuma acesa = segue a página; clicar na acesa desliga (onChange(null)). Usado no slot `right` do NidPanel pelas Tasks 3-6.

- [ ] **Step 1: Escrever o teste que falha** — criar `frontend-observatorio/src/components/nid/PeriodoMenu.test.jsx`

```jsx
// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import PeriodoMenu from "./PeriodoMenu";

describe("PeriodoMenu", () => {
  it("renderiza as 4 pills, nenhuma ativa sem value", () => {
    render(<PeriodoMenu value={null} onChange={() => {}} />);
    for (const label of ["12m", "5a", "10a", "Tudo"]) {
      expect(screen.getByRole("button", { name: new RegExp(label, "i") })).toBeTruthy();
    }
    expect(document.querySelectorAll("[aria-pressed='true']")).toHaveLength(0);
  });

  it("clicar numa pill chama onChange com a key; pill ativa fica aria-pressed", () => {
    const onChange = vi.fn();
    const { rerender } = render(<PeriodoMenu value={null} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: /5a/i }));
    expect(onChange).toHaveBeenCalledWith("5a");
    rerender(<PeriodoMenu value="5a" onChange={onChange} />);
    expect(screen.getByRole("button", { name: /5a/i }).getAttribute("aria-pressed")).toBe("true");
  });

  it("clicar na pill ativa desliga (onChange(null))", () => {
    const onChange = vi.fn();
    render(<PeriodoMenu value="10a" onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: /10a/i }));
    expect(onChange).toHaveBeenCalledWith(null);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
cd frontend-observatorio
npx vitest run src/components/nid/PeriodoMenu.test.jsx
```

Expected: FAIL — módulo inexistente.

- [ ] **Step 3: Criar `frontend-observatorio/src/components/nid/PeriodoMenu.jsx`**

```jsx
import { PRESETS_PAINEL } from "../../utils/periodoGrafico";

/**
 * Seletor compacto de período POR GRÁFICO (slot `right` do NidPanel).
 * Nenhuma pill acesa = o gráfico segue o filtro da página; clicar na pill
 * ativa desliga o override. Reusa o visual dos tabs do painel (.nid-tab).
 */
export default function PeriodoMenu({ value, onChange }) {
  return (
    <div className="nid-panel-actions" role="group" aria-label="Período deste gráfico">
      {PRESETS_PAINEL.map((p) => (
        <button
          key={p.key}
          type="button"
          className={`nid-tab ${value === p.key ? "active" : ""}`}
          aria-pressed={value === p.key}
          title={value === p.key ? "Voltar a seguir o filtro da página" : `Mostrar ${p.label} neste gráfico`}
          onClick={() => onChange(value === p.key ? null : p.key)}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Rodar e ver passar + suíte**

```bash
cd frontend-observatorio
npx vitest run src/components/nid/PeriodoMenu.test.jsx && npm test
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend-observatorio/src/components/nid/PeriodoMenu.jsx frontend-observatorio/src/components/nid/PeriodoMenu.test.jsx
git commit -m "feat(periodo): componente PeriodoMenu (pills de preset por painel)"
```

---

## Padrão de plugagem (referência para as Tasks 3-6)

Cada página ganha:

```jsx
import PeriodoMenu from "../../components/nid/PeriodoMenu";
import { resolverSeriePainel } from "../../utils/periodoGrafico";
```

```jsx
const [periodosGrafico, setPeriodosGrafico] = useState({});
const setPeriodo = (chave) => (preset) =>
  setPeriodosGrafico((prev) => ({ ...prev, [chave]: preset }));
const seriePara = (chave, rawSerie, seriePagina, extrair) =>
  resolverSeriePainel({ rawSerie, seriePagina, preset: periodosGrafico[chave], extrair });
```

E em cada painel candidato:

```jsx
<NidPanel title="..." dataset="..." indicadorKey="chart_x"
  right={<PeriodoMenu value={periodosGrafico["chart_x"] || null} onChange={setPeriodo("chart_x")} />}>
  {/* o gráfico passa a consumir seriePara("chart_x", RAW, SERIE_PAGINA, EXTRair) */}
```

Regras: (a) a chave é o MESMO literal do `indicadorKey` do painel; (b) painéis
com ramo "comparar" só mostram o menu quando `!comparar` (`right={!comparar ? <PeriodoMenu .../> : undefined}`)
e o override não se aplica ao `cmp.chartData`; (c) quando o gráfico consome um
`useMemo` derivado, o memo passa a derivar de `seriePara(...)` e adiciona
`periodosGrafico` às deps; quando o map é inline no JSX, troca-se a variável
`serie` por uma `const seriePainelX = seriePara(...)` logo antes do return ou
inline; (d) painéis não listados nas tabelas NÃO recebem nada.

---

### Task 3: Plugagem — PIX (5), Bolsa Família (3), Pé-de-Meia (1)

**Files:**
- Modify: `frontend-observatorio/src/pages/pix/PixPage.jsx`
- Modify: `frontend-observatorio/src/pages/beneficios/BolsaFamiliaPage.jsx`
- Modify: `frontend-observatorio/src/pages/beneficios/PeDeMeiaPage.jsx`

**Interfaces:** Consumes Task 1/2 + padrão acima. Todas dialeto `dentroDoFiltro` com `extrair = (d) => ({ ano: d.ano, mes: d.mes })`.

- [ ] **Step 1: PIX** — cru: `rawSerie` (~L36); série da página: `serie` (~L68-76, já ordenada com `periodo`). ATENÇÃO: `serie` acrescenta `periodo` e ordena — para os overrides, derive a série do painel com o MESMO pós-processamento: crie um helper local `prepara(arr)` extraído do memo atual (adiciona `periodo` + sort) e use `prepara(seriePara(...))` quando houver override (sem override, `serie` como está). Painéis (todos mapeiam inline no JSX):

| chartKey | Painel (~linha) | Observação |
|---|---|---|
| `chart_vol_pagamentos` | ~165 | tem ramo `comparar` → menu só quando `!comparar` |
| `chart_vol_recebimentos` | ~203 | |
| `chart_qtd_transacoes` | ~217 | |
| `chart_pagadores_unicos` | ~231 | |
| `chart_recebedores_unicos` | ~245 | |

`chart_comparativo_municipios` NÃO recebe nada.

- [ ] **Step 2: Bolsa Família** — cru: `rawSerie` (~L35, itens já têm `periodo` derivado no fetch); série da página: `serie` (~L64-67). Painéis:

| chartKey | Painel (~linha) | Observação |
|---|---|---|
| `chart_evolucao_beneficiarios` | ~164 | ramo `comparar` → menu só quando `!comparar` |
| `chart_total_vs_primeira_infancia` | ~203 | |
| `chart_repasses` | ~222 | |

- [ ] **Step 3: Pé-de-Meia** — cru: `rawSerie` (~L35); série da página: `serie` (~L82-85). Painel único candidato: `chart_evolucao_estudantes` (~167, ramo `comparar` → menu só quando `!comparar`). `chart_por_etapa` e `chart_por_incentivo` NÃO recebem nada (dados all-time sem período).

- [ ] **Step 4: Rodar suíte**

```bash
cd frontend-observatorio
npm test
```

Expected: verde.

- [ ] **Step 5: Commit**

```bash
git add frontend-observatorio/src/pages/pix/PixPage.jsx frontend-observatorio/src/pages/beneficios/BolsaFamiliaPage.jsx frontend-observatorio/src/pages/beneficios/PeDeMeiaPage.jsx
git commit -m "feat(periodo): preset por grafico em PIX, Bolsa Familia e Pe-de-Meia"
```

---

### Task 4: Plugagem — PIB (2), VAF (4), INSS (2)

**Files:**
- Modify: `frontend-observatorio/src/pages/pib/PibPage.jsx`
- Modify: `frontend-observatorio/src/pages/vaf/VafPage.jsx`
- Modify: `frontend-observatorio/src/pages/inss/InssPage.jsx`

**Interfaces:** Consumes Task 1/2 + padrão. Dialeto anual — `extrair` por página abaixo.

- [ ] **Step 1: PIB** — `extrair = (d) => ({ ano: d.ano })`. DOIS crus: `rawSerie` (~L46) e `comp.itens` do foco (o filtrado atual é `vaData` ~L88-93; o cru do painel de VA é a lista de itens do foco, derive `vaRaw` análoga a `vaData` sem o filtro de ano). Painéis:

| chartKey | Painel (~linha) | Cru | Série da página |
|---|---|---|---|
| `chart_evolucao_anual` | ~221 | `rawSerie` | `serie` (~L122) — o memo `areaData` (~L133) passa a derivar de `seriePara` |
| `chart_va_setor` | ~242 | `vaRaw` (itens do foco sem filtro) | `vaData` — memo `vaChartData` (~L138) idem |

`chart_pib_comparativo` e `chart_comparativo_municipios` NÃO recebem nada (endpoint próprio/top-N). `chart_serie_anual` (tabela) não recebe.

- [ ] **Step 2: VAF** — `extrair = (d) => ({ ano: d.ano_base })`; para o ICMS projetado, `extrairIcms = (d) => ({ ano: d.ano_aplicacao ?? d.ano_base })`. Painéis:

| chartKey | Painel (~linha) | Cru | Série da página |
|---|---|---|---|
| `chart_evolucao_ipm` | ~233 | `rawSerie` | `serie` (memo `ipmData` ~L133) |
| `chart_indice_vs_medio` | ~272 | `rawSerie` | `serie` (memo `indicesData` ~L142) |
| `chart_vaf_individual_estado` | ~315 | `rawSerie` | `serie` (memo `vafData` ~L152) |
| `chart_icms_projetado` | ~251 | `icmsProj` | hoje é CRU (memo `icmsChart` ~L85) — a "série da página" deste painel É o cru (comportamento atual preservado sem override); com override, aplica preset sobre `icmsProj` com `extrairIcms` |

`chart_ipm_comparativo`, `chart_comparativo_municipios` e a tabela NÃO recebem.

- [ ] **Step 3: INSS** — `extrair = (d) => ({ ano: d.ano })`; cru: `rawSerie` (linhas ano×categoria, ~L35); série da página: `serieFiltrada` (~L58-65). Painéis:

| chartKey | Painel (~linha) | Observação |
|---|---|---|
| `chart_evolucao_anual` | ~179 | memo `evolucaoAnual` (~L81) passa a derivar de `seriePara` — é o caso de maior valor (default da página = 1 ano → 1 ponto) |
| `chart_top_categorias` | ~168 | memo `topCategorias` (~L67) idem — o preset muda a JANELA da agregação (top-10 do período escolhido) |

`chart_comparativo_municipios` e a tabela NÃO recebem.

- [ ] **Step 4: Rodar suíte** (`npm test`). Expected: verde.
- [ ] **Step 5: Commit**

```bash
git add frontend-observatorio/src/pages/pib/PibPage.jsx frontend-observatorio/src/pages/vaf/VafPage.jsx frontend-observatorio/src/pages/inss/InssPage.jsx
git commit -m "feat(periodo): preset por grafico em PIB, VAF e INSS"
```

---

### Task 5: Plugagem — ESTBAN (4) e Arrecadação (2)

**Files:**
- Modify: `frontend-observatorio/src/pages/estban/EstbanPage.jsx`
- Modify: `frontend-observatorio/src/pages/arrecadacao/ArrecadacaoPage.jsx`

- [ ] **Step 1: ESTBAN** — `extrair = (d) => ({ ano: Number(String(d.data_referencia).slice(0, 4)), mes: Number(String(d.data_referencia).slice(5, 7)) })` (a série é mensal — o preset 12m ganha âncora mensal de verdade). TRÊS crus independentes: `rawSerie`, `rawCaptacao`, `rawComposicao` (~L38-40); séries da página: `serie`/`captacao`/`composicao` (~L106-108). Painéis:

| chartKey | Painel (~linha) | Cru | Série da página |
|---|---|---|---|
| `chart_evolucao_credito` | ~191 | `rawSerie` | `serie` (ramo `comparar` → menu só quando `!comparar`) |
| `chart_captacao_depositos` | ~229 | `rawCaptacao` | `captacao` |
| `chart_credito_vs_captacao` | ~249 | `rawCaptacao` | `captacao` |
| `chart_composicao_credito` | ~268 | `rawComposicao` | `composicao` |

Painéis por instituição (3) e comparativo NÃO recebem.

- [ ] **Step 2: Arrecadação** — `extrair = (d) => ({ ano: d.ano })` (a série é mensal mas o item tem `ano`; `mes` não existe no shape — preset 12m vira "últimos 2 anos"? NÃO: o item é mensal com rótulo `periodo`; sem campo `mes` numérico, use só ano: 12m → `janela12m` sem mes = último ano). Cru: `rawSerie` (~L31); série da página: `serie` (~L60-68). Painéis:

| chartKey | Painel (~linha) | Observação |
|---|---|---|
| `chart_serie_mensal` | ~162 | memo `areaData` (~L71) deriva de `seriePara`; ramo `comparar` → menu só quando `!comparar` |
| `chart_composicao_tipo` | ~201 | hoje é `serie.slice(-24)` inline (~L203). Sem override: comportamento atual (filtrada + slice). COM override: usa `seriePara(...)` SEM o slice (o preset já é o recorte que o usuário pediu) |

A tabela `chart_detalhamento_periodo` NÃO recebe.

- [ ] **Step 3: Rodar suíte** (`npm test`). Expected: verde.
- [ ] **Step 4: Commit**

```bash
git add frontend-observatorio/src/pages/estban/EstbanPage.jsx frontend-observatorio/src/pages/arrecadacao/ArrecadacaoPage.jsx
git commit -m "feat(periodo): preset por grafico em ESTBAN e Arrecadacao"
```

---

### Task 6: Plugagem — Comex (3)

**Files:**
- Modify: `frontend-observatorio/src/pages/comex/ComexPage.jsx`

- [ ] **Step 1:** Hoje o filtro está DENTRO do memo de agregação `chartSerie` (~L120-138: filtra `serie` crua com `dentroDoFiltro` e agrega com `groupComexByPeriod`). Refactor mínimo: extrair uma função local `montarChartSerie(filtroOuPreset)` que (a) filtra o cru (`dentroDoFiltro` com o filtro da página, OU `aplicarPresetSerie` com preset) e (b) agrega com `groupComexByPeriod` (pura, já existe ~L31). `chartSerie` (da página) = `montarChartSerie` com `filters`; cada painel com override usa um memo derivado com o preset. `extrair = (x) => ({ ano: x.ano, mes: x.mes })`. Painéis:

| chartKey | Painel (~linha) | Observação |
|---|---|---|
| `chart_exp_vs_imp` | ~236 | |
| `chart_saldo_mensal` | ~259 | ramo `comparar` → menu só quando `!comparar` |
| `chart_volume_fisico` | ~296 | |

Top-N (`chart_top_produtos`, `chart_top_produtos_peso`, `chart_top_paises` — têm o seletor de ano próprio `anoSelecionado`, intocado) e comparativo NÃO recebem.

- [ ] **Step 2: Rodar suíte** (`npm test`). Expected: verde.
- [ ] **Step 3: Commit**

```bash
git add frontend-observatorio/src/pages/comex/ComexPage.jsx
git commit -m "feat(periodo): preset por grafico em Comex"
```

---

### Task 7: Verificação final

- [ ] **Step 1: Suítes completas**

```bash
cd frontend-observatorio && npm test
```

```bash
cd backend && ../venv/Scripts/python.exe -m pytest tests -q
```

Expected: verde nas duas (backend intocado — é regressão de sanidade).

- [ ] **Step 2: Contagem de cobertura** — grep de sanidade: total de ocorrências de `<PeriodoMenu` em `src/pages/` deve ser **26** (PIX 5, Bolsa 3, Pé-de-Meia 1, PIB 2, VAF 4, INSS 2, ESTBAN 4, Arrecadação 2, Comex 3). Divergência = painel esquecido ou seletor em painel não-candidato.

- [ ] **Step 3: Commit final se houver ajuste** (senão nada a commitar).

---

## Verificação manual (pós-implementação)

1. PIX com filtro de página 12m: forçar "10a" só no Volume de Pagamentos — os outros 4 gráficos não mudam; desligar a pill volta ao filtro da página.
2. INSS: "10a" na Evolução Anual (default da página mostra 1 ponto → vira década).
3. Ligar "Comparar" num painel com toggle: o menu de período some; desligar: volta.
4. Painéis top-N/snapshot (Comex Top Produtos, ESTBAN por instituição, Empresas inteira): sem menu.
