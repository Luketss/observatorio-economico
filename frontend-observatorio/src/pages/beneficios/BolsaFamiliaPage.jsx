import { useEffect, useMemo, useRef, useState } from "react";
import api from "../../services/api";
import { motion } from "framer-motion";
import InsightsPanel from "../../components/InsightsPanel";
import ReleasesPanel from "../../components/ReleasesPanel";
import NidComparativoPanel from "../../components/nid/ComparativoPanel";
import InfoTooltip from "../../components/InfoTooltip";
import FilterBar, { describeFilter, clearFilter } from "../../components/FilterBar";
import { janela12m, dentroDoFiltro } from "../../utils/periodoCards";
import KpiCard from "../../components/KpiCard";
import { NidPageHeader, NidPanel, NidLegend } from "../../components/nid/Panel";
import { AreaLineChart, MultiLineChart, StackedBarChart } from "../../components/nid/charts";
import CompareToggle from "../../components/nid/CompareToggle";
import { comparePanelData } from "../../utils/periodos";
import { useAuth } from "../../context/AuthContext";
import { useViewAs } from "../../context/ViewAsContext";
import KpiSkeleton from "../../components/nid/KpiSkeleton";
import SelecioneMunicipio from "../../components/nid/SelecioneMunicipio";
import PeriodoMenu from "../../components/nid/PeriodoMenu";
import { resolverSeriePainel } from "../../utils/periodoGrafico";

const fmtBRL = (v) =>
  v != null
    ? `R$ ${Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`
    : "—";

const fmtNum = (v) => (v != null ? Number(v).toLocaleString("pt-BR") : "—");

