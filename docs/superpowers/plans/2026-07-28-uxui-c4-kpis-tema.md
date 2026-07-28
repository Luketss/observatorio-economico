# UX/UI C4 — KPIs, legibilidade e tema — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Matar cores hardcoded que quebram os 5 temas (paletas hex, `accent` do KpiCard, IPS inteiro), unificar skeletons/selects/copy e converter o IPS ao padrão nid.

**Architecture:** Tokens novos (`--accent-6/7`, `--chart-muted`) em `themes.css`; `KpiCard.accent` vira cor CSS via `style`; 3 componentes nid novos (`NidSelect`, `KpiSkeleton`, `SelecioneMunicipio`) + prop `label` no `BarraExecucao`; sweeps mecânicos por página; IpsPage reescrita por inteiro (arquivo completo neste plano). Zero backend.

**Tech Stack:** React 19 + Vite, TailwindCSS + tokens CSS (5 temas em `styles/themes.css`), vitest 2. Spec: `docs/superpowers/specs/2026-07-28-uxui-c4-kpis-tema-design.md`.

## Global Constraints

- **Zero backend** — só `frontend-observatorio/`.
- Gates: `npm run test` exit 0 (suite 74) e `npm run build` exit 0, de `frontend-observatorio/`. **Sem testes novos** (C4 é casca visual; decisão de projeto exclui teste de componente React). Eslint baseline sujo NÃO é gate.
- Semântica de cor (convenção existente `.nid-delta`): positivo/verde→`--accent-5`, negativo/vermelho→`--accent-2`, violeta→`--accent-3`, âmbar/laranja→`--accent-4`, azul→`--accent-1`, lima→`--accent-6`, ciano→`--accent-7`, cinza "Outros"→`--chart-muted`. Exceção: paletas de RAIS/CAGED já usam accent-1..5 — os 2 hex extras viram `--accent-6`/`--accent-7`.
- Conteúdo/dados/fetches idênticos em todas as páginas (só casca visual), exceto remoções aprovadas: painel "Indicadores de Composição" de Empresas e o aforismo do card PIB do IPS.
- Fora de escopo: landing, login, admin/*, tabs de desenvolvimento-econômico, PlanoGov, CalendarioPage, releases (CSS print), tabs `bg-blue-600` do Comparativo (só os 2 selects e as 2 cores de gráfico entram).
- Branch de trabalho: `feat/uxui-c4-kpis-tema` a partir de `main`.
- Commits em português no padrão do repo (`feat(uxui): ...`).

---

### Task 1: Tokens novos nos 5 temas

**Files:**
- Modify: `frontend-observatorio/src/styles/themes.css` (blocos dos temas, linhas ~14-170, + bloco compartilhado ~173)

**Interfaces:**
- Consumes: nada.
- Produces: `var(--accent-6)`, `var(--accent-7)` (categóricas extras por tema) e `var(--chart-muted)` (neutro), usados pelas Tasks 3, 5 e 7.

- [ ] **Step 1: Criar branch**

```bash
git checkout main
git checkout -b feat/uxui-c4-kpis-tema
```

- [ ] **Step 2: Adicionar tokens**

Em cada bloco de tema, logo após a linha `--accent-5: ...;`, inserir as duas linhas do tema:

| Tema | `--accent-6` | `--accent-7` |
|---|---|---|
| `body.theme-neon` (~l.32) | `#ff9f43` | `#7aa2ff` |
| `body.theme-aurora` (~l.64) | `#fb923c` | `#22d3ee` |
| `body.theme-sunset` (~l.96) | `#9b5de5` | `#4cc9f0` |
| `body.theme-minimal` (~l.126) | `#a3e635` | `#38bdf8` |
| `body.theme-light` (~l.158) | `#84cc16` | `#06b6d4` |

(No light, os valores são exatamente os hex que o app já usa hoje — zero delta visual nesse tema.)

No bloco compartilhado `body.theme-neon, body.theme-aurora, ... body.theme-light { ... }` (~l.173), adicionar uma linha:

```css
  --chart-muted: var(--text-mute);
```

- [ ] **Step 3: Gates + commit**

Run (de `frontend-observatorio/`): `npm run test` → exit 0; `npm run build` → exit 0.

```bash
git add frontend-observatorio/src/styles/themes.css
git commit -m "feat(uxui): tokens accent-6/7 e chart-muted nos 5 temas"
```

---

### Task 2: KpiCard.accent via style + migração dos usos

**Files:**
- Modify: `frontend-observatorio/src/components/KpiCard.jsx:128`
- Modify: `frontend-observatorio/src/pages/comex/ComexPage.jsx:143,151,159`
- Modify: `frontend-observatorio/src/pages/empresas/EmpresasPage.jsx:83,91,99,107`
- Modify: `frontend-observatorio/src/pages/estban/EstbanPage.jsx:105,113,121`
- Modify: `frontend-observatorio/src/pages/pix/PixPage.jsx:82,90,98`
- Modify: `frontend-observatorio/src/pages/inss/InssPage.jsx:92,100`
- Modify: `frontend-observatorio/src/pages/beneficios/BolsaFamiliaPage.jsx:75,83,91`
- Modify: `frontend-observatorio/src/pages/beneficios/PeDeMeiaPage.jsx:91,99`
- Modify: `frontend-observatorio/src/pages/DashboardGeralPage.jsx:38-42` (`CUSTOM_COLOR_MAP`)

**Interfaces:**
- Consumes: nada (tokens 1..5 já existem).
- Produces: contrato novo do KpiCard — `accent` recebe **cor CSS** (ex.: `"var(--accent-5)"`), nunca mais classe.

- [ ] **Step 1: KpiCard**

`KpiCard.jsx:128`, trocar:

```jsx
<p className={`nid-kpi-value ${accent || ""}`}>
```

por:

```jsx
<p className="nid-kpi-value" style={accent ? { color: accent } : undefined}>
```

Se houver comentário/JSDoc no topo documentando `accent`, atualizar para "cor CSS (ex.: var(--accent-5))".

- [ ] **Step 2: Migrar os usos**

Em TODOS os arquivos/linhas listados acima, substituir o valor da prop/campo `accent` pela tabela (valor antigo → novo, string literal):

| Antigo | Novo |
|---|---|
| `"text-blue-600"` | `"var(--accent-1)"` |
| `"text-green-600"` | `"var(--accent-5)"` |
| `"text-purple-600"` | `"var(--accent-3)"` |
| `"text-orange-500"` | `"var(--accent-4)"` |
| `"text-red-600"` / `"text-red-500"` | `"var(--accent-2)"` |

Inclui ternários (ex.: comex l.159 `balancaPositiva ? "text-green-600" : "text-red-600"` → `balancaPositiva ? "var(--accent-5)" : "var(--accent-2)"`) e os valores do `CUSTOM_COLOR_MAP` do DashboardGeral (só os valores `text-*`; o uso `accent={...}` não muda).

- [ ] **Step 3: Verificar que não sobrou classe na prop**

Run: `grep -rn "accent[:=][\"' ]*text-" frontend-observatorio/src/pages/ frontend-observatorio/src/components/KpiCard.jsx` → 0 ocorrências.

- [ ] **Step 4: Gates + commit**

`npm run test` → exit 0; `npm run build` → exit 0.

```bash
git add frontend-observatorio/src/components/KpiCard.jsx frontend-observatorio/src/pages
git commit -m "feat(uxui): KpiCard.accent tokenizado (cor CSS via style)"
```

---

### Task 3: Paletas hex → accents nos gráficos

**Files:**
- Modify: `frontend-observatorio/src/pages/pix/PixPage.jsx:194,209,223,237,251`
- Modify: `frontend-observatorio/src/pages/estban/EstbanPage.jsx:223,244,263,287,324`
- Modify: `frontend-observatorio/src/pages/comex/ComexPage.jsx:254,295,314`
- Modify: `frontend-observatorio/src/pages/beneficios/BolsaFamiliaPage.jsx:189,208,227`
- Modify: `frontend-observatorio/src/pages/arrecadacao/ArrecadacaoPage.jsx:211`
- Modify: `frontend-observatorio/src/pages/comparativo/ComparativoPage.jsx:171,172`
- Modify: `frontend-observatorio/src/pages/empresas/EmpresasPage.jsx:203`
- Modify: `frontend-observatorio/src/pages/rais/RaisPage.jsx:278`
- Modify: `frontend-observatorio/src/pages/caged/CagedPage.jsx:322`

**Interfaces:**
- Consumes (Task 1): `var(--accent-6)`, `var(--accent-7)`, `var(--chart-muted)`.
- Produces: nada.

- [ ] **Step 1: Substituições por linha**

Aplicar a tabela global de matiz (Global Constraints). Casos concretos:

- Pares/trios: `["#3b82f6","#10b981"]` → `["var(--accent-1)","var(--accent-5)"]`; `["#8b5cf6","#f59e0b"]` e `["#8b5cf6","#f97316"]` → `["var(--accent-3)","var(--accent-4)"]`; `["#06b6d4","#f43f5e"]` → `["var(--accent-7)","var(--accent-2)"]`; `["#10b981","#f97316"]` → `["var(--accent-5)","var(--accent-4)"]`; `["#10b981","#ef4444"]` → `["var(--accent-5)","var(--accent-2)"]`; `["#3b82f6","#8b5cf6"]` → `["var(--accent-1)","var(--accent-3)"]`; `["#6366f1","#10b981","#f59e0b"]` → `["var(--accent-1)","var(--accent-5)","var(--accent-4)"]`; `["#8b5cf6"]` → `["var(--accent-3)"]`.
- Cores avulsas: `color="#3b82f6"` → `color="var(--accent-1)"`; `highlightColor="#f59e0b"` → `highlightColor="var(--accent-4)"`.
- Paletas de 7 (estban 287 e 324): `["#3b82f6","#10b981","#f59e0b","#84cc16","#8b5cf6","#06b6d4","#94a3b8"]` → `["var(--accent-1)","var(--accent-5)","var(--accent-4)","var(--accent-6)","var(--accent-3)","var(--accent-7)","var(--chart-muted)"]`.
- RAIS 278 / CAGED 322: `const palette = [A1, A3, A2, A4, A5, "#8b5cf6", "#06b6d4"]` → `[A1, A3, A2, A4, A5, "var(--accent-6)", "var(--accent-7)"]`.

- [ ] **Step 2: Verificar**

Run: `grep -rnE '#(3b82f6|10b981|f59e0b|ef4444|8b5cf6|06b6d4|6366f1|f97316|f43f5e|84cc16|94a3b8)' frontend-observatorio/src/pages/pix frontend-observatorio/src/pages/estban frontend-observatorio/src/pages/comex frontend-observatorio/src/pages/beneficios frontend-observatorio/src/pages/arrecadacao frontend-observatorio/src/pages/comparativo frontend-observatorio/src/pages/empresas frontend-observatorio/src/pages/rais frontend-observatorio/src/pages/caged` → 0 ocorrências.

- [ ] **Step 3: Gates + commit**

`npm run test` → exit 0; `npm run build` → exit 0.

```bash
git add frontend-observatorio/src/pages
git commit -m "feat(uxui): paletas dos graficos via accents do tema"
```

---

### Task 4: Componentes novos + prop label no BarraExecucao

**Files:**
- Create: `frontend-observatorio/src/components/nid/NidSelect.jsx`
- Create: `frontend-observatorio/src/components/nid/KpiSkeleton.jsx`
- Create: `frontend-observatorio/src/components/nid/SelecioneMunicipio.jsx`
- Modify: `frontend-observatorio/src/components/nid/BarraExecucao.jsx`

**Interfaces:**
- Consumes: `ChartState` (default export de `./ChartState`).
- Produces (Tasks 5–7):
  - `NidSelect({ value, onChange, ariaLabel, children, className? })` — `<select>` tokenizado.
  - `KpiSkeleton({ height? = 80 })` — card `.nid-kpi` com `ChartState kind="loading" shape="kpi"`.
  - `SelecioneMunicipio()` — bloco tracejado padrão, sem props.
  - `BarraExecucao({ pct, label? })` — `label` substitui o texto padrão `"N%"`.

- [ ] **Step 1: NidSelect.jsx**

```jsx
// NidSelect — <select> nativo tokenizado (UX/UI C4). Seta nativa por
// precedente do FilterBar; aria-label obrigatório.
export default function NidSelect({ value, onChange, ariaLabel, children, className = "" }) {
  return (
    <select
      value={value}
      onChange={onChange}
      aria-label={ariaLabel}
      className={`rounded-xl border border-[var(--border)] bg-[var(--panel)] text-[var(--text)] text-sm px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-[var(--accent-1)] ${className}`}
    >
      {children}
    </select>
  );
}
```

- [ ] **Step 2: KpiSkeleton.jsx**

```jsx
import ChartState from "./ChartState";

// KpiSkeleton — card de KPI em loading, padrão único do app (UX/UI C4).
export default function KpiSkeleton({ height = 80 }) {
  return (
    <div className="nid-kpi">
      <ChartState kind="loading" shape="kpi" height={height} />
    </div>
  );
}
```

- [ ] **Step 3: SelecioneMunicipio.jsx**

```jsx
// SelecioneMunicipio — bloco padrão para ADMIN_GLOBAL sem "Ver como" (UX/UI C4).
export default function SelecioneMunicipio() {
  return (
    <div
      className="mt-6 rounded-2xl p-10 text-center"
      style={{ background: "var(--panel)", border: "1px dashed var(--border-strong)" }}
    >
      <p className="text-base font-semibold text-[var(--text)]">Selecione um município</p>
      <p className="text-sm mt-1 text-[var(--text-dim)]">
        Use <b>"Ver como"</b> na administração de Municípios.
      </p>
    </div>
  );
}
```

- [ ] **Step 4: BarraExecucao — prop `label`**

Trocar o componente por:

```jsx
/** Barra de execução (empenhado → pago). pct null = sem valor.
 *  label opcional substitui o texto padrão "N%" (ex.: scores 0-100 do IPS). */
