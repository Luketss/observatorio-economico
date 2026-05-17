# 02 — Migrate PibPage off Recharts

**Phase:** 1 (Foundations) · **Effort:** M · **Impact:** High

## Goal

`PibPage` is the last page using **Recharts**. Every other page already uses the custom NID chart library (`src/components/nid/charts.jsx`). Migrate it, then drop Recharts from `package.json`.

Why: visual consistency (PibPage currently looks different from every other page), smaller bundle, single chart library to maintain going forward.

## Files

- **Edit:** `src/pages/pib/PibPage.jsx`
- **Edit:** `frontend-observatorio/package.json` (remove `recharts` from dependencies)
- **Edit:** `package-lock.json` (regenerate via `npm install`)
- **No new files needed** — all replacement chart components already exist in `src/components/nid/charts.jsx`.

## Chart-by-chart mapping

`PibPage` has three Recharts blocks. Replace each with the listed NID equivalent.

### 1. "Evolução Anual do PIB" — Recharts `BarChart` → NID `AreaLineChart`

The redesign turns this from a bar chart into an area-line chart (matches the "PIB evolution" pattern the design system was built around). See `Charts Review.html`, section 02.

**Before:**
```jsx
<ResponsiveContainer width="100%" height="100%">
  <BarChart data={serie} barCategoryGap="30%">
    <CartesianGrid strokeDasharray="3 3" stroke={ct.grid} vertical={false} />
    <XAxis dataKey="ano" tick={{ fontSize: 12, fill: ct.tick }} stroke={ct.axis} />
    <YAxis tick={{ fontSize: 11, fill: ct.tick }} stroke={ct.axis} width={75}
      tickFormatter={(v) => `${(v / 1_000_000).toFixed(0)}M`} />
    <Tooltip formatter={(v) => [fmtBRL(v), "PIB Total"]} cursor={{ fill: ct.grid }} />
    <Bar dataKey="pib_total" radius={[4, 4, 0, 0]}>
      {serie.map((_, i) => (
        <Cell key={i} fill={i === serie.length - 1 ? "#10b981" : "#a7f3d0"} />
      ))}
    </Bar>
  </BarChart>
</ResponsiveContainer>
```

**After:**
```jsx
import { AreaLineChart, fmtMoneyShort, fmtMoneyFull } from "../../components/nid/charts";

const areaData = useMemo(
  () => serie.map((d) => ({ label: String(d.ano), value: d.pib_total })),
  [serie]
);

// …
<AreaLineChart
  data={areaData}
  height={280}
  color="var(--accent-1)"
  label="PIB Total"
  yFmt={fmtMoneyShort}
  tipFmt={fmtMoneyFull}
/>
```

`AreaLineChart` expects `[{ label, value }]`. Map `serie` accordingly. Drop the `ResponsiveContainer` wrapper — NID charts measure their own container via `useContainerWidth`.

### 2. "Valor Adicionado por Setor" — Recharts stacked `BarChart` → NID `StackedBarChart`

**Before:** Recharts `BarChart` with 4 stacked `Bar` elements (Agropecuária / Indústria / Serviços / Governo).

**After:**
```jsx
import { StackedBarChart } from "../../components/nid/charts";

const vaChartData = useMemo(
  () => vaData.map((d) => ({
    label: String(d.ano),
    "Agropecuária": d.va_agropecuaria,
    "Indústria":    d.va_industria,
    "Serviços":     d.va_servicos,
    "Governo":      d.va_governo,
  })),
  [vaData]
);

// …
<StackedBarChart
  data={vaChartData}
  keys={["Agropecuária", "Indústria", "Serviços", "Governo"]}
  colors={["var(--accent-1)", "var(--accent-3)", "var(--accent-5)", "var(--accent-4)"]}
  height={280}
/>
```

NB: ticket **03** (chart-axis-cleanup) and ticket **08-style monochromatic stacking** modify `StackedBarChart` itself to use a single-hue opacity scale. After ticket 03 lands, you can simplify the `colors` prop to a single color and `StackedBarChart` will fan it out automatically.

### 3. "PIB Comparativo — Municípios" — Recharts `LineChart` → NID `MultiLineChart`

**Before:** Recharts `LineChart` with one `Line` per `cidade` from `COMP_COLORS`.

**After:**
```jsx
import { MultiLineChart } from "../../components/nid/charts";

// Already pivoted into comparativoChart as { ano, [cidade]: value }
const compData = useMemo(
  () => comparativoChart.map((row) => ({ label: String(row.ano), ...row })),
  [comparativoChart]
);

<MultiLineChart
  data={compData}
  series={cidades}
  colors={cidades.map((_, i) => `var(--accent-${(i % 5) + 1})`)}
  height={280}
/>
```

⚠️ This is a stopgap. Ticket **06 (focus + context)** rewrites this entire chart so the user's own município is highlighted and peers are muted grey. When ticket 06 ships, the colors array is replaced by a `focusSeries` prop.

## Cleanup

After all three replacements compile and render:

1. Remove `recharts` from `package.json`:
   ```bash
   cd frontend-observatorio
   npm uninstall recharts
   ```
2. Delete the Recharts imports at the top of `PibPage.jsx`:
   ```jsx
   // DELETE
   import {
     ResponsiveContainer, BarChart, Bar, LineChart, Line,
     CartesianGrid, XAxis, YAxis, Tooltip, Legend, Cell,
   } from "recharts";
   ```
3. The `useChartTheme()` hook (returns `ct.grid`, `ct.tick`, etc.) was used to feed colors into Recharts. NID charts read CSS vars directly. After migration, audit whether `useChartTheme` has any remaining callers; if not, leave it for now (other future use), don't delete in this ticket.

## Wrap charts in NidPanel for consistency

The other pages use `<NidPanel title="…">` around their charts. `PibPage` currently uses a raw Tailwind div:

```jsx
<div className="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800">
  <h3 className="text-base font-bold mb-5 text-slate-800 dark:text-white">Evolução Anual do PIB</h3>
  {…}
</div>
```

Replace with:

```jsx
import { NidPanel } from "../../components/nid/Panel";

<NidPanel title="Evolução Anual do PIB" sub="série histórica · R$ milhões">
  {…chart…}
</NidPanel>
```

Apply the same wrapping to the VA breakdown and the comparativo charts.

## Acceptance criteria

- [ ] `recharts` is gone from `package.json` and not imported anywhere in `src/`.
- [ ] `PibPage` renders all three charts using NID equivalents.
- [ ] All three charts wrapped in `NidPanel`.
- [ ] All chart colors come from CSS vars; no hex literals.
- [ ] Page works in all 5 themes.
- [ ] Bundle size decreases (verify with `npm run build`).
- [ ] No console errors.
