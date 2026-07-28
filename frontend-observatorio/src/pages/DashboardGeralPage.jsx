import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import api from "../services/api";
import { useAuth } from "../context/AuthContext";
import InsightsPanel from "../components/InsightsPanel";
import PrioridadesPanel from "../components/PrioridadesPanel";
import ReleasesPanel from "../components/ReleasesPanel";
import KpiCard from "../components/KpiCard";
import KpiSkeleton from "../components/nid/KpiSkeleton";
import {
  NidPageHeader,
  NidPanel,
  NidLegend,
  NidInsight,
  NidKpiHero,
} from "../components/nid/Panel";
import {
  AreaLineChart,
  DonutChart,
  StackedBarChart,
  MultiLineChart,
  TwinBarChart,
  HBarChart,
  fmtMoneyShort,
  fmtMoneyFull,
  fmtNumber,
} from "../components/nid/charts";
import { ChartHoverProvider } from "../components/nid/ChartHoverContext";
import {
  StarIcon, UserGroupIcon, HomeIcon, HeartIcon, AcademicCapIcon,
  TruckIcon, ChartBarIcon, BuildingOfficeIcon, BoltIcon, GlobeAltIcon,
} from "@heroicons/react/24/outline";

const CUSTOM_ICON_MAP = {
  StarIcon, UserGroupIcon, HomeIcon, HeartIcon, AcademicCapIcon,
  TruckIcon, ChartBarIcon, BuildingOfficeIcon, BoltIcon, GlobeAltIcon,
};
const CUSTOM_COLOR_MAP = {
  blue:   { bg: "bg-[var(--panel-2)]",     text: "var(--accent-1)" },
  green:  { bg: "bg-[var(--panel-2)]",   text: "var(--accent-5)" },
  purple: { bg: "bg-[var(--panel-2)]", text: "var(--accent-3)" },
  orange: { bg: "bg-[var(--panel-2)]", text: "var(--accent-4)" },
  red:    { bg: "bg-[var(--panel-2)]",       text: "var(--accent-2)" },
  slate:  { bg: "bg-[var(--panel-2)]",     text: "text-[var(--text-dim)]" },
};

const A1 = "var(--accent-1)";
const A2 = "var(--accent-2)";
const A3 = "var(--accent-3)";
const A4 = "var(--accent-4)";
const A5 = "var(--accent-5)";

const MES_LABEL = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

const fmtBR = (v, opts = {}) => v != null ? Number(v).toLocaleString("pt-BR", opts) : "—";

function moneyDisplay(v) {
  if (v == null) return { value: "—", unit: "" };
  const a = Math.abs(v);
  if (a >= 1e9) return { value: `R$ ${(v / 1e9).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}`, unit: "Bi" };
  if (a >= 1e6) return { value: `R$ ${(v / 1e6).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}`, unit: "Mi" };
  if (a >= 1e3) return { value: `R$ ${(v / 1e3).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`, unit: "k" };
  return { value: `R$ ${fmtBR(v)}`, unit: "" };
}

function pctDelta(p) {
  if (p == null) return null;
  return { v: `${p > 0 ? "+" : ""}${Number(p).toFixed(1)}%`, up: p > 0 ? true : p < 0 ? false : null };
}

