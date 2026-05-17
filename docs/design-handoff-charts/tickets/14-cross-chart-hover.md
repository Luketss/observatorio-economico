# 14 — Cross-chart hover sync (optional)

**Phase:** 4 (Polish &amp; system) · **Effort:** M · **Impact:** Low (but delightful)

## Goal

When two time-series charts share the same X axis (e.g. PIB and Arrecadação on `DashboardGeralPage`), hovering one should highlight the corresponding period on the other. Subtle but powerful for narrative pages where the user's reading a story across panels.

This is an **optional** ticket — ship only if the other phase-4 work has landed and there's bandwidth for polish.

## Files

- **Create:** `src/components/nid/ChartHoverContext.jsx`
- **Edit:** `src/components/nid/charts.jsx` — opt in via a `syncGroup` prop
- **Edit:** consumer pages that want sync — wrap related panels in `<ChartHoverProvider>`

## Target API

```jsx
<ChartHoverProvider>
  <AreaLineChart data={pibData}     syncGroup="annual" />
  <AreaLineChart data={arrecData}   syncGroup="annual" />
  <TwinBarChart  data={cagedSerie}  syncGroup="annual" />
</ChartHoverProvider>
```

All charts inside the provider that share the same `syncGroup` listen to each other's hover events.

## Implementation

```jsx
// src/components/nid/ChartHoverContext.jsx
import { createContext, useContext, useState, useMemo } from "react";

const Ctx = createContext({ get: () => ({}), set: () => {} });

export function ChartHoverProvider({ children }) {
  const [state, setState] = useState({});  // { [group]: hoveredLabel }
  const api = useMemo(() => ({
    get: (group) => state[group],
    set: (group, label) => setState((s) => ({ ...s, [group]: label })),
  }), [state]);
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useChartHover(group) {
  const ctx = useContext(Ctx);
  if (!group) return [null, () => {}];
  return [ctx.get(group), (label) => ctx.set(group, label)];
}
```

### Inside chart components

In `AreaLineChart`, `MultiLineChart`, `StackedBarChart`, `TwinBarChart`:

```jsx
import { useChartHover } from "./ChartHoverContext";

function AreaLineChart({ data, syncGroup, …, }) {
  const [externalLabel, setExternalLabel] = useChartHover(syncGroup);
  const [localHover, setLocalHover] = useState(null);

  // Combine: prefer local hover, fall back to external label
  const externalIdx = externalLabel != null
    ? data.findIndex((d) => String(d.label) === String(externalLabel))
    : -1;
  const hover = localHover ?? (externalIdx >= 0 ? externalIdx : null);

  // When local hover changes, broadcast it
  useEffect(() => {
    if (!syncGroup) return;
    setExternalLabel(localHover != null ? data[localHover]?.label : null);
  }, [localHover]);

  // …render…
}
```

External hovers display the **crosshair + dot + tooltip** as if hovered locally, but don't fire the chart's own analytics events (if any).

### Tooltip placement when external

When `hover` comes from an external source, the tooltip can't anchor to a cursor position (there is none). Anchor it to the chart's X position for that period, at the top of the chart with a small offset.

## Acceptance criteria

- [ ] `ChartHoverProvider` + `useChartHover(group)` shipped.
- [ ] Charts accept optional `syncGroup` prop.
- [ ] Hovering one chart in a group highlights the same period on all others.
- [ ] Local hover always wins over external.
- [ ] Performance OK with 3 synced charts (no observable lag).
- [ ] Works in all 5 themes.
- [ ] If `ChartHoverProvider` is absent, charts work normally (no errors).
