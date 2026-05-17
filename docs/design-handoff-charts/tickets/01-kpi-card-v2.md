# 01 — KpiCard v2: inline delta + sparkline

**Phase:** 1 (Foundations) · **Effort:** S · **Impact:** High

## Goal

`KpiCard` currently renders only `label`, `value`, optional `sub`, and an info icon. Add two first-class props — a **delta chip** and a **sparkline** — so every KPI carries direction and trend without a separate card.

## Files

- **Edit:** `src/components/KpiCard.jsx`
- **Reuse:** `Sparkline` already exported from `src/components/nid/charts.jsx`
- **Reuse:** `.nid-delta.up / .down / .flat` classes in `src/styles/themes.css`

## Current shape

```jsx
<KpiCard label="PIB Último Ano" value="R$ 1.247.832.450" sub="Ano 2023"
  dataset="pib" indicadorKey="ultimo_ano" />
```

## Target shape

```jsx
<KpiCard
  label="PIB Último Ano"
  period="2023"                          // NEW — eyebrow appendix
  value="R$ 1.25"                        // shortened
  unit="Bi"                              // NEW — softer-weight unit
  delta={{ value: 8.4, direction: "up" }}   // NEW — auto-formatted chip
  deltaLabel="vs 2022"                   // NEW — text after the chip
  spark={[820, 855, 901, 962, 1058, 1151, 1248]}  // NEW — array of numbers
  sparkColor="var(--accent-1)"           // NEW — defaults to --accent-1
  dataset="pib"
  indicadorKey="ultimo_ano"
/>
```

All new props are **optional**. Old call sites keep working unchanged.

## Visual spec (proposed-side mockup in Charts Review.html, section 01)

```
┌────────────────────────────────────────────────┐
│ PIB ÚLTIMO ANO · 2023                      (i) │  ← .nid-kpi-label, 10.5px mono uppercase
│                                                │
│ R$ 1.25 Bi                                     │  ← .nid-kpi-value, 30px Geist 700; "Bi" = 14px 500 --text-dim
│                                                │
│ ▲ +8.4%  vs 2022          série 2010–2023      │  ← delta chip + label, mono 11.5px --text-dim
│ ╭────────────────────────────────────────────╮ │
│ │  sparkline (full bleed, 42px tall)         │ │  ← gradient area + line + endpoint dot
│ ╰────────────────────────────────────────────╯ │
└────────────────────────────────────────────────┘
```

### Delta chip rules

