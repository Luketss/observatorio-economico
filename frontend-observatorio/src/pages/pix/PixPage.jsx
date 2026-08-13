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
import PlanGate from "../../components/PlanGate";
import { NidPageHeader, NidPanel, NidLegend } from "../../components/nid/Panel";
import { MultiLineChart, StackedBarChart } from "../../components/nid/charts";
import CompareToggle from "../../components/nid/CompareToggle";
import { comparePanelData } from "../../utils/periodos";
import { useAuth } from "../../context/AuthContext";
import { useViewAs } from "../../context/ViewAsContext";
import KpiSkeleton from "../../components/nid/KpiSkeleton";
import SelecioneMunicipio from "../../components/nid/SelecioneMunicipio";
import PeriodoMenu from "../../components/nid/PeriodoMenu";
import { aplicarPresetSerie } from "../../utils/periodoGrafico";

const fmtBRL = (v) =>
  v != null
    ? `R$ ${Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`
    : "—";

const fmtNum = (v) => (v != null ? Number(v).toLocaleString("pt-BR") : "—");

const extrairPeriodo = (d) => ({ ano: d.ano, mes: d.mes });

// Mesmo pós-processamento do memo `serie` (adiciona `periodo` + ordena),
// reaplicado quando um painel tem override de período (série crua filtrada
// pelo preset ainda não tem `periodo`).
function prepara(arr) {
  return arr
    .map((d) => ({
      ...d,
      periodo: `${d.ano}-${String(d.mes).padStart(2, "0")}`,
    }))
    .sort((a, b) => a.periodo.localeCompare(b.periodo));
}

