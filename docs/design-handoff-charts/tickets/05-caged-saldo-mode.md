# 05 — CAGED saldo mode (TwinBarChart)

**Phase:** 2 (Time-series storytelling) · **Effort:** S · **Impact:** High

## Goal

Today `TwinBarChart` shows admissões green + desligamentos pink side-by-side, and asks the eye to subtract one from the other every month. The actionable number is the **saldo** — show it directly.

Add a `mode` prop with two values: `"saldo"` (new default) and `"bruto"` (current behavior, kept for the toggle).

## Files

- **Edit:** `src/components/nid/charts.jsx` — `TwinBarChart`
- **Edit:** `src/pages/caged/CagedPage.jsx` — add tab toggle, pass `mode`

## Target API

```jsx
<TwinBarChart
  data={turnoverMes}   // [{ label, admissoes, desligamentos }]
  height={280}
  mode="saldo"          // NEW — "saldo" (default) | "bruto"
  showCumulative        // NEW — overlay YTD acumulado line (default true when saldo)
  yCaption="SALDO (PESSOAS)"
/>
```

## "Saldo" mode — visual spec

See `Charts Review.html` section 04.

- One bar per period, centered horizontally, **anchored to a 0 baseline**.
- Positive months → `var(--accent-5)` (green), above the zero line.
- Negative months → `var(--accent-2)` (pink), below the zero line.
- Zero line drawn explicitly (`stroke="var(--text-mute)" stroke-width="1" opacity=".6"`).
- Y axis: 3 ticks (`+max, 0, -max`), symmetric around zero.
- Tooltip shows: month label · admissões · desligamentos · **saldo (bold, colored by sign)**.

### Implementation outline

```jsx
function TwinBarChart({ data, mode = "saldo", showCumulative = mode === "saldo", ... }) {
  if (mode === "bruto") {
    return <TwinBarBrutoChart {...} />;  // existing implementation, extracted
  }

  // Saldo mode
  const saldos = data.map((d) => d.admissoes - d.desligamentos);
  const maxAbs = Math.max(...saldos.map(Math.abs)) * 1.15;
  const yScaleMin = -maxAbs, yScaleMax = maxAbs;
  const zeroY = padT + (yScaleMax / (yScaleMax - yScaleMin)) * innerH;
  const sy = (v) => padT + ((yScaleMax - v) / (yScaleMax - yScaleMin)) * innerH;

  // …axes (3 ticks: +max, 0, −max)…

  return (
    <svg viewBox={…}>
      {/* gridlines + zero line (zero gets emphasis) */}
      <line x1={padL} x2={w - padR} y1={zeroY} y2={zeroY}
        stroke="var(--text-mute)" strokeWidth="1" opacity="0.6" />

      {/* bars */}
      {data.map((d, i) => {
        const saldo = d.admissoes - d.desligamentos;
        const y = saldo >= 0 ? sy(saldo) : zeroY;
        const h = Math.abs(zeroY - sy(saldo));
        const fill = saldo >= 0 ? "var(--accent-5)" : "var(--accent-2)";
        return (
          <g key={i} onMouseEnter={() => setHover(i)}>
            <rect x={sx(i) - barW/2} y={y} width={barW} height={h} rx="2"
              fill={fill} opacity={hover != null && hover !== i ? 0.4 : 0.9} />
          </g>
        );
      })}

      {/* cumulative line */}
      {showCumulative && (
        <>
          <path d={cumulativePath} stroke="var(--accent-1)" strokeWidth="2" fill="none" />
          <circle cx={lastCumPt.x} cy={lastCumPt.y} r="4" fill="var(--accent-1)" />
          <text x={lastCumPt.x + 6} y={lastCumPt.y + 4}
            className="nid-axis-text" style={{ fill: "var(--accent-1)" }}>
            acumulado YTD
          </text>
        </>
      )}

      {/* X labels */}
      {…}
    </svg>
  );
}
```

### Cumulative line math

```js
let acc = 0;
const cumPts = data.map((d, i) => {
  acc += d.admissoes - d.desligamentos;
  return { x: sxCenter(i), y: sy(acc), value: acc };
});
```

Note: `sy` here is the saldo-axis scale, so the line goes higher as the year accumulates positive saldo. This is exactly what you want — the cumulative answers "are we ahead for the year".

If the cumulative range exceeds the per-period saldo range, expand `maxAbs` accordingly:

```js
const cumAbs = Math.max(...cumPts.map((p) => Math.abs(p.value)));
const maxAbs = Math.max(Math.max(...saldos.map(Math.abs)), cumAbs) * 1.15;
```

### Tooltip

The existing tooltip already shows saldo as the third row. Keep that, but **promote saldo to the headline** and demote admissões / desligamentos to grey context:

```
JUL 2024
SALDO            +195 ▲   (bold, colored)
admissões         512
desligamentos     317
```

## Page-level change — add the tab toggle

In `CagedPage.jsx`:

```jsx
const [mode, setMode] = useState("saldo");

<NidPanel
  title="Movimentação CAGED — 2024"
  sub={mode === "saldo" ? "saldo mensal · acumulado YTD" : "admissões vs. desligamentos"}
  actions={
    <div className="tabbar">
      <button className={`tab ${mode==='saldo'?'active':''}`} onClick={() => setMode("saldo")}>
        Saldo
      </button>
      <button className={`tab ${mode==='bruto'?'active':''}`} onClick={() => setMode("bruto")}>
        Bruto
      </button>
    </div>
  }
>
  <TwinBarChart data={turnoverMes} mode={mode} />
</NidPanel>
```

`NidPanel` may need an `actions` slot if it doesn't already have one — check `src/components/nid/Panel.jsx`. If absent, add it (it's a single `<div className="nid-panel-actions">` next to the title).

## Acceptance criteria

- [ ] `TwinBarChart` accepts `mode` prop with default `"saldo"`.
- [ ] In saldo mode: single bar per period, 0 baseline visible, sign encoded by color.
- [ ] In saldo mode, by default, a cumulative YTD line is drawn in `--accent-1`.
- [ ] Tooltip leads with saldo (bold, colored), demotes admissões/desligamentos.
- [ ] `mode="bruto"` reproduces today's behavior exactly (no visible regression).
- [ ] `CagedPage` shows a "Saldo / Bruto" tab toggle; saldo is the initial state.
- [ ] Works in all 5 themes.
