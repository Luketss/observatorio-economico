import { useEffect, useMemo, useRef, useState } from "react";
import api from "../../services/api";
import { motion } from "framer-motion";
import InsightsPanel from "../../components/InsightsPanel";
import ReleasesPanel from "../../components/ReleasesPanel";
import InfoTooltip from "../../components/InfoTooltip";
import FilterBar, { describeFilter, clearFilter } from "../../components/FilterBar";
import { janela12m, dentroDoFiltro } from "../../utils/periodoCards";
import KpiCard from "../../components/KpiCard";
import { NidPageHeader, NidPanel, NidLegend } from "../../components/nid/Panel";
import { AreaLineChart, MultiLineChart, HBarChart, DonutChart } from "../../components/nid/charts";
import CompareToggle from "../../components/nid/CompareToggle";
import { comparePanelData } from "../../utils/periodos";
import { useAuth } from "../../context/AuthContext";
import { useViewAs } from "../../context/ViewAsContext";
import KpiSkeleton from "../../components/nid/KpiSkeleton";
import SelecioneMunicipio from "../../components/nid/SelecioneMunicipio";


const fmtBRL = (v) =>
  v != null
    ? `R$ ${Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`
    : "—";

const fmtNum = (v) => (v != null ? Number(v).toLocaleString("pt-BR") : "—");

