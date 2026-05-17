# 09 — ChartState component: empty + loading

**Phase:** 4 (Polish &amp; system) · **Effort:** S · **Impact:** Medium

## Goal

Replace `"Sem dados disponíveis"` text and generic `animate-pulse` rectangles with shape-matched chart states that:

- **Loading** — a skeleton in the shape of the chart that's about to render. No layout shift when data arrives.
- **Empty** — a designed message that says **why** there's no data and offers a next action (e.g. "configurar alerta", "explorar série de outro ano").

## Files

- **Create:** `src/components/nid/ChartState.jsx`
- **Edit:** `src/components/nid/charts.jsx` (use `ChartState` inside the existing `EmptyChart` fallback)
- **Edit:** consumer pages — replace ad-hoc loading skeletons with `<ChartState kind="loading" shape="…" />`

## Target API

```jsx
<ChartState
  kind="loading"               // "loading" | "empty"
  shape="line"                  // "line" | "bar" | "stacked" | "twin" | "hbar" | "donut" | "kpi"
  height={240}
  message="Aguardando dados"   // for empty state
  detail="O ingestor processa o CAGED na primeira quinta-feira do mês. Próxima atualização: 6/jun."
  action={{ label: "Configurar alerta de atualização", onClick: () => …, href: "/alertas" }}
/>
```

Both kinds accept the same `shape` so the skeleton (loading) and the dashed-stripe frame (empty) keep the chart's footprint.

## Implementation

```jsx
// src/components/nid/ChartState.jsx
export default function ChartState({
  kind = "empty", shape = "line", height = 240,
  message, detail, action, eyebrow,
}) {
  const Frame = ({ children }) => (
    <div
      className={`nid-chart-state ${kind}`}
      style={{ height, position: "relative" }}
    >
      {children}
    </div>
  );

  if (kind === "loading") {
    return <Frame><Skeleton shape={shape} height={height} /></Frame>;
  }

  return (
    <Frame>
      <div className="nid-empty-content">
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h4>{message || "Sem dados disponíveis"}</h4>
        {detail && <p>{detail}</p>}
        {action && (
          action.href
            ? <a href={action.href} className="btn">{action.label}</a>
            : <button onClick={action.onClick} className="btn">{action.label}</button>
        )}
      </div>
    </Frame>
  );
}

function Skeleton({ shape, height }) {
  switch (shape) {
    case "line":
      return (
        <>
          <div className="skel" style={{ height, borderRadius: 8 }} />
          <svg viewBox="0 0 200 80" preserveAspectRatio="none"
            style={{ position: "absolute", inset: "20px 16px", opacity: 0.35 }}>
            <path d="M2 60 L40 50 L80 55 L120 35 L160 40 L196 20"
              stroke="var(--text-dim)" strokeWidth="2" fill="none" />
          </svg>
        </>
      );
    case "bar":
    case "stacked":
      return (
        <div style={{ display: "flex", alignItems: "flex-end", gap: 12, height, padding: 16 }}>
          {[0.6, 0.8, 0.5, 0.9, 0.7, 1.0].map((h, i) => (
            <div key={i} className="skel"
              style={{ flex: 1, height: `${h * 100}%`, borderRadius: 4 }} />
          ))}
        </div>
      );
    case "twin":
      return (
        <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height, padding: 16 }}>
          {Array.from({ length: 24 }).map((_, i) => (
            <div key={i} className="skel"
              style={{ flex: 1, height: `${30 + Math.abs(Math.sin(i)) * 60}%`, borderRadius: 3 }} />
          ))}
        </div>
      );
    case "hbar":
      return (
        <div style={{ padding: 16 }}>
          {[1.0, 0.78, 0.62, 0.48, 0.34].map((w, i) => (
            <div key={i} className="skel"
              style={{ width: `${w * 100}%`, height: 22, marginTop: 8, borderRadius: 5 }} />
          ))}
        </div>
      );
    case "donut":
      return (
        <div style={{ display: "grid", placeItems: "center", height }}>
          <div className="skel" style={{ width: 160, height: 160, borderRadius: "50%" }} />
        </div>
      );
    case "kpi":
      return (
        <div style={{ padding: 4 }}>
          <div className="skel" style={{ height: 10, width: "60%" }} />
          <div className="skel" style={{ height: 28, width: "50%", marginTop: 14 }} />
          <div className="skel" style={{ height: 10, width: "38%", marginTop: 10 }} />
          <div className="skel" style={{ height: 42, width: "calc(100% + 36px)", margin: "14px -18px -16px", borderRadius: 0 }} />
        </div>
      );
    default:
      return <div className="skel" style={{ height, borderRadius: 8 }} />;
  }
}
```

