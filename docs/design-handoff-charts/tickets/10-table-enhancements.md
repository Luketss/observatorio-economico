# 10 — Table enhancements: sparkline column + delta + row heatmap

**Phase:** 4 (Polish &amp; system) · **Effort:** S · **Impact:** Medium

## Goal

Every page ends with a "Série Anual" / "Série Mensal" table that's the same shape: year/period | value | type. Upgrade them with:

1. **YoY delta column** — inline `.nid-delta` chip.
2. **Trailing sparkline column** — last 5 periods of the value.
3. **Row background heatmap** — softly tint best year green, worst year pink, with `color-mix(... <accent> N%, transparent)`.
4. Demote "Tipo" to a tiny mono code on the right (`EST` / `DEF` / `PREL`).

## Files

- **Create:** `src/components/nid/DataTable.jsx`
- **Edit:** consumer pages (`PibPage`, `ArrecadacaoPage`, `EstbanPage`, …) — swap raw `<table>` for `<DataTable>`.

## Target API

```jsx
<DataTable
  columns={[
    { key: "ano",       label: "Ano",       width: 80 },
    { key: "pib_total", label: "PIB",       align: "right", fmt: fmtMoneyShort, mono: true,
      heatmap: true },   // NEW — tints row background by sign of YoY delta
    { key: "delta",     label: "YoY",       align: "right", kind: "delta" },  // NEW
    { key: "trend",     label: "Tendência 5a", kind: "spark", width: 130 },   // NEW
    { key: "tipo_dado", label: "Tipo",      align: "right", kind: "code", mono: true },
  ]}
  data={serie}
  ownIndex={ownRowIndex}   // optional — adds a "you" tag to that row
/>
```

The `delta` and `trend` columns are **computed** at render time from the value column — they don't require precomputed fields.

## Implementation

```jsx
// src/components/nid/DataTable.jsx
import { Sparkline } from "./charts";

export default function DataTable({ columns, data, ownIndex }) {
  // Precompute deltas, sparks, and heatmap intensities
  const enriched = useMemo(() => {
    const valueKey = columns.find((c) => c.heatmap)?.key
      || columns.find((c) => c.fmt)?.key;
    if (!valueKey) return data.map((row) => ({ ...row }));

    const values = data.map((r) => r[valueKey]).filter((v) => v != null);
    const max = Math.max(...values), min = Math.min(...values);

    return data.map((row, i) => {
      const prev = data[i - 1]?.[valueKey];
      const cur = row[valueKey];
      const delta = (prev != null && cur != null && prev !== 0)
        ? ((cur - prev) / prev) * 100
        : null;
      const trend = data.slice(Math.max(0, i - 4), i + 1).map((r) => r[valueKey]);
      // heatmap weight: green near max, pink near min, transparent in middle
      let heatBg = "transparent";
      if (cur != null && max !== min) {
        const norm = (cur - min) / (max - min);   // 0..1
        if (norm > 0.85)
          heatBg = `color-mix(in oklab, var(--accent-5) ${Math.round((norm - 0.85) * 100)}%, transparent)`;
        else if (norm < 0.15)
          heatBg = `color-mix(in oklab, var(--accent-2) ${Math.round((0.15 - norm) * 100)}%, transparent)`;
      }
      return { ...row, __delta: delta, __trend: trend, __heatBg: heatBg };
    });
  }, [data, columns]);

  return (
    <table className="nid-data-table">
      <thead>
        <tr>
          {columns.map((c) => (
            <th key={c.key}
              style={{ textAlign: c.align || "left", width: c.width }}>
              {c.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {enriched.map((row, i) => (
          <tr key={i} style={{ background: row.__heatBg }}>
            {columns.map((c) => (
              <td key={c.key}
                style={{ textAlign: c.align || "left" }}
                className={c.mono ? "mono" : ""}>
                <Cell row={row} col={c} isOwn={i === ownIndex} />
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Cell({ row, col, isOwn }) {
  const v = row[col.key];

  if (col.kind === "delta") {
    if (row.__delta == null) return <span className="muted">—</span>;
    const dir = row.__delta > 0 ? "up" : row.__delta < 0 ? "down" : "flat";
    const arrow = dir === "up" ? "▲" : dir === "down" ? "▼" : "—";
    return (
      <span className={`nid-delta ${dir}`}>
        {arrow} {row.__delta > 0 ? "+" : ""}{row.__delta.toFixed(1)}%
      </span>
    );
  }

  if (col.kind === "spark") {
    return row.__trend.length > 1
      ? <span className="spark-cell"><Sparkline data={row.__trend} height={20} width={120} glow={false} /></span>
      : <span className="muted">—</span>;
  }

  if (col.kind === "code") {
    if (!v) return null;
    const short = String(v).slice(0, 4).toUpperCase();
    return <span className="code-pill">{short}</span>;
  }

  if (col.fmt) {
    return (
      <>
        {col.fmt(v)}
        {isOwn && <span className="own-tag">você</span>}
      </>
    );
  }

  return <>{v}{isOwn && <span className="own-tag">você</span>}</>;
}
```