export default function BarraExecucao({ pct, label }) {
  if (pct == null) return <span className="text-xs text-[var(--text-dim)]">—</span>;
  return (
    <div className="flex items-center gap-2 min-w-[120px]">
      <div className="flex-1 h-2 rounded-full bg-[var(--panel-2)] overflow-hidden" aria-hidden>
        <div className="h-full rounded-full" style={{ width: `${Math.min(pct, 100)}%`, background: pct >= 100 ? "rgba(16,185,129,.8)" : "var(--accent-1)" }} />
      </div>
      <span className="text-xs text-[var(--text-dim)] w-10 text-right">
        {label ?? `${Number(pct).toLocaleString("pt-BR")}%`}
      </span>
    </div>
  );
}
```

(Mudanças: prop `label` e clamp `Math.min(pct, 100)` no width — sub-indicadores do IPS podem passar de 100.)

- [ ] **Step 5: Gates + commit**

`npm run test` → exit 0; `npm run build` → exit 0.

```bash
git add frontend-observatorio/src/components/nid/NidSelect.jsx frontend-observatorio/src/components/nid/KpiSkeleton.jsx frontend-observatorio/src/components/nid/SelecioneMunicipio.jsx frontend-observatorio/src/components/nid/BarraExecucao.jsx
git commit -m "feat(uxui): NidSelect, KpiSkeleton, SelecioneMunicipio e label na BarraExecucao"
```

---

### Task 5: Aplicar componentes — selects, skeletons, SelecioneMunicipio, copy do Comex

**Files:**
- Modify: `frontend-observatorio/src/pages/comex/ComexPage.jsx` (select 204-219; subs 142/150; skeleton 227-234; bloco município 185-201)
- Modify: `frontend-observatorio/src/pages/comparativo/ComparativoPage.jsx` (selects 115-124 e 132-140)
- Modify: `frontend-observatorio/src/pages/emendas/EmendasPage.jsx` (select 64-74; skeleton 46-54; bloco município 34-44)
- Modify: `frontend-observatorio/src/pages/rais/RaisPage.jsx` (skeleton ~328-330; bloco município ~301-307)
- Modify: `frontend-observatorio/src/pages/caged/CagedPage.jsx` (skeleton ~375-379; bloco município ~345-351)
- Modify: `frontend-observatorio/src/pages/DashboardGeralPage.jsx` (skeleton ~240-242)
- Modify: `frontend-observatorio/src/pages/fpm/FpmPage.jsx` (skeleton ~155-163; bloco município ~143-153)
- Modify: `frontend-observatorio/src/pages/dinheiro-na-mesa/DinheiroNaMesaPage.jsx` (skeleton ~83-91; bloco município ~71-81)
- Modify: `frontend-observatorio/src/pages/painel-prefeito/PainelPrefeitoPage.jsx` (skeleton ~385)
- Modify: `frontend-observatorio/src/pages/empresas/EmpresasPage.jsx` (skeleton ~150; bloco município ~134-140)
- Modify: `frontend-observatorio/src/pages/arrecadacao/ArrecadacaoPage.jsx:148`, `estban/EstbanPage.jsx:174 e 336`, `inss/InssPage.jsx:149`, `pix/PixPage.jsx:151`, `vaf/VafPage.jsx:216`, `pib/PibPage.jsx:198`, `beneficios/BolsaFamiliaPage.jsx:145`, `beneficios/PeDeMeiaPage.jsx:147` (skeletons)

**Interfaces:**
- Consumes (Task 4): `NidSelect`, `KpiSkeleton`, `SelecioneMunicipio`.
- Produces: nada.

- [ ] **Step 1: Selects → NidSelect**

Import `NidSelect from "../../components/nid/NidSelect"` nas 3 páginas. Substituições (label `<label>` ao lado fica como está):

Comex 207-217 →
```jsx
<NidSelect value={anoSelecionado} onChange={(e) => setAnoSelecionado(e.target.value)} ariaLabel="Filtrar por ano">
  {anos.map((ano) => (
    <option key={ano} value={String(ano)}>{ano}</option>
  ))}