export default function BolsaFamiliaPage() {
  const { user } = useAuth();
  const { viewAsId } = useViewAs();
  // ADMIN_GLOBAL precisa de um município selecionado (view-as) para escopar os
  // gráficos do dashboard; sem seleção, pedimos para escolher em vez de
  // sobrepor todos os municípios no mesmo gráfico.
  const needsMunicipio = user?.role === "ADMIN_GLOBAL" && viewAsId == null;

  const [rawSerie, setRawSerie] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ yearFrom: "", yearTo: "", monthFrom: "", monthTo: "" });

  // Default "12m ancorado no último dado" (guard contra sobrescrever o usuário).
  const filtroTocado = useRef(false);
  const mudarFiltros = (v) => { filtroTocado.current = true; setFilters(v); };
  const [comparar, setComparar] = useState(false);
  const cmp = useMemo(() => comparePanelData(rawSerie, { valueKey: "total_beneficiarios" }), [rawSerie]);

  useEffect(() => {
    api.get("/bolsa_familia/serie")
      .then((serieRes) => {
        const raw = (serieRes.data || []).map((item) => ({
          ...item,
          periodo: `${item.ano}-${String(item.mes).padStart(2, "0")}`,
        }));
        raw.sort((a, b) => a.periodo.localeCompare(b.periodo));
        setRawSerie(raw);
        if (!filtroTocado.current) {
          setFilters(janela12m(raw, (d) => ({ ano: d.ano, mes: d.mes })));
        }
      })
      .catch((err) => console.error("Erro ao carregar Bolsa Família:", err))
      .finally(() => setLoading(false));
  }, []);

  const years = useMemo(() => [...new Set(rawSerie.map((d) => d.ano))].sort(), [rawSerie]);

  const serie = useMemo(
    () => rawSerie.filter((d) => dentroDoFiltro(d, filters, (x) => ({ ano: x.ano, mes: x.mes }))),
    [rawSerie, filters]
  );

  const [periodosGrafico, setPeriodosGrafico] = useState({});
  const setPeriodo = (chave) => (preset) =>
    setPeriodosGrafico((prev) => ({ ...prev, [chave]: preset }));
  const seriePara = (chave) =>
    resolverSeriePainel({
      rawSerie,
      seriePagina: serie,
      preset: periodosGrafico[chave],
      extrair: (d) => ({ ano: d.ano, mes: d.mes }),
    });

  const serieEvolucaoBeneficiarios = seriePara("chart_evolucao_beneficiarios");
  const serieTotalVsPrimeiraInfancia = seriePara("chart_total_vs_primeira_infancia");
  const serieRepasses = seriePara("chart_repasses");

  // Fluxo: contagens mensais viram MÉDIA no período (somar duplicaria famílias);
  // valores em R$ são SOMA do período. Mesma série filtrada dos gráficos.
  const totaisPeriodo = useMemo(() => {
    if (!serie.length) return null;
    const soma = serie.reduce(
      (acc, d) => ({
        benef: acc.benef + (d.total_beneficiarios || 0),
        valor: acc.valor + (d.valor_total || 0),
        pi: acc.pi + (d.beneficiarios_primeira_infancia || 0),
      }),
      { benef: 0, valor: 0, pi: 0 }
    );
    return {
      mediaBenef: soma.benef / serie.length,
      valorTotal: soma.valor,
      mediaPi: soma.pi / serie.length,
    };
  }, [serie]);
  const filtroLabel = describeFilter(filters);

  const cards = [
    {
      label: "Beneficiários por Mês",
      value: totaisPeriodo ? fmtNum(Math.round(totaisPeriodo.mediaBenef)) : "—",
      sub: filtroLabel ? `Média mensal · ${filtroLabel}` : "Média mensal · toda a série",
      accent: "var(--accent-1)",
      dataset: "bolsa_familia",
      indicadorKey: "total_beneficiarios",
    },
    {
      label: "Valor Total",
      value: totaisPeriodo ? fmtBRL(totaisPeriodo.valorTotal) : "—",
      sub: filtroLabel ? `Repasses · ${filtroLabel}` : "Repasses de toda a série",
      accent: "var(--accent-5)",
      dataset: "bolsa_familia",
      indicadorKey: "valor_total",
    },
    {
      label: "Benef. Primeira Infância",
      value: totaisPeriodo ? fmtNum(Math.round(totaisPeriodo.mediaPi)) : "—",
      sub: filtroLabel
        ? `Crianças até 7 anos · média/mês · ${filtroLabel}`
        : "Crianças até 7 anos · média/mês",
      accent: "var(--accent-3)",
      dataset: "bolsa_familia",
      indicadorKey: "media_por_beneficiario",
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
        title={<>Bolsa Família <InfoTooltip dataset="bolsa_familia" /></>}
        sub="Beneficiários e repasses do Programa Bolsa Família."
        chips={describeFilter(filters) ? [{
          label: describeFilter(filters),
          active: true,
          onClick: () => document.getElementById("filter-bar-bolsafamilia")?.scrollIntoView({ block: "center", behavior: "smooth" }),
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

      <FilterBar id="filter-bar-bolsafamilia" years={years} showMonths value={filters} onChange={mudarFiltros} />

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

      <InsightsPanel dataset="bolsa_familia" />

      {/* Evolução de Beneficiários */}
      <NidPanel
        title="Evolução de Beneficiários"
        dataset="bolsa_familia"
        indicadorKey="chart_evolucao_beneficiarios"
        sub={comparar && cmp.temAnterior
          ? `${cmp.series[0]} vs ${cmp.series[1]} · ${
              cmp.deltaPct != null
                ? `${cmp.deltaPct >= 0 ? "+" : ""}${cmp.deltaPct.toFixed(1)}%`
                : "—"
            } no acumulado`
          : "total de beneficiários por mês"}
        right={!comparar ? (
          <PeriodoMenu
            value={periodosGrafico["chart_evolucao_beneficiarios"] || null}
            onChange={setPeriodo("chart_evolucao_beneficiarios")}
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
              yFmt={(v) => Number(v).toLocaleString("pt-BR")}
              tipFmt={(v) => Number(v).toLocaleString("pt-BR")}
            />
          </>
        ) : (
          <AreaLineChart
            data={serieEvolucaoBeneficiarios.map((d) => ({ label: d.periodo, value: d.total_beneficiarios || 0 }))}
            height={280}
            color="var(--accent-1)"
            label="Beneficiários"
            yFmt={(v) => Number(v).toLocaleString("pt-BR")}
            tipFmt={(v) => Number(v).toLocaleString("pt-BR")}
            loading={loading}
            emptyMessage="Sem dados disponíveis"
          />
        )}
      </NidPanel>

      {/* Beneficiários: Total vs Primeira Infância */}
      <NidPanel
        title="Beneficiários: Total vs Primeira Infância"
        dataset="bolsa_familia"
        indicadorKey="chart_total_vs_primeira_infancia"
        right={
          <PeriodoMenu
            value={periodosGrafico["chart_total_vs_primeira_infancia"] || null}
            onChange={setPeriodo("chart_total_vs_primeira_infancia")}
          />
        }
      >
        <MultiLineChart
          data={serieTotalVsPrimeiraInfancia.map((d) => ({
            label: d.periodo,
            "Total Beneficiários": d.total_beneficiarios || 0,
            "Primeira Infância": d.beneficiarios_primeira_infancia || 0,
          }))}
          series={["Total Beneficiários", "Primeira Infância"]}
          colors={["var(--accent-1)", "var(--accent-3)"]}
          legend
          height={280}
          yFmt={(v) => Number(v).toLocaleString("pt-BR")}
          tipFmt={(v) => Number(v).toLocaleString("pt-BR")}
          loading={loading}
          emptyMessage="Sem dados disponíveis"
        />
      </NidPanel>

      {/* Comparativo Bolsa vs Primeira Infância */}
      <NidPanel
        title="Repasses: Bolsa Família vs Primeira Infância"
        dataset="bolsa_familia"
        indicadorKey="chart_repasses"
        right={
          <PeriodoMenu
            value={periodosGrafico["chart_repasses"] || null}
            onChange={setPeriodo("chart_repasses")}
          />
        }
      >
        <StackedBarChart
          data={serieRepasses.map((d) => ({
            label: d.periodo,
            "Valor Bolsa": d.valor_bolsa || 0,
            "Primeira Infância": d.valor_primeira_infancia || 0,
          }))}
          keys={["Valor Bolsa", "Primeira Infância"]}
          colors={["var(--accent-1)", "var(--accent-3)"]}
          legend
          height={280}
          yFmt={(v) => `R$ ${(v / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}k`}
          tipFmt={fmtBRL}
          loading={loading}
          emptyMessage="Sem dados disponíveis"
        />
      </NidPanel>
      <NidComparativoPanel
        title="Comparativo Municipal"
        sub="Ranking por valor total pago em Bolsa Família"
        dataset="bolsa_familia"
        indicadorKey="chart_comparativo_municipios"
        endpoint="/bolsa_familia/comparativo"
        metric="valor_total"
        fmt={(v) => `R$ ${Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`}
        color="var(--accent-1)"
      />

      <ReleasesPanel dataset="bolsa_familia" />
      </>
      )}

    </motion.div>
  );
}


