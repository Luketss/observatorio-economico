import { useEffect, useMemo, useState } from "react";
import api from "../../services/api";
import { motion } from "framer-motion";
import InsightsPanel from "../../components/InsightsPanel";
import ReleasesPanel from "../../components/ReleasesPanel";
import InfoTooltip from "../../components/InfoTooltip";
import FilterBar, { describeFilter, clearFilter } from "../../components/FilterBar";
import KpiCard from "../../components/KpiCard";
import { NidPanel, NidPageHeader } from "../../components/nid/Panel";
import ChartState from "../../components/nid/ChartState.jsx";
import { AreaLineChart, StackedBarChart, fmtMoneyShort, fmtMoneyFull } from "../../components/nid/charts";
import DataTable from "../../components/nid/DataTable";

const fmtBRL = (v) =>
  `R$ ${Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`;

export default function ArrecadacaoPage() {
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
      <NidPageHeader
        title={<>Arrecadação Municipal <InfoTooltip dataset="arrecadacao" /></>}
        sub="Evolução das receitas municipais por período."
        chips={describeFilter(filters) ? [{
          label: describeFilter(filters),
          active: true,
          onClick: () => document.getElementById("filter-bar-arrecadacao")?.scrollIntoView({ block: "center", behavior: "smooth" }),
          onClear: () => setFilters(clearFilter()),
        }] : null}
      />

      <InsightsPanel dataset="arrecadacao" />

      <FilterBar id="filter-bar-arrecadacao" years={years} value={filters} onChange={setFilters} />

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
          <StackedBarChart
            data={serie.slice(-24).map((d) => ({
              label: String(d.periodo),
              icms: d.icms || 0,
              ipva: d.ipva || 0,
              ipi: d.ipi || 0,
            }))}
            keys={["icms", "ipva", "ipi"]}
            colors={["#6366f1", "#10b981", "#f59e0b"]}
            height={280}
            yFmt={fmtMoneyShort}
            tipFmt={fmtMoneyFull}
          />
        </div>
      )}

      {/* Breakdown table */}
      {serie.length > 0 && (
        <NidPanel title="Detalhamento por Período" sub="arrecadação mensal">
          <DataTable
            columns={[
              { key: "periodo", label: "Período",    width: 100 },
              { key: "total",   label: "Total",      align: "right", fmt: fmtMoneyShort, mono: true, heatmap: true },
              { key: "__delta", label: "YoY",        align: "right", kind: "delta" },
              { key: "__trend", label: "Tendência",  kind: "spark",  width: 120 },
              { key: "icms",    label: "ICMS",       align: "right", fmt: fmtMoneyShort, mono: true },
              { key: "ipva",    label: "IPVA",       align: "right", fmt: fmtMoneyShort, mono: true },
              { key: "ipi",     label: "IPI",        align: "right", fmt: fmtMoneyShort, mono: true },
            ]}
            data={serie.slice().reverse()}
          />
        </NidPanel>
      )}
      <ReleasesPanel dataset="arrecadacao" />

    </motion.div>
  );
}


