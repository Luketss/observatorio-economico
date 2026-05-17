# 11 — Glow tokens: reserve glow for hover

**Phase:** 1 (Foundations) · **Effort:** S · **Impact:** Medium

## Goal

Currently `glow={true}` is the default on every chart and fires on lines, areas, bars, dots, and donut slices simultaneously. When everything glows, nothing does. Reserve glow for **hovered / focused** elements, mute the resting state.

## Files

- **Edit:** `src/components/nid/charts.jsx` — change default `glow` semantics
- **No CSS changes** — relies on existing `--glow-on` token in themes

## API change

Replace boolean `glow` with a three-state string:

```jsx
glow="hover"    // default — only the hovered series/dot/bar glows
glow="always"   // current behavior — everything glows always
glow={false}    // off completely (already the minimal/light theme behavior)
```

Boolean `true` should map to `"hover"` for backward compatibility; boolean `false` keeps its meaning.

### Resolution helper

```jsx
function resolveGlow(glow) {
  if (glow === true)  return "hover";    // backward compat
  if (glow === false) return "off";
  if (!glow)          return "hover";    // default
  return glow;
}
```

## Per-chart implementation

### AreaLineChart

Currently:

```jsx
{glow && <path d={path} stroke={color} strokeWidth="6" fill="none"
  opacity="0.5" filter={`url(#glow-${id})`} />}
{pts.map((p, i) => (
  <g opacity={hover === i ? 1 : 0.6}>
    {glow && <circle … filter={`url(#glow-${id})`} />}
    …
  </g>
))}
```

After:

```jsx
const glowMode = resolveGlow(glow);
const glowAlways = glowMode === "always";
const glowHover = glowMode !== "off";

// Resting glow halo: only when glowAlways
{glowAlways && (
  <path d={path} stroke={color} strokeWidth="6" fill="none"
    opacity="0.5" filter={`url(#glow-${id})`} />
)}

// Per-point glow: only on the hovered point (if glowHover)
{pts.map((p, i) => (
  <g key={i}>
    {glowHover && hover === i && (
      <circle cx={p.x} cy={p.y} r="8" fill={color}
        opacity="0.4" filter={`url(#glow-${id})`} />
    )}
    <circle cx={p.x} cy={p.y} r={hover === i ? 4.5 : 2.5}
      fill="var(--bg)" stroke={color} strokeWidth="2" />
  </g>
))}
```

### Other charts

Apply the same pattern:

- `StackedBarChart` — current `glow && isHover` is already hover-gated; just remove the per-segment-always glow if any.
- `MultiLineChart` — drop the 5px ghost path; only halo the focused series's hovered point.
- `TwinBarChart` — already mostly hover-gated; ensure resting bars have no filter.
- `DonutChart` — currently `glow && <path d={s.path} opacity="0.45" filter={…} />` for every slice. Move this into a hover handler so only the hovered slice glows.
- `Sparkline` — drop the ghost glow path entirely (since sparklines are tiny and the glow already overpowers the line).

### Glow filter strength

The current `<feGaussianBlur stdDeviation={glow ? 4 : 0} />` is *too bright* even on a single hovered element. Reduce to `stdDeviation={glow ? 2.5 : 0}` for points and `3` for bars.

## useChartTheme hook update

`src/hooks/useChartTheme.js` is currently used by the Recharts code in PibPage; after ticket 02 it may have no callers. If it survives, add a `glowDefault` helper:

```js
export function useChartTheme() {
  // …existing…
  const isLightOrMinimal =
    document.body.classList.contains("theme-light") ||
    document.body.classList.contains("theme-minimal");
  return {
    // …
    glowDefault: isLightOrMinimal ? "off" : "hover",
  };
}
```

Pages can read this and pass it down explicitly if they want to force per-theme glow behavior. For most cases the chart's own default `"hover"` is fine.

## Acceptance criteria

- [ ] `glow` prop accepts `"hover"` / `"always"` / `false`; boolean `true` maps to `"hover"`.
- [ ] Default behavior changed: resting charts no longer have ghost-glow halos behind lines and areas.
- [ ] Hover triggers a single-element halo on the hovered point, bar, or slice.
- [ ] Minimal and light themes already had `--glow-on: 0`; no visible regression there.
- [ ] Dashboard feels noticeably "calmer" with multiple panels on screen.
