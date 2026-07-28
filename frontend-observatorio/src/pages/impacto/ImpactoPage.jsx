import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import api from "../../services/api";
import { NidPanel, NidPageHeader } from "../../components/nid/Panel";
import { AreaLineChart, Annotation, fmtMoneyShort, fmtNumber } from "../../components/nid/charts";
import { useAuth } from "../../context/AuthContext";
import { useViewAs } from "../../context/ViewAsContext";
import { beforeAfter } from "../../utils/periodos";
import SelecioneMunicipio from "../../components/nid/SelecioneMunicipio";

// ─── Indicator registry ───────────────────────────────────────────────────────
// For Comex: rows carry tipo_operacao + valor_fob_usd; saldo = exp - imp grouped by period.
// We handle Comex separately (needs grouping) via the comex flag.
const INDICADORES = [
  {
    key: "arrecadacao",
    label: "Arrecadação total",
    endpoint: "/arrecadacao/serie",
    valueKey: "total",
    fmt: fmtMoneyShort,
  },
  {
    key: "caged",
    label: "Saldo de empregos (CAGED)",
    endpoint: "/caged/serie",
    valueKey: "saldo",
    fmt: fmtNumber,
  },
  {
    key: "pix",
    label: "Volume PIX",
    endpoint: "/pix/serie",
    derive: (d) => (d.vl_pagador_pf || 0) + (d.vl_pagador_pj || 0),
    fmt: fmtMoneyShort,
  },
  {
    key: "estban",
    label: "Crédito (ESTBAN)",
    endpoint: "/estban/serie",
    valueKey: "valor_operacoes_credito",
    fmt: fmtMoneyShort,
    dateFromRef: true, // use data_referencia instead of ano/mes
  },
  {
    key: "comex",
    label: "Saldo comercial (Comex)",
    endpoint: "/comex/serie",
    comex: true, // special grouping logic
    fmt: fmtMoneyShort,
  },
  {
    key: "bolsa_familia",
    label: "Beneficiários Bolsa Família",
    endpoint: "/bolsa_familia/serie",
    valueKey: "total_beneficiarios",
    fmt: fmtNumber,
  },
  {
    key: "pe_de_meia",
    label: "Estudantes Pé-de-Meia",
    endpoint: "/pe_de_meia/serie",
    valueKey: "total_estudantes",
    fmt: fmtNumber,
  },
];

// ─── Normalize raw rows to { ano, mes, value } ────────────────────────────────
function normalizeRows(rows, ind) {
  if (ind.comex) {
    // Group by {ano,mes}: accumulate export and import separately, then compute saldo
    const map = {};
    for (const d of rows) {
      const key = `${d.ano}_${d.mes}`;
      if (!map[key]) map[key] = { ano: d.ano, mes: d.mes, exp: 0, imp: 0 };
      const tipo = String(d.tipo_operacao || "").toLowerCase();
      const val = d.valor_fob_usd ?? d.valor_usd ?? 0;
      if (tipo === "exp" || tipo === "export" || tipo === "exportacao") {
        map[key].exp += val;
      } else if (tipo === "imp" || tipo === "import" || tipo === "importacao") {
        map[key].imp += val;
      }
    }
    return Object.values(map)
      .map(({ ano, mes, exp, imp }) => ({ ano, mes, value: exp - imp }))
      .filter((d) => d.ano && d.mes);
  }

  return rows
    .map((d) => {
      let ano, mes;
      if (ind.dateFromRef) {
        const dt = new Date(d.data_referencia);
        ano = dt.getUTCFullYear();
        mes = dt.getUTCMonth() + 1;
      } else {
        ano = d.ano;
        mes = d.mes;
      }
      const value = ind.derive ? ind.derive(d) : d[ind.valueKey];
      return { ano, mes, value };
    })
    .filter((d) => d.ano && d.mes);
}

// ─── Build label string matching AreaLineChart x-axis format ─────────────────
function toLabel(ano, mes) {
  return `${String(ano).slice(2)}/${String(mes).padStart(2, "0")}`;
}