</NidSelect>
```

Comparativo 115-124 (estado) e 132-140 (ano) → mesmo padrão, `ariaLabel="Filtrar por estado"` / `"Filtrar por ano"`, preservando `<option value="">Todos</option>` e os maps atuais.

Emendas 65-73 → `<NidSelect value={ano} onChange={(e) => setAno(e.target.value)} ariaLabel="Filtrar por ano" className="ml-auto">` com as mesmas options (o `ml-auto` preserva o posicionamento).

- [ ] **Step 2: Skeletons → KpiSkeleton**

Import `KpiSkeleton from "../../components/nid/KpiSkeleton"` (ou `"../components/nid/KpiSkeleton"` no DashboardGeral). Transformações por variante — o GRID/container externo de cada página fica como está, só o item interno muda:

Variante 1 (`.nid-kpi` opacity 0.4) — ex. emendas 46-54:
```jsx
// ANTES
{[...Array(4)].map((_, i) => (
  <div key={i} className="nid-kpi" style={{ minHeight: 110, opacity: 0.4 }} />
))}
// DEPOIS
{[...Array(4)].map((_, i) => <KpiSkeleton key={i} />)}
```
Aplicar em: emendas, fpm, dinheiro-na-mesa, painel-prefeito (todos `minHeight: 110` → `<KpiSkeleton />`), rais (~328) e DashboardGeral (~240) — estes dois estão dentro de `.nid-kpis` e usam `minHeight: 150` → `<KpiSkeleton height={110} />`.

Variante 2 (`ChartState` dentro de wrapper `bg-[var(--panel)]`) — ex. comex 228-234:
```jsx
// ANTES
<div key={i} className="bg-[var(--panel)] p-6 rounded-2xl border border-[var(--border)]">
  <ChartState kind="loading" shape="kpi" height={80} />
