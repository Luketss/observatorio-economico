# 04 — Benchmark + forecast + annotations on line/area charts

**Phase:** 2 (Time-series storytelling) · **Effort:** M · **Impact:** High

## Goal

Time-series charts should communicate the story without forcing the user to hover. Add three first-class props to `AreaLineChart` and `MultiLineChart`:

1. **`benchmark`** — a dashed horizontal reference line with a label (e.g. "média estadual · 600M").
2. **`forecast`** — a dashed continuation past the last data point, computed from a simple linear regression on the last N points. Backlog item from `IDEAS.md`.
3. **`annotations`** — point or range callouts ("COVID dip", "novo pico").

All three are optional. The component works without them.

## Files

- **Edit:** `src/components/nid/charts.jsx`
- **Edit:** `src/pages/pib/PibPage.jsx`, `src/pages/arrecadacao/ArrecadacaoPage.jsx`, `src/pages/caged/CagedPage.jsx` (consumers)

## Target API

```jsx
<AreaLineChart
  data={areaData}
  yCaption="R$ MILHÕES"
  benchmark={{
    value: 600_000_000,
    label: "média estadual",
    color: "var(--text-dim)",          // optional, defaults to text-dim
  }}
  forecast={{
    steps: 1,                           // how many future periods to project
    method: "linear-6",                 // linear regression on last 6 points
    color: "var(--accent-3)",           // optional, defaults to accent-3
    label: "projeção",
  }}
  annotations={[
    { x: "2020", kind: "negative", label: "COVID" },
    { x: "2023", kind: "positive", label: "novo pico" },
    { xRange: ["2020", "2021"], kind: "negative" },  // band, no label
  ]}
/>
```

## Implementation — benchmark

The chart already computes `sy(value)` for any number. Inject one extra `<line>` + `<text>`:

```jsx
{benchmark && (
  <g>
    <line
      x1={padL} x2={w - padR}
      y1={sy(benchmark.value)} y2={sy(benchmark.value)}
      stroke={benchmark.color || "var(--text-dim)"}
      strokeDasharray="6 5" strokeWidth="1.2" opacity="0.55"
    />
    <text
      x={w - padR} y={sy(benchmark.value) - 5}
      textAnchor="end"
      className="nid-axis-text"
      style={{ fill: benchmark.color || "var(--text-dim)", letterSpacing: ".06em" }}
    >
      {benchmark.label} · {tipFmt(benchmark.value)}
    </text>
  </g>
)}
```

If `benchmark.value` falls outside the current Y range, expand `yMax` to include it (otherwise the line clips):

```js
const benchValue = benchmark?.value;
const yMaxRaw = Math.max(...ys, benchValue ?? -Infinity) * 1.12;
```

## Implementation — forecast

### The regression

Pure JS, no dependencies. Last-N linear regression:

```js
function linearForecast(values, steps = 1, n = 6) {
  const tail = values.slice(-n);
  const N = tail.length;
  if (N < 2) return [];
  // x = 0..N-1, y = values
  const xMean = (N - 1) / 2;
  const yMean = tail.reduce((s, v) => s + v, 0) / N;
  let num = 0, den = 0;
  for (let i = 0; i < N; i++) {
    num += (i - xMean) * (tail[i] - yMean);
    den += (i - xMean) ** 2;
  }
  const slope = den ? num / den : 0;
  const intercept = yMean - slope * xMean;
  const out = [];
  for (let i = 1; i <= steps; i++) out.push(intercept + slope * (N - 1 + i));
  return out;
}
```

### The render

After the main historical path is drawn, append:

```jsx
{forecast && forecastPoints.length > 0 && (
  <>
    {/* Bridge from last real point to first forecast point */}
    <path
      d={`M ${lastReal.x} ${lastReal.y} L ${forecastPts.map(p => `${p.x} ${p.y}`).join(" L ")}`}
      stroke={forecast.color || "var(--accent-3)"}
      strokeWidth="2" strokeDasharray="3 4" fill="none"
    />
    {/* Optional shaded band — uncertainty cone */}
    <path
      d={confidenceBandPath}
      fill={forecast.color || "var(--accent-3)"} opacity="0.15"
    />
  </>
)}
```

