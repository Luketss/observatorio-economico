# 15 — Annotation overlay layer (optional, declarative)

**Phase:** 4 (Polish &amp; system) · **Effort:** M · **Impact:** Medium

## Goal

Ticket 04 added an `annotations` prop to line/area charts as an **array of objects**. This ticket builds a more ergonomic declarative API on top: child components that any chart accepts.

```jsx
<AreaLineChart data={pibData} yCaption="R$ MILHÕES">
  <Annotation x="2020" kind="negative">COVID</Annotation>
  <Annotation x="2023" kind="positive">novo pico</Annotation>
  <AnnotationBand xRange={["2020", "2021"]} kind="negative" />
  <Benchmark value={600_000_000} label="média estadual" />
</AreaLineChart>
```

Optional ticket — ship only if ticket 04's array API turns out to be cumbersome to use in practice.

## Files

- **Edit:** `src/components/nid/charts.jsx`
- **Or create:** `src/components/nid/Annotation.jsx`

## Implementation pattern

Each `Annotation*` component is a **shadow component** — it doesn't render anything itself. It just exists to be `React.Children.map`'d by the parent chart, which reads its props and renders the actual SVG element inside its own viewBox.

```jsx
export function Annotation(props) { return null; }
export function AnnotationBand(props) { return null; }
export function Benchmark(props) { return null; }

// Inside AreaLineChart:
function partitionChildren(children) {
  const annotations = [], bands = [], benchmarks = [];
  React.Children.forEach(children, (child) => {
    if (!React.isValidElement(child)) return;
    if (child.type === Annotation)      annotations.push(child.props);
    else if (child.type === AnnotationBand) bands.push(child.props);
    else if (child.type === Benchmark)  benchmarks.push(child.props);
  });
  return { annotations, bands, benchmarks };
}

function AreaLineChart({ data, children, /* …other props as array form (ticket 04)… */ }) {
  const { annotations, bands, benchmarks } = partitionChildren(children);
  // Merge with array-form props if both used
  const allAnnotations = [...annotations, ...(arrayAnnotations || [])];
  // …render same as ticket 04, reading from allAnnotations/bands/benchmarks…
}
```

### Why this pattern

- JSX-style composition reads naturally for designers / PMs editing the page directly.
- The chart still owns all the math (`sx`, `sy`); the children are pure declarations.
- Backward-compatible with ticket 04's array form — both can coexist.

## Acceptance criteria

- [ ] `Annotation`, `AnnotationBand`, `Benchmark` components shipped from `src/components/nid/`.
- [ ] Both child-form and array-form APIs work; results merge.
- [ ] Each chart that supports annotations (`AreaLineChart`, `MultiLineChart`, `StackedBarChart`, `TwinBarChart`) accepts both.
- [ ] At least one page (e.g. `PibPage`) migrated to the child-form syntax as a demo.
- [ ] Works in all 5 themes.