</div>
// DEPOIS
<KpiSkeleton key={i} />
```
Aplicar em: comex, arrecadacao, estban(174), inss, pix, vaf, pib e caged (~377: já usa `.nid-kpi` + ChartState 120 → vira `<KpiSkeleton key={i} height={120} />`). Remover o import de `ChartState` da página se ficar órfão.

Variante 3 (`animate-pulse h-28`) — ex. bolsa 145:
```jsx
// ANTES
<div key={i} className="bg-[var(--panel)] p-6 rounded-2xl border border-[var(--border)] animate-pulse h-28" />
// DEPOIS
<KpiSkeleton key={i} />
```
Aplicar em: bolsa-familia, pe-de-meia, empresas (~150).

Caso à parte — estban 336 (pulse da TABELA, não de KPI): só recolorir `bg-slate-50` → `bg-[var(--panel-2)]`.

- [ ] **Step 3: Blocos "Selecione um município" → componente**

Import `SelecioneMunicipio from "../../components/nid/SelecioneMunicipio"` nas 7 páginas (comex, empresas, rais, caged, emendas, fpm, dinheiro-na-mesa). Substituir SÓ o `<div className="...rounded-2xl p-10 text-center...">...</div>` tracejado por `<SelecioneMunicipio />`, preservando o `NidPageHeader` e o wrapper `motion.div` de cada página.

- [ ] **Step 4: Copy do Comex**

`ComexPage.jsx:142` e `:150`: trocar `sub: "No período"` por `sub: describeFilter(filters) || "Todo o período"` (`describeFilter` já é importado na página).

- [ ] **Step 5: Verificações**

- `grep -rn "Selecione um município" frontend-observatorio/src/pages/` → apenas IpsPage (se ainda tiver picker próprio; será reescrita na Task 7) e nenhuma das 7 páginas.
- `grep -rn "animate-pulse h-28\|opacity: 0.4" frontend-observatorio/src/pages/` → 0 nas páginas listadas.
- `grep -rn "bg-slate-50" frontend-observatorio/src/pages/estban` → 0.
- `grep -rn "ring-blue-500" frontend-observatorio/src/pages/comex frontend-observatorio/src/pages/comparativo` → 0.

- [ ] **Step 6: Gates + commit**

`npm run test` → exit 0; `npm run build` → exit 0.

```bash
git add frontend-observatorio/src/pages
git commit -m "feat(uxui): NidSelect/KpiSkeleton/SelecioneMunicipio aplicados + copy do Comex"
```

---

### Task 6: Empresas — remover painel "Indicadores de Composição"

**Files:**
- Modify: `frontend-observatorio/src/pages/empresas/EmpresasPage.jsx` (MiniStat 16-25; painel 227-248)

**Interfaces:**
- Consumes: nada.
- Produces: nada.

- [ ] **Step 1: Remover**

Deletar: a function `MiniStat` (linhas 16-25) e o bloco inteiro do painel (do `<div className="bg-[var(--panel)] p-6 rounded-2xl shadow-sm border border-[var(--border)]">` com o `<h3>Indicadores de Composição</h3>` até seu fechamento, ~227-248), incluindo o skeleton `bg-slate-50` interno. Conferir que o grid/fluxo em volta fecha sem buraco (o painel é um filho direto do fluxo da página; os vizinhos apenas se aproximam). Remover helpers que ficarem órfãos (ex.: `fmtPct` se só o painel usava — verificar com grep no arquivo).

- [ ] **Step 2: Verificar + gates + commit**

`grep -n "MiniStat\|Indicadores de Composição" frontend-observatorio/src/pages/empresas/EmpresasPage.jsx` → 0. `npm run test` → exit 0; `npm run build` → exit 0.

```bash
git add frontend-observatorio/src/pages/empresas/EmpresasPage.jsx
git commit -m "feat(uxui): remove painel redundante Indicadores de Composicao de Empresas"
```

---

### Task 7: IPS — reescrita completa ao padrão nid

**Files:**
- Modify: `frontend-observatorio/src/pages/ips/IpsPage.jsx` (substituir o ARQUIVO INTEIRO pelo conteúdo abaixo)

**Interfaces:**
- Consumes (Tasks 1 e 4): `var(--chart-muted)`, `NidSelect`, `KpiSkeleton`, `BarraExecucao({ pct, label })`.
- Produces: nada.

Deltas aprovados vs. página atual: aforismo "Desenvolvimento econômico não equivale..." sai (população/área viram sub do card PIB); hero deixa de ter fundo colorido por score (cor no valor via accent); "Populacao/Area" acentuados; unidade unificada "de 100"; `radarData`→`perfilData`.

- [ ] **Step 1: Substituir o arquivo inteiro por:**

```jsx
import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import api from "../../services/api";
import { useAuth } from "../../context/AuthContext";
import KpiCard from "../../components/KpiCard";
import InfoTooltip from "../../components/InfoTooltip";
import { NidPageHeader, NidPanel } from "../../components/nid/Panel";
import { HBarChart, MultiLineChart } from "../../components/nid/charts";
import BarraExecucao from "../../components/nid/BarraExecucao";
import MunicipioPicker from "../../components/nid/MunicipioPicker";
import NidSelect from "../../components/nid/NidSelect";
import KpiSkeleton from "../../components/nid/KpiSkeleton";

