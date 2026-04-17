import { useEffect, useState, useMemo } from "react";
import api from "../../services/api";
import { motion } from "framer-motion";
import InsightsPanel from "../../components/InsightsPanel";
import ReleasesPanel from "../../components/ReleasesPanel";
import InfoTooltip from "../../components/InfoTooltip";
import FilterBar from "../../components/FilterBar";
import KpiCard from "../../components/KpiCard";
import PlanGate from "../../components/PlanGate";
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

const fmtUSD = (v) =>
  v != null
    ? `US$ ${Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`
    : "—";

export default function ComexPage() {
  const [serie, setSerie] = useState([]);
  const [resumo, setResumo] = useState(null);
  const [porProduto, setPorProduto] = useState([]);
  const [porPais, setPorPais] = useState([]);
  const [anoSelecionado, setAnoSelecionado] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingFilters, setLoadingFilters] = useState(false);
  const [filters, setFilters] = useState({ yearFrom: "", yearTo: "", monthFrom: "", monthTo: "" });

  // Derive available years from serie data
  const anos = useMemo(() => {
    const set = new Set(serie.map((d) => d.ano));
    return [...set].sort((a, b) => b - a);
  }, [serie]);

  // Initial load: serie + resumo
  useEffect(() => {
    Promise.all([api.get("/comex/serie"), api.get("/comex/resumo")])
      .then(([serieRes, resumoRes]) => {
        const raw = serieRes.data || [];
        setSerie(raw);
        setResumo(resumoRes.data);
        // Set default year to most recent
        const years = [...new Set(raw.map((d) => d.ano))].sort((a, b) => b - a);
        if (years.length > 0) setAnoSelecionado(String(years[0]));
      })
      .catch((err) => console.error("Erro ao carregar Comex:", err))
      .finally(() => setLoading(false));
  }, []);

  // Load products and countries when year changes
  useEffect(() => {
    if (!anoSelecionado) return;
    setLoadingFilters(true);
    Promise.all([
      api.get(`/comex/por_produto?ano=${anoSelecionado}`),
      api.get(`/comex/por_pais?ano=${anoSelecionado}`),
    ])
      .then(([prodRes, paisRes]) => {
        const sortedProd = (prodRes.data || [])
          .sort((a, b) => (b.valor_usd ?? 0) - (a.valor_usd ?? 0))
          .slice(0, 10);
        const sortedPais = (paisRes.data || [])
          .sort((a, b) => (b.valor_usd ?? 0) - (a.valor_usd ?? 0))
          .slice(0, 10);
        setPorProduto(sortedProd);
        setPorPais(sortedPais);
      })
      .catch((err) => console.error("Erro ao filtrar Comex:", err))
      .finally(() => setLoadingFilters(false));
  }, [anoSelecionado]);

  // Build time series: group by period, separate exports and imports (value + weight)
  const chartSerie = useMemo(() => {
    const { yearFrom, yearTo, monthFrom, monthTo } = filters;
    const map = {};
    serie.forEach((item) => {
      if (yearFrom && item.ano < +yearFrom) return;
      if (yearTo && item.ano > +yearTo) return;
      if (monthFrom && item.mes < +monthFrom) return;
      if (monthTo && item.mes > +monthTo) return;
      const key = `${item.ano}-${String(item.mes).padStart(2, "0")}`;
      if (!map[key]) map[key] = { periodo: key, exportacoes: 0, importacoes: 0, peso_export: 0, peso_import: 0 };
      const tipo = item.tipo_operacao?.toLowerCase();
      if (tipo === "exp" || tipo === "export") {
        map[key].exportacoes += item.valor_usd ?? 0;
        map[key].peso_export += item.peso_kg ?? 0;
      } else if (tipo === "imp" || tipo === "import") {
        map[key].importacoes += item.valor_usd ?? 0;
        map[key].peso_import += item.peso_kg ?? 0;
      }
    });
    return Object.values(map)
      .sort((a, b) => a.periodo.localeCompare(b.periodo))
      .map((d) => ({ ...d, saldo: d.exportacoes - d.importacoes }));
  }, [serie, filters]);

  const balancaPositiva = (resumo?.balanca_comercial ?? 0) >= 0;

  const cards = [
    {
      label: "Total Exportado",
      value: fmtUSD(resumo?.total_exportado_usd),
      sub: "No período",
      accent: "text-green-600",
      dataset: "comex",
      indicadorKey: "exportacoes",
    },
    {
      label: "Total Importado",
      value: fmtUSD(resumo?.total_importado_usd),
      sub: "No período",
      accent: "text-orange-500",
      dataset: "comex",
      indicadorKey: "importacoes",
    },
    {
      label: "Balança Comercial",
      value: fmtUSD(resumo?.balanca_comercial),
      sub: "Exportações − Importações",
      accent: balancaPositiva ? "text-green-600" : "text-red-600",
      dataset: "comex",
      indicadorKey: "saldo",
    },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-8"
    >
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-extrabold tracking-tight text-slate-800 dark:text-white">
              Comércio Exterior
            </h1>
            <InfoTooltip dataset="comex" />
          </div>
          <p className="text-sm text-slate-400 dark:text-slate-500 mt-1">
            Exportações, importações e balança comercial.
          </p>
        </div>
        {anos.length > 0 && (
          <div className="flex items-center gap-2">
            <label className="text-sm text-slate-500 dark:text-slate-400 font-medium">Ano:</label>
            <select
              value={anoSelecionado}
              onChange={(e) => setAnoSelecionado(e.target.value)}
              className="border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-700 dark:text-slate-100 bg-white dark:bg-slate-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {anos.map((ano) => (
                <option key={ano} value={String(ano)}>
                  {ano}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <InsightsPanel dataset="comex" />

      <FilterBar years={anos.slice().sort()} showMonths value={filters} onChange={setFilters} />

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[...Array(3)].map((_, i) => (
            <div
              key={i}
              className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-100 dark:border-slate-800 animate-pulse h-28"
            />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {cards.map((c) => (
            <KpiCard key={c.label} {...c} />
          ))}
        </div>
      )}

      {/* Exportações vs Importações ao longo do tempo */}
      <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800">
        <h3 className="text-base font-bold mb-5 text-slate-800 dark:text-white">
          Exportações vs Importações
        </h3>
        {loading ? (
          <div className="animate-pulse h-64 bg-slate-50 dark:bg-slate-800 rounded-xl" />
        ) : chartSerie.length === 0 ? (
          <div className="h-64 flex items-center justify-center text-slate-400 dark:text-slate-500 text-sm">
            Sem dados disponíveis
          </div>
        ) : (
          <div className="h-48 md:h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartSerie}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis
                  dataKey="periodo"
                  tick={{ fontSize: 10 }}
                  stroke="#94a3b8"
                  interval="preserveStartEnd"
                />
                <YAxis
                  tick={{ fontSize: 11 }}
                  stroke="#94a3b8"
                  tickFormatter={(v) =>
                    `US$ ${(v / 1_000_000).toLocaleString("pt-BR", {
                      maximumFractionDigits: 1,
                    })}M`
                  }
                />
                <Tooltip formatter={(v) => [fmtUSD(v)]} />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="exportacoes"
                  name="Exportações"
                  stroke="#10b981"
                  strokeWidth={2.5}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="importacoes"
                  name="Importações"
                  stroke="#f97316"
                  strokeWidth={2.5}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Saldo — Balança Comercial Mensal */}
      {chartSerie.length > 0 && (
        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800">
          <h3 className="text-base font-bold mb-5 text-slate-800 dark:text-white">
            Saldo da Balança Comercial (Mensal)
          </h3>
          <div className="h-60">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartSerie}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="periodo" tick={{ fontSize: 10 }} stroke="#94a3b8" interval="preserveStartEnd" />
                <YAxis
                  tick={{ fontSize: 11 }}
                  stroke="#94a3b8"
                  tickFormatter={(v) =>
                    `US$ ${(v / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}M`
                  }
                />
                <Tooltip formatter={(v) => [fmtUSD(v), "Saldo"]} />
                <Line
                  type="monotone"
                  dataKey="saldo"
                  name="Saldo"
                  stroke="#8b5cf6"
                  strokeWidth={2.5}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Peso Total por Período (kg) */}
      {chartSerie.length > 0 && (chartSerie.some(d => d.peso_export > 0 || d.peso_import > 0)) && (
        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800">
          <h3 className="text-base font-bold mb-5 text-slate-800 dark:text-white">
            Volume Físico — Peso Exportado vs Importado (kg)
          </h3>
          <div className="h-48 md:h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartSerie}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="periodo" tick={{ fontSize: 10 }} stroke="#94a3b8" interval="preserveStartEnd" />
                <YAxis
                  tick={{ fontSize: 11 }}
                  stroke="#94a3b8"
                  tickFormatter={(v) => {
                    if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M kg`;
                    if (v >= 1_000) return `${(v / 1_000).toFixed(0)}t`;
                    return `${v} kg`;
                  }}
                />
                <Tooltip formatter={(v) => [`${Number(v).toLocaleString("pt-BR")} kg`]} />
                <Legend />
                <Line type="monotone" dataKey="peso_export" name="Peso Exportado" stroke="#10b981" strokeWidth={2.5} dot={false} />
                <Line type="monotone" dataKey="peso_import" name="Peso Importado" stroke="#f97316" strokeWidth={2.5} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Produtos */}
        <PlanGate planKey="comex.por_produto">
        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800">
          <h3 className="text-base font-bold mb-1 text-slate-800 dark:text-white">
            Top 10 Produtos
          </h3>
          <p className="text-xs text-slate-400 dark:text-slate-500 mb-5">Ano: {anoSelecionado}</p>
          {loading || loadingFilters ? (
            <div className="animate-pulse h-64 bg-slate-50 dark:bg-slate-800 rounded-xl" />
          ) : porProduto.length === 0 ? (
            <div className="h-64 flex items-center justify-center text-slate-400 dark:text-slate-500 text-sm">
              Sem dados disponíveis
            </div>
          ) : (
            <div className="h-52 md:h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={porProduto}
                  layout="vertical"
                  margin={{ left: 10, right: 20 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="#f1f5f9"
                    horizontal={false}
                  />
                  <XAxis
                    type="number"
                    tick={{ fontSize: 11 }}
                    stroke="#94a3b8"
                    tickFormatter={(v) =>
                      `US$ ${(v / 1_000).toLocaleString("pt-BR", {
                        maximumFractionDigits: 0,
                      })}k`
                    }
                  />
                  <YAxis
                    type="category"
                    dataKey="produto"
                    tick={{ fontSize: 9 }}
                    stroke="#94a3b8"
                    width={130}
                  />
                  <Tooltip formatter={(v) => [fmtUSD(v), "Valor USD"]} />
                  <Bar dataKey="valor_usd" name="Valor USD" radius={[0, 4, 4, 0]}>
                    {porProduto.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Top Produtos por Peso */}
        {!loading && !loadingFilters && porProduto.length > 0 && porProduto.some(p => p.peso_kg > 0) && (
          <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800">
            <h3 className="text-base font-bold mb-1 text-slate-800 dark:text-white">Top Produtos por Peso</h3>
            <p className="text-xs text-slate-400 dark:text-slate-500 mb-5">Ano: {anoSelecionado}</p>
            <div className="h-52 md:h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={[...porProduto].sort((a, b) => (b.peso_kg ?? 0) - (a.peso_kg ?? 0)).slice(0, 10)}
                  layout="vertical"
                  margin={{ left: 10, right: 20 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                  <XAxis
                    type="number"
                    tick={{ fontSize: 11 }}
                    stroke="#94a3b8"
                    tickFormatter={(v) => v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M kg` : `${(v / 1_000).toFixed(0)}t`}
                  />
                  <YAxis type="category" dataKey="produto" tick={{ fontSize: 9 }} stroke="#94a3b8" width={130} />
                  <Tooltip formatter={(v) => [`${Number(v).toLocaleString("pt-BR")} kg`, "Peso"]} />
                  <Bar dataKey="peso_kg" name="Peso (kg)" radius={[0, 4, 4, 0]}>
                    {porProduto.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
        </PlanGate>

        {/* Top Países */}
        <PlanGate planKey="comex.por_pais">
        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800">
          <h3 className="text-base font-bold mb-1 text-slate-800 dark:text-white">
            Top 10 Países
          </h3>
          <p className="text-xs text-slate-400 dark:text-slate-500 mb-5">Ano: {anoSelecionado}</p>
          {loading || loadingFilters ? (
            <div className="animate-pulse h-64 bg-slate-50 dark:bg-slate-800 rounded-xl" />
          ) : porPais.length === 0 ? (
            <div className="h-64 flex items-center justify-center text-slate-400 dark:text-slate-500 text-sm">
              Sem dados disponíveis
            </div>
          ) : (
            <div className="h-52 md:h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={porPais}
                  layout="vertical"
                  margin={{ left: 10, right: 20 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="#f1f5f9"
                    horizontal={false}
                  />
                  <XAxis
                    type="number"
                    tick={{ fontSize: 11 }}
                    stroke="#94a3b8"
                    tickFormatter={(v) =>
                      `US$ ${(v / 1_000).toLocaleString("pt-BR", {
                        maximumFractionDigits: 0,
                      })}k`
                    }
                  />
                  <YAxis
                    type="category"
                    dataKey="pais"
                    tick={{ fontSize: 9 }}
                    stroke="#94a3b8"
                    width={110}
                  />
                  <Tooltip formatter={(v) => [fmtUSD(v), "Valor USD"]} />
                  <Bar dataKey="valor_usd" name="Valor USD" radius={[0, 4, 4, 0]}>
                    {porPais.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
        </PlanGate>
      </div>
      <ReleasesPanel dataset="comex" />

    </motion.div>
  );
}
