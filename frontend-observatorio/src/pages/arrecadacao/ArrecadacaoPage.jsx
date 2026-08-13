import { useEffect, useMemo, useRef, useState } from "react";
import api from "../../services/api";
import { motion } from "framer-motion";
import InsightsPanel from "../../components/InsightsPanel";
import ReleasesPanel from "../../components/ReleasesPanel";
import InfoTooltip from "../../components/InfoTooltip";
import FilterBar, { describeFilter, clearFilter } from "../../components/FilterBar";
import { janela12mAnos } from "../../utils/periodoCards";
import KpiCard from "../../components/KpiCard";
import { NidPanel, NidPageHeader, NidLegend } from "../../components/nid/Panel";
import KpiSkeleton from "../../components/nid/KpiSkeleton";
import SelecioneMunicipio from "../../components/nid/SelecioneMunicipio";
import { useAuth } from "../../context/AuthContext";
import { useViewAs } from "../../context/ViewAsContext";
import { AreaLineChart, MultiLineChart, StackedBarChart, fmtMoneyShort, fmtMoneyFull } from "../../components/nid/charts";
import CompareToggle from "../../components/nid/CompareToggle";
import { comparePanelData } from "../../utils/periodos";
import DataTable from "../../components/nid/DataTable";
import PeriodoMenu from "../../components/nid/PeriodoMenu";
import { resolverSeriePainel } from "../../utils/periodoGrafico";

const fmtBRL = (v) =>
  `R$ ${Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`;

