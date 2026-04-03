import { useEffect, useState } from "react";
import api from "../../services/api";
import { motion } from "framer-motion";
import InfoTooltip from "../../components/InfoTooltip";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
} from "recharts";

const METRICS = [
  { key: "arrecadacao", label: "Arrecadação", endpoint: "/comparativo/arrecadacao", valueKey: "total" },
  { key: "caged", label: "CAGED (Saldo)", endpoint: "/comparativo/caged", valueKey: "saldo_total" },
  { key: "rais", label: "RAIS (Vínculos)", endpoint: "/comparativo/rais", valueKey: "total_vinculos" },
];

const COLORS = [
  "#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#ef4444",
  "#06b6d4", "#84cc16", "#f97316", "#ec4899", "#6366f1",
];

const currentYear = new Date().getFullYear();
const YEARS = Array.from({ length: 8 }, (_, i) => currentYear - i);

const fmtBRL = (v) =>
  `R$ ${Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`;
const fmtNum = (v) => Number(v).toLocaleString("pt-BR");

export default function ComparativoPage() {
  const [metricKey, setMetricKey] = useState("arrecadacao");
  const [ano, setAno] = useState(currentYear - 1);
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const metric = METRICS.find((m) => m.key === metricKey);

  useEffect(() => {
    setLoading(true);
    setError(null);
    api
      .get(`${metric.endpoint}?ano=${ano}`)
      .then((res) => setData(res.data || []))
      .catch((err) => {
        console.error("Erro comparativo:", err);
        setError("Sem permissão ou sem dados para os filtros selecionados.");
        setData([]);
      })
      .finally(() => setLoading(false));
  }, [metricKey, ano]);

  const isCurrency = metricKey === "arrecadacao";
  const fmt = isCurrency ? fmtBRL : fmtNum;

  const chartData = [...data].sort((a, b) => b[metric.valueKey] - a[metric.valueKey]);

  const best = chartData[0];

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
            Comparativo entre Municípios
          </h1>
          <InfoTooltip dataset="comparativo" />
        </div>
        <p className="text-sm text-slate-400 dark:text-slate-500 mt-1">
          Ranking dos municípios por indicador e ano. Disponível apenas para administradores.
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4 bg-white p-5 rounded-2xl shadow-sm border border-slate-100">
        <div className="flex flex-col gap-1">
          <label className="text-xs uppercase tracking-wider text-slate-400 font-medium">
            Indicador
          </label>
          <div className="flex gap-2">
            {METRICS.map((m) => (
              <button
                key={m.key}
                onClick={() => setMetricKey(m.key)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  metricKey === m.key
                    ? "bg-blue-600 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs uppercase tracking-wider text-slate-400 font-medium">
            Ano
          </label>
          <select
            value={ano}
            onChange={(e) => setAno(Number(e.target.value))}
            className="px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {YEARS.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Summary card */}
      {best && !loading && (
        <div className="bg-blue-600 text-white p-5 rounded-2xl flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-wider opacity-70">Melhor desempenho — {ano}</p>
            <p className="text-xl font-bold mt-1">{best.municipio}</p>
          </div>
          <p className="text-2xl font-extrabold">{fmt(best[metric.valueKey])}</p>
        </div>
      )}

      {/* Chart */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
        <h3 className="text-base font-bold mb-5 text-slate-800">
          {metric.label} por Município — {ano}
        </h3>

        {loading ? (
          <div className="h-72 flex items-center justify-center">
            <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : error ? (
          <div className="h-72 flex items-center justify-center text-slate-400 text-sm">
            {error}
          </div>
        ) : chartData.length === 0 ? (
          <div className="h-72 flex items-center justify-center text-slate-400 text-sm">
            Sem dados para {ano}
          </div>
        ) : (
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} layout="vertical" barCategoryGap="25%">
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                <XAxis
                  type="number"
                  tick={{ fontSize: 11 }}
                  stroke="#94a3b8"
                  tickFormatter={(v) =>
                    isCurrency ? `${(v / 1_000_000).toFixed(0)}M` : v.toLocaleString("pt-BR")
                  }
                />
                <YAxis
                  type="category"
                  dataKey="municipio"
                  width={130}
                  tick={{ fontSize: 11 }}
                  stroke="#94a3b8"
                />
                <Tooltip
                  formatter={(v) => [fmt(v), metric.label]}
                  cursor={{ fill: "#f8fafc" }}
                />
                <Bar dataKey={metric.valueKey} radius={[0, 4, 4, 0]}>
                  {chartData.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Table */}
      {chartData.length > 0 && !loading && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100">
            <h3 className="text-base font-bold text-slate-800">Ranking Completo</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-left text-xs uppercase text-slate-400 tracking-wider">
                  <th className="px-6 py-3">#</th>
                  <th className="px-6 py-3">Município</th>
                  <th className="px-6 py-3 text-right">{metric.label}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {chartData.map((item, i) => (
                  <tr key={i} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-3 text-slate-400 font-medium">{i + 1}</td>
                    <td className="px-6 py-3 font-medium text-slate-700">{item.municipio}</td>
                    <td className="px-6 py-3 text-right font-semibold text-slate-800">
                      {fmt(item[metric.valueKey])}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </motion.div>
  );
}
