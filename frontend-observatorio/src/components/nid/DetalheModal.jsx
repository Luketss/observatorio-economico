import NidModal from "./NidModal";
import { AreaLineChart } from "./charts";

/**
 * DetalheModal — thin drill-down detail modal.
 *
 * Props:
 *   open    {bool}       — controls visibility
 *   onClose {fn}         — called when the modal should close
 *   titulo  {string}     — modal title
 *   serie   {Array<{label, value}>} (optional) — time series; when present renders AreaLineChart
 *   fmt     {fn}         — formatter for y-axis / tooltip / stat block (e.g. fmtMoneyShort)
 *   valor   {number}     (optional) — single value shown as a stat block when serie is absent
 */
export default function DetalheModal({ open, onClose, titulo, serie, fmt, valor }) {
  const hasSerie = Array.isArray(serie) && serie.length > 0;

  return (
    <NidModal open={open} onClose={onClose} title={titulo} size="lg">
      {hasSerie ? (
        <AreaLineChart
          data={serie}
          yFmt={fmt}
          tipFmt={fmt}
          label={titulo}
          height={280}
        />
      ) : (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "32px 16px",
            gap: 8,
          }}
        >
          <span
            style={{
              fontSize: "2.25rem",
              fontWeight: 700,
              color: "var(--text)",
              letterSpacing: "-0.02em",
            }}
          >
            {fmt && valor != null ? fmt(valor) : valor ?? "—"}
          </span>
          {titulo && (
            <span style={{ fontSize: "0.875rem", color: "var(--text-dim)" }}>
              {titulo}
            </span>
          )}
        </div>
      )}
    </NidModal>
  );
}
