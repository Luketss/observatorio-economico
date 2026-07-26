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
import { NidPageHeader, NidPanel, NidLegend } from "../../components/nid/Panel";
import { MultiLineChart, StackedBarChart } from "../../components/nid/charts";
import CompareToggle from "../../components/nid/CompareToggle";
import { comparePanelData } from "../../utils/periodos";
import ChartState from "../../components/nid/ChartState.jsx";
import { useAuth } from "../../context/AuthContext";
import { useViewAs } from "../../context/ViewAsContext";

function ChartCard({ title, children, empty }) {
  return (
    <div className="bg-[var(--panel)] p-6 rounded-2xl shadow-sm border border-[var(--border)]">
      <h3 className="text-base font-bold mb-5 text-[var(--text)]">{title}</h3>
      {empty ? (
        <div className="h-60 flex items-center justify-center text-[var(--text-mute)] text-sm">
          Sem dados disponíveis
        </div>
      ) : (
        children
      )}
    </div>
  );
}

const fmtBRL = (v) =>
  v != null
    ? `R$ ${Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`
    : "—";

const fmtNum = (v) => (v != null ? Number(v).toLocaleString("pt-BR") : "—");

export default function PixPage() {
  const { user } = useAuth();
  const { viewAsId } = useViewAs();
  // ADMIN_GLOBAL precisa de um município selecionado (view-as) para escopar os
  // gráficos do dashboard; sem seleção, pedimos para escolher em vez de
  // sobrepor todos os municípios no mesmo gráfico.
  const needsMunicipio = user?.role === "ADMIN_GLOBAL" && viewAsId == null;

  const [rawSerie, setRawSerie] = useState([]);
  const [resumo, setResumo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ yearFrom: "", yearTo: "", monthFrom: "", monthTo: "" });
  const [comparar, setComparar] = useState(false);
  const rawSerieCmp = useMemo(
    () => rawSerie.map((d) => ({ ...d, _v: (d.vl_pagador_pf || 0) + (d.vl_pagador_pj || 0) })),
    [rawSerie]
  );
  const cmp = useMemo(() => comparePanelData(rawSerieCmp, { valueKey: "_v" }), [rawSerieCmp]);

  useEffect(() => {
    Promise.all([api.get("/pix/serie"), api.get("/pix/resumo")])
      .then(([serieRes, resumoRes]) => {
        setRawSerie(serieRes.data || []);
        setResumo(resumoRes.data);
      })
      .catch((err) => console.error("Erro ao carregar PIX:", err))
      .finally(() => setLoading(false));
  }, []);

  const years = useMemo(() => {
    const set = new Set(rawSerie.map((d) => d.ano));
    return [...set].sort();
  }, [rawSerie]);

  const serie = useMemo(() => {
    const { yearFrom, yearTo, monthFrom, monthTo } = filters;
    return rawSerie
      .filter((d) => {
        if (yearFrom && d.ano < +yearFrom) return false;
        if (yearTo && d.ano > +yearTo) return false;
        if (monthFrom && d.mes < +monthFrom) return false;
        if (monthTo && d.mes > +monthTo) return false;
        return true;
      })
      .map((d) => ({
        ...d,
        periodo: `${d.ano}-${String(d.mes).padStart(2, "0")}`,
      }))
      .sort((a, b) => a.periodo.localeCompare(b.periodo));
  }, [rawSerie, filters]);

  const cards = [
    {
      label: "Volume PF (Pagamentos)",
      value: resumo ? fmtBRL(resumo.volume_total_pf) : "—",
      sub: "Total acumulado",
      accent: "text-blue-600",
      dataset: "pix",
      indicadorKey: "volume_pf",
    },
    {
      label: "Volume PJ (Pagamentos)",
      value: resumo ? fmtBRL(resumo.volume_total_pj) : "—",
      sub: "Total acumulado",
      accent: "text-green-600",
      dataset: "pix",
      indicadorKey: "volume_pj",
    },
    {
      label: "Total de Transações",
      value: resumo ? fmtNum(resumo.total_transacoes) : "—",
      sub: "PF + PJ (pagadores)",
      accent: "text-purple-600",
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
            município e visualizar os dados de PIX.
          </p>
        </div>
      ) : (
      <>
      <div className="flex items-center justify-end">
        <CompareToggle active={comparar} onChange={setComparar} disabled={!cmp.temAnterior} />
      </div>

      <FilterBar id="filter-bar-pix" years={years} showMonths value={filters} onChange={setFilters} />

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
          {cards.map((c) => <KpiCard key={c.label} {...c} />)}
        </div>
      )}

      <InsightsPanel dataset="pix" />

      {/* Volume PF vs PJ — Pagamentos */}
      <PlanGate planKey="pix.detalhado">
      <NidPanel
        title="Volume de Pagamentos — PF vs PJ"
        sub={comparar && cmp.temAnterior
          ? `${cmp.series[0]} vs ${cmp.series[1]} · ${
              cmp.deltaPct != null
                ? `${cmp.deltaPct >= 0 ? "+" : ""}${cmp.deltaPct.toFixed(1)}%`
                : "—"
            } no acumulado`
          : "volume mensal PF + PJ"}
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
            data={serie.map((d) => ({ label: d.periodo, "Volume PF": d.vl_pagador_pf || 0, "Volume PJ": d.vl_pagador_pj || 0 }))}
            series={["Volume PF", "Volume PJ"]}
            colors={["#3b82f6", "#10b981"]}
            height={280}
            legend
            yFmt={(v) => `R$ ${(v / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}M`}
            tipFmt={fmtBRL}
          />
        )}
      </NidPanel>

      {/* Volume Recebimentos — PF vs PJ */}
      <ChartCard title="Volume de Recebimentos — PF vs PJ" empty={serie.length === 0}>
        <MultiLineChart
          data={serie.map((d) => ({ label: d.periodo, "Recebimento PF": d.vl_recebedor_pf || 0, "Recebimento PJ": d.vl_recebedor_pj || 0 }))}
          series={["Recebimento PF", "Recebimento PJ"]}
          colors={["#8b5cf6", "#f59e0b"]}
          height={240}
          legend
          yFmt={(v) => `R$ ${(v / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}M`}
          tipFmt={fmtBRL}
        />
      </ChartCard>

      {/* Quantidade de Transações */}
      <ChartCard title="Quantidade de Transações (Pagadores)" empty={serie.length === 0}>
        <StackedBarChart
          data={serie.map((d) => ({ label: d.periodo, "Transações PF": d.qt_pagador_pf || 0, "Transações PJ": d.qt_pagador_pj || 0 }))}
          keys={["Transações PF", "Transações PJ"]}
          colors={["#3b82f6", "#10b981"]}
          height={240}
          legend
          yFmt={(v) => Number(v).toLocaleString("pt-BR")}
          tipFmt={(v) => Number(v).toLocaleString("pt-BR")}
        />
      </ChartCard>

      {/* Pessoas Únicas Pagadoras */}
      <ChartCard title="Pessoas Únicas Pagadoras" empty={serie.length === 0}>
        <MultiLineChart
          data={serie.map((d) => ({ label: d.periodo, "Pessoas PF": d.qt_pes_pagador_pf || 0, "Pessoas PJ": d.qt_pes_pagador_pj || 0 }))}
          series={["Pessoas PF", "Pessoas PJ"]}
          colors={["#8b5cf6", "#f97316"]}
          height={240}
          legend
          yFmt={(v) => Number(v).toLocaleString("pt-BR")}
          tipFmt={(v) => Number(v).toLocaleString("pt-BR")}
        />
      </ChartCard>

      {/* Pessoas Únicas Recebedoras */}
      <ChartCard title="Pessoas Únicas Recebedoras" empty={serie.length === 0}>
        <MultiLineChart
          data={serie.map((d) => ({ label: d.periodo, "Recebedores PF": d.qt_pes_recebedor_pf || 0, "Recebedores PJ": d.qt_pes_recebedor_pj || 0 }))}
          series={["Recebedores PF", "Recebedores PJ"]}
          colors={["#06b6d4", "#f43f5e"]}
          height={240}
          legend
          yFmt={(v) => Number(v).toLocaleString("pt-BR")}
          tipFmt={(v) => Number(v).toLocaleString("pt-BR")}
        />
      </ChartCard>
      </PlanGate>
      <NidComparativoPanel
        title="Comparativo Municipal · PIX"
        sub="Ranking por volume total transacionado (PF + PJ pagador)"
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