function fmt(v) {
  if (v == null) return "—";
  return Number(v).toFixed(1);
}

// Convenção nid: positivo → accent-5, atenção → accent-4, crítico → accent-2.
function scoreAccent(score) {
  if (score == null) return undefined;
  if (score >= 70) return "var(--accent-5)";
  if (score >= 50) return "var(--accent-4)";
  return "var(--accent-2)";
}

const DIMENSIONS = [
  { key: "necessidades_humanas_basicas", label: "Necessidades Humanas Básicas", short: "NHB" },
  { key: "fundamentos_bem_estar", label: "Fundamentos do Bem-estar", short: "FBE" },
  { key: "oportunidades", label: "Oportunidades", short: "OPO" },
];

const COMPONENTS = [
  { key: "nutricao_cuidados_medicos", label: "Nutrição e Cuidados Médicos", dim: "nhb" },
  { key: "agua_saneamento", label: "Água e Saneamento", dim: "nhb" },
  { key: "moradia", label: "Moradia", dim: "nhb" },
  { key: "seguranca_pessoal", label: "Segurança Pessoal", dim: "nhb" },
  { key: "acesso_conhecimento_basico", label: "Acesso ao Conhecimento", dim: "fbe" },
  { key: "acesso_informacao_comunicacao", label: "Acesso à Informação", dim: "fbe" },
  { key: "saude_bem_estar", label: "Saúde e Bem-estar", dim: "fbe" },
  { key: "qualidade_meio_ambiente", label: "Meio Ambiente", dim: "fbe" },
  { key: "direitos_individuais", label: "Direitos Individuais", dim: "opo" },
  { key: "liberdades_individuais", label: "Liberdades Individuais", dim: "opo" },
  { key: "inclusao_social", label: "Inclusão Social", dim: "opo" },
  { key: "acesso_educacao_superior", label: "Educação Superior", dim: "opo" },
];

const SUB_INDICATORS = [
  { key: "cobertura_vacinal_poliomielite", label: "Cobertura Vacinal", dim: "nhb" },
  { key: "mortalidade_infantil_5_anos", label: "Mortalidade Infantil (<5a)", dim: "nhb" },
  { key: "abastecimento_agua_rede", label: "Abastecimento de Água", dim: "nhb" },
  { key: "esgotamento_sanitario_adequado", label: "Esgotamento Sanitário", dim: "nhb" },
  { key: "domicilios_coleta_residuos", label: "Coleta de Resíduos", dim: "nhb" },
  { key: "assassinatos_jovens", label: "Assassinatos de Jovens", dim: "nhb" },
  { key: "homicidios", label: "Homicídios", dim: "nhb" },
  { key: "abandono_ensino_medio", label: "Abandono Ens. Médio", dim: "fbe" },
  { key: "ideb_ensino_fundamental", label: "Ideb Ens. Fundamental", dim: "fbe" },
  { key: "cobertura_internet_movel", label: "Internet Móvel (4G/5G)", dim: "fbe" },
  { key: "expectativa_vida", label: "Expectativa de Vida", dim: "fbe" },
  { key: "obesidade", label: "Obesidade", dim: "fbe" },
  { key: "areas_verdes_urbanas", label: "Áreas Verdes Urbanas", dim: "fbe" },
  { key: "emissoes_co2_habitante", label: "Emissões CO₂/hab", dim: "fbe" },
  { key: "acesso_cultura_lazer_esporte", label: "Cultura, Lazer e Esporte", dim: "opo" },
  { key: "gravidez_adolescencia", label: "Gravidez na Adolescência", dim: "opo" },
  { key: "paridade_genero_camara", label: "Paridade de Gênero (Câmara)", dim: "opo" },
  { key: "empregados_ensino_superior", label: "Empregados c/ Ens. Superior", dim: "opo" },
  { key: "nota_mediana_enem", label: "Nota Mediana ENEM", dim: "opo" },
];

const SERIES_COLORS = [
  "var(--accent-1)", "var(--accent-5)", "var(--accent-4)",
  "var(--accent-2)", "var(--accent-3)", "var(--accent-7)",
];