export default function DashboardGeralPage() {
  const { user } = useAuth();
  const isGlobal = user?.role === "ADMIN_GLOBAL";

  const [pibResumo, setPibResumo] = useState(null);
  const [pibSerie, setPibSerie] = useState([]);
  const [pibComparativo, setPibComparativo] = useState([]);
  const [arrecResumo, setArrecResumo] = useState(null);
  const [arrecPorTipo, setArrecPorTipo] = useState([]);
  const [cagedResumo, setCagedResumo] = useState(null);
  const [cagedSerie, setCagedSerie] = useState([]);
  const [customCards, setCustomCards] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    async function fetchAll() {
      const safeGet = (url, params) =>
        api.get(url, params ? { params } : undefined).then((r) => r.data).catch(() => null);

      const [
        pibRes, pibSerieRes, pibCompRes,
        arrecRes, arrecTipoRes,
        cagedRes, cagedSerieRes,
        cardsRes,
      ] = await Promise.all([
        safeGet("/pib/resumo"),
        safeGet("/pib/serie"),
        safeGet("/pib/comparativo"),
        safeGet("/arrecadacao/resumo"),
        safeGet("/arrecadacao/por_tipo"),
        safeGet("/caged/resumo"),
        safeGet("/caged/serie"),
        isGlobal ? Promise.resolve([]) : safeGet("/dashboard-cards"),
      ]);

      if (!alive) return;
      setPibResumo(pibRes);
      setPibSerie(pibSerieRes || []);
      setPibComparativo(pibCompRes || []);
      setArrecResumo(arrecRes);
      setArrecPorTipo(arrecTipoRes || []);
      setCagedResumo(cagedRes);
      setCagedSerie(cagedSerieRes || []);
      setCustomCards(cardsRes || []);
      setLoading(false);
    }
    fetchAll();
    return () => { alive = false; };
  }, [isGlobal]);

  // ── Derived chart data ──
  const pibChartData = useMemo(
    () => pibSerie.map((d) => ({ label: String(d.ano), value: Number(d.pib_total) || 0 })),
    [pibSerie]
  );
  const pibSparkData = useMemo(() => pibChartData.map((d) => d.value), [pibChartData]);

  const vaSetorData = useMemo(() => {
    // group /pib/comparativo by ano (current municipio rows already filtered server-side for non-global users)
    const grouped = new Map();
    pibComparativo.forEach((r) => {
      if (!grouped.has(r.ano)) grouped.set(r.ano, { label: String(r.ano), Agropecuária: 0, Indústria: 0, Serviços: 0, Governo: 0 });
      const row = grouped.get(r.ano);
      row.Agropecuária += Number(r.va_agropecuaria) || 0;
      row.Indústria   += Number(r.va_industria)   || 0;
      row.Serviços    += Number(r.va_servicos)    || 0;
      row.Governo     += Number(r.va_governo)     || 0;
    });
    return Array.from(grouped.values()).sort((a, b) => Number(a.label) - Number(b.label));
  }, [pibComparativo]);

  const comparativoCidades = useMemo(() => {
    if (!pibComparativo.length) return { data: [], series: [] };
    const cities = Array.from(new Set(pibComparativo.map((r) => r.cidade))).slice(0, 4);
    const byAno = new Map();
    pibComparativo.forEach((r) => {
      if (!cities.includes(r.cidade)) return;
      if (!byAno.has(r.ano)) byAno.set(r.ano, { label: String(r.ano) });
      byAno.get(r.ano)[r.cidade] = (byAno.get(r.ano)[r.cidade] || 0) + (Number(r.pib_total) || 0);
    });
    const data = Array.from(byAno.values()).sort((a, b) => Number(a.label) - Number(b.label));
    return { data, series: cities };
  }, [pibComparativo]);

  const cagedTwinData = useMemo(() => {
    // /caged/serie returns per-month items: ano, mes, total_admissoes, total_desligamentos, saldo
    if (!cagedSerie.length) return [];
    // pick the latest 12 months
    const sorted = [...cagedSerie].sort((a, b) => (a.ano - b.ano) || (a.mes - b.mes));
    const last12 = sorted.slice(-12);
    return last12.map((d) => ({
      label: MES_LABEL[(d.mes || 1) - 1] || String(d.mes),
      admissoes: Number(d.total_admissoes ?? d.admissoes ?? 0),
      desligamentos: Number(d.total_desligamentos ?? d.desligamentos ?? 0),
    }));
  }, [cagedSerie]);

  const cagedSparkData = useMemo(
    () => cagedTwinData.map((d) => d.admissoes - d.desligamentos),
    [cagedTwinData]
  );

  const arrecDonut = useMemo(() => {
    if (!arrecPorTipo.length) return { items: [], legendItems: [] };
    const totals = new Map();
    arrecPorTipo.forEach((r) => {
      totals.set(r.tipo, (totals.get(r.tipo) || 0) + (Number(r.valor) || 0));
    });
    const items = Array.from(totals.entries())
      .filter(([, v]) => v > 0)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
    const palette = [A1, A3, A2, A4, A5];
    const total = items.reduce((s, i) => s + i.value, 0) || 1;
    const legendItems = items.map((it, i) => ({
      name: `${it.name} · ${Math.round((it.value / total) * 100)}%`,
      color: palette[i % palette.length],
    }));
    return { items, legendItems, palette, total };
  }, [arrecPorTipo]);

  const arrecSparkData = useMemo(() => {
    if (!arrecPorTipo.length) return [];
    const byPeriodo = new Map();
    arrecPorTipo.forEach((r) => {
      byPeriodo.set(r.periodo, (byPeriodo.get(r.periodo) || 0) + (Number(r.valor) || 0));
    });
    return Array.from(byPeriodo.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-12)
      .map(([, v]) => v);
  }, [arrecPorTipo]);

  const topSetoresHBar = useMemo(() => {
    if (!vaSetorData.length) return [];
    const last = vaSetorData[vaSetorData.length - 1];
    return [
      { label: "Serviços",    value: last.Serviços },
      { label: "Indústria",   value: last.Indústria },
      { label: "Agropecuária", value: last.Agropecuária },
      { label: "Governo",     value: last.Governo },
    ].sort((a, b) => b.value - a.value);
  }, [vaSetorData]);

  // ── KPIs ──
  const pibMoney = moneyDisplay(pibResumo?.pib_ultimo_ano);
  const arrecMoney = moneyDisplay(arrecResumo?.total_geral);
  const saldoCaged = cagedResumo?.saldo_total;
  const cagedDisplay = saldoCaged != null
    ? { value: `${saldoCaged > 0 ? "+" : ""}${fmtBR(saldoCaged)}`, unit: "vagas" }
    : { value: "—", unit: "" };

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <NidPageHeader
        title="Dashboard Geral"
        sub="Indicadores econômicos consolidados do município"
      />

      <div className="mt-4 mb-6">
        <PrioridadesPanel />
      </div>

      {/* Hero KPIs (neon design) */}
      {loading ? (
        <div className="nid-kpis">
          {[...Array(4)].map((_, i) => <KpiSkeleton key={i} height={110} />)}
        </div>
      ) : (
        <div className="nid-kpis">
          <NidKpiHero
            label="PIB · Último Ano"
            badge={pibResumo?.ultimo_ano ? String(pibResumo.ultimo_ano) : null}
            value={pibMoney.value}
            unit={pibMoney.unit}
            delta={pctDelta(pibResumo?.crescimento_percentual)}
            foot="vs ano anterior"
            color={A1}
            sparkData={pibSparkData}
          />
          <NidKpiHero
            label="Arrecadação Total"
            badge="YTD"
            value={arrecMoney.value}
            unit={arrecMoney.unit}
            delta={pctDelta(arrecResumo?.crescimento_percentual)}
            foot="vs ano anterior"
            color={A3}
            sparkData={arrecSparkData}
          />
          <NidKpiHero
            label="Saldo CAGED"
            badge={cagedResumo?.ano ? String(cagedResumo.ano) : null}
            value={cagedDisplay.value}
            unit={cagedDisplay.unit}
            delta={cagedResumo?.total_admissoes != null
              ? { v: `${fmtBR(cagedResumo.total_admissoes)} adm.`, up: null }
              : null}
            foot="acumulado período"
            color={A5}
            sparkData={cagedSparkData}
          />
          <NidKpiHero
            label="Crescimento PIB"
            badge="YoY"
            value={pibResumo?.crescimento_percentual != null
              ? `${pibResumo.crescimento_percentual > 0 ? "+" : ""}${pibResumo.crescimento_percentual.toFixed(1)}`
              : "—"}
            unit="%"
            delta={null}
            foot="variação último ano"
            color={A4}
            sparkData={pibSparkData}
          />
        </div>
      )}

      {/* Insights strip — backend-managed (kept) + a couple neon-style data-derived hints */}
      {!loading && (pibResumo || arrecResumo || cagedResumo) && (
        <div className="nid-insights">
          {pibResumo?.crescimento_percentual != null && (
            <NidInsight kind={pibResumo.crescimento_percentual >= 0 ? "up" : "down"}>
              <b>PIB {pibResumo.crescimento_percentual >= 0 ? "cresce" : "recua"} {Math.abs(pibResumo.crescimento_percentual).toFixed(1)}%</b>
              {" "}em {pibResumo.ultimo_ano} vs ano anterior.
            </NidInsight>
          )}
          {arrecResumo?.crescimento_percentual != null && (
            <NidInsight kind="info">
              <b>Arrecadação total</b> alcança {fmtMoneyFull(arrecResumo.total_geral || 0)}
              {" "}no período ({arrecResumo.crescimento_percentual > 0 ? "+" : ""}
              {Number(arrecResumo.crescimento_percentual).toFixed(1)}% YoY).
            </NidInsight>
          )}
          {saldoCaged != null && (
            <NidInsight kind={saldoCaged >= 0 ? "up" : "down"}>
              <b>CAGED</b> registra saldo de <b>{saldoCaged > 0 ? "+" : ""}{fmtBR(saldoCaged)}</b> vagas
              {cagedResumo?.total_admissoes != null && (
                <> · {fmtBR(cagedResumo.total_admissoes)} admissões</>
              )}.
            </NidInsight>
          )}
        </div>
      )}

      {/* Backend-managed insights (kept intact) */}
      <div style={{ marginBottom: 22 }}>
        <InsightsPanel dataset="geral" />
      </div>

      {/* PIB area chart + Receita Donut */}
      {/* ChartHoverProvider syncs "annual" group: PIB Evolução ↔ PIB Comparativo */}
      <ChartHoverProvider>
        <div className="nid-grid-2">
          <NidPanel title="Evolução do PIB" sub="Série anual · IBGE / SIDRA" tabs={["Anual"]}>
            <AreaLineChart data={pibChartData} color={A1} glow height={280} label="PIB Total" syncGroup="annual" />
            <NidLegend items={[{ name: "PIB Total", color: A1 }]} />
          </NidPanel>

          <NidPanel
            title="Receita por Tipo"
            sub={arrecResumo?.total_geral != null ? "Composição YTD" : "Sem dados"}
          >
            {arrecDonut.items.length > 0 ? (
              <>
                <DonutChart
                  data={arrecDonut.items}
                  colors={arrecDonut.palette}
                  glow
                  height={210}
                  centerLabel={arrecResumo?.total_geral != null ? fmtMoneyShort(arrecResumo.total_geral) : ""}
                  centerSub="ARRECADADO"
                />
                <NidLegend items={arrecDonut.legendItems} />
              </>
            ) : (
              <div style={{
                height: 210, display: "grid", placeItems: "center",
                color: "var(--text-mute)", fontSize: 13, fontFamily: "var(--font-mono)",
              }}>
                Sem dados disponíveis
              </div>
            )}
          </NidPanel>
        </div>

        {/* VA por Setor + Comparativo cidades */}
        <div className="nid-grid-1-1">
          <NidPanel title="Valor Adicionado por Setor" sub="Decomposição setorial · R$ correntes">
            <StackedBarChart
              data={vaSetorData}
              keys={["Agropecuária", "Indústria", "Serviços", "Governo"]}
              colors={[A5, A1, A3, A4]}
              glow
              height={260}
            />
            <NidLegend items={[
              { name: "Agropecuária", color: A5 },
              { name: "Indústria",   color: A1 },
              { name: "Serviços",    color: A3 },
              { name: "Governo",     color: A4 },
            ]} />
          </NidPanel>

          <NidPanel
            title="PIB Comparativo"
            sub={comparativoCidades.series.length > 1
              ? `${comparativoCidades.series.length} municípios`
              : "Histórico do município"}
          >
            <MultiLineChart
              data={comparativoCidades.data}
              series={comparativoCidades.series}
              colors={[A3, A1, A4, A2]}
              glow
              height={260}
              syncGroup="annual"
            />
            <NidLegend items={comparativoCidades.series.map((s, i) => ({
              name: s, color: [A3, A1, A4, A2][i % 4],
            }))} />
          </NidPanel>
        </div>
      </ChartHoverProvider>

      {/* CAGED twin bars + Top setores */}
      <div className="nid-grid-1-1">
        <NidPanel title="Saldo CAGED" sub="Admissões vs Desligamentos · Últimos 12 meses">
          <TwinBarChart data={cagedTwinData} glow colorUp={A5} colorDown={A2} height={260} />
          <NidLegend items={[
            { name: "Admissões", color: A5 },
            { name: "Desligamentos", color: A2 },
          ]} />
        </NidPanel>

        <NidPanel title="Top Setores · VA" sub={vaSetorData.length ? `Maiores contribuições ${vaSetorData[vaSetorData.length - 1].label}` : "Sem dados"}>
          <HBarChart data={topSetoresHBar} color={A1} glow height={240} fmt={fmtMoneyShort} />
        </NidPanel>
      </div>

      {/* Custom cards from /dashboard-cards (kept) */}
      {!loading && customCards.length > 0 && (
        <div style={{ marginTop: 8, marginBottom: 22 }}>
          <h3 style={{
            color: "var(--text-mute)", fontSize: 11, fontFamily: "var(--font-mono)",
            letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 12,
          }}>
            Indicadores Personalizados
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            {customCards.map((card, i) => (
              <KpiCard
                key={card.id}
                label={card.titulo}
                value={card.valor}
                sub={card.subtitulo}
                icon={CUSTOM_ICON_MAP[card.icone] || StarIcon}
                color={CUSTOM_COLOR_MAP[card.cor] || CUSTOM_COLOR_MAP.blue}
                delay={i * 0.05}
              />
            ))}
          </div>
        </div>
      )}

      {/* Releases (kept) */}
      <div style={{ marginTop: 8 }}>
        <ReleasesPanel dataset="geral" />
      </div>
    </motion.div>
  );
}
