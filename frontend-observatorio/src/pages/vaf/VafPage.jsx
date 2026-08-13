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
import { NidPanel, NidLegend, NidPageHeader } from "../../components/nid/Panel";
import { useAuth } from "../../context/AuthContext";
import { useViewAs } from "../../context/ViewAsContext";
import KpiSkeleton from "../../components/nid/KpiSkeleton";
import SelecioneMunicipio from "../../components/nid/SelecioneMunicipio";
import {
  AreaLineChart,
  MultiLineChart,
  fmtMoneyShort,
  fmtMoneyFull,
} from "../../components/nid/charts";
import DataTable from "../../components/nid/DataTable";
import { montarComparativo, descreverPares } from "../../utils/seriesComparativo";
import ComparadorMunicipios from "../../components/nid/ComparadorMunicipios";
import PeriodoMenu from "../../components/nid/PeriodoMenu";
import { resolverSeriePainel } from "../../utils/periodoGrafico";

// IPM e índices são valores decimais pequenos (ex.: 0,024115) — não R$.
const fmtIndice = (v) =>
  v == null
    ? "—"
    : Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 4, maximumFractionDigits: 6 });

const fmtPct = (v) =>
  v == null ? "—" : `${v > 0 ? "+" : ""}${Number(v).toFixed(2)}%`;

// Paleta dos municipios fixados pelo usuario. Fora de --accent-2 (cor do foco) e
// de --accent-1 (cor de hover de par), senao o fixado se confunde com os dois.
const CORES_FIXADOS = ["var(--accent-4)", "var(--accent-5)", "var(--accent-3)"];

