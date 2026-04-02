import { useEffect, useState } from "react";
import api from "../../services/api";
import { motion } from "framer-motion";
import InsightsPanel from "../../components/InsightsPanel";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
} from "recharts";

const COLORS = [
  "#3b82f6",
  "#10b981",
  "#f59e0b",
  "#8b5cf6",
  "#ef4444",
  "#06b6d4",
];

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

function MiniStat({ label, value, color }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-slate-50 dark:border-slate-800 last:border-0">
      <span className="text-sm text-slate-500 dark:text-slate-400">{label}</span>
      <span className={`text-sm font-bold ${color || "text-slate-800 dark:text-white"}`}>
        {value}
      </span>
    </div>
  );
}

const fmtNum = (v) => (v != null ? Number(v).toLocaleString("pt-BR") : "—");

const fmtPct = (num, total) => {
  if (!num || !total) return "—";
  return `${((num / total) * 100).toFixed(1)}%`;
};

export default function EmpresasPage() {
  const [resumo, setResumo] = useState(null);
  const [porPorte, setPorPorte] = useState([]);
  const [porCnae, setPorCnae] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get("/empresas/resumo"),
      api.get("/empresas/por_porte"),
      api.get("/empresas/por_cnae"),
    ])
      .then(([resumoRes, porteRes, cnaeRes]) => {
        setResumo(resumoRes.data);
        setPorPorte(
          (porteRes.data || []).map((d) => ({ name: d.porte, value: d.total }))
        );
        const sorted = (cnaeRes.data || []).sort(
          (a, b) => (b.total ?? 0) - (a.total ?? 0)
        );
        setPorCnae(sorted.slice(0, 15));
      })
      .catch((err) => console.error("Erro ao carregar Empresas:", err))
      .finally(() => setLoading(false));
  }, []);

  const cards = [
    {
      label: "Total Empresas",
      value: fmtNum(resumo?.total_empresas),
      sub: "Cadastradas",
      accent: "text-blue-600",
    },
    {
      label: "Empresas Ativas",
      value: fmtNum(resumo?.total_ativas),
      sub: fmtPct(resumo?.total_ativas, resumo?.total_empresas) + " do total",
      accent: "text-green-600",
    },
    {
      label: "MEI",
      value: fmtNum(resumo?.total_mei),
      sub: fmtPct(resumo?.total_mei, resumo?.total_empresas) + " do total",
      accent: "text-purple-600",
    },
    {
      label: "Simples Nacional",
      value: fmtNum(resumo?.total_simples),
      sub: fmtPct(resumo?.total_simples, resumo?.total_empresas) + " do total",
      accent: "text-orange-500",
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
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-800 dark:text-white">
          Empresas — CNPJ
        </h1>
        <p className="text-sm text-slate-400 dark:text-slate-500 mt-1">
          Perfil e composição do tecido empresarial local.
        </p>
      </div>

      <InsightsPanel dataset="empresas" />

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          {[...Array(4)].map((_, i) => (
            <div
              key={i}
              className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-100 dark:border-slate-800 animate-pulse h-28"
            />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6">
          {cards.map((c) => (
            <KpiCard key={c.label} {...c} />
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Pie chart por porte */}
        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800">
          <h3 className="text-base font-bold mb-5 text-slate-800 dark:text-white">
            Distribuição por Porte
          </h3>
          {loading ? (
            <div className="animate-pulse h-64 bg-slate-50 dark:bg-slate-800 rounded-xl" />
          ) : porPorte.length === 0 ? (
            <div className="h-64 flex items-center justify-center text-slate-400 dark:text-slate-500 text-sm">
              Sem dados disponíveis
            </div>
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={porPorte}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                  >
                    {porPorte.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(v) => [fmtNum(v), "Empresas"]}
                  />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Mini stats */}
        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800">
          <h3 className="text-base font-bold mb-5 text-slate-800 dark:text-white">
            Indicadores de Composição
          </h3>
          {loading ? (
            <div className="animate-pulse h-48 bg-slate-50 dark:bg-slate-800 rounded-xl" />
          ) : (
            <div className="space-y-1">
              <MiniStat
                label="Taxa de Atividade"
                value={fmtPct(resumo?.total_ativas, resumo?.total_empresas)}
                color="text-green-600"
              />
              <MiniStat
                label="Participação MEI"
                value={fmtPct(resumo?.total_mei, resumo?.total_empresas)}
                color="text-purple-600"
              />
              <MiniStat
                label="Simples Nacional"
                value={fmtPct(resumo?.total_simples, resumo?.total_empresas)}
                color="text-orange-500"
              />
              <MiniStat
                label="Total Cadastradas"
                value={fmtNum(resumo?.total_empresas)}
                color="text-blue-600"
              />
              <MiniStat
                label="Empresas Ativas"
                value={fmtNum(resumo?.total_ativas)}
                color="text-slate-800"
              />
              <MiniStat
                label="MEI"
                value={fmtNum(resumo?.total_mei)}
                color="text-slate-800"
              />
              <MiniStat
                label="Simples Nacional"
                value={fmtNum(resumo?.total_simples)}
                color="text-slate-800"
              />
            </div>
          )}
        </div>

        {/* Top CNAEs placeholder for larger screen */}
        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 lg:col-span-1 hidden lg:block">
          <h3 className="text-base font-bold mb-3 text-slate-800 dark:text-white">
            Nota
          </h3>
          <p className="text-sm text-slate-400 dark:text-slate-500">
            O gráfico completo de CNAEs está disponível abaixo, com os 15
            principais setores de atividade econômica.
          </p>
        </div>
      </div>

      {/* Top CNAEs */}
      <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800">
        <h3 className="text-base font-bold mb-5 text-slate-800 dark:text-white">
          Top 15 Atividades Econômicas (CNAE)
        </h3>
        {loading ? (
          <div className="animate-pulse h-96 bg-slate-50 dark:bg-slate-800 rounded-xl" />
        ) : porCnae.length === 0 ? (
          <div className="h-64 flex items-center justify-center text-slate-400 dark:text-slate-500 text-sm">
            Sem dados disponíveis
          </div>
        ) : (
          <div className="h-96">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={porCnae}
                layout="vertical"
                margin={{ left: 20, right: 20 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="#f1f5f9"
                  horizontal={false}
                />
                <XAxis type="number" tick={{ fontSize: 11 }} stroke="#94a3b8" />
                <YAxis
                  type="category"
                  dataKey="cnae_fiscal"
                  tick={{ fontSize: 9 }}
                  stroke="#94a3b8"
                  width={160}
                />
                <Tooltip
                  formatter={(v) => [fmtNum(v), "Empresas"]}
                />
                <Bar dataKey="total" name="Empresas" radius={[0, 4, 4, 0]}>
                  {porCnae.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </motion.div>
  );
}
