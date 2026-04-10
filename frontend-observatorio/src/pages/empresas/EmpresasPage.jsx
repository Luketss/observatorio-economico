import { useEffect, useState } from "react";
import api from "../../services/api";
import { motion } from "framer-motion";
import InsightsPanel from "../../components/InsightsPanel";
import ReleasesPanel from "../../components/ReleasesPanel";
import InfoTooltip from "../../components/InfoTooltip";
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
  "#f97316",
  "#a855f7",
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
  const [porSituacao, setPorSituacao] = useState([]);
  const [situacaoPorPorte, setSituacaoPorPorte] = useState([]);
  const [porCnaeSecao, setPorCnaeSecao] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get("/empresas/resumo"),
      api.get("/empresas/por_porte"),
      api.get("/empresas/por_situacao"),
      api.get("/empresas/situacao_por_porte"),
      api.get("/empresas/por_cnae_secao"),
    ])
      .then(([resumoRes, porteRes, situacaoRes, situPorteRes, cnaeSecaoRes]) => {
        setResumo(resumoRes.data);
        setPorPorte(
          (porteRes.data || []).map((d) => ({ name: d.porte, value: d.total }))
        );
        setPorSituacao(situacaoRes.data || []);
        setSituacaoPorPorte(situPorteRes.data || []);
        const sorted = (cnaeSecaoRes.data || []).sort(
          (a, b) => (b.total_vinculos ?? 0) - (a.total_vinculos ?? 0)
        );
        setPorCnaeSecao(sorted.slice(0, 12));
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
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-800 dark:text-white">
            Empresas — CNPJ
          </h1>
          <InfoTooltip dataset="empresas" />
        </div>
        <p className="text-sm text-slate-400 dark:text-slate-500 mt-1">
          Perfil e composição do tecido empresarial local.
        </p>
      </div>

      <InsightsPanel dataset="empresas" />

      {/* KPI Cards */}
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

      {/* Distribuição por Porte + Situação */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pie — porte */}
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
            <div className="h-44 md:h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={porPorte}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={90}
                    label={({ name, percent }) =>
                      `${name} ${(percent * 100).toFixed(1)}%`
                    }
                    labelLine={false}
                  >
                    {porPorte.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v) => [fmtNum(v), "Empresas"]} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Situação cadastral */}
        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800">
          <h3 className="text-base font-bold mb-5 text-slate-800 dark:text-white">
            Empresas por Situação Cadastral
          </h3>
          {loading ? (
            <div className="animate-pulse h-64 bg-slate-50 dark:bg-slate-800 rounded-xl" />
          ) : porSituacao.length === 0 ? (
            <div className="h-64 flex items-center justify-center text-slate-400 dark:text-slate-500 text-sm">
              Sem dados disponíveis
            </div>
          ) : (
            <div className="h-44 md:h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={porSituacao}
                  layout="vertical"
                  margin={{ left: 10, right: 20 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11 }} stroke="#94a3b8" />
                  <YAxis
                    type="category"
                    dataKey="label"
                    tick={{ fontSize: 10 }}
                    stroke="#94a3b8"
                    width={120}
                  />
                  <Tooltip formatter={(v) => [fmtNum(v), "Empresas"]} />
                  <Bar dataKey="total" name="Empresas" radius={[0, 4, 4, 0]}>
                    {porSituacao.map((d, i) => (
                      <Cell
                        key={i}
                        fill={d.situacao === "02" ? "#10b981" : "#ef4444"}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      {/* Ativas vs Fechadas por Porte (Saldo) */}
      <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800">
        <h3 className="text-base font-bold mb-5 text-slate-800 dark:text-white">
          Ativas vs. Fechadas por Porte
        </h3>
        {loading ? (
          <div className="animate-pulse h-72 bg-slate-50 dark:bg-slate-800 rounded-xl" />
        ) : situacaoPorPorte.length === 0 ? (
          <div className="h-64 flex items-center justify-center text-slate-400 dark:text-slate-500 text-sm">
            Sem dados disponíveis
          </div>
        ) : (
          <div className="h-48 md:h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={situacaoPorPorte} margin={{ left: 10, right: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="porte" tick={{ fontSize: 11 }} stroke="#94a3b8" />
                <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" />
                <Tooltip formatter={(v) => fmtNum(v)} />
                <Legend />
                <Bar dataKey="ativas" name="Ativas" fill="#10b981" radius={[4, 4, 0, 0]} />
                <Bar dataKey="fechadas" name="Fechadas/Baixadas" fill="#ef4444" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Empresas por Setor CNAE */}
      <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800">
        <h3 className="text-base font-bold mb-5 text-slate-800 dark:text-white">
          Empresas por Setor de Atividade (CNAE — Seção)
        </h3>
        {loading ? (
          <div className="animate-pulse h-96 bg-slate-50 dark:bg-slate-800 rounded-xl" />
        ) : porCnaeSecao.length === 0 ? (
          <div className="h-64 flex items-center justify-center text-slate-400 dark:text-slate-500 text-sm">
            Sem dados disponíveis
          </div>
        ) : (
          <div className="h-96">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={porCnaeSecao}
                layout="vertical"
                margin={{ left: 20, right: 20 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11 }} stroke="#94a3b8" />
                <YAxis
                  type="category"
                  dataKey="descricao"
                  tick={{ fontSize: 9 }}
                  stroke="#94a3b8"
                  width={220}
                />
                <Tooltip formatter={(v) => [fmtNum(v), "Empresas"]} />
                <Bar dataKey="total_vinculos" name="Empresas" radius={[0, 4, 4, 0]}>
                  {porCnaeSecao.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Composição Adicional */}
      <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800">
        <h3 className="text-base font-bold mb-5 text-slate-800 dark:text-white">
          Indicadores de Composição
        </h3>
        {loading ? (
          <div className="animate-pulse h-48 bg-slate-50 dark:bg-slate-800 rounded-xl" />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12">
            <div>
              <MiniStat label="Taxa de Atividade" value={fmtPct(resumo?.total_ativas, resumo?.total_empresas)} color="text-green-600" />
              <MiniStat label="Participação MEI" value={fmtPct(resumo?.total_mei, resumo?.total_empresas)} color="text-purple-600" />
              <MiniStat label="Simples Nacional" value={fmtPct(resumo?.total_simples, resumo?.total_empresas)} color="text-orange-500" />
            </div>
            <div>
              <MiniStat label="Total Cadastradas" value={fmtNum(resumo?.total_empresas)} color="text-blue-600" />
              <MiniStat label="Empresas Ativas" value={fmtNum(resumo?.total_ativas)} color="text-green-600" />
              <MiniStat label="MEI" value={fmtNum(resumo?.total_mei)} color="text-purple-600" />
            </div>
          </div>
        )}
      </div>
      <ReleasesPanel dataset="empresas" />

    </motion.div>
  );
}
