import { useEffect, useMemo, useState } from "react";
import api from "../../services/api";
import { motion } from "framer-motion";
import InsightsPanel from "../../components/InsightsPanel";
import ReleasesPanel from "../../components/ReleasesPanel";
import InfoTooltip from "../../components/InfoTooltip";
import FilterBar from "../../components/FilterBar";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
} from "recharts";

function KpiCard({ label, value, sub, accent }) {
  return (
    <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800">
      <p className="text-xs uppercase tracking-wider text-slate-400 dark:text-slate-500 font-medium">
        {label}
      </p>
      <p className={`text-2xl font-bold mt-2 ${accent || "text-slate-800 dark:text-white"}`}>
        {value}
      </p>
      {sub && <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">{sub}</p>}
    </div>
  );
}

function ChartCard({ title, children, empty }) {
  return (
    <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800">
      <h3 className="text-base font-bold mb-5 text-slate-800 dark:text-white">{title}</h3>
      {empty ? (
        <div className="h-60 flex items-center justify-center text-slate-400 dark:text-slate-500 text-sm">
          Sem dados disponíveis
        </div>
      ) : (
        children
      )}
    </div>
  );
}

const fmtBRL = (v) =>
  v != null
    ? `R$ ${Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`
    : "—";

const fmtNum = (v) => (v != null ? Number(v).toLocaleString("pt-BR") : "—");

export default function PixPage() {
  const [rawSerie, setRawSerie] = useState([]);
  const [resumo, setResumo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ yearFrom: "", yearTo: "", monthFrom: "", monthTo: "" });

  useEffect(() => {
    Promise.all([api.get("/pix/serie"), api.get("/pix/resumo")])
      .then(([serieRes, resumoRes]) => {
        setRawSerie(serieRes.data || []);
        setResumo(resumoRes.data);
      })
      .catch((err) => console.error("Erro ao carregar PIX:", err))
      .finally(() => setLoading(false));
  }, []);

  const years = useMemo(() => {
    const set = new Set(rawSerie.map((d) => d.ano));
    return [...set].sort();
  }, [rawSerie]);

  const serie = useMemo(() => {
    const { yearFrom, yearTo, monthFrom, monthTo } = filters;
    return rawSerie
      .filter((d) => {
        if (yearFrom && d.ano < +yearFrom) return false;
        if (yearTo && d.ano > +yearTo) return false;
        if (monthFrom && d.mes < +monthFrom) return false;
        if (monthTo && d.mes > +monthTo) return false;
        return true;
      })
      .map((d) => ({
        ...d,
        periodo: `${d.ano}-${String(d.mes).padStart(2, "0")}`,
      }))
      .sort((a, b) => a.periodo.localeCompare(b.periodo));
  }, [rawSerie, filters]);

  const cards = [
    {
      label: "Volume PF (Pagamentos)",
      value: resumo ? fmtBRL(resumo.volume_total_pf) : "—",
      sub: "Total acumulado",
      accent: "text-blue-600",
    },
    {
      label: "Volume PJ (Pagamentos)",
      value: resumo ? fmtBRL(resumo.volume_total_pj) : "—",
      sub: "Total acumulado",
      accent: "text-green-600",
    },
    {
      label: "Total de Transações",
      value: resumo ? fmtNum(resumo.total_transacoes) : "—",
      sub: "PF + PJ (pagadores)",
      accent: "text-purple-600",
    },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-8"
    >
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-800 dark:text-white">
            PIX — Transações Instantâneas
          </h1>
          <InfoTooltip dataset="pix" />
        </div>
        <p className="text-sm text-slate-400 dark:text-slate-500 mt-1">
          Volumes e quantidade de transações PIX por mês (Banco Central do Brasil).
        </p>
      </div>

      <InsightsPanel dataset="pix" />

      <FilterBar years={years} showMonths value={filters} onChange={setFilters} />

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-100 dark:border-slate-800 animate-pulse h-28" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {cards.map((c) => <KpiCard key={c.label} {...c} />)}
        </div>
      )}

      {/* Volume PF vs PJ — Pagamentos */}
      <ChartCard title="Volume de Pagamentos — PF vs PJ" empty={serie.length === 0}>
        <div className="h-48 md:h-72">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={serie}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="periodo" tick={{ fontSize: 10 }} stroke="#94a3b8" interval="preserveStartEnd" />
              <YAxis
                tick={{ fontSize: 11 }}
                stroke="#94a3b8"
                tickFormatter={(v) =>
                  `R$ ${(v / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}M`
                }
              />
              <Tooltip formatter={(v) => [fmtBRL(v)]} />
              <Legend />
              <Line type="monotone" dataKey="vl_pagador_pf" name="Volume PF" stroke="#3b82f6" strokeWidth={2.5} dot={false} />
              <Line type="monotone" dataKey="vl_pagador_pj" name="Volume PJ" stroke="#10b981" strokeWidth={2.5} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </ChartCard>

      {/* Volume Recebimentos — PF vs PJ */}
      <ChartCard title="Volume de Recebimentos — PF vs PJ" empty={serie.length === 0}>
        <div className="h-44 md:h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={serie}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="periodo" tick={{ fontSize: 10 }} stroke="#94a3b8" interval="preserveStartEnd" />
              <YAxis
                tick={{ fontSize: 11 }}
                stroke="#94a3b8"
                tickFormatter={(v) =>
                  `R$ ${(v / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}M`
                }
              />
              <Tooltip formatter={(v) => [fmtBRL(v)]} />
              <Legend />
              <Line type="monotone" dataKey="vl_recebedor_pf" name="Recebimento PF" stroke="#8b5cf6" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="vl_recebedor_pj" name="Recebimento PJ" stroke="#f59e0b" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </ChartCard>

      {/* Quantidade de Transações */}
      <ChartCard title="Quantidade de Transações (Pagadores)" empty={serie.length === 0}>
        <div className="h-44 md:h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={serie} barCategoryGap="20%">
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="periodo" tick={{ fontSize: 10 }} stroke="#94a3b8" interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" tickFormatter={(v) => v.toLocaleString("pt-BR")} />
              <Tooltip formatter={(v) => [fmtNum(v)]} />
              <Legend />
              <Bar dataKey="qt_pagador_pf" name="Transações PF" fill="#3b82f6" radius={[2, 2, 0, 0]} />
              <Bar dataKey="qt_pagador_pj" name="Transações PJ" fill="#10b981" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </ChartCard>

      {/* Pessoas Únicas */}
      <ChartCard title="Pessoas Únicas Pagadoras" empty={serie.length === 0}>
        <div className="h-44 md:h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={serie}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="periodo" tick={{ fontSize: 10 }} stroke="#94a3b8" interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" tickFormatter={(v) => v.toLocaleString("pt-BR")} />
              <Tooltip formatter={(v) => [fmtNum(v)]} />
              <Legend />
              <Line type="monotone" dataKey="qt_pes_pagador_pf" name="Pessoas PF" stroke="#8b5cf6" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="qt_pes_pagador_pj" name="Pessoas PJ" stroke="#f97316" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </ChartCard>
      <ReleasesPanel dataset="pix" />

    </motion.div>
  );
}
