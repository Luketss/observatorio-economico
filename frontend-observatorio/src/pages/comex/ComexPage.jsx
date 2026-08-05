import { useEffect, useState, useMemo, useRef } from "react";
import api from "../../services/api";
import { motion } from "framer-motion";
import InsightsPanel from "../../components/InsightsPanel";
import ReleasesPanel from "../../components/ReleasesPanel";
import NidComparativoPanel from "../../components/nid/ComparativoPanel";
import InfoTooltip from "../../components/InfoTooltip";
import FilterBar, { describeFilter, clearFilter } from "../../components/FilterBar";
import { janela12m, dentroDoFiltro } from "../../utils/periodoCards";
import KpiCard from "../../components/KpiCard";
import PlanGate from "../../components/PlanGate";
import { NidPageHeader, NidPanel, NidLegend } from "../../components/nid/Panel";
import { MultiLineChart, HBarChart } from "../../components/nid/charts";
import CompareToggle from "../../components/nid/CompareToggle";
import { comparePanelData } from "../../utils/periodos";
import { useAuth } from "../../context/AuthContext";
import { useViewAs } from "../../context/ViewAsContext";
import NidSelect from "../../components/nid/NidSelect";
import KpiSkeleton from "../../components/nid/KpiSkeleton";
import SelecioneMunicipio from "../../components/nid/SelecioneMunicipio";


const fmtUSD = (v) =>
  v != null
    ? `US$ ${Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`
    : "—";

// Groups comex serie rows by {ano, mes}, summing export/import USD by tipo_operacao.
// Returns [{ano, mes, export, import, saldo}] sorted by period.
// Note: chartSerie has its own filtered variant that also accumulates peso_export/peso_import.
function groupComexByPeriod(rows) {
  const map = {};
  rows.forEach((item) => {
    const key = `${item.ano}-${item.mes}`;
    if (!map[key]) map[key] = { ano: item.ano, mes: item.mes, export: 0, import: 0 };
    const tipo = item.tipo_operacao?.toLowerCase();
    if (tipo === "exp" || tipo === "export") {
      map[key].export += item.valor_usd ?? 0;
    } else if (tipo === "imp" || tipo === "import") {
      map[key].import += item.valor_usd ?? 0;
    }
  });
  return Object.values(map)
    .sort((a, b) => a.ano !== b.ano ? a.ano - b.ano : a.mes - b.mes)
    .map((d) => ({ ...d, saldo: d.export - d.import }));
}

