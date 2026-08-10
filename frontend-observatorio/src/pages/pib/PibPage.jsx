import { useEffect, useMemo, useRef, useState } from "react";
import api from "../../services/api";
import { motion } from "framer-motion";
import InsightsPanel from "../../components/InsightsPanel";
import ReleasesPanel from "../../components/ReleasesPanel";
import NidComparativoPanel from "../../components/nid/ComparativoPanel";
import InfoTooltip from "../../components/InfoTooltip";
import FilterBar, { describeFilter, clearFilter } from "../../components/FilterBar";
import { janela12m } from "../../utils/periodoCards";
import KpiCard from "../../components/KpiCard";
import PlanGate from "../../components/PlanGate";
import { NidPanel, NidLegend, NidPageHeader } from "../../components/nid/Panel";
import { useAuth } from "../../context/AuthContext";
import { useViewAs } from "../../context/ViewAsContext";
import KpiSkeleton from "../../components/nid/KpiSkeleton";
import SelecioneMunicipio from "../../components/nid/SelecioneMunicipio";
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
import { montarComparativo, descreverPares } from "../../utils/seriesComparativo";
import ComparadorMunicipios from "../../components/nid/ComparadorMunicipios";

const fmtBRL = (v) =>
  `R$ ${Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`;

// Paleta dos municipios fixados pelo usuario. Fora de --accent-2 (cor do foco) e
// de --accent-1 (cor de hover de par), senao o fixado se confunde com os dois.
const CORES_FIXADOS = ["var(--accent-4)", "var(--accent-5)", "var(--accent-3)"];

export default function PibPage() {
  const { user } = useAuth();
  const { viewAsId } = useViewAs();
  // ADMIN_GLOBAL precisa de um município selecionado (view-as) para escopar os
  // gráficos do dashboard; sem seleção, pedimos para escolher em vez de
  // sobrepor todos os municípios no mesmo gráfico.
  const needsMunicipio = user?.role === "ADMIN_GLOBAL" && viewAsId == null;

  const VAZIO = { foco: null, pares: [], fixados: [], criterio_pares: null, motivo: null, itens: [] };
  const [rawSerie, setRawSerie] = useState([]);
  const [resumo, setResumo] = useState(null);
  const [comp, setComp] = useState(VAZIO);
  const [fixadosIds, setFixadosIds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ yearFrom: "", yearTo: "" });

  // Default "12m" de série anual = último ano com dado (guard p/ o usuário).
  const filtroTocado = useRef(false);
  const mudarFiltros = (v) => { filtroTocado.current = true; setFilters(v); };

  useEffect(() => {
    Promise.all([
      api.get("/pib/serie"),
      api.get("/pib/resumo"),
      api.get("/pib/comparativo", {
        params: fixadosIds.length ? { fixados: fixadosIds.join(",") } : undefined,
      }),
    ])
      .then(([serieRes, resumoRes, compRes]) => {
        const raw = serieRes.data || [];
        setRawSerie(raw);
        setResumo(resumoRes.data);
        setComp(compRes.data || VAZIO);
        if (!filtroTocado.current) {
          setFilters(janela12m(raw, (d) => ({ ano: d.ano })));
        }
      })
      .catch((err) => console.error("Erro ao carregar PIB:", err))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fixadosIds]);

  const years = useMemo(() => rawSerie.map((d) => d.ano).sort(), [rawSerie]);

  // VA por setor é do município em FOCO — antes o código pegava "a primeira
  // cidade do comparativo", que virou uma cidade qualquer quando a rota passou
  // a devolver a base inteira.
  const vaData = useMemo(() => {
    if (!comp.foco) return [];
    return (comp.itens || [])
      .filter((d) => d.municipio_id === comp.foco.municipio_id)
      .filter((d) => {
        const { yearFrom, yearTo } = filters;
        if (yearFrom && d.ano < +yearFrom) return false;
        if (yearTo && d.ano > +yearTo) return false;
        return true;
      })
      .sort((a, b) => a.ano - b.ano);
  }, [comp, filters]);

  // Foco + pares comparáveis já vêm pivotados pelo util — o backend manda o
  // envelope, o util decide domínio de anos (o do foco) e rótulos (homônimos
  // entre UFs).
  const cmp = useMemo(
    () => montarComparativo({
      itens: comp.itens, foco: comp.foco, pares: comp.pares, fixados: comp.fixados,
      anoKey: "ano", valorKey: "pib_total",
    }),
    [comp]
  );
  const seriesComp = useMemo(
    () => (cmp.focusSeries ? [cmp.focusSeries, ...cmp.peerSeries, ...cmp.pinnedSeries] : []),
    [cmp]
  );
  // Cor por posição (i % 5) colidia com o foco (--accent-2) ou com o hover de
  // par (--accent-1) dependendo de quantos pares vinham na resposta. Fixado
  // sempre pega uma cor da paleta dedicada, pela posição dele entre os fixados.
  const coresComp = useMemo(
    () => seriesComp.map((s) => {
      const iFix = cmp.pinnedSeries.indexOf(s);
      return iFix >= 0 ? CORES_FIXADOS[iFix % CORES_FIXADOS.length] : "var(--accent-1)";
    }),
    [seriesComp, cmp.pinnedSeries]
  );

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

  // ── KPI cards ──────────────────────────────────────────────────────────────

  const cards = [
    {
      label: "PIB Último Ano",
      value: resumo ? fmtBRL(resumo.pib_ultimo_ano) : "—",
      sub: resumo?.ultimo_ano ? `Ano ${resumo.ultimo_ano} · último da série` : null,
      dataset: "pib",
      indicadorKey: "ultimo_ano",
    },
    {
      label: "Crescimento",
      value:
        resumo?.crescimento_percentual != null
          ? `${resumo.crescimento_percentual > 0 ? "+" : ""}${resumo.crescimento_percentual.toFixed(1)}%`
          : "—",
      sub: "Variação vs ano anterior · última da série",
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
          onClear: () => mudarFiltros(clearFilter()),
        }] : null}
      />

      {needsMunicipio ? (
        <SelecioneMunicipio />
      ) : (
      <>
      <FilterBar id="filter-bar-pib" years={years} value={filters} onChange={mudarFiltros} />

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[...Array(3)].map((_, i) => <KpiSkeleton key={i} />)}
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

      {/* PIB Comparativo — foco + pares comparáveis. Gate inclui `comp.motivo`
          para o painel aparecer com a explicação (ex.: "ainda não há série
          histórica") em vez de sumir quando não há foco. */}
      {(cmp.focusSeries || comp.motivo) && (
        <NidPanel title="PIB Comparativo — Municípios" sub={descreverPares(comp)}>
          <ComparadorMunicipios fixados={comp.fixados} onChange={setFixadosIds} />
          <MultiLineChart
            data={cmp.data}
            series={seriesComp}
            colors={coresComp}
            height={280}
            yFmt={fmtMoneyShort}
            tipFmt={fmtMoneyFull}
            focusSeries={cmp.focusSeries}
            pinnedSeries={cmp.pinnedSeries}
            peerCount={cmp.peerSeries.length}
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
