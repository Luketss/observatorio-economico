import { useEffect, useMemo, useState } from "react";
import api from "../../services/api";
import { motion } from "framer-motion";
import InsightsPanel from "../../components/InsightsPanel";
import ReleasesPanel from "../../components/ReleasesPanel";
import NidComparativoPanel from "../../components/nid/ComparativoPanel";
import InfoTooltip from "../../components/InfoTooltip";
import FilterBar, { describeFilter, clearFilter } from "../../components/FilterBar";
import KpiCard from "../../components/KpiCard";
import PlanGate from "../../components/PlanGate";
import { NidPanel, NidLegend, NidPageHeader } from "../../components/nid/Panel";
import { useAuth } from "../../context/AuthContext";
import { useViewAs } from "../../context/ViewAsContext";
import ChartState from "../../components/nid/ChartState.jsx";
import {
  AreaLineChart,
  StackedBarChart,
  MultiLineChart,
  Annotation,
  AnnotationBand,
  fmtMoneyShort,
  fmtMoneyFull,
} from "../../components/nid/charts";
import DataTable from "../../components/nid/DataTable";

const fmtBRL = (v) =>
  `R$ ${Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`;

export default function PibPage() {
  const { user } = useAuth();
  const { viewAsId } = useViewAs();
  const ownCity = user?.municipio?.nome;
  // ADMIN_GLOBAL precisa de um município selecionado (view-as) para escopar os
  // gráficos do dashboard; sem seleção, pedimos para escolher em vez de
  // sobrepor todos os municípios no mesmo gráfico.
  const needsMunicipio = user?.role === "ADMIN_GLOBAL" && viewAsId == null;

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
      <NidPageHeader
        title={<>PIB — Produto Interno Bruto <InfoTooltip dataset="pib" /></>}
        sub="Série histórica do PIB municipal."
        chips={describeFilter(filters) ? [{
          label: describeFilter(filters),
          active: true,
          onClick: () => document.getElementById("filter-bar-pib")?.scrollIntoView({ block: "center", behavior: "smooth" }),
          onClear: () => setFilters(clearFilter()),
        }] : null}
      />

      {needsMunicipio ? (
        <div
          className="rounded-2xl p-10 text-center"
          style={{
            background: "var(--panel)",
            border: "1px dashed var(--border-strong)",
            color: "var(--text-dim)",
          }}
        >
          <p className="text-base font-semibold" style={{ color: "var(--text)" }}>
            Selecione um município
          </p>
          <p className="text-sm mt-1">
            Use <b>"Ver como"</b> na administração de Municípios para escolher um
            município e visualizar os dados de PIB.
          </p>
        </div>
      ) : (
      <>
      <FilterBar id="filter-bar-pib" years={years} value={filters} onChange={setFilters} />

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

      <InsightsPanel dataset="pib" />

      {/* Evolução Anual do PIB */}
      <NidPanel title="Evolução Anual do PIB" sub="série histórica · R$ milhões">
        {/* demo: array-form (xRange band) + declarative child (point annotation) — both coexist */}
        <AreaLineChart
          data={areaData}
          height={280}
          color="var(--accent-1)"
          label="PIB Total"
          yFmt={fmtMoneyShort}
          tipFmt={fmtMoneyFull}
          forecast={{ steps: 1, method: "linear-6" }}
          annotations={[
            { xRange: ["2020", "2021"], kind: "negative" },
          ]}
        >
          <Annotation x="2020" kind="negative">COVID</Annotation>
        </AreaLineChart>
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
            focusSeries={ownCity}
            showMedian
            showBand
            legend
          />
        </NidPanel>
      )}

      {/* Série Anual table */}
      {serie.length > 0 && (
        <NidPanel title="Série Anual" sub="histórico · PIB total por ano">
          <DataTable
            columns={[
              { key: "ano",       label: "Ano",          width: 80 },
              { key: "pib_total", label: "PIB Total",    align: "right", fmt: fmtMoneyShort, mono: true, heatmap: true },
              { key: "__delta",   label: "YoY",          align: "right", kind: "delta" },
              { key: "__trend",   label: "Tendência 5a", kind: "spark",  width: 130 },
              { key: "tipo_dado", label: "Tipo",         align: "right", kind: "code", mono: true },
            ]}
            data={serie.slice().reverse()}
            pageSize={12}
          />
        </NidPanel>
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
      </>
      )}

    </motion.div>
  );
}
