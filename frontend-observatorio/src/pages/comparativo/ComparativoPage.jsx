import { useEffect, useState, useMemo } from "react";
import api from "../../services/api";
import { useAuth } from "../../context/AuthContext";
import { motion } from "framer-motion";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
} from "recharts";

const fmtBRL = (v) =>
  v != null
    ? `R$ ${Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`
    : "—";

const fmtNum = (v) =>
  v != null ? Number(v).toLocaleString("pt-BR") : "—";

const DATASETS = [
  { key: "arrecadacao", label: "Arrecadação", endpoint: "/comparativo/arrecadacao", metrica: "total", fmt: fmtBRL, hasAno: true },
  { key: "pib", label: "PIB", endpoint: "/pib/ranking", metrica: "pib_total", fmt: fmtBRL, hasAno: true },
  { key: "caged", label: "CAGED", endpoint: "/comparativo/caged", metrica: "saldo_total", fmt: fmtNum, hasAno: true },
  { key: "rais", label: "RAIS", endpoint: "/comparativo/rais", metrica: "total_vinculos", fmt: fmtNum, hasAno: true },
  { key: "estban", label: "Bancos", endpoint: "/estban/comparativo", metrica: "credito_total", fmt: fmtBRL, hasAno: true },
  { key: "comex", label: "Comex", endpoint: "/comex/comparativo", metrica: "exportacoes", fmt: fmtBRL, hasAno: true },
  { key: "empresas", label: "Empresas", endpoint: "/empresas/comparativo", metrica: "total_empresas", fmt: fmtNum, hasAno: false },
  { key: "bolsa_familia", label: "Bolsa Família", endpoint: "/bolsa_familia/comparativo", metrica: "valor_total", fmt: fmtBRL, hasAno: true },
  { key: "inss", label: "INSS", endpoint: "/inss/comparativo", metrica: "valor_total", fmt: fmtBRL, hasAno: true },
  { key: "pix", label: "PIX", endpoint: "/pix/comparativo", metrica: "volume_total", fmt: fmtBRL, hasAno: true },
  { key: "pe_de_meia", label: "Pé-de-Meia", endpoint: "/pe_de_meia/comparativo", metrica: "total_estudantes", fmt: fmtNum, hasAno: true },
];

const METRIC_LABELS = {
  arrecadacao: "Total Arrecadado",
  pib: "PIB Total",
  caged: "Saldo CAGED",
  rais: "Vínculos Empregatícios",
  estban: "Crédito Total",
  comex: "Exportações (USD)",
  empresas: "Empresas Ativas",
  bolsa_familia: "Repasses Totais",
  inss: "Valor Total INSS",
  pix: "Volume PIX",
  pe_de_meia: "Estudantes Beneficiados",
};

const CURRENT_YEAR = new Date().getFullYear();
const YEAR_OPTIONS = Array.from({ length: 8 }, (_, i) => CURRENT_YEAR - i);

