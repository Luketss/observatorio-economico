# 06 — MultiLineChart focus + context

**Phase:** 3 (Comparison &amp; ranking) · **Effort:** M · **Impact:** High

## Goal

When comparing one município against peers, the user has a single line they care about. Today every city gets its own color from a 6-color palette (`COMP_COLORS`) and the legend becomes a chore. Switch to a **focus + context** pattern:

- The focused município → saturated accent (default `--accent-2`).
- Peer municípios → desaturated grey, all the same color.
- A **peer median** line drawn dashed, in `--text-dim`.
- On hover, the hovered peer line momentarily lifts to `--accent-1`.

Old behavior (per-series colors) is kept under the existing API — opt-in via the absence of `focusSeries`.

## Files

- **Edit:** `src/components/nid/charts.jsx` — `MultiLineChart`
- **Edit:** `src/pages/comparativo/ComparativoPage.jsx`
- **Edit:** `src/pages/pib/PibPage.jsx` (comparativo block)

## Target API

```jsx
<MultiLineChart
  data={data}                            // [{ label, [cityName]: value, … }]
  series={cidades}                       // ["Belo Horizonte", "Uberlândia", …]
  focusSeries="Uberlândia"               // NEW — when set, switches to focus+context mode
  focusColor="var(--accent-2)"           // NEW — defaults to --accent-2
  showMedian                             // NEW — render peer median as dashed line
  showBand                               // NEW — render peer min/max band
/>
```

Old call sites that don't pass `focusSeries` keep the per-series-color behavior.

## Implementation

Inside `MultiLineChart`:

```jsx
const focusMode = !!focusSeries;
const focusIdx = focusMode ? series.indexOf(focusSeries) : -1;

// Per-series color resolver
const colorFor = (si) => {
  if (!focusMode) return colors[si];
  if (si === focusIdx) return focusColor || "var(--accent-2)";
  return "rgba(120,145,255,.28)";   // grey, theme-safe
};

const strokeFor = (si, isHovered) => {
  if (!focusMode) return 2;
  if (si === focusIdx) return 2.5;
  return isHovered ? 1.8 : 1.2;
};

// Per-series hover state
const [hoverSeries, setHoverSeries] = useState(null);
```

### Median line

```js
const medianAt = (i) => {
  const peerVals = series
    .filter((s) => s !== focusSeries)
    .map((s) => data[i][s])
    .filter((v) => v != null && !isNaN(v))
    .sort((a, b) => a - b);
  if (peerVals.length === 0) return null;
  const mid = Math.floor(peerVals.length / 2);
  return peerVals.length % 2 === 0
    ? (peerVals[mid - 1] + peerVals[mid]) / 2
    : peerVals[mid];
};

const medianPts = showMedian
  ? data.map((_, i) => ({ x: sx(i), y: sy(medianAt(i) || 0) }))
  : [];
```

```jsx
{showMedian && (
  <>
    <path d={smoothPath(medianPts)}
      stroke="var(--text-dim)" strokeWidth="1.4"
      strokeDasharray="5 4" fill="none" />
    <text x={medianPts[medianPts.length - 1].x + 6}
      y={medianPts[medianPts.length - 1].y + 4}
      className="nid-axis-text" style={{ fill: "var(--text-dim)" }}>
      mediana
    </text>
  </>
)}
```

### Peer band

```jsx
{showBand && (
  <path
    d={bandPath}            // upper envelope forward + lower envelope reversed
    fill="rgba(120,145,255,.06)"
  />
)}
```

Where `bandPath` is built from peer min and max at each index:

```js
const peerMin = data.map((row, i) => Math.min(...series.filter(s=>s!==focusSeries).map(s=>row[s]||Infinity)));
const peerMax = data.map((row, i) => Math.max(...series.filter(s=>s!==focusSeries).map(s=>row[s]||-Infinity)));
const upper = peerMax.map((v, i) => `${sx(i)} ${sy(v)}`).join(" L ");
const lower = [...peerMin].reverse().map((v, i) => `${sx(data.length - 1 - i)} ${sy(v)}`).join(" L ");
const bandPath = `M ${upper} L ${lower} Z`;
```

### Per-line hover

```jsx
{series.map((s, si) => (
  <g key={s}
    onMouseEnter={() => focusMode && si !== focusIdx && setHoverSeries(si)}
    onMouseLeave={() => setHoverSeries(null)}>
    <path
      d={smoothPath(ptsBySeries[si])}
      stroke={hoverSeries === si ? "var(--accent-1)" : colorFor(si)}
      strokeWidth={strokeFor(si, hoverSeries === si)}
      fill="none"
    />
  </g>
))}
```

The focused series renders **last** so it sits on top of peers and on top of the median.

### Endpoint label for focused series

After drawing the focused path, place a label at its last point:

```jsx
{focusMode && (
  <>
    <circle cx={focusedLast.x} cy={focusedLast.y} r="5" fill={focusColor || "var(--accent-2)"} />
    <text x={focusedLast.x + 8} y={focusedLast.y + 4}
      className="nid-axis-text"
      style={{ fill: focusColor || "var(--accent-2)", fontSize: 11 }}>
      {focusSeries}
    </text>
  </>
)}
```

Reduce `padR` to ~80 when this label is on so it doesn't get clipped.

### Tooltip behavior

In focus mode, sort the rows in the tooltip with the focused series first, then peers in descending value, and dim peer rows visually:

```jsx
<div className="tip-row" style={{ fontWeight: 700 }}>
  <span className="name"><span className="swatch" style={{ background: focusColor }} /> {focusSeries}</span>
  <span>{tipFmt(focusValue)}</span>
</div>
{peers.map((p) => (
  <div className="tip-row" key={p.name} style={{ opacity: 0.7 }}>
    <span className="name">{p.name}</span>
    <span>{tipFmt(p.value)}</span>
  </div>
))}
<div className="tip-row" style={{ borderTop: "1px solid var(--border)", paddingTop: 4 }}>
  <span className="name">mediana</span>
  <span>{tipFmt(medianValue)}</span>
</div>
```

## Page-level change — wiring focusSeries

In `ComparativoPage.jsx`, the focused município is the logged-in user's own município. Read it from `AuthContext`:

```jsx
import { useAuth } from "../../context/AuthContext";
const { user } = useAuth();
const ownCity = user?.municipio?.nome;   // adapt to actual shape

<MultiLineChart
  data={data}
  series={cidades}
  focusSeries={ownCity}
  showMedian
  showBand
/>
```

In `PibPage.jsx`, do the same in the comparativo block.

## Acceptance criteria

- [ ] `focusSeries` prop added; when set, switches to focus + context rendering.
- [ ] Old behavior preserved when `focusSeries` is not passed.
- [ ] Focused line is the boldest, drawn last (on top), with endpoint dot + city label.
- [ ] Peer lines are uniformly muted grey; hover lifts a peer to `--accent-1`.
- [ ] `showMedian` renders dashed peer median with a right-side label.
- [ ] `showBand` renders a soft peer min/max band behind all lines.
- [ ] Tooltip in focus mode: focused on top (bold) → peers (dimmed) → median (separated rule).
- [ ] Wired on `ComparativoPage` and PIB comparativo block, reading own município from `AuthContext`.
- [ ] Scales visually to 10+ peer cities without legend clutter.
- [ ] Works in all 5 themes.
