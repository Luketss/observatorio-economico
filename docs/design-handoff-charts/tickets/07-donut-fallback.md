# 07 — DonutChart fallback to 100% horizontal bar

**Phase:** 3 (Comparison &amp; ranking) · **Effort:** S · **Impact:** Medium

## Goal

Donuts read well at 2 slices, poorly at 4+. Add an automatic fallback: when `data.length > 4` (or when `prefer="bar"` is passed), `DonutChart` switches to a labelled **100% horizontal bar** layout. Both layouts share the same data and props.

## Files

- **Edit:** `src/components/nid/charts.jsx` — `DonutChart`

## Target API

```jsx
<DonutChart
  data={[
    { label: "Comércio",   value: 842 },
    { label: "Serviços",   value: 648 },
    { label: "Construção", value: 551 },
    { label: "Indústria",  value: 421 },
    { label: "Transporte", value: 356 },
    { label: "Outros",     value: 422 },
  ]}
  baseColor="var(--accent-1)"   // NEW — single-hue fallback uses opacity scale
  prefer="auto"                  // NEW — "auto" (default) | "donut" | "bar"
  threshold={4}                  // NEW — N above which auto switches to bar (default 4)
  centerLabel="3 240"
  centerSub="empresas"
/>
```

## Implementation

```jsx
export function DonutChart({ data, baseColor, prefer = "auto", threshold = 4, ...rest }) {
  const useBar =
    prefer === "bar" ||
    (prefer === "auto" && data.length > threshold);

  return useBar
    ? <PercentBarChart data={data} baseColor={baseColor || "var(--accent-1)"} {...rest} />
    : <DonutChartCore data={data} colors={rest.colors} {...rest} />;
}
```

`DonutChartCore` is today's `DonutChart` implementation, renamed.

### `PercentBarChart`

```jsx
function PercentBarChart({ data, baseColor, centerLabel, centerSub }) {
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  const sorted = [...data].sort((a, b) => b.value - a.value);
  const opacityScale = [0.95, 0.7, 0.5, 0.35, 0.25, 0.18];

  return (
    <div className="nid-pct-wrap">
      {/* Total label */}
      {(centerLabel || centerSub) && (
        <div className="nid-pct-total">
          <span className="big">{centerLabel}</span>
          {centerSub && <span className="small"> {centerSub}</span>}
        </div>
      )}

      {/* The single horizontal bar */}
      <div className="nid-pct-bar" role="img" aria-label="composição percentual">
        {sorted.map((d, i) => {
          const pct = (d.value / total) * 100;
          return (
            <div key={d.label}
              className="nid-pct-seg"
              style={{
                flex: pct,
                background: baseColor,
                opacity: opacityScale[i] ?? 0.12,
              }}
              title={`${d.label}: ${d.value.toLocaleString("pt-BR")} · ${pct.toFixed(1)}%`}
            >
              {/* Inline label, only if segment is wide enough */}
              {pct > 12 && (
                <span className="nid-pct-seg-label">
                  {pct.toFixed(0)}%
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Legend rows below — labels + absolute + percent */}
      <ul className="nid-pct-legend">
        {sorted.map((d, i) => (
          <li key={d.label}>
            <span className="sw" style={{ background: baseColor, opacity: opacityScale[i] ?? 0.12 }} />
            <span className="label">{d.label}</span>
            <span className="val">
              {d.value.toLocaleString("pt-BR")} · {((d.value / total) * 100).toFixed(1)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

### CSS (add to `themes.css` or `global.css`)

```css
.nid-pct-wrap { width: 100%; }
.nid-pct-total {
  display: flex; align-items: baseline; gap: 8px;
  font-family: var(--font-display);
  color: var(--text);
  margin-bottom: 12px;
}
.nid-pct-total .big { font-size: 22px; font-weight: 700; letter-spacing: -0.02em; }
.nid-pct-total .small {
  font-family: var(--font-mono); font-size: 11px;
  text-transform: uppercase; letter-spacing: 0.1em;
  color: var(--text-mute);
}
.nid-pct-bar {
  display: flex; height: 38px; border-radius: 8px; overflow: hidden;
  border: 1px solid var(--border);
}
.nid-pct-seg {
  display: flex; align-items: center; padding: 0 8px;
  font-family: var(--font-mono); font-size: 11px; font-weight: 600;
  color: rgba(0,0,0,0.85); transition: opacity 0.15s;
}
.nid-pct-seg:hover { opacity: 1 !important; }
.nid-pct-legend {
  list-style: none; padding: 0; margin: 14px 0 0;
  display: grid; gap: 8px;
}
.nid-pct-legend li {
  display: grid; grid-template-columns: 14px 1fr auto; gap: 10px;
  align-items: center;
  font-family: var(--font-mono); font-size: 12px;
  color: var(--text-dim);
}
.nid-pct-legend .sw { width: 10px; height: 10px; border-radius: 3px; }
.nid-pct-legend .label { color: var(--text); }
.nid-pct-legend .val { color: var(--text-dim); }
```

### Theming note

The text-on-segment color is currently `rgba(0,0,0,0.85)`. Under the light theme this is fine. Under dark themes the bright cyan segment is bright enough that black-on-cyan reads well. If a segment opacity drops below 0.4, the text gets unreadable — only render the inline `{pct}%` label when both:

```js
pct > 12 && opacityScale[i] >= 0.4
```

## Acceptance criteria

- [ ] `DonutChart` accepts `prefer`, `threshold`, `baseColor`. Existing call sites with ≤ 4 slices render unchanged.
- [ ] With > 4 slices and `prefer="auto"`, renders the 100% horizontal bar layout.
- [ ] Bar has inline percent labels on wide segments only.
- [ ] Legend rows below show label · absolute · percent in `tabular-nums`.
- [ ] `prefer="bar"` forces the bar even for 2-slice data. `prefer="donut"` forces the donut even for 10-slice data.
- [ ] Works in all 5 themes.
