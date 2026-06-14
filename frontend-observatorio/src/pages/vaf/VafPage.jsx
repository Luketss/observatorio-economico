import { useEffect, useMemo, useState } from "react";
import api from "../../services/api";
import { motion } from "framer-motion";
import InsightsPanel from "../../components/InsightsPanel";
import ReleasesPanel from "../../components/ReleasesPanel";
import NidComparativoPanel from "../../components/nid/ComparativoPanel";
import InfoTooltip from "../../components/InfoTooltip";
import FilterBar, { describeFilter, clearFilter } from "../../components/FilterBar";
import KpiCard from "../../components/KpiCard";
import { NidPanel, NidLegend, NidPageHeader } from "../../components/nid/Panel";
import { useAuth } from "../../context/AuthContext";
import ChartState from "../../components/nid/ChartState.jsx";
import {
  AreaLineChart,
  MultiLineChart,
  fmtMoneyShort,
  fmtMoneyFull,
} from "../../components/nid/charts";
import DataTable from "../../components/nid/DataTable";

// IPM e índices são valores decimais pequenos (ex.: 0,024115) — não R$.
const fmtIndice = (v) =>
  v == null
    ? "—"
    : Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 4, maximumFractionDigits: 6 });

const fmtPct = (v) =>
  v == null ? "—" : `${v > 0 ? "+" : ""}${Number(v).toFixed(2)}%`;

