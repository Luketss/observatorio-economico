import { useEffect, useState, useMemo } from "react";
import api from "../../services/api";
import { useAuth } from "../../context/AuthContext";
import { NidPanel } from "./Panel";
import { HBarChart } from "./charts";

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
  dataset,
  indicadorKey,
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
  const myName = user?.municipio?.nome ?? null;

  const display = useMemo(() => {
    if (!rows.length) return { items: [], myRank: null, chartData: [] };
    const sorted = [...rows].sort((a, b) => (b[metric] || 0) - (a[metric] || 0));
    const myRank = myId ? sorted.findIndex((r) => r.municipio_id === myId) : -1;
    let items = sorted.slice(0, limit);
    if (myRank >= limit) {
      items = [...items, sorted[myRank]];
    }
    const chartData = items.map((r) => ({ label: r.municipio, value: r[metric] || 0 }));
    return { items, myRank: myRank >= 0 ? myRank + 1 : null, total: sorted.length, chartData };
  }, [rows, metric, myId, limit]);

  return (
    <NidPanel
      title={title}
      sub={sub}
      dataset={dataset}
      indicadorKey={indicadorKey}
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
          <HBarChart
            data={display.chartData}
            highlight={myName}
            showPosition
            positionOffset={0}
            fmt={fmt}
            color={color}
          />
        </>
      )}
    </NidPanel>
  );
}
