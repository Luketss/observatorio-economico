import { useEffect, useMemo, useState } from "react";
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
//
// pageSize: optional. When set (> 0), the table paginates with prev/next
//   controls. Enrichment (delta/trend/heatmap) is computed over the FULL
//   dataset first, so values stay correct across page boundaries — only the
//   visible slice is rendered.
// ─────────────────────────────────────────────────────────

export default function DataTable({ columns, data, ownIndex, pageSize }) {
  const [page, setPage] = useState(0);
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

  const paginate = pageSize > 0;
  const pageCount = paginate ? Math.max(1, Math.ceil(enriched.length / pageSize)) : 1;

  // Clamp the page if the dataset shrinks (e.g. a filter change).
  useEffect(() => {
    if (page > pageCount - 1) setPage(0);
  }, [pageCount, page]);

  if (!data || data.length === 0) return null;

  const safePage = Math.min(page, pageCount - 1);
  const startIdx = paginate ? safePage * pageSize : 0;
  const visible = paginate
    ? enriched.slice(startIdx, startIdx + pageSize)
    : enriched;

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
          {visible.map((row, i) => {
            const absIdx = startIdx + i;
            return (
              <tr key={absIdx} style={{ background: row.__heatBg }}>
                {columns.map((c) => (
                  <td
                    key={c.key}
                    style={{ textAlign: c.align || "left" }}
                    className={c.mono ? "mono" : ""}
                  >
                    <Cell row={row} col={c} isOwn={absIdx === ownIndex} />
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>

      {paginate && pageCount > 1 && (
        <div className="nid-data-table-pager">
          <span className="nid-pager-info">
            {startIdx + 1}–{startIdx + visible.length} de {enriched.length}
          </span>
          <div className="nid-pager-controls">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={safePage === 0}
              aria-label="Página anterior"
            >
              ← Anterior
            </button>
            <span className="nid-pager-page">
              {safePage + 1} / {pageCount}
            </span>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
              disabled={safePage >= pageCount - 1}
              aria-label="Próxima página"
            >
              Próxima →
            </button>
          </div>
        </div>
      )}
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