export default function IpsPage() {
  const { user } = useAuth();

  const [estados, setEstados] = useState([]);
  const [selectedEstado, setSelectedEstado] = useState("");
  const [municipios, setMunicipios] = useState([]);
  const [selectedMunicipioId, setSelectedMunicipioId] = useState(null);
  const [selectedAno, setSelectedAno] = useState(2025);

  const [scorecard, setScorecard] = useState(null);
  const [evolucao, setEvolucao] = useState([]);
  const [ranking, setRanking] = useState(null);
  const [comparativo, setComparativo] = useState([]);
  const [destaques, setDestaques] = useState(null);
  const [sugestoes, setSugestoes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [compareMunicipioIds, setCompareMunicipioIds] = useState([]);
  const [openDims, setOpenDims] = useState({ nhb: false, fbe: false, opo: false });

  // Load state list on mount
  useEffect(() => {
    api.get("/ips/municipios", { params: { ano: selectedAno } }).then((res) => {
      const estadoSet = [...new Set(res.data.map((m) => m.estado))].sort();
      setEstados(estadoSet);
      if (user?.estado && estadoSet.includes(user.estado)) {
        setSelectedEstado(user.estado);
      } else if (estadoSet.length > 0) {
        setSelectedEstado(estadoSet[0]);
      }
    }).catch((err) => console.error("Erro ao carregar estados IPS:", err));
  }, [selectedAno]);

  // Load city list when estado changes
  useEffect(() => {
    if (!selectedEstado) return;
    api
      .get("/ips/municipios", { params: { ano: selectedAno, estado: selectedEstado } })
      .then((res) => {
        setMunicipios(res.data);
        const userCity = res.data.find((m) => m.municipio_id === user?.municipio_id);
        setSelectedMunicipioId(
          userCity ? userCity.municipio_id : res.data[0]?.municipio_id ?? null
        );
      })
      .catch((err) => console.error("Erro ao carregar municípios IPS:", err));
  }, [selectedEstado, selectedAno]);

  // Load all data when city/year changes
  useEffect(() => {
    if (!selectedMunicipioId) return;
    setLoading(true);
    const params = { municipio_id: selectedMunicipioId, ano: selectedAno };
    Promise.all([
      api.get("/ips/scorecard", { params }),
      api.get("/ips/evolucao", { params: { municipio_id: selectedMunicipioId } }),
      api.get("/ips/ranking", { params }),
      api.get("/ips/destaques", { params }),
      api.get("/ips/sugestoes", { params: { ...params, limit: 6 } }),
    ])
      .then(([sc, ev, rk, dest, sug]) => {
        setScorecard(sc.data);
        setEvolucao(ev.data);
        setRanking(rk.data);
        setDestaques(dest.data);
        setSugestoes(sug.data);
        setCompareMunicipioIds([]);
      })
      .catch((err) => console.error("Erro ao carregar dados IPS:", err))
      .finally(() => setLoading(false));
  }, [selectedMunicipioId, selectedAno]);

  // Load comparativo when compare ids change
  useEffect(() => {
    if (!selectedMunicipioId) return;
    const allIds = [selectedMunicipioId, ...compareMunicipioIds];
    api
      .get("/ips/comparativo", {
        params: {
          municipio_id: selectedMunicipioId,
          ano: selectedAno,
          municipio_ids: allIds.join(","),
        },
      })
      .then((res) => setComparativo(res.data))
      .catch((err) => console.error("Erro ao carregar comparativo IPS:", err));
  }, [selectedMunicipioId, selectedAno, compareMunicipioIds]);

  function addCompare(municipioId) {
    if (!compareMunicipioIds.includes(municipioId) && municipioId !== selectedMunicipioId) {
      setCompareMunicipioIds((prev) => [...prev, municipioId]);
    }
  }

  function removeCompare(municipioId) {
    setCompareMunicipioIds((prev) => prev.filter((id) => id !== municipioId));
  }

  const perfilData = useMemo(
    () =>
      COMPONENTS.map((c) => ({
        label: c.label,
        value: scorecard?.[c.key] ?? 0,
      })),
    [scorecard]
  );

  const comparativoData = useMemo(() => {
    const keys = [
      "ips_geral",
      "necessidades_humanas_basicas",
      "fundamentos_bem_estar",
      "oportunidades",
    ];
    const labels = { ips_geral: "IPS Geral", necessidades_humanas_basicas: "NHB", fundamentos_bem_estar: "FBE", oportunidades: "OPO" };
    return keys.map((k) => ({
      name: labels[k],
      ...Object.fromEntries(comparativo.map((c) => [c.nome, c[k] ?? 0])),
    }));
  }, [comparativo]);

  const pibPerCapita = scorecard?.pib_per_capita
    ? `R$ ${Number(scorecard.pib_per_capita).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`
    : "—";
  const pibSub = [
    scorecard?.populacao && `Pop. ${scorecard.populacao.toLocaleString("pt-BR")}`,
    scorecard?.area_km2 && `Área ${Number(scorecard.area_km2).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} km²`,
  ].filter(Boolean).join(" · ");

  return (
    <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="space-y-6">
      <div className="flex items-center gap-2">
        <NidPageHeader
          title="IPS"
          sub="Índice de Progresso Social — avaliação multidimensional da qualidade de vida, de 0 a 100"
        />
        <InfoTooltip dataset="ips" />
      </div>

      {/* Selectors */}
      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs text-[var(--text-mute)] mb-1">Estado</label>
          <NidSelect
            value={selectedEstado}
            onChange={(e) => setSelectedEstado(e.target.value)}
            ariaLabel="Filtrar por estado"
          >
            {estados.map((e) => (
              <option key={e} value={e}>{e}</option>
            ))}
          </NidSelect>
        </div>
        <div className="min-w-[220px]">
          <label className="block text-xs text-[var(--text-mute)] mb-1">Município</label>
          <MunicipioPicker
            municipios={municipios.map((m) => ({ ...m, id: m.municipio_id }))}
            value={selectedMunicipioId ?? ""}
            onChange={(id) => setSelectedMunicipioId(id ? Number(id) : null)}
          />
        </div>
        <div>
          <label className="block text-xs text-[var(--text-mute)] mb-1">Ano</label>
          <div className="flex" style={{ gap: 6 }}>
            {[2024, 2025].map((a) => (
              <button
                key={a}
                onClick={() => setSelectedAno(a)}
                className={`nid-tab ${selectedAno === a ? "active" : ""}`}
              >
                {a}
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <KpiSkeleton key={i} />)}
        </div>
      )}

      {!loading && scorecard && (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KpiCard
              label="IPS Geral"
              value={fmt(scorecard.ips_geral)}
              sub="de 100"
              accent={scoreAccent(scorecard.ips_geral)}
              dataset="ips"
              indicadorKey="ips_geral"
            />
            <KpiCard
              label="Ranking Nacional"
              value={ranking ? `${ranking.ranking_nacional}º` : "—"}
              sub={ranking ? `de ${ranking.total_nacional.toLocaleString("pt-BR")} municípios` : ""}
              dataset="ips"
              indicadorKey="ranking_nacional"
            />
            <KpiCard
              label="Ranking Estadual"
              value={ranking ? `${ranking.ranking_estadual}º` : "—"}
              sub={ranking ? `de ${ranking.total_estadual.toLocaleString("pt-BR")} em ${selectedEstado}` : ""}
              dataset="ips"
              indicadorKey="ranking_estadual"
            />
            <KpiCard
              label="PIB per capita"
              value={pibPerCapita}
              sub={pibSub}
              dataset="ips"
              indicadorKey="pib_per_capita"
            />
          </div>

          {/* Dimensões */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {DIMENSIONS.map((d) => (
              <KpiCard
                key={d.key}
                label={d.short}
                value={fmt(scorecard[d.key])}
                sub={d.label}
                accent={scoreAccent(scorecard[d.key])}
                dataset="ips"
                indicadorKey={d.key}
              />
            ))}
          </div>

          <NidPanel title="Perfil por Componente" sub="Score de cada componente · de 100">
            <HBarChart
              data={perfilData}
              color="var(--accent-1)"
              fmt={(v) => `${fmt(v)} de 100`}
              emptyMessage="Sem dados disponíveis"
            />
          </NidPanel>

          {destaques && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <NidPanel title="Pontos Fortes" sub="Maiores diferenças positivas vs. média estadual">
                <div className="space-y-3">
                  {destaques.melhores.map((d) => (
                    <div key={d.campo} className="flex justify-between items-center">
                      <span className="text-sm text-[var(--text-dim)]">{d.label}</span>
                      <div className="text-right">
                        <span className="text-sm font-bold" style={{ color: "var(--accent-5)" }}>{fmt(d.valor)}</span>
                        <span className="text-xs text-[var(--text-mute)] ml-1">(+{fmt(d.diferenca)} vs média)</span>
                      </div>
                    </div>
                  ))}
                </div>
              </NidPanel>
              <NidPanel title="Pontos a Melhorar" sub="Maiores diferenças negativas vs. média estadual">
                <div className="space-y-3">
                  {destaques.piores.map((d) => (
                    <div key={d.campo} className="flex justify-between items-center">
                      <span className="text-sm text-[var(--text-dim)]">{d.label}</span>
                      <div className="text-right">
                        <span className="text-sm font-bold" style={{ color: "var(--accent-2)" }}>{fmt(d.valor)}</span>
                        <span className="text-xs text-[var(--text-mute)] ml-1">({fmt(d.diferenca)} vs média)</span>
                      </div>
                    </div>
                  ))}
                </div>
              </NidPanel>
            </div>
          )}

          {/* Detalhamento por Dimensão (colapsável) */}
          <div className="space-y-3">
            <h2 className="text-base font-semibold text-[var(--text)]">Detalhamento por Dimensão</h2>
            {[
              { dimKey: "nhb", label: "Necessidades Humanas Básicas" },
              { dimKey: "fbe", label: "Fundamentos do Bem-estar" },
              { dimKey: "opo", label: "Oportunidades" },
            ].map(({ dimKey, label }) => {
              const comps = COMPONENTS.filter((c) => c.dim === dimKey);
              const subs = SUB_INDICATORS.filter((s) => s.dim === dimKey);
              return (
                <div key={dimKey} className="nid-panel overflow-hidden" style={{ padding: 0 }}>
                  <button
                    onClick={() => setOpenDims((p) => ({ ...p, [dimKey]: !p[dimKey] }))}
                    className="w-full flex justify-between items-center p-5 text-left cursor-pointer"
                  >
                    <span className="font-medium text-[var(--text)]">{label}</span>
                    <span className="text-[var(--text-mute)] text-sm">{openDims[dimKey] ? "▲" : "▼"}</span>
                  </button>
                  {openDims[dimKey] && (
                    <div className="px-5 pb-5 space-y-2 border-t border-[var(--border)] pt-4">
                      <p className="text-xs font-semibold uppercase tracking-widest text-[var(--text-mute)] mb-3">
                        Componentes
                      </p>
                      {comps.map((c) => {
                        const v = scorecard[c.key];
                        return (
                          <div key={c.key} className="flex items-center gap-3">
                            <span className="text-xs text-[var(--text-dim)] w-48 flex-shrink-0">{c.label}</span>
                            <div className="flex-1">
                              <BarraExecucao pct={v} label={fmt(v)} />
                            </div>
                          </div>
                        );
                      })}
                      <p className="text-xs font-semibold uppercase tracking-widest text-[var(--text-mute)] mt-4 mb-3">
                        Sub-indicadores
                      </p>
                      {subs.map((s) => {
                        const v = scorecard[s.key];
                        return (
                          <div key={s.key} className="flex items-center gap-3">
                            <span className="text-xs text-[var(--text-dim)] w-48 flex-shrink-0">{s.label}</span>
                            <div className="flex-1">
                              <BarraExecucao pct={v} label={fmt(v)} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {evolucao.length > 0 && (
            <NidPanel title="Evolução ao Longo do Tempo" sub="IPS geral e dimensões por ano">
              <MultiLineChart
                data={evolucao.map((d) => ({
                  label: String(d.ano),
                  "IPS Geral": d.ips_geral || 0,
                  "NHB": d.necessidades_humanas_basicas || 0,
                  "FBE": d.fundamentos_bem_estar || 0,
                  "OPO": d.oportunidades || 0,
                }))}
                series={["IPS Geral", "NHB", "FBE", "OPO"]}
                colors={["var(--accent-1)", "var(--accent-5)", "var(--accent-4)", "var(--accent-3)"]}
                height={220}
                yFmt={(v) => v.toFixed(1)}
                tipFmt={(v) => v.toFixed(1)}
                legend
                emptyMessage="Sem histórico disponível"
              />
              {evolucao.length >= 2 && (() => {
                const last = evolucao[evolucao.length - 1];
                const prev = evolucao[evolucao.length - 2];
                const delta = (last.ips_geral ?? 0) - (prev.ips_geral ?? 0);
                return (
                  <p className="text-sm mt-3 font-medium" style={{ color: delta >= 0 ? "var(--accent-5)" : "var(--accent-2)" }}>
                    {delta >= 0 ? "+" : ""}{fmt(delta)} pontos de {prev.ano} para {last.ano}
                  </p>
                );
              })()}
            </NidPanel>
          )}

          <NidPanel title="Comparar com Outros Municípios" sub="Municípios semelhantes por PIB per capita">
            <div className="space-y-4">
              {sugestoes.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {sugestoes.map((s) => (
                    <button
                      key={s.municipio_id}
                      onClick={() => addCompare(s.municipio_id)}
                      disabled={compareMunicipioIds.includes(s.municipio_id)}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors cursor-pointer ${
                        compareMunicipioIds.includes(s.municipio_id)
                          ? "bg-[var(--panel-2)] border-[var(--border)] text-[var(--accent-1)]"
                          : "border-[var(--border)] text-[var(--text-dim)] hover:bg-[var(--panel-2)]"
                      }`}
                    >
                      {s.nome} ({s.estado}) — {fmt(s.ips_geral)}
                    </button>
                  ))}
                </div>
              )}

              {compareMunicipioIds.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {compareMunicipioIds.map((id) => {
                    const m = comparativo.find((c) => c.municipio_id === id);
                    return m ? (
                      <span
                        key={id}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium border"
                        style={{ background: "var(--panel-2)", borderColor: "var(--accent-1)", color: "var(--accent-1)" }}
                      >
                        {m.nome}
                        <button onClick={() => removeCompare(id)} className="ml-1 hover:opacity-70 cursor-pointer">✕</button>
                      </span>
                    ) : null;
                  })}
                </div>
              )}

              {comparativo.length > 0 && (
                <MultiLineChart
                  data={comparativoData.map((d) => ({ label: d.name, ...d }))}
                  series={comparativo.map((c) => c.nome)}
                  colors={SERIES_COLORS}
                  height={250}
                  yFmt={(v) => v.toFixed(1)}
                  tipFmt={(v) => v.toFixed(1)}
                  legend
                />
              )}
            </div>
          </NidPanel>
        </>
      )}
    </motion.div>
  );
}
```

- [ ] **Step 2: Verificar**

- `grep -nE "slate-|blue-500|emerald-|amber-50|red-500|red-600|text-6xl|#[0-9a-fA-F]{6}" frontend-observatorio/src/pages/ips/IpsPage.jsx` → 0 ocorrências.
- `grep -n "Populacao\|Area:" frontend-observatorio/src/pages/ips/IpsPage.jsx` → 0.

- [ ] **Step 3: Gates + commit**

`npm run test` → exit 0; `npm run build` → exit 0.

```bash
git add frontend-observatorio/src/pages/ips/IpsPage.jsx
git commit -m "feat(uxui): IPS convertido ao padrao nid (KpiCard, NidPanel, tokens)"
```

---

### Task 8: Verificação final

**Files:** nenhum (só verificação; correções pontuais se algo falhar).

- [ ] **Step 1: Gates completos**

De `frontend-observatorio/`: `npm run test` → exit 0 (74); `npm run build` → exit 0.

- [ ] **Step 2: Greps de cobertura**

- `grep -rnE 'accent[:=]["'"'"' ]*text-' frontend-observatorio/src/` → 0.
- `grep -rnE '#(3b82f6|10b981|f59e0b|8b5cf6|06b6d4|6366f1|f97316|f43f5e|84cc16|94a3b8|ef4444)' frontend-observatorio/src/pages/ --include=*.jsx | grep -v landing | grep -v login | grep -v admin | grep -v desenvolvimento-economico | grep -v dados-internos | grep -v releases | grep -v impacto` → 0 (impacto usa hex só como fallback de var(), aceito).
- `grep -rn "bg-slate-50\|border-slate-50" frontend-observatorio/src/pages/ --include=*.jsx | grep -v admin | grep -v dados-internos | grep -v desenvolvimento-economico` → 0.
- `grep -rn "Selecione um município" frontend-observatorio/src/` → apenas `components/nid/SelecioneMunicipio.jsx`.
- `grep -rn "ring-blue-500" frontend-observatorio/src/pages/comex frontend-observatorio/src/pages/comparativo frontend-observatorio/src/pages/ips` → 0.
- `grep -rn "MiniStat" frontend-observatorio/src/` → 0.

- [ ] **Step 3: Checklist visual (fica para o usuário)**

IPS nos 5 temas (dark sem blocos claros); 20 KPIs coloridos acompanhando o tema; gráficos das 7 páginas com accents; selects de Comex/Comparativo/Emendas/IPS uniformes; skeletons idênticos; "Selecione um município" único; painel de Empresas ausente sem buraco; subs do Comex com o período real.

- [ ] **Step 4: Integração**

Sem correções → nada a commitar. Merge ao `main` via superpowers:finishing-a-development-branch após review final.