export default function PeDeMeiaPage() {
  const { user } = useAuth();
  const { viewAsId } = useViewAs();
  // ADMIN_GLOBAL precisa de um município selecionado (view-as) para escopar os
  // gráficos do dashboard; sem seleção, pedimos para escolher em vez de
  // sobrepor todos os municípios no mesmo gráfico.
  const needsMunicipio = user?.role === "ADMIN_GLOBAL" && viewAsId == null;

  const [rawSerie, setRawSerie] = useState([]);
  const [porEtapa, setPorEtapa] = useState([]);
  const [porIncentivo, setPorIncentivo] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ yearFrom: "", yearTo: "", monthFrom: "", monthTo: "" });

  // Default "12m ancorado no último dado" (guard contra sobrescrever o usuário).
  const filtroTocado = useRef(false);
  const mudarFiltros = (v) => { filtroTocado.current = true; setFilters(v); };
  const [comparar, setComparar] = useState(false);
  const cmp = useMemo(() => comparePanelData(rawSerie, { valueKey: "total_estudantes" }), [rawSerie]);

  useEffect(() => {
    Promise.all([
      api.get("/pe_de_meia/serie"),
      api.get("/pe_de_meia/por_etapa"),
      api.get("/pe_de_meia/por_incentivo"),
    ])
      .then(([serieRes, etapaRes, incentivoRes]) => {
        const raw = (serieRes.data || []).map((item) => ({
          ...item,
          periodo: `${item.ano}-${String(item.mes).padStart(2, "0")}`,
        }));
        raw.sort((a, b) => a.periodo.localeCompare(b.periodo));
        setRawSerie(raw);
        if (!filtroTocado.current) {
          setFilters(janela12m(raw, (d) => ({ ano: d.ano, mes: d.mes })));
        }
        setPorEtapa(
          (etapaRes.data || []).sort(
            (a, b) => b.total_estudantes - a.total_estudantes
          )
        );
        setPorIncentivo(
          (incentivoRes.data || []).map((d) => ({
            name: d.tipo_incentivo,
            value: d.total_estudantes,
            valor_total: d.valor_total,
          }))
        );
      })
      .catch((err) => console.error("Erro ao carregar Pé-de-Meia:", err))
      .finally(() => setLoading(false));
  }, []);

  const years = useMemo(() => [...new Set(rawSerie.map((d) => d.ano))].sort(), [rawSerie]);

  const serie = useMemo(
    () => rawSerie.filter((d) => dentroDoFiltro(d, filters, (x) => ({ ano: x.ano, mes: x.mes }))),
    [rawSerie, filters]
  );

  // Fluxo: estudantes/mês = MÉDIA no período (somar duplicaria pessoas);
  // valor = SOMA do período. Mesma série filtrada dos gráficos.
  const totaisPeriodo = useMemo(() => {
    if (!serie.length) return null;
    const soma = serie.reduce(
      (acc, d) => ({
        estudantes: acc.estudantes + (d.total_estudantes || 0),
        valor: acc.valor + (d.valor_total || 0),
      }),
      { estudantes: 0, valor: 0 }
    );
    return { mediaEstudantes: soma.estudantes / serie.length, valorTotal: soma.valor };
  }, [serie]);
  const filtroLabel = describeFilter(filters);

  const cards = [
    {
      label: "Estudantes por Mês",
      value: totaisPeriodo ? fmtNum(Math.round(totaisPeriodo.mediaEstudantes)) : "—",
      sub: filtroLabel ? `Média mensal · ${filtroLabel}` : "Média mensal · toda a série",
      accent: "var(--accent-1)",
      dataset: "pe_de_meia",
      indicadorKey: "total_estudantes",
    },
    {
      label: "Valor Total",
      value: totaisPeriodo ? fmtBRL(totaisPeriodo.valorTotal) : "—",
      sub: filtroLabel ? `Repasses · ${filtroLabel}` : "Repasses totais",
      accent: "var(--accent-5)",
      dataset: "pe_de_meia",
      indicadorKey: "valor_total",
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
        title={<>Pé-de-Meia <InfoTooltip dataset="pe_de_meia" /></>}
        sub="Incentivos financeiros a estudantes do ensino médio público."
        chips={describeFilter(filters) ? [{
          label: describeFilter(filters),
          active: true,
          onClick: () => document.getElementById("filter-bar-pedemeia")?.scrollIntoView({ block: "center", behavior: "smooth" }),
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

      <FilterBar id="filter-bar-pedemeia" years={years} showMonths value={filters} onChange={mudarFiltros} />

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {[...Array(2)].map((_, i) => <KpiSkeleton key={i} />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {cards.map((c) => (
            <KpiCard key={c.label} {...c} />
          ))}
        </div>
      )}

      <InsightsPanel dataset="pe_de_meia" />

      {/* Evolução de Estudantes */}
      <NidPanel
        title="Evolução de Estudantes Beneficiados"
        sub={comparar && cmp.temAnterior
          ? `${cmp.series[0]} vs ${cmp.series[1]} · ${
              cmp.deltaPct != null
                ? `${cmp.deltaPct >= 0 ? "+" : ""}${cmp.deltaPct.toFixed(1)}%`
                : "—"
            } no acumulado`
          : "total de estudantes beneficiados por mês"}
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
              yFmt={(v) => Number(v).toLocaleString("pt-BR")}
              tipFmt={(v) => Number(v).toLocaleString("pt-BR")}
            />
          </>
        ) : (
          <AreaLineChart
            data={serie.map((d) => ({ label: d.periodo, value: d.total_estudantes || 0 }))}
            height={280}
            color="var(--accent-5)"
            label="Estudantes"
            yFmt={(v) => Number(v).toLocaleString("pt-BR")}
            tipFmt={(v) => Number(v).toLocaleString("pt-BR")}
            loading={loading}
            emptyMessage="Sem dados disponíveis"
          />
        )}
      </NidPanel>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Estudantes por Etapa de Ensino */}
        <NidPanel title="Estudantes por Etapa de Ensino">
          <HBarChart
            data={porEtapa.map((d) => ({ label: d.etapa_ensino, value: d.total_estudantes || 0 }))}
            color="var(--accent-5)"
            fmt={(v) => Number(v).toLocaleString("pt-BR")}
            loading={loading}
            emptyMessage="Sem dados disponíveis"
          />
        </NidPanel>

        {/* Breakdown por Tipo de Incentivo */}
        <NidPanel title="Estudantes por Tipo de Incentivo">
          <DonutChart
            data={porIncentivo.map((d) => ({ label: d.name, value: d.value }))}
            baseColor="var(--accent-5)"
            height={220}
            legend
            loading={loading}
            emptyMessage="Sem dados disponíveis"
          />
        </NidPanel>
      </div>
      <ReleasesPanel dataset="pe_de_meia" />
      </>
      )}

    </motion.div>
  );
}