export default function VafPage() {
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
  const [icmsProj, setIcmsProj] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ yearFrom: "", yearTo: "" });

  // Preset de período POR GRÁFICO — override do filtro da página, por painel.
  const [periodosGrafico, setPeriodosGrafico] = useState({});
  const setPeriodo = (chave) => (preset) =>
    setPeriodosGrafico((prev) => ({ ...prev, [chave]: preset }));
  const extrairAno = (d) => ({ ano: d.ano_base });
  const extrairIcms = (d) => ({ ano: d.ano_aplicacao ?? d.ano_base });
  const seriePara = (chave, rawSerie, seriePagina, extrair) =>
    resolverSeriePainel({ rawSerie, seriePagina, preset: periodosGrafico[chave], extrair });

  // Default "12m" de série anual = último ano-base com dado (guard p/ usuário).
  const filtroTocado = useRef(false);
  const mudarFiltros = (v) => { filtroTocado.current = true; setFilters(v); };

  useEffect(() => {
    Promise.all([
      api.get("/vaf/serie"),
      api.get("/vaf/resumo"),
      api.get("/vaf/comparativo", {
        params: fixadosIds.length ? { fixados: fixadosIds.join(",") } : undefined,
      }),
      api.get("/vaf/icms_projetado").catch(() => ({ data: [] })),
    ])
      .then(([serieRes, resumoRes, compRes, icmsRes]) => {
        const raw = serieRes.data || [];
        setRawSerie(raw);
        setResumo(resumoRes.data);
        setComp(compRes.data || VAZIO);
        setIcmsProj(icmsRes.data || []);
        if (!filtroTocado.current) {
          setFilters(janela12m(raw, (d) => ({ ano: d.ano_base })));
        }
      })
      .catch((err) => console.error("Erro ao carregar VAF:", err))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fixadosIds]);

  // ICMS projetado a partir do IPM (ancorado no ICMS realizado). Hoje a
  // "série da página" deste painel É o cru (sem filtro de período aplicado
  // antes) — sem override, o preset continua sendo o próprio icmsProj.
  const icmsChart = useMemo(() => {
    const s = seriePara("chart_icms_projetado", icmsProj, icmsProj, extrairIcms);
    return s.map((d) => ({
      label: String(d.ano_aplicacao ?? d.ano_base),
      "Projetado": d.icms_projetado,
      "Realizado": d.realizado,
    }));
  }, [icmsProj, periodosGrafico]);

  const years = useMemo(() => rawSerie.map((d) => d.ano_base).sort(), [rawSerie]);

  const serie = useMemo(() => {
    const { yearFrom, yearTo } = filters;
    return rawSerie.filter((d) => {
      if (yearFrom && d.ano_base < +yearFrom) return false;
      if (yearTo && d.ano_base > +yearTo) return false;
      return true;
    });
  }, [rawSerie, filters]);

  // Foco + pares comparáveis já vêm pivotados pelo util — o backend manda o
  // envelope, o util decide domínio de anos (o do foco) e rótulos (homônimos
  // entre UFs).
  const cmp = useMemo(
    () => montarComparativo({
      itens: comp.itens, foco: comp.foco, pares: comp.pares, fixados: comp.fixados,
      anoKey: "ano_base", valorKey: "indice_participacao_municipal",
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

  // ── NID chart data shapes ──────────────────────────────────────────────────

  const ipmData = useMemo(() => {
    const s = seriePara("chart_evolucao_ipm", rawSerie, serie, extrairAno);
    return s.map((d) => ({
      label: String(d.ano_base),
      value: d.indice_participacao_municipal,
    }));
  }, [serie, rawSerie, periodosGrafico]);

  const indicesData = useMemo(() => {
    const s = seriePara("chart_indice_vs_medio", rawSerie, serie, extrairAno);
    return s.map((d) => ({
      label: String(d.ano_base),
      "Índice": d.indice,
      "Índice Médio": d.indice_medio,
    }));
  }, [serie, rawSerie, periodosGrafico]);

  const vafData = useMemo(() => {
    const s = seriePara("chart_vaf_individual_estado", rawSerie, serie, extrairAno);
    return s.map((d) => ({
      label: String(d.ano_base),
      "VAF Individual": d.vaf_individual,
      "VAF do Estado": d.vaf_estado,
    }));
  }, [serie, rawSerie, periodosGrafico]);

  // ── KPI cards ──────────────────────────────────────────────────────────────

  const cards = [
    {
      label: "IPM Último Ano",
      value: resumo ? fmtIndice(resumo.ipm_ultimo_ano) : "—",
      sub: resumo?.ultimo_ano ? `Ano-base ${resumo.ultimo_ano} · último da série` : null,
      dataset: "vaf",
      indicadorKey: "ipm_ultimo_ano",
    },
    {
      label: "Variação do IPM",
      value:
        resumo?.variacao_ipm_percentual != null
          ? fmtPct(resumo.variacao_ipm_percentual)
          : "—",
      sub: "Variação vs ano anterior · última da série",
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
          onClear: () => mudarFiltros(clearFilter()),
        }] : null}
      />

      {needsMunicipio ? (
        <SelecioneMunicipio />
      ) : (
      <>
      <FilterBar id="filter-bar-vaf" years={years} value={filters} onChange={mudarFiltros} />

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

      <InsightsPanel dataset="vaf" />

      {/* Evolução do IPM */}
      <NidPanel
        title="Evolução do IPM"
        sub="índice de participação municipal por ano-base"
        dataset="vaf"
        indicadorKey="chart_evolucao_ipm"
        right={
          <PeriodoMenu
            value={periodosGrafico["chart_evolucao_ipm"] || null}
            onChange={setPeriodo("chart_evolucao_ipm")}
          />
        }
      >
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

      {/* ICMS projetado a partir do IPM */}
      {icmsChart.length > 0 && (
        <NidPanel
          title="ICMS Projetado a partir do IPM"
          sub="repasse estimado por ano de aplicação · escala o ICMS realizado pela razão do IPM"
          dataset="vaf"
          indicadorKey="chart_icms_projetado"
          right={
            <PeriodoMenu
              value={periodosGrafico["chart_icms_projetado"] || null}
              onChange={setPeriodo("chart_icms_projetado")}
            />
          }
        >
          <NidLegend
            items={[
              { name: "Projetado", color: "var(--accent-1)" },
              { name: "Realizado", color: "var(--accent-5)" },
            ]}
          />
          <MultiLineChart
            data={icmsChart}
            series={["Projetado", "Realizado"]}
            colors={["var(--accent-1)", "var(--accent-5)"]}
            height={280}
            yFmt={fmtMoneyShort}
            tipFmt={fmtMoneyFull}
          />
        </NidPanel>
      )}

      {/* Índice vs Índice Médio */}
      {serie.length > 0 && (
        <NidPanel
          title="Índice vs Índice Médio"
          sub="índice do VAF e sua média móvel por ano-base"
          dataset="vaf"
          indicadorKey="chart_indice_vs_medio"
          right={
            <PeriodoMenu
              value={periodosGrafico["chart_indice_vs_medio"] || null}
              onChange={setPeriodo("chart_indice_vs_medio")}
            />
          }
        >
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

      {/* IPM Comparativo — foco + pares comparáveis. Gate inclui `comp.motivo`
          para o painel aparecer com a explicação (ex.: "ainda não há série
          histórica") em vez de sumir quando não há foco. */}
      {(cmp.focusSeries || comp.motivo) && (
        <NidPanel title="IPM Comparativo — Municípios" sub={descreverPares(comp)} dataset="vaf" indicadorKey="chart_ipm_comparativo">
          <ComparadorMunicipios fixados={comp.fixados} onChange={setFixadosIds} />
          <MultiLineChart
            data={cmp.data}
            series={seriesComp}
            colors={coresComp}
            height={280}
            yFmt={fmtIndice}
            tipFmt={fmtIndice}
            focusSeries={cmp.focusSeries}
            pinnedSeries={cmp.pinnedSeries}
            peerCount={cmp.peerSeries.length}
            showMedian
            showBand
            legend
          />
        </NidPanel>
      )}

      {/* VAF Individual × Estado */}
      {serie.length > 0 && (
        <NidPanel
          title="VAF Individual × Estado"
          sub="valores monetários do VAF · R$"
          dataset="vaf"
          indicadorKey="chart_vaf_individual_estado"
          right={
            <PeriodoMenu
              value={periodosGrafico["chart_vaf_individual_estado"] || null}
              onChange={setPeriodo("chart_vaf_individual_estado")}
            />
          }
        >
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
        <NidPanel title="Série Anual" sub="histórico · índices, médias e IPM por ano-base" dataset="vaf" indicadorKey="chart_serie_anual">
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
            pageSize={12}
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
        dataset="vaf"
        indicadorKey="chart_comparativo_municipios"
      />

      <ReleasesPanel dataset="vaf" />
      </>
      )}

    </motion.div>
  );
}