// ─── ImpactoPage ──────────────────────────────────────────────────────────────
export default function ImpactoPage() {
  const { user } = useAuth();
  const { viewAsId } = useViewAs();
  const needsMunicipio = user?.role === "ADMIN_GLOBAL" && viewAsId == null;

  const [marcos, setMarcos] = useState([]);
  const [indKey, setIndKey] = useState(INDICADORES[0].key);
  const [marcoId, setMarcoId] = useState("");
  const [serie, setSerie] = useState([]);
  const [loading, setLoading] = useState(false);

  const ind = INDICADORES.find((i) => i.key === indKey);
  const marco = marcos.find((m) => String(m.id) === String(marcoId));

  // Fetch marcos once
  useEffect(() => {
    api
      .get("/marcos")
      .then((r) => setMarcos(r.data || []))
      .catch(() => setMarcos([]));
  }, []);

  // Fetch indicator série when indicator or municipality changes
  useEffect(() => {
    if (needsMunicipio) {
      setSerie([]);
      return;
    }
    const ind = INDICADORES.find((i) => i.key === indKey);
    setLoading(true);
    api
      .get(ind.endpoint)
      .then((r) => {
        const rows = normalizeRows(r.data || [], ind);
        setSerie(rows);
      })
      .catch(() => setSerie([]))
      .finally(() => setLoading(false));
  }, [indKey, needsMunicipio]);

  // Sorted chart data
  const areaData = useMemo(
    () =>
      serie
        .slice()
        .sort((a, b) => a.ano - b.ano || a.mes - b.mes)
        .map((d) => ({ label: toLabel(d.ano, d.mes), value: d.value ?? 0 })),
    [serie]
  );

  // Marco label in chart x-axis format
  const marcoLabel = useMemo(() => {
    if (!marco) return null;
    const dt = new Date(marco.data + "T00:00:00Z");
    return toLabel(dt.getUTCFullYear(), dt.getUTCMonth() + 1);
  }, [marco]);

  // Before/after analysis
  const ba = useMemo(
    () =>
      marco && serie.length
        ? beforeAfter(serie, marco.data, { valueKey: "value", janela: 12 })
        : null,
    [serie, marco]
  );

  // Delta badge helper — null-guarded
  function deltaBadge(deltaPct) {
    if (deltaPct == null) return null;
    const isPos = deltaPct >= 0;
    return (
      <span
        style={{
          display: "inline-block",
          padding: "2px 8px",
          borderRadius: 999,
          fontSize: 12,
          fontWeight: 700,
          fontFamily: "var(--font-mono)",
          background: isPos ? "rgba(16,185,129,.15)" : "rgba(239,68,68,.15)",
          color: isPos ? "var(--accent-5, #10b981)" : "var(--accent-2, #ef4444)",
        }}
      >
        {isPos ? "+" : ""}
        {deltaPct.toFixed(1)}%
      </span>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-8"
    >
      <NidPageHeader
        title="Impacto de Ações"
        sub="Compare um indicador antes e depois de um marco da gestão municipal."
      />

      {needsMunicipio ? (
        <SelecioneMunicipio />
      ) : (
        <>
          {/* ── Selectors ── */}
          <div className="flex flex-wrap gap-4 items-end">
            <div className="flex flex-col gap-1.5 min-w-[220px]">
              <label
                className="text-xs font-semibold uppercase tracking-widest"
                style={{ color: "var(--text-dim)" }}
              >
                Indicador
              </label>
              <select
                value={indKey}
                onChange={(e) => {
                  setIndKey(e.target.value);
                  setMarcoId("");
                }}
                className="rounded-xl px-3 py-2 text-sm"
                style={{
                  background: "var(--panel)",
                  border: "1px solid var(--border)",
                  color: "var(--text)",
                  cursor: "pointer",
                }}
              >
                {INDICADORES.map((i) => (
                  <option key={i.key} value={i.key}>
                    {i.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1.5 min-w-[260px]">
              <label
                className="text-xs font-semibold uppercase tracking-widest"
                style={{ color: "var(--text-dim)" }}
              >
                Marco
              </label>
              <select
                value={marcoId}
                onChange={(e) => setMarcoId(e.target.value)}
                className="rounded-xl px-3 py-2 text-sm"
                style={{
                  background: "var(--panel)",
                  border: "1px solid var(--border)",
                  color: "var(--text)",
                  cursor: "pointer",
                }}
              >
                <option value="">— Selecione um marco —</option>
                {marcos.map((m) => (
                  <option key={m.id} value={String(m.id)}>
                    {new Date(m.data + "T00:00:00Z").toLocaleDateString("pt-BR")} · {m.titulo}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* ── Chart ── */}
          <NidPanel
            title={ind.label}
            sub={
              marco
                ? `Série histórica · Marco: "${marco.titulo}"`
                : "Série histórica · selecione um marco para ver a análise"
            }
          >
            <AreaLineChart
              data={areaData}
              height={280}
              color="var(--accent-3)"
              label={ind.label}
              yFmt={ind.fmt}
              tipFmt={ind.fmt}
              loading={loading}
              emptyMessage="Sem dados para este indicador"
            >
              {marcoLabel && (
                <Annotation x={marcoLabel} kind="positive">
                  {marco.titulo}
                </Annotation>
              )}
            </AreaLineChart>
          </NidPanel>

          {/* ── Before / After cards ── */}
          {ba && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Antes */}
              <div
                className="rounded-2xl p-6"
                style={{
                  background: "var(--panel)",
                  border: "1px solid var(--border)",
                }}
              >
                <p
                  className="text-xs font-semibold uppercase tracking-widest mb-2"
                  style={{ color: "var(--text-dim)" }}
                >
                  Antes do marco
                </p>
                <p
                  className="text-xs mb-4"
                  style={{ color: "var(--text-dim)" }}
                >
                  Média dos {ba.antes.n > 0 ? ba.antes.n : "—"} meses anteriores
                </p>
                {ba.antes.n === 0 ? (
                  <p className="text-sm" style={{ color: "var(--text-dim)" }}>
                    dados insuficientes
                  </p>
                ) : (
                  <p className="text-2xl font-bold" style={{ color: "var(--text)" }}>
                    {ind.fmt(ba.antes.media)}
                  </p>
                )}
              </div>

              {/* Depois */}
              <div
                className="rounded-2xl p-6"
                style={{
                  background: "var(--panel)",
                  border: "1px solid var(--border)",
                }}
              >
                <p
                  className="text-xs font-semibold uppercase tracking-widest mb-2"
                  style={{ color: "var(--text-dim)" }}
                >
                  Depois do marco
                </p>
                <p
                  className="text-xs mb-4"
                  style={{ color: "var(--text-dim)" }}
                >
                  Média dos {ba.depois.n > 0 ? ba.depois.n : "—"} meses seguintes
                </p>
                {ba.depois.n === 0 ? (
                  <p className="text-sm" style={{ color: "var(--text-dim)" }}>
                    dados insuficientes
                  </p>
                ) : (
                  <>
                    <p className="text-2xl font-bold mb-2" style={{ color: "var(--text)" }}>
                      {ind.fmt(ba.depois.media)}
                    </p>
                    {deltaBadge(ba.deltaPct)}
                  </>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </motion.div>
  );
}