## CSS

```css
.nid-data-table {
  width: 100%;
  border-collapse: collapse;
  font-family: var(--font-display);
  font-size: 13px;
  font-feature-settings: "tnum";
}
.nid-data-table thead tr {
  background: var(--panel-2);
}
.nid-data-table th {
  padding: 10px 14px;
  text-align: left;
  font: 600 10px/1 var(--font-mono);
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: var(--text-mute);
}
.nid-data-table td {
  padding: 10px 14px;
  border-bottom: 1px solid var(--border);
  color: var(--text);
  vertical-align: middle;
}
.nid-data-table td.mono {
  font-family: var(--font-mono);
  font-weight: 500;
  font-size: 13px;
}
.nid-data-table tbody tr:last-child td { border-bottom: none; }
.nid-data-table .muted { color: var(--text-mute); }
.nid-data-table .spark-cell { display: inline-block; vertical-align: middle; }
.nid-data-table .code-pill {
  font: 500 11px/1 var(--font-mono);
  letter-spacing: 0.06em;
  color: var(--text-dim);
  padding: 3px 6px;
  border-radius: 4px;
  background: var(--panel-2);
}
.nid-data-table .own-tag {
  margin-left: 8px;
  font: 600 9px/1 var(--font-mono);
  letter-spacing: 0.1em; text-transform: uppercase;
  color: var(--accent-2);
  background: color-mix(in oklab, var(--accent-2) 15%, transparent);
  padding: 2px 5px; border-radius: 3px;
  vertical-align: 1px;
}
```

## Page-level — `PibPage` migration

Replace the bottom table block:

```jsx
import DataTable from "../../components/nid/DataTable";
import { fmtMoneyShort } from "../../components/nid/charts";

<NidPanel title="Série Anual">
  <DataTable
    columns={[
      { key: "ano",       label: "Ano" },
      { key: "pib_total", label: "PIB", align: "right", fmt: fmtMoneyShort, mono: true, heatmap: true },
      { key: "__delta",   label: "YoY", align: "right", kind: "delta" },
      { key: "__trend",   label: "Tendência 5a", kind: "spark", width: 130 },
      { key: "tipo_dado", label: "Tipo", align: "right", kind: "code", mono: true },
    ]}
    data={serie}
  />
</NidPanel>
```

Apply the same to ArrecadacaoPage, EstbanPage, RaisPage, etc.

## Acceptance criteria

- [ ] New `DataTable` component renders any series with `value`, `delta`, `spark`, `code` columns.
- [ ] Delta and trend columns auto-computed from a marked-`heatmap`/`fmt` column — no precomputed fields.
- [ ] Best/worst row backgrounds tinted via `color-mix` with `--accent-5`/`--accent-2`.
- [ ] Tipo demoted to a compact code pill.
- [ ] At least 3 pages migrated to use `DataTable`.
- [ ] `tabular-nums` applied throughout.
- [ ] Works in all 5 themes.
