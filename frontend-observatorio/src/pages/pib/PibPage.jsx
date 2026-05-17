import { useEffect, useMemo, useState } from "react";
import api from "../../services/api";
import { motion } from "framer-motion";
import InsightsPanel from "../../components/InsightsPanel";
import ReleasesPanel from "../../components/ReleasesPanel";
import NidComparativoPanel from "../../components/nid/ComparativoPanel";
import InfoTooltip from "../../components/InfoTooltip";
import FilterBar from "../../components/FilterBar";
import KpiCard from "../../components/KpiCard";
import PlanGate from "../../components/PlanGate";
import { NidPanel, NidLegend } from "../../components/nid/Panel";
import {
  AreaLineChart,
  StackedBarChart,
  MultiLineChart,
  fmtMoneyShort,
  fmtMoneyFull,
} from "../../components/nid/charts";

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

  const serie = useMemo(() => {
    const { yearFrom, yearTo } = filters;
    return rawSerie.filter((d) => {
      if (yearFrom && d.ano < +yearFrom) return false;
      if (yearTo && d.ano > +yearTo) return false;
      return true;
    });
  }, [rawSerie, filters]);

  // ── NID chart data shapes ──────────────────────────────────────────────────

  const areaData = useMemo(
    () => serie.map((d) => ({ label: String(d.ano), value: d.pib_total })),
    [serie]
  );

  const vaChartData = useMemo(
    () =>
      vaData.map((d) => ({
        label: String(d.ano),
        "Agropecuária": d.va_agropecuaria,
        "Indústria": d.va_industria,
        "Serviços": d.va_servicos,
        "Governo": d.va_governo,
      })),
    [vaData]
  );

  const compData = useMemo(
    () => comparativoChart.map((row) => ({ label: String(row.ano), ...row })),
    [comparativoChart]
  );

  // ── KPI cards ──────────────────────────────────────────────────────────────

  const cards = [
    {
      label: "PIB Último Ano",
      value: resumo ? fmtBRL(resumo.pib_ultimo_ano) : "—",
      sub: resumo?.ultimo_ano ? `Ano ${resumo.ultimo_ano}` : null,
      dataset: "pib",
      indicadorKey: "ultimo_ano",
    },
    {
      label: "Crescimento",
      value:
        resumo?.crescimento_percentual != null
          ? `${resumo.crescimento_percentual > 0 ? "+" : ""}${resumo.crescimento_percentual.toFixed(1)}%`
          : "—",
      sub: "Variação vs ano anterior",
      dataset: "pib",
      indicadorKey: "crescimento",
    },
    {
      label: "Anos na Série",
      value: serie.length > 0 ? serie.length : "—",
      sub:
        serie.length > 0
          ? `${serie[0].ano} – ${serie[serie.length - 1].ano}`
          : null,
      dataset: "pib",
      indicadorKey: "anos_serie",
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

      {/* Evolução Anual do PIB */}
      <NidPanel title="Evolução Anual do PIB" sub="série histórica · R$ milhões">
        <AreaLineChart
          data={areaData}
          height={280}
          color="var(--accent-1)"
          label="PIB Total"
          yFmt={fmtMoneyShort}
          tipFmt={fmtMoneyFull}
        />
      </NidPanel>

      {/* Valor Adicionado por Setor */}
      {vaData.length > 0 && (
        <PlanGate planKey="pib.por_setor">
          <NidPanel title="Valor Adicionado por Setor" sub="composição por setor produtivo">
            <NidLegend
              items={[
                { name: "Agropecuária", color: "var(--accent-1)" },
                { name: "Indústria", color: "var(--accent-3)" },
                { name: "Serviços", color: "var(--accent-5)" },
                { name: "Governo", color: "var(--accent-4)" },
              ]}
            />
            <StackedBarChart
              data={vaChartData}
              keys={["Agropecuária", "Indústria", "Serviços", "Governo"]}
              colors={["var(--accent-1)", "var(--accent-3)", "var(--accent-5)", "var(--accent-4)"]}
              height={280}
              yFmt={fmtMoneyShort}
              tipFmt={fmtMoneyFull}
            />
          </NidPanel>
        </PlanGate>
      )}

      {/* PIB Comparativo — Municípios */}
      {comparativoChart.length > 0 && cidades.length > 1 && (
        <NidPanel title="PIB Comparativo — Municípios" sub="evolução comparativa entre municípios">
          <MultiLineChart
            data={compData}
            series={cidades}
            colors={cidades.map((_, i) => `var(--accent-${(i % 5) + 1})`)}
            height={280}
            yFmt={fmtMoneyShort}
            tipFmt={fmtMoneyFull}
          />
        </NidPanel>
      )}

      {/* Série Anual table */}
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

      <NidComparativoPanel
        title="Ranking de PIB Municipal"
        sub="Posição do município no ranking nacional/estadual (último ano disponível)"
        endpoint="/pib/ranking"
        metric="pib_total"
        fmt={(v) => {
          const n = Number(v);
          if (n >= 1e9) return `R$ ${(n / 1e9).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} Bi`;
          if (n >= 1e6) return `R$ ${(n / 1e6).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} Mi`;
          return `R$ ${n.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`;
        }}
        color="var(--accent-4)"
      />

      <ReleasesPanel dataset="pib" />

    </motion.div>
  );
}
