import { useMemo } from "react";
import { Sparkline } from "./charts";

// ─────────────────────────────────────────────────────────
// DataTable — generic analytical series table
// Ticket 10 — sparkline column + delta + row heatmap
//
// Column descriptor shape:
//   { key, label, width?, align?, fmt?, mono?, heatmap?, kind? }
//
// kind values:
//   "delta"  — auto-computed YoY delta chip (uses __delta)
//   "spark"  — trailing 5-period sparkline    (uses __trend)
//   "code"   — compact mono pill (first 4 chars)
//   (omit)   — raw value, optionally passed through col.fmt
//
// heatmap: true on a numeric column → row background tinted by
//   sign/magnitude of that column's value (green near max,
//   pink near min, transparent mid-range).
//
// ownIndex: optional row index that gets a "você" tag.
// ─────────────────────────────────────────────────────────

export default function DataTable({ columns, data, ownIndex }) {
  const enriched = useMemo(() => {
    if (!data || data.length === 0) return [];

    // Determine which column drives delta/spark/heatmap computations.
    // Priority: explicit heatmap flag → first col with a fmt (assumed numeric).
    const valueCol =
      columns.find((c) => c.heatmap) ||
      columns.find((c) => c.fmt);
    const valueKey = valueCol?.key;

    if (!valueKey) {
      // No numeric anchor — still render, just no enrichment.
      return data.map((row) => ({
        ...row,
        __delta: null,
        __trend: [],
        __heatBg: "transparent",
      }));
    }

    const values = data.map((r) => r[valueKey]).filter((v) => v != null);
    const max = values.length ? Math.max(...values) : 0;
    const min = values.length ? Math.min(...values) : 0;

    return data.map((row, i) => {
      const cur = row[valueKey];
      const prev = data[i - 1]?.[valueKey];

      // YoY delta (prev → cur)
      const delta =
        prev != null && cur != null && prev !== 0
          ? ((cur - prev) / Math.abs(prev)) * 100
          : null;

      // Trailing 5-period slice (includes current row)
      const trend = data
        .slice(Math.max(0, i - 4), i + 1)
        .map((r) => r[valueKey]);

      // Row background heatmap
      let heatBg = "transparent";
      if (cur != null && max !== min && valueCol?.heatmap) {
        const norm = (cur - min) / (max - min); // 0 = worst, 1 = best
        if (norm > 0.85) {
          const pct = Math.round((norm - 0.85) / 0.15 * 15);
          heatBg = `color-mix(in oklab, var(--accent-5) ${pct}%, transparent)`;
        } else if (norm < 0.15) {
          const pct = Math.round((0.15 - norm) / 0.15 * 15);
          heatBg = `color-mix(in oklab, var(--accent-2) ${pct}%, transparent)`;
        }
      }

      return { ...row, __delta: delta, __trend: trend, __heatBg: heatBg };
    });
  }, [data, columns]);

  if (!data || data.length === 0) return null;

  return (
    <div className="nid-data-table-wrap">
      <table className="nid-data-table">
        <thead>
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                style={{ textAlign: c.align || "left", width: c.width }}
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {enriched.map((row, i) => (
            <tr key={i} style={{ background: row.__heatBg }}>
              {columns.map((c) => (
                <td
                  key={c.key}
                  style={{ textAlign: c.align || "left" }}
                  className={c.mono ? "mono" : ""}
                >
                  <Cell row={row} col={c} isOwn={i === ownIndex} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Cell renderer ─────────────────────────────────────────
function Cell({ row, col, isOwn }) {
  const v = row[col.key];

  // delta chip
  if (col.kind === "delta") {
    if (row.__delta == null) return <span className="muted">—</span>;
    const dir =
      row.__delta > 0 ? "up" : row.__delta < 0 ? "down" : "flat";
    const arrow = dir === "up" ? "▲" : dir === "down" ? "▼" : "—";
    return (
      <span className={`nid-delta ${dir}`}>
        {arrow} {row.__delta > 0 ? "+" : ""}
        {row.__delta.toFixed(1)}%
      </span>
    );
  }

  // trailing sparkline
  if (col.kind === "spark") {
    return row.__trend && row.__trend.length > 1 ? (
      <span className="spark-cell">
        <Sparkline
          data={row.__trend}
          height={20}
          width={col.width ? col.width - 10 : 120}
          glow={false}
        />
      </span>
    ) : (
      <span className="muted">—</span>
    );
  }

  // compact code pill
  if (col.kind === "code") {
    if (v == null || v === "") return null;
    const short = String(v).slice(0, 4).toUpperCase();
    return <span className="code-pill">{short}</span>;
  }

  // formatted numeric + optional "você" tag
  if (col.fmt) {
    const formatted = v != null ? col.fmt(v) : "—";
    return (
      <>
        {formatted}
        {isOwn && <span className="own-tag">você</span>}
      </>
    );
  }

  // plain value
  return (
    <>
      {v != null ? v : "—"}
      {isOwn && <span className="own-tag">você</span>}
    </>
  );
}