Extend the X domain to include the projected steps; show projected X labels in the forecast color with a "P" suffix (e.g. `'24 P`):

```js
const xDomain = [
  ...data.map((d) => d.label),
  ...forecastPts.map((_, i) => `${nextYear + i} P`),
];
```

### Tooltip

Forecast points should be hoverable too. Distinguish them in the tooltip:

```
'24 P   PROJEÇÃO            R$ 1.32 Bi
        (regressão linear, 6 pts)
```

## Implementation — annotations

### Point annotation

```jsx
{annotations?.map((a, i) => {
  if (a.x == null) return null;
  const idx = data.findIndex((d) => d.label === a.x);
  if (idx < 0) return null;
  const pt = pts[idx];
  const fill = a.kind === "negative" ? "var(--accent-2)"
            : a.kind === "positive" ? "var(--accent-5)"
            : "var(--accent-1)";
  return (
    <g key={i}>
      <circle cx={pt.x} cy={pt.y} r="5"
        fill="var(--bg)" stroke={fill} strokeWidth="2" />
      {a.label && (
        <foreignObject x={pt.x - 60} y={pt.y - 38} width="120" height="22">
          <div xmlns="http://www.w3.org/1999/xhtml" className={`nid-pin ${a.kind || ""}`}>
            {a.label}
          </div>
        </foreignObject>
      )}
    </g>
  );
})}
```

`.nid-pin` style (add to `global.css`):

```css
.nid-pin {
  display: inline-block;
  font-family: var(--font-mono);
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 0.06em;
  background: var(--accent-1); color: #03191e;
  padding: 4px 8px; border-radius: 6px;
  box-shadow: 0 8px 18px -8px rgba(0,0,0,.6);
  white-space: nowrap;
}
.nid-pin.negative { background: var(--accent-2); color: #fff; }
.nid-pin.positive { background: var(--accent-5); color: #03130a; }
```

### Range annotation (band)

```jsx
{annotations?.filter((a) => a.xRange).map((a, i) => {
  const i0 = data.findIndex((d) => d.label === a.xRange[0]);
  const i1 = data.findIndex((d) => d.label === a.xRange[1]);
  if (i0 < 0 || i1 < 0) return null;
  const fill = a.kind === "negative" ? "rgba(255,61,146,.06)" : "rgba(0,229,255,.06)";
  const stroke = a.kind === "negative" ? "rgba(255,61,146,.15)" : "rgba(0,229,255,.15)";
  return (
    <rect key={`band-${i}`}
      x={pts[i0].x} y={padT}
      width={pts[i1].x - pts[i0].x}
      height={innerH}
      fill={fill} stroke={stroke}
    />
  );
})}
```

## Where to use this first (pages)

- `PibPage` PIB evolution: benchmark = state PIB average, forecast = 1-year, annotation = COVID range
- `ArrecadacaoPage`: benchmark = same period last year (rolling), forecast = next month
- `CagedPage` saldo: annotation on best month + worst month automatically

Suggested helper utility in `src/utils/insights.js`:

```js
export function autoAnnotateExtremes(data, valueKey = "value") {
  if (!data || data.length < 2) return [];
  const sorted = [...data].sort((a, b) => a[valueKey] - b[valueKey]);
  return [
    { x: sorted[0].label, kind: "negative", label: "mínimo" },
    { x: sorted[sorted.length - 1].label, kind: "positive", label: "máximo" },
  ];
}
```

## Acceptance criteria

- [ ] `AreaLineChart` and `MultiLineChart` accept `benchmark`, `forecast`, and `annotations` props.
- [ ] When `benchmark.value` falls outside the chart's Y range, the range extends.
- [ ] Forecast uses pure-JS linear regression on the last N (default 6) points; no new dependencies.
- [ ] Forecast points are hoverable and labelled "PROJEÇÃO" in the tooltip.
- [ ] Annotations support both point (`x`) and range (`xRange`) forms.
- [ ] All new visual elements read colors from CSS vars.
- [ ] At least one example landed on PibPage and one on CagedPage to demonstrate.
- [ ] Works in all 5 themes.
