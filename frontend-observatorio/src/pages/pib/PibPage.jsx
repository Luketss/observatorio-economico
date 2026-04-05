import { useEffect, useMemo, useState } from "react";
import api from "../../services/api";
import { motion } from "framer-motion";
import InsightsPanel from "../../components/InsightsPanel";
import ReleasesPanel from "../../components/ReleasesPanel";
import InfoTooltip from "../../components/InfoTooltip";
import FilterBar from "../../components/FilterBar";
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

function KpiCard({ label, value, sub }) {
  return (
    <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800">
      <p className="text-xs uppercase tracking-wider text-slate-400 dark:text-slate-500 font-medium">
        {label}
      </p>
      <p className="text-2xl font-bold mt-2 text-slate-800 dark:text-white">{value}</p>
      {sub && <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">{sub}</p>}
    </div>
  );
}

const fmtBRL = (v) =>
  `R$ ${Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`;

export default function PibPage() {
  const [rawSerie, setRawSerie] = useState([]);
  const [resumo, setResumo] = useState(null);
  const [comparativo, setComparativo] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ yearFrom: "", yearTo: "" });

  useEffect(() => {
    Promise.all([
      api.get("/pib/serie"),
      api.get("/pib/resumo"),
      api.get("/pib/comparativo"),
    ])
      .then(([serieRes, resumoRes, compRes]) => {
        setRawSerie(serieRes.data || []);
        setResumo(resumoRes.data);
        setComparativo(compRes.data || []);
      })
      .catch((err) => console.error("Erro ao carregar PIB:", err))
      .finally(() => setLoading(false));
  }, []);

  const years = useMemo(() => rawSerie.map((d) => d.ano).sort(), [rawSerie]);

  // VA breakdown per year (own city only — first unique city in comparativo)
  const vaData = useMemo(() => {
    if (!comparativo.length) return [];
    const cidades = [...new Set(comparativo.map((d) => d.cidade))];
    const propia = comparativo.filter((d) => d.cidade === cidades[0]);
    return propia
      .filter((d) => {
        const { yearFrom, yearTo } = filters;
        if (yearFrom && d.ano < +yearFrom) return false;
        if (yearTo && d.ano > +yearTo) return false;
        return true;
      })
      .sort((a, b) => a.ano - b.ano);
  }, [comparativo, filters]);

  // Comparativo by city — pivot to {ano, cityA, cityB, ...}
  const comparativoChart = useMemo(() => {
    const anos = [...new Set(comparativo.map((d) => d.ano))].sort();
    return anos.map((ano) => {
      const obj = { ano };
      comparativo.filter((d) => d.ano === ano).forEach((d) => {
        obj[d.cidade] = d.pib_total;
      });
      return obj;
    });
  }, [comparativo]);

  const cidades = useMemo(() => [...new Set(comparativo.map((d) => d.cidade))], [comparativo]);
  const COMP_COLORS = ["#10b981", "#3b82f6", "#f59e0b", "#8b5cf6", "#ef4444", "#06b6d4"];

  const serie = useMemo(() => {
    const { yearFrom, yearTo } = filters;
    return rawSerie.filter((d) => {
      if (yearFrom && d.ano < +yearFrom) return false;
      if (yearTo && d.ano > +yearTo) return false;
      return true;
    });
  }, [rawSerie, filters]);

  const cards = [
    {
      label: "PIB Último Ano",
      value: resumo ? fmtBRL(resumo.pib_ultimo_ano) : "—",
      sub: resumo?.ultimo_ano ? `Ano ${resumo.ultimo_ano}` : null,
    },
    {
      label: "Crescimento",
      value:
        resumo?.crescimento_percentual != null
          ? `${resumo.crescimento_percentual > 0 ? "+" : ""}${resumo.crescimento_percentual.toFixed(1)}%`
          : "—",
      sub: "Variação vs ano anterior",
    },
    {
      label: "Anos na Série",
      value: serie.length > 0 ? serie.length : "—",
      sub:
        serie.length > 0
          ? `${serie[0].ano} – ${serie[serie.length - 1].ano}`
          : null,
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
            PIB — Produto Interno Bruto
          </h1>
          <InfoTooltip dataset="pib" />
        </div>
        <p className="text-sm text-slate-400 dark:text-slate-500 mt-1">
          Série histórica do PIB municipal.
        </p>
      </div>

      <InsightsPanel dataset="pib" />
      <ReleasesPanel dataset="pib" />

      <FilterBar years={years} value={filters} onChange={setFilters} />

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-100 dark:border-slate-800 animate-pulse h-28" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {cards.map((c) => (
            <KpiCard key={c.label} {...c} />
          ))}
        </div>
      )}

      <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800">
        <h3 className="text-base font-bold mb-5 text-slate-800 dark:text-white">
          Evolução Anual do PIB
        </h3>
        {serie.length === 0 ? (
          <div className="h-64 flex items-center justify-center text-slate-400 dark:text-slate-500 text-sm">
            Sem dados disponíveis
          </div>
        ) : (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={serie} barCategoryGap="30%">
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="ano" tick={{ fontSize: 12 }} stroke="#94a3b8" />
                <YAxis
                  tick={{ fontSize: 11 }}
                  stroke="#94a3b8"
                  width={75}
                  tickFormatter={(v) =>
                    `${(v / 1_000_000).toFixed(0)}M`
                  }
                />
                <Tooltip
                  formatter={(v) => [fmtBRL(v), "PIB Total"]}
                  cursor={{ fill: "#f8fafc" }}
                />
                <Bar dataKey="pib_total" radius={[4, 4, 0, 0]}>
                  {serie.map((_, i) => (
                    <Cell
                      key={i}
                      fill={i === serie.length - 1 ? "#10b981" : "#a7f3d0"}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* VA Breakdown */}
      {vaData.length > 0 && (
        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800">
          <h3 className="text-base font-bold mb-5 text-slate-800 dark:text-white">
            Valor Adicionado por Setor
          </h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={vaData} margin={{ left: 10, right: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="ano" tick={{ fontSize: 12 }} stroke="#94a3b8" />
                <YAxis
                  tick={{ fontSize: 11 }}
                  stroke="#94a3b8"
                  width={75}
                  tickFormatter={(v) => `${(v / 1_000_000).toFixed(0)}M`}
                />
                <Tooltip formatter={(v) => [fmtBRL(v)]} />
                <Legend />
                <Bar dataKey="va_agropecuaria" name="Agropecuária" stackId="va" fill="#10b981" />
                <Bar dataKey="va_industria" name="Indústria" stackId="va" fill="#3b82f6" />
                <Bar dataKey="va_servicos" name="Serviços" stackId="va" fill="#f59e0b" />
                <Bar dataKey="va_governo" name="Governo" stackId="va" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Comparativo entre cidades */}
      {comparativoChart.length > 0 && cidades.length > 1 && (
        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800">
          <h3 className="text-base font-bold mb-5 text-slate-800 dark:text-white">
            PIB Comparativo — Municípios
          </h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={comparativoChart}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="ano" tick={{ fontSize: 12 }} stroke="#94a3b8" />
                <YAxis
                  tick={{ fontSize: 11 }}
                  stroke="#94a3b8"
                  width={75}
                  tickFormatter={(v) => `${(v / 1_000_000).toFixed(0)}M`}
                />
                <Tooltip formatter={(v) => [fmtBRL(v)]} />
                <Legend />
                {cidades.map((cidade, i) => (
                  <Line
                    key={cidade}
                    type="monotone"
                    dataKey={cidade}
                    name={cidade}
                    stroke={COMP_COLORS[i % COMP_COLORS.length]}
                    strokeWidth={2}
                    dot={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {serie.length > 0 && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800">
            <h3 className="text-base font-bold text-slate-800 dark:text-white">Série Anual</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800 text-left text-xs uppercase text-slate-400 dark:text-slate-500 tracking-wider">
                  <th className="px-6 py-3">Ano</th>
                  <th className="px-6 py-3 text-right">PIB Total</th>
                  <th className="px-6 py-3">Tipo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                {serie.slice().reverse().map((item, i) => (
                  <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                    <td className="px-6 py-3 font-medium text-slate-700 dark:text-slate-200">{item.ano}</td>
                    <td className="px-6 py-3 text-right font-semibold text-slate-800 dark:text-white">
                      {fmtBRL(item.pib_total)}
                    </td>
                    <td className="px-6 py-3 text-slate-500 dark:text-slate-400">{item.tipo_dado || "—"}</td>
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