export default function VafPage() {
  const { user } = useAuth();
  const ownCity = user?.municipio?.nome;

  const [rawSerie, setRawSerie] = useState([]);
  const [resumo, setResumo] = useState(null);
  const [comparativo, setComparativo] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ yearFrom: "", yearTo: "" });

  useEffect(() => {
    Promise.all([
      api.get("/vaf/serie"),
      api.get("/vaf/resumo"),
      api.get("/vaf/comparativo"),
    ])
      .then(([serieRes, resumoRes, compRes]) => {
        setRawSerie(serieRes.data || []);
        setResumo(resumoRes.data);
        setComparativo(compRes.data || []);
      })
      .catch((err) => console.error("Erro ao carregar VAF:", err))
      .finally(() => setLoading(false));
  }, []);

  const years = useMemo(() => rawSerie.map((d) => d.ano_base).sort(), [rawSerie]);

  const serie = useMemo(() => {
    const { yearFrom, yearTo } = filters;
    return rawSerie.filter((d) => {
      if (yearFrom && d.ano_base < +yearFrom) return false;
      if (yearTo && d.ano_base > +yearTo) return false;
      return true;
    });
  }, [rawSerie, filters]);

  // Comparativo de IPM entre municípios — pivot para {ano, cityA, cityB, ...}
  const comparativoChart = useMemo(() => {
    const anos = [...new Set(comparativo.map((d) => d.ano_base))].sort();
    return anos.map((ano) => {
      const obj = { ano };
      comparativo
        .filter((d) => d.ano_base === ano)
        .forEach((d) => {
          obj[d.cidade] = d.indice_participacao_municipal;
        });
      return obj;
    });
  }, [comparativo]);

  const cidades = useMemo(
    () => [...new Set(comparativo.map((d) => d.cidade))],
    [comparativo]
  );

  // ── NID chart data shapes ──────────────────────────────────────────────────

  const ipmData = useMemo(
    () =>
      serie.map((d) => ({
        label: String(d.ano_base),
        value: d.indice_participacao_municipal,
      })),
    [serie]
  );

  const indicesData = useMemo(
    () =>
      serie.map((d) => ({
        label: String(d.ano_base),
        "Índice": d.indice,
        "Índice Médio": d.indice_medio,
      })),
    [serie]
  );

  const vafData = useMemo(
    () =>
      serie.map((d) => ({
        label: String(d.ano_base),
        "VAF Individual": d.vaf_individual,
        "VAF do Estado": d.vaf_estado,
      })),
    [serie]
  );

  const compData = useMemo(
    () => comparativoChart.map((row) => ({ label: String(row.ano), ...row })),
    [comparativoChart]
  );

  // ── KPI cards ──────────────────────────────────────────────────────────────

  const cards = [
    {
      label: "IPM Último Ano",
      value: resumo ? fmtIndice(resumo.ipm_ultimo_ano) : "—",
      sub: resumo?.ultimo_ano ? `Ano-base ${resumo.ultimo_ano}` : null,
      dataset: "vaf",
      indicadorKey: "ipm_ultimo_ano",
    },
    {
      label: "Variação do IPM",
      value:
        resumo?.variacao_ipm_percentual != null
          ? fmtPct(resumo.variacao_ipm_percentual)
          : "—",
      sub: "Variação vs ano anterior",
      dataset: "vaf",
      indicadorKey: "variacao_ipm",
    },
    {
      label: "Anos na Série",
      value: serie.length > 0 ? serie.length : "—",
      sub:
        serie.length > 0
          ? `${serie[0].ano_base} – ${serie[serie.length - 1].ano_base}`
          : null,
      dataset: "vaf",
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
      <NidPageHeader
        title={<>VAF — Valor Adicionado Fiscal <InfoTooltip dataset="vaf" /></>}
        sub="Índice de Participação Municipal (IPM) e componentes do VAF — base do repasse de ICMS."
        chips={describeFilter(filters) ? [{
          label: describeFilter(filters),
          active: true,
          onClick: () => document.getElementById("filter-bar-vaf")?.scrollIntoView({ block: "center", behavior: "smooth" }),
          onClear: () => setFilters(clearFilter()),
        }] : null}
      />

      <InsightsPanel dataset="vaf" />

      <FilterBar id="filter-bar-vaf" years={years} value={filters} onChange={setFilters} />

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="bg-[var(--panel)] p-6 rounded-2xl border border-[var(--border)]">
              <ChartState kind="loading" shape="kpi" height={80} />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {cards.map((c) => (
            <KpiCard key={c.label} {...c} />
          ))}
        </div>
      )}

      {/* Evolução do IPM */}
      <NidPanel title="Evolução do IPM" sub="índice de participação municipal por ano-base">
        <AreaLineChart
          data={ipmData}
          height={280}
          color="var(--accent-1)"
          label="IPM"
          yFmt={fmtIndice}
          tipFmt={fmtIndice}
          forecast={{ steps: 1, method: "linear-6" }}
        />
      </NidPanel>

      {/* Índice vs Índice Médio */}
      {serie.length > 0 && (
        <NidPanel title="Índice vs Índice Médio" sub="índice do VAF e sua média móvel por ano-base">
          <NidLegend
            items={[
              { name: "Índice", color: "var(--accent-1)" },
              { name: "Índice Médio", color: "var(--accent-3)" },
            ]}
          />
          <MultiLineChart
            data={indicesData}
            series={["Índice", "Índice Médio"]}
            colors={["var(--accent-1)", "var(--accent-3)"]}
            height={280}
            yFmt={fmtIndice}
            tipFmt={fmtIndice}
          />
        </NidPanel>
      )}

      {/* IPM Comparativo — Municípios */}
      {comparativoChart.length > 0 && cidades.length > 1 && (
        <NidPanel title="IPM Comparativo — Municípios" sub="evolução comparativa do IPM entre municípios">
          <MultiLineChart
            data={compData}
            series={cidades}
            colors={cidades.map((_, i) => `var(--accent-${(i % 5) + 1})`)}
            height={280}
            yFmt={fmtIndice}
            tipFmt={fmtIndice}
            focusSeries={ownCity}
            showMedian
            showBand
          />
        </NidPanel>
      )}

      {/* VAF Individual × Estado */}
      {serie.length > 0 && (
        <NidPanel title="VAF Individual × Estado" sub="valores monetários do VAF · R$">
          <NidLegend
            items={[
              { name: "VAF Individual", color: "var(--accent-1)" },
              { name: "VAF do Estado", color: "var(--accent-4)" },
            ]}
          />
          <MultiLineChart
            data={vafData}
            series={["VAF Individual", "VAF do Estado"]}
            colors={["var(--accent-1)", "var(--accent-4)"]}
            height={280}
            yFmt={fmtMoneyShort}
            tipFmt={fmtMoneyFull}
          />
        </NidPanel>
      )}

      {/* Série Anual table */}
      {serie.length > 0 && (
        <NidPanel title="Série Anual" sub="histórico · índices, médias e IPM por ano-base">
          <DataTable
            columns={[
              { key: "ano_base",                      label: "Ano-base",       width: 90 },
              { key: "ano_aplicacao",                 label: "Aplicação",      width: 90, align: "right" },
              { key: "indice",                        label: "Índice",         align: "right", fmt: fmtIndice, mono: true },
              { key: "indice_medio",                  label: "Índice Médio",   align: "right", fmt: fmtIndice, mono: true },
              { key: "indice_participacao_municipal", label: "IPM",            align: "right", fmt: fmtIndice, mono: true, heatmap: true },
              { key: "__delta",                       label: "YoY (IPM)",      align: "right", kind: "delta" },
              { key: "__trend",                       label: "Tendência 5a",   kind: "spark",  width: 130 },
              { key: "pct_ipm",                       label: "Var. IPM",       align: "right", fmt: fmtPct, mono: true },
            ]}
            data={serie.slice().reverse()}
          />
        </NidPanel>
      )}

      <NidComparativoPanel
        title="Ranking de IPM Municipal"
        sub="Posição do município pelo Índice de Participação Municipal (último ano-base disponível)"
        endpoint="/vaf/ranking"
        metric="indice_participacao_municipal"
        fmt={fmtIndice}
        color="var(--accent-4)"
      />

      <ReleasesPanel dataset="vaf" />

    </motion.div>
  );
}
