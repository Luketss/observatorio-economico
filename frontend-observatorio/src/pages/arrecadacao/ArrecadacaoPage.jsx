import { useEffect, useMemo, useState } from "react";
import api from "../../services/api";
import { useChartTheme } from "../../hooks/useChartTheme";
import { motion } from "framer-motion";
import InsightsPanel from "../../components/InsightsPanel";
import ReleasesPanel from "../../components/ReleasesPanel";
import InfoTooltip from "../../components/InfoTooltip";
import FilterBar from "../../components/FilterBar";
import KpiCard from "../../components/KpiCard";
import { NidPanel } from "../../components/nid/Panel";
import ChartState from "../../components/nid/ChartState.jsx";
import { AreaLineChart, fmtMoneyShort, fmtMoneyFull } from "../../components/nid/charts";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
} from "recharts";

const fmtBRL = (v) =>
  `R$ ${Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`;

export default function ArrecadacaoPage() {
  const ct = useChartTheme();
  const [rawSerie, setRawSerie] = useState([]);
  const [resumo, setResumo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ yearFrom: "", yearTo: "" });

  useEffect(() => {
    Promise.all([api.get("/arrecadacao/serie"), api.get("/arrecadacao/resumo")])
      .then(([serieRes, resumoRes]) => {
        setRawSerie(serieRes.data || []);
        setResumo(resumoRes.data);
      })
      .catch((err) => console.error("Erro ao carregar arrecadação:", err))
      .finally(() => setLoading(false));
  }, []);

  const years = useMemo(() => {
    const set = new Set(rawSerie.map((d) => parseInt(d.periodo)));
    return [...set].sort();
  }, [rawSerie]);

  const serie = useMemo(() => {
    const { yearFrom, yearTo } = filters;
    return rawSerie.filter((d) => {
      const y = parseInt(d.periodo);
      if (yearFrom && y < +yearFrom) return false;
      if (yearTo && y > +yearTo) return false;
      return true;
    });
  }, [rawSerie, filters]);

  // NID chart shape for AreaLineChart
  const areaData = useMemo(
    () => serie.map((d) => ({ label: String(d.periodo), value: d.total || 0 })),
    [serie]
  );

  const cards = [
    {
      label: "Total Arrecadado",
      value: resumo ? fmtBRL(resumo.total_geral) : "—",
      sub: "Todos os períodos",
      dataset: "arrecadacao",
      indicadorKey: "total_arrecadado",
    },
    {
      label: "Último Ano",
      value: resumo ? fmtBRL(resumo.total_ultimo_ano) : "—",
      sub: serie.length ? `Ano ${serie[serie.length - 1].ano}` : null,
      dataset: "arrecadacao",
      indicadorKey: "ultimo_ano",
    },
    {
      label: "Média Mensal",
      value: resumo ? fmtBRL(resumo.media_mensal) : "—",
      sub: "Por mês no período",
      dataset: "arrecadacao",
      indicadorKey: "media_mensal",
    },
    {
      label: "Crescimento",
      value:
        resumo?.crescimento_percentual != null
          ? `${resumo.crescimento_percentual > 0 ? "+" : ""}${resumo.crescimento_percentual.toFixed(1)}%`
          : "—",
      sub: "vs ano anterior",
      dataset: "arrecadacao",
      indicadorKey: "crescimento_anual",
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
            Arrecadação Municipal
          </h1>
          <InfoTooltip dataset="arrecadacao" />
        </div>
        <p className="text-sm text-slate-400 dark:text-slate-500 mt-1">
          Evolução das receitas municipais por período.
        </p>
      </div>

      <InsightsPanel dataset="arrecadacao" />

      <FilterBar years={years} value={filters} onChange={setFilters} />

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-100 dark:border-slate-800">
              <ChartState kind="loading" shape="kpi" height={80} />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
          {cards.map((c) => (
            <KpiCard key={c.label} {...c} />
          ))}
        </div>
      )}

      <NidPanel title="Série Histórica Mensal" sub="receita total por período">
        <AreaLineChart
          data={areaData}
          height={280}
          color="var(--accent-3)"
          label="Total Arrecadado"
          yFmt={fmtMoneyShort}
          tipFmt={fmtMoneyFull}
          forecast={{ steps: 2, method: "linear-6" }}
        />
      </NidPanel>

      {/* ICMS / IPVA / IPI Breakdown */}
      {serie.length > 0 && (
        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800">
          <h3 className="text-base font-bold mb-5 text-slate-800 dark:text-white">
            Composição por Tipo de Imposto (ICMS / IPVA / IPI)
          </h3>
          <div className="h-48 md:h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={serie.slice(-24)} margin={{ left: 10, right: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={ct.grid} vertical={false} />
                <XAxis dataKey="periodo" tick={{ fontSize: 10, fill: ct.tick }} stroke={ct.axis} />
                <YAxis
                  tick={{ fontSize: 11, fill: ct.tick }}
                  stroke={ct.axis}
                  width={70}
                  tickFormatter={(v) => `${(v / 1_000_000).toFixed(0)}M`}
                />
                <Tooltip contentStyle={ct.tooltipStyle} formatter={(v) => [fmtBRL(v)]} />
                <Legend />
                <Bar dataKey="icms" name="ICMS" stackId="a" fill="#6366f1" />
                <Bar dataKey="ipva" name="IPVA" stackId="a" fill="#10b981" />
                <Bar dataKey="ipi" name="IPI" stackId="a" fill="#f59e0b" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Breakdown table */}
      {serie.length > 0 && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800">
            <h3 className="text-base font-bold text-slate-800 dark:text-white">Detalhamento por Período</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800 text-left text-xs uppercase text-slate-400 dark:text-slate-500 tracking-wider">
                  <th className="px-6 py-3">Período</th>
                  <th className="px-6 py-3 text-right">Total</th>
                  <th className="px-6 py-3 text-right">ICMS</th>
                  <th className="px-6 py-3 text-right">IPVA</th>
                  <th className="px-6 py-3 text-right">IPI</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                {serie.slice().reverse().map((item, i) => (
                  <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                    <td className="px-6 py-3 font-medium text-slate-700 dark:text-slate-200">{item.periodo}</td>
                    <td className="px-6 py-3 text-right text-slate-800 dark:text-white font-semibold">{fmtBRL(item.total)}</td>
                    <td className="px-6 py-3 text-right text-slate-500 dark:text-slate-400">{fmtBRL(item.icms)}</td>
                    <td className="px-6 py-3 text-right text-slate-500 dark:text-slate-400">{fmtBRL(item.ipva)}</td>
                    <td className="px-6 py-3 text-right text-slate-500 dark:text-slate-400">{fmtBRL(item.ipi)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <ReleasesPanel dataset="arrecadacao" />

    </motion.div>
  );
}


