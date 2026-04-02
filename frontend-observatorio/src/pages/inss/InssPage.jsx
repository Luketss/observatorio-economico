import { useEffect, useState } from "react";
import api from "../../services/api";
import { motion } from "framer-motion";
import InsightsPanel from "../../components/InsightsPanel";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  Cell,
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

const fmtBRL = (v) =>
  v != null
    ? `R$ ${Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`
    : "—";

const fmtNum = (v) => (v != null ? Number(v).toLocaleString("pt-BR") : "—");

export default function InssPage() {
  const [serie, setSerie] = useState([]);
  const [resumo, setResumo] = useState(null);
  const [topCategorias, setTopCategorias] = useState([]);
  const [evolucaoAnual, setEvolucaoAnual] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api.get("/inss/serie"), api.get("/inss/resumo")])
      .then(([serieRes, resumoRes]) => {
        const raw = serieRes.data || [];
        setSerie(raw);
        setResumo(resumoRes.data);

        // Aggregate by category for top categories bar chart
        const catMap = {};
        raw.forEach((item) => {
          if (!catMap[item.categoria]) {
            catMap[item.categoria] = { categoria: item.categoria, quantidade_beneficios: 0, valor_anual: 0 };
          }
          catMap[item.categoria].quantidade_beneficios += item.quantidade_beneficios ?? 0;
          catMap[item.categoria].valor_anual += item.valor_anual ?? 0;
        });
        const sorted = Object.values(catMap).sort(
          (a, b) => b.quantidade_beneficios - a.quantidade_beneficios
        );
        setTopCategorias(sorted.slice(0, 10));

        // Aggregate by year for annual evolution line chart
        const anoMap = {};
        raw.forEach((item) => {
          if (!anoMap[item.ano]) {
            anoMap[item.ano] = { ano: item.ano, quantidade_beneficios: 0 };
          }
          anoMap[item.ano].quantidade_beneficios += item.quantidade_beneficios ?? 0;
        });
        const evolucao = Object.values(anoMap).sort((a, b) => a.ano - b.ano);
        setEvolucaoAnual(evolucao);
      })
      .catch((err) => console.error("Erro ao carregar INSS:", err))
      .finally(() => setLoading(false));
  }, []);

  // Table data: sorted by valor_anual desc
  const tableData = [...serie]
    .sort((a, b) => (b.valor_anual ?? 0) - (a.valor_anual ?? 0))
    .slice(0, 50);

  const cards = [
    {
      label: "Total Benefícios",
      value: fmtNum(resumo?.total_beneficios),
      sub: "No período",
      accent: "text-blue-600",
    },
    {
      label: "Valor Total",
      value: fmtBRL(resumo?.valor_total),
      sub: "Pagamentos totais",
      accent: "text-green-600",
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
          INSS — Benefícios Previdenciários
        </h1>
        <p className="text-sm text-slate-400 dark:text-slate-500 mt-1">
          Quantidade e valor dos benefícios pagos pelo INSS.
        </p>
      </div>

      <InsightsPanel dataset="inss" />

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {[...Array(2)].map((_, i) => (
            <div
              key={i}
              className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-100 dark:border-slate-800 animate-pulse h-28"
            />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {cards.map((c) => (
            <KpiCard key={c.label} {...c} />
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Categorias */}
        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800">
          <h3 className="text-base font-bold mb-5 text-slate-800 dark:text-white">
            Top Categorias de Benefícios
          </h3>
          {loading ? (
            <div className="animate-pulse h-64 bg-slate-50 dark:bg-slate-800 rounded-xl" />
          ) : topCategorias.length === 0 ? (
            <div className="h-64 flex items-center justify-center text-slate-400 dark:text-slate-500 text-sm">
              Sem dados disponíveis
            </div>
          ) : (
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={topCategorias}
                  layout="vertical"
                  margin={{ left: 10, right: 20 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="#f1f5f9"
                    horizontal={false}
                  />
                  <XAxis type="number" tick={{ fontSize: 11 }} stroke="#94a3b8" />
                  <YAxis
                    type="category"
                    dataKey="categoria"
                    tick={{ fontSize: 9 }}
                    stroke="#94a3b8"
                    width={130}
                  />
                  <Tooltip
                    formatter={(v) => [
                      Number(v).toLocaleString("pt-BR"),
                      "Benefícios",
                    ]}
                  />
                  <Bar
                    dataKey="quantidade_beneficios"
                    name="Benefícios"
                    radius={[0, 4, 4, 0]}
                  >
                    {topCategorias.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Evolução Anual */}
        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800">
          <h3 className="text-base font-bold mb-5 text-slate-800 dark:text-white">
            Evolução Anual de Benefícios
          </h3>
          {loading ? (
            <div className="animate-pulse h-64 bg-slate-50 dark:bg-slate-800 rounded-xl" />
          ) : evolucaoAnual.length === 0 ? (
            <div className="h-64 flex items-center justify-center text-slate-400 dark:text-slate-500 text-sm">
              Sem dados disponíveis
            </div>
          ) : (
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={evolucaoAnual}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis
                    dataKey="ano"
                    tick={{ fontSize: 11 }}
                    stroke="#94a3b8"
                  />
                  <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" />
                  <Tooltip
                    formatter={(v) => [
                      Number(v).toLocaleString("pt-BR"),
                      "Benefícios",
                    ]}
                  />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="quantidade_beneficios"
                    name="Benefícios"
                    stroke="#3b82f6"
                    strokeWidth={2.5}
                    dot={{ r: 4 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      {/* Tabela detalhada */}
      <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800">
        <h3 className="text-base font-bold mb-5 text-slate-800 dark:text-white">
          Detalhamento por Ano e Categoria
        </h3>
        {loading ? (
          <div className="animate-pulse h-40 bg-slate-50 dark:bg-slate-800 rounded-xl" />
        ) : tableData.length === 0 ? (
          <div className="h-32 flex items-center justify-center text-slate-400 dark:text-slate-500 text-sm">
            Sem dados disponíveis
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800">
                  <th className="text-left py-3 px-4 text-xs uppercase tracking-wider text-slate-400 dark:text-slate-500 font-medium">
                    Ano
                  </th>
                  <th className="text-left py-3 px-4 text-xs uppercase tracking-wider text-slate-400 dark:text-slate-500 font-medium">
                    Categoria
                  </th>
                  <th className="text-right py-3 px-4 text-xs uppercase tracking-wider text-slate-400 dark:text-slate-500 font-medium">
                    Qtd. Benefícios
                  </th>
                  <th className="text-right py-3 px-4 text-xs uppercase tracking-wider text-slate-400 dark:text-slate-500 font-medium">
                    Valor Anual
                  </th>
                </tr>
              </thead>
              <tbody>
                {tableData.map((row, i) => (
                  <tr
                    key={i}
                    className="border-b border-slate-50 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                  >
                    <td className="py-3 px-4 text-slate-600 dark:text-slate-300">{row.ano}</td>
                    <td className="py-3 px-4 text-slate-800 dark:text-white font-medium">
                      {row.categoria}
                    </td>
                    <td className="py-3 px-4 text-right text-slate-600 dark:text-slate-300">
                      {fmtNum(row.quantidade_beneficios)}
                    </td>
                    <td className="py-3 px-4 text-right text-slate-800 dark:text-white font-medium">
                      {fmtBRL(row.valor_anual)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </motion.div>
  );
}