export default function ArrecadacaoPage() {
  const { user } = useAuth();
  const { viewAsId } = useViewAs();
  // ADMIN_GLOBAL precisa de um município selecionado (view-as) para escopar os
  // gráficos do dashboard; sem seleção, pedimos para escolher em vez de
  // sobrepor todos os municípios no mesmo gráfico.
  const needsMunicipio = user?.role === "ADMIN_GLOBAL" && viewAsId == null;

  const [rawSerie, setRawSerie] = useState([]);
  const [resumo, setResumo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ yearFrom: "", yearTo: "" });
  const [comparar, setComparar] = useState(false);
  const cmp = useMemo(() => comparePanelData(rawSerie, { valueKey: "total" }), [rawSerie]);

  // Preset de período POR GRÁFICO — override do filtro da página, por painel.
  // Itens mensais mas só com `ano` numérico no shape (sem `mes`); preset 12m
  // vira "último ano com dado" — comportamento esperado para esta série.
  const [periodosGrafico, setPeriodosGrafico] = useState({});
  const setPeriodo = (chave) => (preset) =>
    setPeriodosGrafico((prev) => ({ ...prev, [chave]: preset }));
  const extrairAno = (d) => ({ ano: d.ano });
  const seriePara = (chave, rawSerieX, seriePagina) =>
    resolverSeriePainel({ rawSerie: rawSerieX, seriePagina, preset: periodosGrafico[chave], extrair: extrairAno });

  // Default "12m ancorado no último dado": aplicado UMA vez no primeiro fetch;
  // interação do usuário que chegue antes (filtroTocado) tem prioridade.
  const filtroTocado = useRef(false);
  const mudarFiltros = (v) => { filtroTocado.current = true; setFilters(v); };

  useEffect(() => {
    Promise.all([api.get("/arrecadacao/serie"), api.get("/arrecadacao/resumo")])
      .then(([serieRes, resumoRes]) => {
        const raw = serieRes.data || [];
        setRawSerie(raw);
        setResumo(resumoRes.data);
        if (!filtroTocado.current) setFilters(janela12mAnos(raw, (d) => d.ano));
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
  const areaData = useMemo(() => {
    const s = seriePara("chart_serie_mensal", rawSerie, serie);
    return s.map((d) => ({ label: String(d.periodo), value: d.total || 0 }));
  }, [serie, rawSerie, periodosGrafico]);

  // Painel de composição por tipo: sem override, mantém `.slice(-24)` (janela
  // fixa de hoje); com override, usa a série resolvida SEM slice — o preset
  // já É o recorte que o usuário pediu.
  const composicaoTipoData = useMemo(() => {
    const s = seriePara("chart_composicao_tipo", rawSerie, serie.slice(-24));
    return s.map((d) => ({
      label: String(d.periodo),
      icms: d.icms || 0,
      ipva: d.ipva || 0,
      ipi: d.ipi || 0,
    }));
  }, [serie, rawSerie, periodosGrafico]);

  // Fluxo: somas derivadas da MESMA série filtrada dos gráficos (linhas mensais).
  const totalPeriodo = useMemo(
    () => serie.reduce((s, d) => s + (d.total || 0), 0),
    [serie]
  );
  const filtroLabel = describeFilter(filters);

  const cards = [
    {
      label: "Total Arrecadado",
      value: serie.length ? fmtBRL(totalPeriodo) : "—",
      sub: filtroLabel || "Todos os períodos",
      dataset: "arrecadacao",
      indicadorKey: "total_arrecadado",
    },
    {
      label: "Último Ano",
      value: resumo ? fmtBRL(resumo.total_ultimo_ano) : "—",
      sub: rawSerie.length ? `Ano ${rawSerie[rawSerie.length - 1].ano} · último da série` : null,
      dataset: "arrecadacao",
      indicadorKey: "ultimo_ano",
    },
    {
      label: "Média Mensal",
      value: serie.length ? fmtBRL(totalPeriodo / serie.length) : "—",
      sub: filtroLabel ? `Por mês · ${filtroLabel}` : "Por mês em toda a série",
      dataset: "arrecadacao",
      indicadorKey: "media_mensal",
    },
    {
      label: "Crescimento",
      value:
        resumo?.crescimento_percentual != null
          ? `${resumo.crescimento_percentual > 0 ? "+" : ""}${resumo.crescimento_percentual.toFixed(1)}%`
          : "—",
      sub: "vs ano anterior · última variação da série",
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
          onClear: () => mudarFiltros(clearFilter()),
        }] : null}
      />

      {needsMunicipio ? (
        <SelecioneMunicipio />
      ) : (
      <>
      <div className="flex items-center justify-end">
        <CompareToggle active={comparar} onChange={setComparar} disabled={!cmp.temAnterior} />
      </div>

      <FilterBar id="filter-bar-arrecadacao" years={years} value={filters} onChange={mudarFiltros} />

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
          {[...Array(4)].map((_, i) => <KpiSkeleton key={i} />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
          {cards.map((c) => (
            <KpiCard key={c.label} {...c} />
          ))}
        </div>
      )}

      <InsightsPanel dataset="arrecadacao" />

      <NidPanel
        title="Série Histórica Mensal"
        dataset="arrecadacao"
        indicadorKey="chart_serie_mensal"
        sub={comparar && cmp.temAnterior
          ? `${cmp.series[0]} vs ${cmp.series[1]} · ${
              cmp.deltaPct != null
                ? `${cmp.deltaPct >= 0 ? "+" : ""}${cmp.deltaPct.toFixed(1)}%`
                : "—"
            } no acumulado`
          : "receita total por período"}
        right={!comparar ? (
          <PeriodoMenu
            value={periodosGrafico["chart_serie_mensal"] || null}
            onChange={setPeriodo("chart_serie_mensal")}
          />
        ) : undefined}
      >
        {comparar && cmp.temAnterior ? (
          <>
            <NidLegend items={[
              { name: cmp.series[0], color: "var(--accent-1)" },
              { name: cmp.series[1], color: "var(--accent-3)" },
            ]} />
            <MultiLineChart
              data={cmp.chartData}
              series={cmp.series}
              colors={["var(--accent-1)", "var(--accent-3)"]}
              height={280}
              yFmt={fmtMoneyShort}
              tipFmt={fmtMoneyFull}
            />
          </>
        ) : (
          <AreaLineChart
            data={areaData}
            height={280}
            color="var(--accent-3)"
            label="Total Arrecadado"
            yFmt={fmtMoneyShort}
            tipFmt={fmtMoneyFull}
            forecast={{ steps: 2, method: "linear-6" }}
          />
        )}
      </NidPanel>

      {/* ICMS / IPVA / IPI Breakdown */}
      {serie.length > 0 && (
        <NidPanel
          title="Composição por Tipo de Imposto (ICMS / IPVA / IPI)"
          dataset="arrecadacao"
          indicadorKey="chart_composicao_tipo"
          right={
            <PeriodoMenu
              value={periodosGrafico["chart_composicao_tipo"] || null}
              onChange={setPeriodo("chart_composicao_tipo")}
            />
          }
        >
          <StackedBarChart
            data={composicaoTipoData}
            keys={["icms", "ipva", "ipi"]}
            colors={["var(--accent-1)", "var(--accent-5)", "var(--accent-4)"]}
            height={280}
            yFmt={fmtMoneyShort}
            tipFmt={fmtMoneyFull}
          />
        </NidPanel>
      )}

      {/* Breakdown table */}
      {serie.length > 0 && (
        <NidPanel title="Detalhamento por Período" dataset="arrecadacao" indicadorKey="chart_detalhamento_periodo" sub="arrecadação mensal">
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
            pageSize={12}
          />
        </NidPanel>
      )}
      <ReleasesPanel dataset="arrecadacao" />
      </>
      )}

    </motion.div>
  );
}


