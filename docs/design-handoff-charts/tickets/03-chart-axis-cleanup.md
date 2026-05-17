# 03 — Chart axis cleanup: Y-caption + monochrome stacks

**Phase:** 1 (Foundations) · **Effort:** S · **Impact:** Medium

## Goal

Two small but pervasive changes to the chart frame:

1. **Y-axis caption.** Replace the "R$ 1.4B / R$ 1.0B / R$ 700M / …" stack with a single rotated caption (e.g. `R$ MILHÕES`) plus 3 numeric ticks.
2. **Monochrome stacks.** `StackedBarChart` currently takes a `colors` array of distinct hues. Add an optional single-color mode that fans the color out by opacity (`.95 / .7 / .45 / .25`) so the legend reads as a scale, not a rainbow.

## Files

- **Edit:** `src/components/nid/charts.jsx`

## Part 1 — Y-axis caption

### Approach

Add a new optional prop `yCaption` to all cartesian charts (`AreaLineChart`, `StackedBarChart`, `MultiLineChart`, `TwinBarChart`). When provided, it replaces the per-tick `R$` prefix with a single rotated caption to the left of the chart.

### Component changes (each cartesian chart)

The render block of each chart already has:

```jsx
{ticks.map((t, i) => (
  <g key={i}>
    <line x1={padL} x2={w - padR} y1={sy(t)} y2={sy(t)} stroke="var(--grid)" strokeDasharray="3 4" />
    <text x={padL - 10} y={sy(t) + 3.5} className="nid-axis-text" textAnchor="end">{yFmt(t)}</text>
  </g>
))}
```

Wrap so that when `yCaption` is set:
- Reduce the visible tick count to 3 (already done via `niceTicks(0, yMax, 3)` — currently 4).
- Use the **plain numeric formatter** (`fmtNumberShort`) instead of `fmtMoneyShort` — the unit is now in the caption.
- Render the caption rotated -90° at `x=14, y=height/2`.

```jsx
{yCaption && (
  <text className="axis-cap"
    x={14} y={height / 2}
    transform={`rotate(-90 14 ${height / 2})`}
    textAnchor="middle">
    {yCaption}
  </text>
)}
```

Add a CSS class in `global.css` if not already present:

```css
.axis-cap {
  font-family: var(--font-mono);
  font-size: 10px;
  fill: var(--text-mute);
  letter-spacing: 0.14em;
  text-transform: uppercase;
}
```

### Call-site update

```jsx
// Before
<AreaLineChart data={…} yFmt={fmtMoneyShort} tipFmt={fmtMoneyFull} />

// After
<AreaLineChart data={…} yCaption="R$ MILHÕES" yFmt={(v) => fmtNumberShort(v / 1e6)} tipFmt={fmtMoneyFull} />
```

`yFmt` is whatever formatter divides the raw value into the caption's unit. Tooltips still use `tipFmt` (full money) so on-hover detail is unaffected.

## Part 2 — Monochrome stacks

### Current API

```jsx
<StackedBarChart
  data={…}
  keys={["Agropecuária", "Indústria", "Serviços", "Governo"]}
  colors={["#10b981", "#3b82f6", "#f59e0b", "#8b5cf6"]}
/>
```

### Target API (backward-compatible)

```jsx
<StackedBarChart
  data={…}
  keys={["Agropecuária", "Indústria", "Serviços", "Governo"]}
  baseColor="var(--accent-1)"      // NEW — when set, ignores `colors`
  showTotalLabel                   // NEW — renders total on top of each bar
  highlightLast                    // NEW — frames the most recent bar
/>
```

If `baseColor` is set, derive the per-segment color via opacity:

```js
const opacityScale = (i, n) => {
  // first stack (bottom) most saturated, top stack faintest
  const stops = [0.95, 0.70, 0.45, 0.25, 0.15];
  return stops[i] ?? 0.10;
};

// In the render loop, fill becomes:
const fillFor = (ki) =>
  baseColor
    ? baseColor   // applied via separate <rect opacity={opacityScale(ki)} />
    : `url(#bgrad-${id}-${ki})`;
```

When `baseColor` is set, drop the per-color gradient definitions and use opacity attributes instead.

### Total label

When `showTotalLabel` is true, render a `<text>` element above each bar:

```jsx
{data.map((d, i) => {
  const total = keys.reduce((s, k) => s + (d[k] || 0), 0);
  const cx = sx(i);
  const top = sy(total);
  return (
    <text x={cx} y={top - 8} className="nid-axis-text"
      textAnchor="middle" style={{ fill: "var(--text)" }}>
      {yFmt(total)}
    </text>
  );
})}
```

### Highlight last bar

When `highlightLast` is true and `i === data.length - 1`, draw an outline rect around the entire bar group and color the total label in `--accent-2`:

```jsx
{highlightLast && i === data.length - 1 && (
  <rect x={cx - barWidth/2 - 2} y={top - 2}
    width={barWidth + 4} height={padT + innerH - top + 4}
    fill="none" stroke="var(--accent-2)" strokeWidth="1.5" rx="3" />
)}
```

And compute YoY delta for that label:
```
R$ 1.25B · +19%   ← in --accent-2
```

## Call sites to update after this ticket

- `PibPage.jsx` → VA por Setor: `baseColor="var(--accent-1)"`, `showTotalLabel`, `highlightLast`, `yCaption="R$ MILHÕES"`
- `DashboardGeralPage.jsx` → all `StackedBarChart` instances: add `showTotalLabel`
- All `AreaLineChart` / `MultiLineChart` / `TwinBarChart` calls: add `yCaption`

## Acceptance criteria

- [ ] New `yCaption` prop on all four cartesian charts. When set, axis ticks lose any unit prefix (just digits) and 3 (not 5) ticks are shown.
- [ ] `axis-cap` class added to `global.css`, reads from theme tokens.
- [ ] `StackedBarChart` accepts `baseColor`, `showTotalLabel`, `highlightLast`. All three default to off; old call sites unchanged.
- [ ] When `baseColor` is set, segments use opacity stops `[.95, .7, .45, .25]`; legend swatches in the page reflect the same opacity.
- [ ] Works in all 5 themes.
- [ ] Tooltips still show full money values (they read `tipFmt`, not `yFmt`).