- Reuses existing `.nid-delta.up / .down / .flat` classes.
- Prefix: `▲` for `up`, `▼` for `down`, `—` for `flat`.
- Value formatted to 1 decimal, with sign: `+8.4%`, `−5.6%`, `±0.1%`.
- If `delta.value === 0` or `direction === "flat"`, use `.flat` class and `—` prefix.
- If `delta` is `null/undefined`, render nothing (don't reserve space).

### Sparkline rules

- Pass `spark` directly to the existing `Sparkline` component.
- Default color `var(--accent-1)`. When `delta.direction === "down"`, default to `var(--accent-2)` instead. Explicit `sparkColor` overrides.
- Sparkline sits flush to the bottom of the card. Apply negative margin so it bleeds to the card edges (already styled in `.nid-kpi-spark`):
  ```css
  .nid-kpi-spark { margin: 12px -18px -16px; height: 42px; }
  ```

### Period rules

- When `period` is provided, append it to the label as `" · 2023"`.
- This **replaces** putting "Ano 2023" in the `sub` slot on existing pages. Update call sites accordingly (see migration list below).
- `sub` prop is retained for cases where a non-period footnote is wanted ("Variação vs ano anterior", etc.), but should be deprecated long-term.

## Implementation sketch

```jsx
import { Sparkline } from "./nid/charts";

function DeltaChip({ value, direction }) {
  if (value == null) return null;
  const arrow = direction === "up" ? "▲" : direction === "down" ? "▼" : "—";
  const sign = value > 0 ? "+" : value < 0 ? "−" : "±";
  const cls = `nid-delta ${direction || "flat"}`;
  return (
    <span className={cls}>
      {arrow} {sign}{Math.abs(value).toFixed(1)}%
    </span>
  );
}

export default function KpiCard({
  label, period, value, unit, sub,
  delta, deltaLabel, spark, sparkColor,
  dataset, indicadorKey, /* …existing props… */
}) {
  // …existing info/tooltip/modal logic stays…

  const fullLabel = period ? `${label} · ${period}` : label;
  const autoSparkColor =
    sparkColor || (delta?.direction === "down" ? "var(--accent-2)" : "var(--accent-1)");

  return (
    <motion.div /* … */ className="nid-kpi">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="nid-kpi-label">{fullLabel}</p>
          <p className="nid-kpi-value">
            {value}
            {unit && <span className="nid-unit"> {unit}</span>}
          </p>
          {(delta || sub) && (
            <p className="nid-kpi-foot">
              {delta && <DeltaChip {...delta} />}
              {deltaLabel && <span>{deltaLabel}</span>}
              {sub && <span style={{ marginLeft: "auto", color: "var(--text-mute)" }}>{sub}</span>}
            </p>
          )}
        </div>
        {/* …icon + info button (unchanged)… */}
      </div>
      {spark && spark.length > 1 && (
        <div className="nid-kpi-spark">
          <Sparkline data={spark} color={autoSparkColor} />
        </div>
      )}
    </motion.div>
  );
}
```

## Migration of existing call sites

The following pages assemble `cards` arrays and pass them into `KpiCard`. Update them to use the new props:

### `src/pages/pib/PibPage.jsx`

```jsx
const cards = [
  {
    label: "PIB Último Ano",
    period: resumo?.ultimo_ano ? String(resumo.ultimo_ano) : null,
    value: resumo ? fmtBRLShort(resumo.pib_ultimo_ano).value : "—",
    unit: resumo ? fmtBRLShort(resumo.pib_ultimo_ano).unit : "",
    delta: resumo?.crescimento_percentual != null
      ? {
          value: resumo.crescimento_percentual,
          direction: resumo.crescimento_percentual > 0 ? "up"
                   : resumo.crescimento_percentual < 0 ? "down" : "flat",
        }
      : null,
    deltaLabel: "vs ano anterior",
    spark: rawSerie.map((d) => d.pib_total),
    dataset: "pib",
    indicadorKey: "ultimo_ano",
  },
  // …drop the standalone "Crescimento" card; it's now inline in the one above
  {
    label: "Anos na Série",
    value: serie.length > 0 ? String(serie.length) : "—",
    sub: serie.length > 0 ? `${serie[0].ano} – ${serie[serie.length - 1].ano}` : null,
    dataset: "pib",
    indicadorKey: "anos_serie",
  },
];
```

Note: The old standalone "Crescimento" card is **deleted** — its info now lives as the delta chip inside the PIB card.

### `src/pages/DashboardGeralPage.jsx`

Apply the same pattern to every block of cards in `DashboardGeralPage`. Where two cards expressed value + delta separately, merge them. Where a card had a sparkline rendered inline below, move it to the `spark` prop.

### `src/pages/caged/CagedPage.jsx`, `arrecadacao/ArrecadacaoPage.jsx`, etc.

Pass spark data wherever a series is available. Read the existing `*Serie` state, extract the relevant numeric column, and forward as `spark={...}`.

## Acceptance criteria

- [ ] All existing `KpiCard` call sites keep rendering correctly (additive change).
- [ ] When `delta` is provided, the chip appears inline on the foot row using `.nid-delta`.
- [ ] When `spark` is provided, the sparkline fills the bottom of the card.
- [ ] Sparkline color flips to `--accent-2` when delta direction is `down` unless overridden.
- [ ] `period` prop appends to the label; "Ano 2023" no longer appears in any `sub` slot.
- [ ] PIB page: 3 cards become 2 cards (PIB merges with Crescimento) on `DashboardGeralPage` and on `PibPage`.
- [ ] Works in all 5 themes; verify by toggling `body.theme-light`.
- [ ] No new dependencies.