export default function BenchmarkPage() {
  const { user } = useAuth();
  const [activeKey, setActiveKey] = useState("arrecadacao");
  const [ano, setAno] = useState(CURRENT_YEAR - 1);
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);

  const activeDataset = DATASETS.find((d) => d.key === activeKey);

  useEffect(() => {
    if (!activeDataset) return;
    setLoading(true);
    setData([]);
    const params = activeDataset.hasAno ? { ano } : {};
    api
      .get(activeDataset.endpoint, { params })
      .then((res) => setData(res.data || []))
      .catch(() => setData([]))
      .finally(() => setLoading(false));
  }, [activeKey, ano]);

  const chartData = useMemo(() => {
    if (!activeDataset || !data.length) return [];
    return data.map((row) => ({
      municipio: row.municipio,
      municipio_id: row.municipio_id,
      valor: row[activeDataset.metrica] ?? 0,
    }));
  }, [data, activeDataset]);

  const myId = user?.municipio_id;

  const tooltipFormatter = (v) => [activeDataset?.fmt(v), METRIC_LABELS[activeKey]];

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-8"
    >
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-800 dark:text-white">
          Benchmark Municipal
        </h1>
        <p className="text-sm text-slate-400 dark:text-slate-500 mt-1">
          Comparativo de indicadores entre municípios da plataforma.
        </p>
      </div>

      {/* Dataset tabs */}
      <div className="flex flex-wrap gap-2">
        {DATASETS.map((ds) => (
          <button
            key={ds.key}
            onClick={() => setActiveKey(ds.key)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              activeKey === ds.key
                ? "bg-blue-600 text-white shadow"
                : "bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:border-blue-400"
            }`}
          >
            {ds.label}
          </button>
        ))}
      </div>

      {/* Year selector */}
      {activeDataset?.hasAno && (
        <div className="flex items-center gap-3">
          <label className="text-sm font-medium text-slate-600 dark:text-slate-300">
            Ano:
          </label>
          <select
            value={ano}
            onChange={(e) => setAno(+e.target.value)}
            className="text-sm border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 bg-white dark:bg-slate-800 text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {YEAR_OPTIONS.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
      )}

      {/* Chart */}
      <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800">
        <h3 className="text-base font-bold mb-5 text-slate-800 dark:text-white">
          {METRIC_LABELS[activeKey]}{activeDataset?.hasAno ? ` — ${ano}` : ""}
        </h3>

        {loading ? (
          <div className="animate-pulse h-64 bg-slate-50 dark:bg-slate-800 rounded-xl" />
        ) : chartData.length === 0 ? (
          <div className="h-64 flex items-center justify-center text-slate-400 dark:text-slate-500 text-sm">
            Sem dados disponíveis
          </div>
        ) : (
          <div className="h-64 md:h-96">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={chartData}
                layout="vertical"
                margin={{ left: 8, right: 24, top: 4, bottom: 4 }}
              >
                <XAxis
                  type="number"
                  tick={{ fontSize: 10 }}
                  stroke="#94a3b8"
                  tickFormatter={(v) => {
                    if (v >= 1_000_000_000) return `${(v / 1e9).toFixed(1)}B`;
                    if (v >= 1_000_000) return `${(v / 1e6).toFixed(1)}M`;
                    if (v >= 1_000) return `${(v / 1e3).toFixed(0)}K`;
                    return v;
                  }}
                />
                <YAxis
                  type="category"
                  dataKey="municipio"
                  tick={{ fontSize: 11 }}
                  stroke="#94a3b8"
                  width={160}
                />
                <Tooltip formatter={tooltipFormatter} />
                <Bar dataKey="valor" radius={[0, 4, 4, 0]}>
                  {chartData.map((row, i) => (
                    <Cell
                      key={i}
                      fill={
                        myId && row.municipio_id === myId
                          ? "#f59e0b"
                          : "#3b82f6"
                      }
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Ranking table */}
      {!loading && chartData.length > 0 && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 dark:border-slate-800">
                <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider w-12">
                  #
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Município
                </th>
                <th className="text-right px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  {METRIC_LABELS[activeKey]}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
              {chartData.map((row, i) => (
                <tr
                  key={i}
                  className={`transition-colors ${
                    myId && row.municipio_id === myId
                      ? "bg-amber-50 dark:bg-amber-900/10"
                      : "hover:bg-slate-50 dark:hover:bg-slate-800/40"
                  }`}
                >
                  <td className="px-6 py-3 text-slate-400 font-mono text-xs">{i + 1}</td>
                  <td className="px-4 py-3 font-medium text-slate-800 dark:text-white">
                    {row.municipio}
                    {myId && row.municipio_id === myId && (
                      <span className="ml-2 text-xs text-amber-600 dark:text-amber-400 font-semibold">
                        (seu município)
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-3 text-right font-semibold text-slate-700 dark:text-slate-200">
                    {activeDataset?.fmt(row.valor)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </motion.div>
  );
}
