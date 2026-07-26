import { useEffect, useMemo, useState } from "react";
import api from "../../services/api";
import { motion } from "framer-motion";
import InsightsPanel from "../../components/InsightsPanel";
import ReleasesPanel from "../../components/ReleasesPanel";
import NidComparativoPanel from "../../components/nid/ComparativoPanel";
import InfoTooltip from "../../components/InfoTooltip";
import FilterBar, { describeFilter, clearFilter } from "../../components/FilterBar";
import KpiCard from "../../components/KpiCard";
import { NidPageHeader, NidPanel, NidLegend } from "../../components/nid/Panel";
import { AreaLineChart, MultiLineChart, StackedBarChart } from "../../components/nid/charts";
import CompareToggle from "../../components/nid/CompareToggle";
import { comparePanelData } from "../../utils/periodos";
import { useAuth } from "../../context/AuthContext";
import { useViewAs } from "../../context/ViewAsContext";

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
  const [resumo, setResumo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ yearFrom: "", yearTo: "", monthFrom: "", monthTo: "" });
  const [comparar, setComparar] = useState(false);
  const cmp = useMemo(() => comparePanelData(rawSerie, { valueKey: "total_beneficiarios" }), [rawSerie]);

  useEffect(() => {
    Promise.all([
      api.get("/bolsa_familia/serie"),
      api.get("/bolsa_familia/resumo"),
    ])
      .then(([serieRes, resumoRes]) => {
        const raw = (serieRes.data || []).map((item) => ({
          ...item,
          periodo: `${item.ano}-${String(item.mes).padStart(2, "0")}`,
        }));
        raw.sort((a, b) => a.periodo.localeCompare(b.periodo));
        setRawSerie(raw);
        setResumo(resumoRes.data);
      })
      .catch((err) => console.error("Erro ao carregar Bolsa Família:", err))
      .finally(() => setLoading(false));
  }, []);

  const years = useMemo(() => [...new Set(rawSerie.map((d) => d.ano))].sort(), [rawSerie]);

  const serie = useMemo(() => {
    const { yearFrom, yearTo, monthFrom, monthTo } = filters;
    return rawSerie.filter((d) => {
      if (yearFrom && d.ano < +yearFrom) return false;
      if (yearTo && d.ano > +yearTo) return false;
      if (monthFrom && d.mes < +monthFrom) return false;
      if (monthTo && d.mes > +monthTo) return false;
      return true;
    });
  }, [rawSerie, filters]);

  const cards = [
    {
      label: "Total Beneficiários",
      value: fmtNum(resumo?.total_beneficiarios),
      sub: "No período",
      accent: "text-blue-600",
      dataset: "bolsa_familia",
      indicadorKey: "total_beneficiarios",
    },
    {
      label: "Valor Total",
      value: fmtBRL(resumo?.valor_total),
      sub: "Repasses totais",
      accent: "text-green-600",
      dataset: "bolsa_familia",
      indicadorKey: "valor_total",
    },
    {
      label: "Benef. Primeira Infância",
      value: fmtNum(resumo?.beneficiarios_primeira_infancia),
      sub: "Crianças até 7 anos",
      accent: "text-purple-600",
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
            município e visualizar os dados de Bolsa Família.
          </p>
        </div>
      ) : (
      <>
      <div className="flex items-center justify-end">
        <CompareToggle active={comparar} onChange={setComparar} disabled={!cmp.temAnterior} />
      </div>

      <FilterBar id="filter-bar-bolsafamilia" years={years} showMonths value={filters} onChange={setFilters} />

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[...Array(3)].map((_, i) => (
            <div
              key={i}
              className="bg-[var(--panel)] p-6 rounded-2xl border border-[var(--border)] animate-pulse h-28"
            />
          ))}
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
        sub={comparar && cmp.temAnterior
          ? `${cmp.series[0]} vs ${cmp.series[1]} · ${
              cmp.deltaPct != null
                ? `${cmp.deltaPct >= 0 ? "+" : ""}${cmp.deltaPct.toFixed(1)}%`
                : "—"
            } no acumulado`
          : "total de beneficiários por mês"}
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
            data={serie.map((d) => ({ label: d.periodo, value: d.total_beneficiarios || 0 }))}
            height={280}
            color="#3b82f6"
            label="Beneficiários"
            yFmt={(v) => Number(v).toLocaleString("pt-BR")}
            tipFmt={(v) => Number(v).toLocaleString("pt-BR")}
            loading={loading}
            emptyMessage="Sem dados disponíveis"
          />
        )}
      </NidPanel>

      {/* Beneficiários: Total vs Primeira Infância */}
      <div className="bg-[var(--panel)] p-6 rounded-2xl shadow-sm border border-[var(--border)]">
        <h3 className="text-base font-bold mb-5 text-[var(--text)]">
          Beneficiários: Total vs Primeira Infância
        </h3>
        <MultiLineChart
          data={serie.map((d) => ({
            label: d.periodo,
            "Total Beneficiários": d.total_beneficiarios || 0,
            "Primeira Infância": d.beneficiarios_primeira_infancia || 0,
          }))}
          series={["Total Beneficiários", "Primeira Infância"]}
          colors={["#3b82f6", "#8b5cf6"]}
          legend
          height={280}
          yFmt={(v) => Number(v).toLocaleString("pt-BR")}
          tipFmt={(v) => Number(v).toLocaleString("pt-BR")}
          loading={loading}
          emptyMessage="Sem dados disponíveis"
        />
      </div>

      {/* Comparativo Bolsa vs Primeira Infância */}
      <div className="bg-[var(--panel)] p-6 rounded-2xl shadow-sm border border-[var(--border)]">
        <h3 className="text-base font-bold mb-5 text-[var(--text)]">
          Repasses: Bolsa Família vs Primeira Infância
        </h3>
        <StackedBarChart
          data={serie.map((d) => ({
            label: d.periodo,
            "Valor Bolsa": d.valor_bolsa || 0,
            "Primeira Infância": d.valor_primeira_infancia || 0,
          }))}
          keys={["Valor Bolsa", "Primeira Infância"]}
          colors={["#3b82f6", "#8b5cf6"]}
          legend
          height={280}
          yFmt={(v) => `R$ ${(v / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}k`}
          tipFmt={fmtBRL}
          loading={loading}
          emptyMessage="Sem dados disponíveis"
        />
      </div>
      <NidComparativoPanel
        title="Comparativo Municipal"
        sub="Ranking por valor total pago em Bolsa Família"
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