## CSS

```css
.nid-chart-state {
  display: flex; align-items: center; justify-content: center;
  width: 100%;
}
.nid-chart-state.empty {
  border: 1px dashed var(--border-strong);
  border-radius: 12px;
  background: repeating-linear-gradient(135deg,
    transparent 0 10px,
    rgba(120,145,255,0.03) 10px 20px);
}
.nid-empty-content {
  display: flex; flex-direction: column; align-items: center; gap: 8px;
  text-align: center; padding: 24px;
}
.nid-empty-content .eyebrow {
  font: 600 10px/1 var(--font-mono);
  letter-spacing: 0.16em; text-transform: uppercase;
  color: var(--text-mute);
}
.nid-empty-content h4 {
  margin: 2px 0 0;
  font: 600 14px/1.3 var(--font-display);
  color: var(--text-dim);
}
.nid-empty-content p {
  margin: 0; max-width: 340px;
  font: 400 12px/1.45 var(--font-display);
  color: var(--text-mute);
}
.nid-empty-content .btn {
  margin-top: 6px;
  font: 600 11px/1 var(--font-mono);
  letter-spacing: 0.06em; text-transform: uppercase;
  color: var(--accent-1);
  background: color-mix(in oklab, var(--accent-1) 10%, transparent);
  border: 1px solid color-mix(in oklab, var(--accent-1) 35%, transparent);
  padding: 8px 14px; border-radius: 7px;
  text-decoration: none; cursor: pointer;
  transition: 0.15s;
}
.nid-empty-content .btn:hover {
  background: color-mix(in oklab, var(--accent-1) 18%, transparent);
}

.skel {
  background: linear-gradient(90deg,
    var(--panel-2) 0%,
    rgba(120,145,255,0.06) 50%,
    var(--panel-2) 100%);
  background-size: 200% 100%;
  animation: shimmer 1.8s linear infinite;
  border-radius: 6px;
}
@keyframes shimmer { to { background-position: -200% 0; } }
```

## Wire into existing chart components

In `charts.jsx`, every chart that currently has:

```jsx
if (!data || data.length === 0) return <EmptyChart h={height} />;
```

Replace with a more informative state — but only after pages start passing a `state` prop:

```jsx
// New optional API on each chart
function AreaLineChart({ data, height, loading, emptyMessage, emptyAction, ... }) {
  if (loading) return <ChartState kind="loading" shape="line" height={height} />;
  if (!data || data.length === 0) {
    return (
      <ChartState
        kind="empty" shape="line" height={height}
        message={emptyMessage}
        action={emptyAction}
      />
    );
  }
  // …existing render…
}
```

The internal `EmptyChart` function stays as a fallback for the "no message passed" case.

## Page-level — replace loading skeletons

Find call sites like (`PibPage.jsx`):

```jsx
{loading ? (
  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
    {[...Array(3)].map((_, i) => (
      <div key={i} className="bg-white dark:bg-slate-900 p-6 rounded-2xl border … animate-pulse h-28" />
    ))}
  </div>
) : (…)}
```

Replace with shape-matched skeletons:

```jsx
{loading ? (
  <div className="nid-kpis">
    {[...Array(3)].map((_, i) => (
      <div className="nid-kpi" key={i}>
        <ChartState kind="loading" shape="kpi" height={120} />
      </div>
    ))}
  </div>
) : (…)}
```

Similarly for chart panels, pass `loading={loading}` directly to the chart component.

## Acceptance criteria

- [ ] New `ChartState` component shipped under `src/components/nid/`.
- [ ] All 7 shape skeletons supported.
- [ ] Empty state shows eyebrow + heading + detail + optional action (button or anchor).
- [ ] All chart components accept `loading` and (optionally) `emptyMessage` / `emptyAction` props and delegate to `ChartState` when appropriate.
- [ ] At least 3 pages (PibPage, CagedPage, ArrecadacaoPage) updated to use shape-matched loading skeletons.
- [ ] Works in all 5 themes.
