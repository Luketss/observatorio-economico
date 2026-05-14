import { useEffect, useState, useMemo } from "react";
import api from "../../services/api";
import { useAuth } from "../../context/AuthContext";
import { NidPanel } from "./Panel";

/**
 * Themed ranking/comparativo panel for any dataset.
 *
 * Renders the top N municipalities by a metric, with the current user's
 * município highlighted (and forced into view if outside the top N).
 *
 * Props:
 *  - title:      panel title
 *  - sub:        panel subtitle
 *  - endpoint:   API path returning [{municipio, municipio_id, estado, <metric>}]
 *  - metric:     key in each row that holds the value (e.g. "valor_total")
 *  - fmt:        (number) => string formatter for the value
 *  - color:      bar color CSS var (default --accent-1)
 *  - limit:      top-N rows (default 10)
 *  - filterByEstado: if true, restrict to the user's estado (passed as ?estado=...)
 *  - ano:        optional year filter
 */
export default function NidComparativoPanel({
  title,
  sub,
  endpoint,
  metric,
  fmt = (v) => Number(v).toLocaleString("pt-BR"),
  color = "var(--accent-1)",
  limit = 10,
  filterByEstado = true,
  ano,
}) {
  const { user } = useAuth();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [estadoFilter, setEstadoFilter] = useState(filterByEstado);

  useEffect(() => {
    let alive = true;
    const params = {};
    if (ano) params.ano = ano;
    if (estadoFilter && user?.estado) params.estado = user.estado;
    api.get(endpoint, { params })
      .then((r) => { if (alive) setRows(r.data || []); })
      .catch(() => { if (alive) setRows([]); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [endpoint, ano, estadoFilter, user?.estado]);

  const myId = user?.municipio_id;

  const display = useMemo(() => {
    if (!rows.length) return { items: [], myRank: null, max: 0 };
    const sorted = [...rows].sort((a, b) => (b[metric] || 0) - (a[metric] || 0));
    const myRank = myId ? sorted.findIndex((r) => r.municipio_id === myId) : -1;
    let items = sorted.slice(0, limit);
    if (myRank >= limit) {
      items = [...items, sorted[myRank]];
    }
    const max = sorted[0]?.[metric] || 0;
    return { items, myRank: myRank >= 0 ? myRank + 1 : null, total: sorted.length, max };
  }, [rows, metric, myId, limit]);

  return (
    <NidPanel
      title={title}
      sub={sub}
      right={
        user?.estado && (
          <button
            onClick={() => setEstadoFilter((v) => !v)}
            className={`nid-tab ${estadoFilter ? "active" : ""}`}
            title={estadoFilter ? `Mostrando apenas ${user.estado}` : "Mostrando todos os estados"}
          >
            {user.estado || "BR"}
          </button>
        )
      }
    >
      {loading ? (
        <div style={{ height: 240, display: "grid", placeItems: "center", color: "var(--text-mute)", fontSize: 13, fontFamily: "var(--font-mono)" }}>
          Carregando…
        </div>
      ) : display.items.length === 0 ? (
        <div style={{ height: 240, display: "grid", placeItems: "center", color: "var(--text-mute)", fontSize: 13, fontFamily: "var(--font-mono)" }}>
          Sem dados disponíveis
        </div>
      ) : (
        <>
          {display.myRank && (
            <div style={{
              fontSize: 11,
              fontFamily: "var(--font-mono)",
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              color: "var(--text-dim)",
              marginBottom: 10,
            }}>
              Posição do município:{" "}
              <span style={{ color: "var(--text)", fontWeight: 700 }}>
                #{display.myRank}
              </span>
              {display.total ? <> de {display.total}</> : null}
            </div>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {display.items.map((r, i) => {
              const isMe = r.municipio_id === myId;
              const pct = display.max > 0 ? ((r[metric] || 0) / display.max) * 100 : 0;
              const rank = i < limit ? i + 1 : display.myRank;
              return (
                <div
                  key={r.municipio_id}
                  style={{
                    position: "relative",
                    display: "grid",
                    gridTemplateColumns: "32px 1fr auto",
                    alignItems: "center",
                    gap: 10,
                    padding: "8px 12px",
                    borderRadius: 9,
                    background: isMe
                      ? "color-mix(in oklab, var(--accent-1) 14%, transparent)"
                      : "var(--panel-2)",
                    border: isMe
                      ? "1px solid var(--border-strong)"
                      : "1px solid transparent",
                    overflow: "hidden",
                  }}
                >
                  {/* bar background */}
                  <div style={{
                    position: "absolute",
                    inset: 0,
                    width: `${pct}%`,
                    background: `linear-gradient(90deg, ${isMe ? "color-mix(in oklab, var(--accent-1) 22%, transparent)" : `color-mix(in oklab, ${color} 8%, transparent)`}, transparent)`,
                    pointerEvents: "none",
                  }} />
                  <span style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 11,
                    fontWeight: 700,
                    color: isMe ? "var(--accent-1)" : "var(--text-mute)",
                    textAlign: "center",
                    position: "relative",
                  }}>
                    #{rank}
                  </span>
                  <span style={{
                    fontSize: 13,
                    fontWeight: isMe ? 700 : 500,
                    color: isMe ? "var(--text)" : "var(--text-dim)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    position: "relative",
                  }}>
                    {r.municipio} <span style={{ color: "var(--text-mute)", fontSize: 11, fontFamily: "var(--font-mono)" }}>· {r.estado}</span>
                  </span>
                  <span style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 12,
                    fontWeight: 600,
                    color: "var(--text)",
                    position: "relative",
                  }}>
                    {fmt(r[metric] || 0)}
                  </span>
                </div>
              );
            })}
          </div>
        </>
      )}
    </NidPanel>
  );
}