export default function ComexPage() {
  const { user } = useAuth();
  const { viewAsId } = useViewAs();
  // ADMIN_GLOBAL precisa de um município selecionado (view-as) para escopar os
  // gráficos do dashboard; sem seleção, pedimos para escolher em vez de
  // sobrepor todos os municípios no mesmo gráfico.
  const needsMunicipio = user?.role === "ADMIN_GLOBAL" && viewAsId == null;

  const [serie, setSerie] = useState([]);
  const [porProduto, setPorProduto] = useState([]);
  const [porPais, setPorPais] = useState([]);
  const [anoSelecionado, setAnoSelecionado] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingFilters, setLoadingFilters] = useState(false);
  const [filters, setFilters] = useState({ yearFrom: "", yearTo: "", monthFrom: "", monthTo: "" });
  const [comparar, setComparar] = useState(false);

  // Default "12m ancorado no último dado" (guard contra sobrescrever o usuário).
  const filtroTocado = useRef(false);
  const mudarFiltros = (v) => { filtroTocado.current = true; setFilters(v); };
  const rawComexSaldo = useMemo(
    () => groupComexByPeriod(serie).map((d) => ({ ano: d.ano, mes: d.mes, _v: d.saldo })),
    [serie]
  );
  const cmp = useMemo(() => comparePanelData(rawComexSaldo, { valueKey: "_v" }), [rawComexSaldo]);

  // Derive available years from serie data
  const anos = useMemo(() => {
    const set = new Set(serie.map((d) => d.ano));
    return [...set].sort((a, b) => b - a);
  }, [serie]);

  // Initial load: serie (cards de fluxo derivam dela — /comex/resumo não é mais usado)
  useEffect(() => {
    api.get("/comex/serie")
      .then((serieRes) => {
        const raw = serieRes.data || [];
        setSerie(raw);
        if (!filtroTocado.current) {
          setFilters(janela12m(raw, (d) => ({ ano: d.ano, mes: d.mes })));
        }
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
    const map = {};
    serie.forEach((item) => {
      if (!dentroDoFiltro(item, filters, (x) => ({ ano: x.ano, mes: x.mes }))) return;
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

  // Fluxo: totais do período filtrado (mesma agregação dos gráficos) — o sub
  // describeFilter agora descreve o VALOR de verdade.
  const totaisComex = useMemo(
    () =>
      chartSerie.reduce(
        (acc, d) => ({ exp: acc.exp + d.exportacoes, imp: acc.imp + d.importacoes }),
        { exp: 0, imp: 0 }
      ),
    [chartSerie]
  );
  const balancaPositiva = totaisComex.exp - totaisComex.imp >= 0;
  const filtroLabel = describeFilter(filters);

  const cards = [
    {
      label: "Total Exportado",
      value: chartSerie.length ? fmtUSD(totaisComex.exp) : "—",
      sub: filtroLabel || "Todo o período",
      accent: "var(--accent-5)",
      dataset: "comex",
      indicadorKey: "exportacoes",
    },
    {
      label: "Total Importado",
      value: chartSerie.length ? fmtUSD(totaisComex.imp) : "—",
      sub: filtroLabel || "Todo o período",
      accent: "var(--accent-4)",
      dataset: "comex",
      indicadorKey: "importacoes",
    },
    {
      label: "Balança Comercial",
      value: chartSerie.length ? fmtUSD(totaisComex.exp - totaisComex.imp) : "—",
      sub: filtroLabel ? `Exportações − Importações · ${filtroLabel}` : "Exportações − Importações",
      accent: balancaPositiva ? "var(--accent-5)" : "var(--accent-2)",
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
      <NidPageHeader
        title={<>Comércio Exterior <InfoTooltip dataset="comex" /></>}
        sub="Exportações, importações e balança comercial."
        chips={[
          describeFilter(filters) ? {
            label: describeFilter(filters),
            active: true,
            onClick: () => document.getElementById("filter-bar-comex")?.scrollIntoView({ block: "center", behavior: "smooth" }),
            onClear: () => mudarFiltros(clearFilter()),
          } : null,
        ].filter(Boolean)}
      />

      {needsMunicipio ? (
        <SelecioneMunicipio />
      ) : (
      <>
      {anos.length > 0 && (
        <div className="flex items-center gap-2">
          <label className="text-sm text-[var(--text-dim)] font-medium">Ano:</label>
          <NidSelect value={anoSelecionado} onChange={(e) => setAnoSelecionado(e.target.value)} ariaLabel="Filtrar por ano">
            {anos.map((ano) => (
              <option key={ano} value={String(ano)}>{ano}</option>
            ))}
          </NidSelect>
        </div>
      )}

      <div className="flex items-center justify-end">
        <CompareToggle active={comparar} onChange={setComparar} disabled={!cmp.temAnterior} />
      </div>

      <FilterBar id="filter-bar-comex" years={anos.slice().sort()} showMonths value={filters} onChange={mudarFiltros} />

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

      <InsightsPanel dataset="comex" />

      {/* Exportações vs Importações ao longo do tempo */}
      <NidPanel title="Exportações vs Importações">
        <MultiLineChart
          data={chartSerie.map((d) => ({
            label: d.periodo,
            "Exportações": d.exportacoes,
            "Importações": d.importacoes,
          }))}
          series={["Exportações", "Importações"]}
          colors={["var(--accent-5)", "var(--accent-4)"]}
          legend
          height={280}
          yFmt={(v) => `US$ ${(v / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}M`}
          tipFmt={fmtUSD}
          loading={loading}
          emptyMessage="Sem dados disponíveis"
        />
      </NidPanel>

      {/* Saldo — Balança Comercial Mensal */}
      {chartSerie.length > 0 && (
        <NidPanel
          title="Saldo da Balança Comercial (Mensal)"
          sub={comparar && cmp.temAnterior
            ? `${cmp.series[0]} vs ${cmp.series[1]} · ${
                cmp.deltaPct != null
                  ? `${cmp.deltaPct >= 0 ? "+" : ""}${cmp.deltaPct.toFixed(1)}%`
                  : "—"
              } no acumulado`
            : "exportações − importações por mês"}
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
                height={240}
                yFmt={(v) => `US$ ${(v / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}M`}
                tipFmt={fmtUSD}
              />
            </>
          ) : (
            <MultiLineChart
              data={chartSerie.map((d) => ({ label: d.periodo, "Saldo": d.saldo }))}
              series={["Saldo"]}
              colors={["var(--accent-3)"]}
              height={240}
              yFmt={(v) => `US$ ${(v / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}M`}
              tipFmt={fmtUSD}
            />
          )}
        </NidPanel>
      )}

      {/* Peso Total por Período (kg) */}
      {chartSerie.length > 0 && (chartSerie.some(d => d.peso_export > 0 || d.peso_import > 0)) && (
        <NidPanel title="Volume Físico — Peso Exportado vs Importado (kg)">
          <MultiLineChart
            data={chartSerie.map((d) => ({
              label: d.periodo,
              "Peso Exportado": d.peso_export,
              "Peso Importado": d.peso_import,
            }))}
            series={["Peso Exportado", "Peso Importado"]}
            colors={["var(--accent-5)", "var(--accent-4)"]}
            legend
            height={240}
            yFmt={(v) => v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M kg` : v >= 1_000 ? `${(v / 1_000).toFixed(0)}t` : `${v} kg`}
            tipFmt={(v) => `${Number(v).toLocaleString("pt-BR")} kg`}
          />
        </NidPanel>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Produtos */}
        <PlanGate planKey="comex.por_produto">
        <NidPanel title="Top 10 Produtos" sub={<>Ano: {anoSelecionado}</>}>
          <HBarChart
            data={porProduto.map((d) => ({ label: d.produto, value: d.valor_usd || 0 }))}
            color="var(--accent-4)"
            fmt={fmtUSD}
            loading={loading || loadingFilters}
            emptyMessage="Sem dados disponíveis"
          />
        </NidPanel>

        {/* Top Produtos por Peso */}
        {!loading && !loadingFilters && porProduto.length > 0 && porProduto.some(p => p.peso_kg > 0) && (
          <NidPanel title="Top Produtos por Peso" sub={<>Ano: {anoSelecionado}</>}>
            <HBarChart
              data={[...porProduto].sort((a, b) => (b.peso_kg ?? 0) - (a.peso_kg ?? 0)).slice(0, 10).map((d) => ({ label: d.produto, value: d.peso_kg || 0 }))}
              color="var(--accent-4)"
              fmt={(v) => v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M kg` : `${(v / 1_000).toFixed(0)}t`}
            />
          </NidPanel>
        )}
        </PlanGate>

        {/* Top Países */}
        <PlanGate planKey="comex.por_pais">
        <NidPanel title="Top 10 Países" sub={<>Ano: {anoSelecionado}</>}>
          <HBarChart
            data={porPais.map((d) => ({ label: d.pais, value: d.valor_usd || 0 }))}
            color="var(--accent-4)"
            fmt={fmtUSD}
            loading={loading || loadingFilters}
            emptyMessage="Sem dados disponíveis"
          />
        </NidPanel>
        </PlanGate>
      </div>
      <NidComparativoPanel
        title="Comparativo de Exportações"
        sub="Ranking municipal por valor exportado (USD)"
        endpoint="/comex/comparativo"
        metric="exportacoes"
        fmt={(v) => `US$ ${Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`}
        color="var(--accent-3)"
      />

      <ReleasesPanel dataset="comex" />
      </>
      )}

    </motion.div>
  );
}