export default function PixPage() {
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
  const rawSerieCmp = useMemo(
    () => rawSerie.map((d) => ({ ...d, _v: (d.vl_pagador_pf || 0) + (d.vl_pagador_pj || 0) })),
    [rawSerie]
  );
  const cmp = useMemo(() => comparePanelData(rawSerieCmp, { valueKey: "_v" }), [rawSerieCmp]);

  useEffect(() => {
    api.get("/pix/serie")
      .then((serieRes) => {
        const raw = serieRes.data || [];
        setRawSerie(raw);
        if (!filtroTocado.current) {
          setFilters(janela12m(raw, (d) => ({ ano: d.ano, mes: d.mes })));
        }
      })
      .catch((err) => console.error("Erro ao carregar PIX:", err))
      .finally(() => setLoading(false));
  }, []);

  const years = useMemo(() => {
    const set = new Set(rawSerie.map((d) => d.ano));
    return [...set].sort();
  }, [rawSerie]);

  const serie = useMemo(() => {
    return prepara(rawSerie.filter((d) => dentroDoFiltro(d, filters, (x) => ({ ano: x.ano, mes: x.mes }))));
  }, [rawSerie, filters]);

  const [periodosGrafico, setPeriodosGrafico] = useState({});
  const setPeriodo = (chave) => (preset) =>
    setPeriodosGrafico((prev) => ({ ...prev, [chave]: preset }));
  const seriePara = (chave) =>
    periodosGrafico[chave]
      ? prepara(aplicarPresetSerie(rawSerie, periodosGrafico[chave], extrairPeriodo))
      : serie;

  const seriePagamentos = seriePara("chart_vol_pagamentos");
  const serieRecebimentos = seriePara("chart_vol_recebimentos");
  const serieTransacoes = seriePara("chart_qtd_transacoes");
  const seriePagadores = seriePara("chart_pagadores_unicos");
  const serieRecebedores = seriePara("chart_recebedores_unicos");

  // Fluxo: somas do período filtrado (mesma série dos gráficos).
  const totais = useMemo(
    () =>
      serie.reduce(
        (acc, d) => ({
          pf: acc.pf + (d.vl_pagador_pf || 0),
          pj: acc.pj + (d.vl_pagador_pj || 0),
          qt: acc.qt + (d.qt_pagador_pf || 0) + (d.qt_pagador_pj || 0),
        }),
        { pf: 0, pj: 0, qt: 0 }
      ),
    [serie]
  );
  const filtroLabel = describeFilter(filters);

  const cards = [
    {
      label: "Volume PF (Pagamentos)",
      value: serie.length ? fmtBRL(totais.pf) : "—",
      sub: filtroLabel || "Total acumulado",
      accent: "var(--accent-1)",
      dataset: "pix",
      indicadorKey: "volume_pf",
    },
    {
      label: "Volume PJ (Pagamentos)",
      value: serie.length ? fmtBRL(totais.pj) : "—",
      sub: filtroLabel || "Total acumulado",
      accent: "var(--accent-5)",
      dataset: "pix",
      indicadorKey: "volume_pj",
    },
    {
      label: "Total de Transações",
      value: serie.length ? fmtNum(totais.qt) : "—",
      sub: filtroLabel ? `PF + PJ (pagadores) · ${filtroLabel}` : "PF + PJ (pagadores)",
      accent: "var(--accent-3)",
      dataset: "pix",
      indicadorKey: "volume_total",
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
        title={<>PIX — Transações Instantâneas <InfoTooltip dataset="pix" /></>}
        sub="Volumes e quantidade de transações PIX por mês (Banco Central do Brasil)."
        chips={describeFilter(filters) ? [{
          label: describeFilter(filters),
          active: true,
          onClick: () => document.getElementById("filter-bar-pix")?.scrollIntoView({ block: "center", behavior: "smooth" }),
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

      <FilterBar id="filter-bar-pix" years={years} showMonths value={filters} onChange={mudarFiltros} />

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[...Array(3)].map((_, i) => <KpiSkeleton key={i} />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {cards.map((c) => <KpiCard key={c.label} {...c} />)}
        </div>
      )}

      <InsightsPanel dataset="pix" />

      {/* Volume PF vs PJ — Pagamentos */}
      <PlanGate planKey="pix.detalhado">
      <NidPanel
        title="Volume de Pagamentos — PF vs PJ"
        dataset="pix"
        indicadorKey="chart_vol_pagamentos"
        sub={comparar && cmp.temAnterior
          ? `${cmp.series[0]} vs ${cmp.series[1]} · ${
              cmp.deltaPct != null
                ? `${cmp.deltaPct >= 0 ? "+" : ""}${cmp.deltaPct.toFixed(1)}%`
                : "—"
            } no acumulado`
          : "volume mensal PF + PJ"}
        right={!comparar ? (
          <PeriodoMenu
            value={periodosGrafico["chart_vol_pagamentos"] || null}
            onChange={setPeriodo("chart_vol_pagamentos")}
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
              yFmt={(v) => `R$ ${(v / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}M`}
              tipFmt={fmtBRL}
            />
          </>
        ) : (
          <MultiLineChart
            data={seriePagamentos.map((d) => ({ label: d.periodo, "Volume PF": d.vl_pagador_pf || 0, "Volume PJ": d.vl_pagador_pj || 0 }))}
            series={["Volume PF", "Volume PJ"]}
            colors={["var(--accent-1)", "var(--accent-5)"]}
            height={280}
            legend
            yFmt={(v) => `R$ ${(v / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}M`}
            tipFmt={fmtBRL}
          />
        )}
      </NidPanel>

      {/* Volume Recebimentos — PF vs PJ */}
      <NidPanel
        title="Volume de Recebimentos — PF vs PJ"
        dataset="pix"
        indicadorKey="chart_vol_recebimentos"
        right={
          <PeriodoMenu
            value={periodosGrafico["chart_vol_recebimentos"] || null}
            onChange={setPeriodo("chart_vol_recebimentos")}
          />
        }
      >
        <MultiLineChart
          emptyMessage="Sem dados disponíveis"
          data={serieRecebimentos.map((d) => ({ label: d.periodo, "Recebimento PF": d.vl_recebedor_pf || 0, "Recebimento PJ": d.vl_recebedor_pj || 0 }))}
          series={["Recebimento PF", "Recebimento PJ"]}
          colors={["var(--accent-3)", "var(--accent-4)"]}
          height={240}
          legend
          yFmt={(v) => `R$ ${(v / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}M`}
          tipFmt={fmtBRL}
        />
      </NidPanel>

      {/* Quantidade de Transações */}
      <NidPanel
        title="Quantidade de Transações (Pagadores)"
        dataset="pix"
        indicadorKey="chart_qtd_transacoes"
        right={
          <PeriodoMenu
            value={periodosGrafico["chart_qtd_transacoes"] || null}
            onChange={setPeriodo("chart_qtd_transacoes")}
          />
        }
      >
        <StackedBarChart
          emptyMessage="Sem dados disponíveis"
          data={serieTransacoes.map((d) => ({ label: d.periodo, "Transações PF": d.qt_pagador_pf || 0, "Transações PJ": d.qt_pagador_pj || 0 }))}
          keys={["Transações PF", "Transações PJ"]}
          colors={["var(--accent-1)", "var(--accent-5)"]}
          height={240}
          legend
          yFmt={(v) => Number(v).toLocaleString("pt-BR")}
          tipFmt={(v) => Number(v).toLocaleString("pt-BR")}
        />
      </NidPanel>

      {/* Pessoas Únicas Pagadoras */}
      <NidPanel
        title="Pessoas Únicas Pagadoras"
        dataset="pix"
        indicadorKey="chart_pagadores_unicos"
        right={
          <PeriodoMenu
            value={periodosGrafico["chart_pagadores_unicos"] || null}
            onChange={setPeriodo("chart_pagadores_unicos")}
          />
        }
      >
        <MultiLineChart
          emptyMessage="Sem dados disponíveis"
          data={seriePagadores.map((d) => ({ label: d.periodo, "Pessoas PF": d.qt_pes_pagador_pf || 0, "Pessoas PJ": d.qt_pes_pagador_pj || 0 }))}
          series={["Pessoas PF", "Pessoas PJ"]}
          colors={["var(--accent-3)", "var(--accent-4)"]}
          height={240}
          legend
          yFmt={(v) => Number(v).toLocaleString("pt-BR")}
          tipFmt={(v) => Number(v).toLocaleString("pt-BR")}
        />
      </NidPanel>

      {/* Pessoas Únicas Recebedoras */}
      <NidPanel
        title="Pessoas Únicas Recebedoras"
        dataset="pix"
        indicadorKey="chart_recebedores_unicos"
        right={
          <PeriodoMenu
            value={periodosGrafico["chart_recebedores_unicos"] || null}
            onChange={setPeriodo("chart_recebedores_unicos")}
          />
        }
      >
        <MultiLineChart
          emptyMessage="Sem dados disponíveis"
          data={serieRecebedores.map((d) => ({ label: d.periodo, "Recebedores PF": d.qt_pes_recebedor_pf || 0, "Recebedores PJ": d.qt_pes_recebedor_pj || 0 }))}
          series={["Recebedores PF", "Recebedores PJ"]}
          colors={["var(--accent-7)", "var(--accent-2)"]}
          height={240}
          legend
          yFmt={(v) => Number(v).toLocaleString("pt-BR")}
          tipFmt={(v) => Number(v).toLocaleString("pt-BR")}
        />
      </NidPanel>
      </PlanGate>
      <NidComparativoPanel
        title="Comparativo Municipal · PIX"
        sub="Ranking por volume total transacionado (PF + PJ pagador)"
        dataset="pix"
        indicadorKey="chart_comparativo_municipios"
        endpoint="/pix/comparativo"
        metric="volume_total"
        fmt={(v) => `R$ ${Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`}
        color="var(--accent-3)"
      />

      <ReleasesPanel dataset="pix" />
      </>
      )}

    </motion.div>
  );
}


