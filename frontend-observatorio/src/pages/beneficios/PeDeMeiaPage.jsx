import { useEffect, useMemo, useState } from "react";
import api from "../../services/api";
import { motion } from "framer-motion";
import InsightsPanel from "../../components/InsightsPanel";
import ReleasesPanel from "../../components/ReleasesPanel";
import InfoTooltip from "../../components/InfoTooltip";
import FilterBar from "../../components/FilterBar";
import KpiCard from "../../components/KpiCard";
import { NidPanel, NidLegend } from "../../components/nid/Panel";
import { AreaLineChart, MultiLineChart, HBarChart, DonutChart } from "../../components/nid/charts";
import CompareToggle from "../../components/nid/CompareToggle";
import { comparePanelData } from "../../utils/periodos";
import { useAuth } from "../../context/AuthContext";
import { useViewAs } from "../../context/ViewAsContext";


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
  const [resumo, setResumo] = useState(null);
  const [porEtapa, setPorEtapa] = useState([]);
  const [porIncentivo, setPorIncentivo] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ yearFrom: "", yearTo: "", monthFrom: "", monthTo: "" });
  const [comparar, setComparar] = useState(false);
  const cmp = useMemo(() => comparePanelData(rawSerie, { valueKey: "total_estudantes" }), [rawSerie]);

  useEffect(() => {
    Promise.all([
      api.get("/pe_de_meia/serie"),
      api.get("/pe_de_meia/resumo"),
      api.get("/pe_de_meia/por_etapa"),
      api.get("/pe_de_meia/por_incentivo"),
    ])
      .then(([serieRes, resumoRes, etapaRes, incentivoRes]) => {
        const raw = (serieRes.data || []).map((item) => ({
          ...item,
          periodo: `${item.ano}-${String(item.mes).padStart(2, "0")}`,
        }));
        raw.sort((a, b) => a.periodo.localeCompare(b.periodo));
        setRawSerie(raw);
        setResumo(resumoRes.data);
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
      label: "Total Estudantes",
      value: fmtNum(resumo?.total_estudantes),
      sub: "No período",
      accent: "text-blue-600",
      dataset: "pe_de_meia",
      indicadorKey: "total_estudantes",
    },
    {
      label: "Valor Total",
      value: fmtBRL(resumo?.valor_total),
      sub: "Repasses totais",
      accent: "text-green-600",
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
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-extrabold tracking-tight text-[var(--text)]">
            Pé-de-Meia
          </h1>
          <InfoTooltip dataset="pe_de_meia" />
        </div>
        <p className="text-sm text-[var(--text-mute)] mt-1">
          Incentivos financeiros a estudantes do ensino médio público.
        </p>
      </div>

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
            município e visualizar os dados de Pé-de-Meia.
          </p>
        </div>
      ) : (
      <>
      <InsightsPanel dataset="pe_de_meia" />

      <div className="flex items-center justify-end">
        <CompareToggle active={comparar} onChange={setComparar} disabled={!cmp.temAnterior} />
      </div>

      <FilterBar years={years} showMonths value={filters} onChange={setFilters} />

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {[...Array(2)].map((_, i) => (
            <div
              key={i}
              className="bg-[var(--panel)] p-6 rounded-2xl border border-[var(--border)] animate-pulse h-28"
            />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {cards.map((c) => (
            <KpiCard key={c.label} {...c} />
          ))}
        </div>
      )}

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
        <div className="bg-[var(--panel)] p-6 rounded-2xl shadow-sm border border-[var(--border)]">
          <h3 className="text-base font-bold mb-5 text-[var(--text)]">
            Estudantes por Etapa de Ensino
          </h3>
          <HBarChart
            data={porEtapa.map((d) => ({ label: d.etapa_ensino, value: d.total_estudantes || 0 }))}
            color="var(--accent-5)"
            fmt={(v) => Number(v).toLocaleString("pt-BR")}
            loading={loading}
            emptyMessage="Sem dados disponíveis"
          />
        </div>

        {/* Breakdown por Tipo de Incentivo */}
        <div className="bg-[var(--panel)] p-6 rounded-2xl shadow-sm border border-[var(--border)]">
          <h3 className="text-base font-bold mb-5 text-[var(--text)]">
            Estudantes por Tipo de Incentivo
          </h3>
          <DonutChart
            data={porIncentivo.map((d) => ({ label: d.name, value: d.value }))}
            baseColor="var(--accent-5)"
            height={220}
            legend
            loading={loading}
            emptyMessage="Sem dados disponíveis"
          />
        </div>
      </div>
      <ReleasesPanel dataset="pe_de_meia" />
      </>
      )}

    </motion.div>
  );
}


