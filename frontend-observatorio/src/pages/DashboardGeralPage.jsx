import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import api from "../services/api";
import { useAuth } from "../context/AuthContext";
import { useViewAs } from "../context/ViewAsContext";
import InsightsPanel from "../components/InsightsPanel";
import PrioridadesPanel from "../components/PrioridadesPanel";
import ReleasesPanel from "../components/ReleasesPanel";
import KpiCard from "../components/KpiCard";
import KpiSkeleton from "../components/nid/KpiSkeleton";
import SelecioneMunicipio from "../components/nid/SelecioneMunicipio";
import MudancasRelevantes from "../components/MudancasRelevantes";
import AtalhoCard from "../components/AtalhoCard";
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
import { montarComparativo, descreverPares } from "../utils/seriesComparativo";
import { fmtBR, moneyDisplay } from "../utils/metricasEconomicas";
import {
  StarIcon, UserGroupIcon, HomeIcon, HeartIcon, AcademicCapIcon,
  TruckIcon, ChartBarIcon, BuildingOfficeIcon, BoltIcon, GlobeAltIcon,
  PresentationChartBarIcon, BuildingLibraryIcon, ChartBarSquareIcon,
  BuildingOffice2Icon, TrophyIcon,
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
  slate:  { bg: "bg-[var(--panel-2)]",     text: "var(--text-dim)" },
};

const A1 = "var(--accent-1)";
const A2 = "var(--accent-2)";
const A3 = "var(--accent-3)";
const A4 = "var(--accent-4)";
const A5 = "var(--accent-5)";

const MES_LABEL = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

function pctDelta(p) {
  if (p == null) return null;
  return { v: `${p > 0 ? "+" : ""}${Number(p).toFixed(1)}%`, up: p > 0 ? true : p < 0 ? false : null };
}

export default function DashboardGeralPage() {
  const { user } = useAuth();
  const isGlobal = user?.role === "ADMIN_GLOBAL";
  const { viewAsId } = useViewAs();
  const needsMunicipio = isGlobal && viewAsId == null;

  const [pibResumo, setPibResumo] = useState(null);
  const [pibSerie, setPibSerie] = useState([]);
  const [pibComp, setPibComp] = useState({ foco: null, pares: [], fixados: [], criterio_pares: null, motivo: null, itens: [] });
  const [arrecResumo, setArrecResumo] = useState(null);
  const [arrecPorTipo, setArrecPorTipo] = useState([]);
  const [cagedResumo, setCagedResumo] = useState(null);
  const [cagedSerie, setCagedSerie] = useState([]);
  const [vafResumo, setVafResumo] = useState(null);
  const [customCards, setCustomCards] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (needsMunicipio) return;
    let alive = true;
    async function fetchAll() {
      const safeGet = (url, params) =>
        api.get(url, params ? { params } : undefined).then((r) => r.data).catch(() => null);

      const [
        pibRes, pibSerieRes, pibCompRes,
        arrecRes, arrecTipoRes,
        cagedRes, cagedSerieRes,
        vafRes,
        cardsRes,
      ] = await Promise.all([
        safeGet("/pib/resumo"),
        safeGet("/pib/serie"),
        safeGet("/pib/comparativo"),
        safeGet("/arrecadacao/resumo"),
        safeGet("/arrecadacao/por_tipo"),
        safeGet("/caged/resumo"),
        safeGet("/caged/serie"),
        safeGet("/vaf/resumo"),
        isGlobal ? Promise.resolve([]) : safeGet("/dashboard-cards"),
      ]);

      if (!alive) return;
      setPibResumo(pibRes);
      setPibSerie(pibSerieRes || []);
      setPibComp(pibCompRes || { foco: null, pares: [], fixados: [], criterio_pares: null, motivo: null, itens: [] });
      setArrecResumo(arrecRes);
      setArrecPorTipo(arrecTipoRes || []);
      setCagedResumo(cagedRes);
      setCagedSerie(cagedSerieRes || []);
      setVafResumo(vafRes);
      setCustomCards(cardsRes || []);
      setLoading(false);
    }
    fetchAll();
    return () => { alive = false; };
  }, [isGlobal, needsMunicipio]);

  // ── Derived chart data ──
  const pibChartData = useMemo(
    () => pibSerie.map((d) => ({ label: String(d.ano), value: Number(d.pib_total) || 0 })),
    [pibSerie]
  );
  const pibSparkData = useMemo(() => pibChartData.map((d) => d.value), [pibChartData]);

  const vaSetorData = useMemo(() => {
    // Decomposição do município em FOCO. Antes somava todos os municípios do
    // payload, o que virou "o Brasil inteiro" quando a rota passou a devolver
    // a base completa para ADMIN_GLOBAL.
    if (!pibComp.foco) return [];
    const grouped = new Map();
    (pibComp.itens || [])
      .filter((r) => r.municipio_id === pibComp.foco.municipio_id)
      .forEach((r) => {
        if (!grouped.has(r.ano)) grouped.set(r.ano, { label: String(r.ano), Agropecuária: 0, Indústria: 0, Serviços: 0, Governo: 0 });
        const row = grouped.get(r.ano);
        row.Agropecuária += Number(r.va_agropecuaria) || 0;
        row.Indústria   += Number(r.va_industria)   || 0;
        row.Serviços    += Number(r.va_servicos)    || 0;
        row.Governo     += Number(r.va_governo)     || 0;
      });
    return Array.from(grouped.values()).sort((a, b) => Number(a.label) - Number(b.label));
  }, [pibComp]);

  // Foco + pares comparáveis já vêm pivotados pelo util — o backend manda o
  // envelope, o util decide domínio de anos (o do foco) e rótulos (homônimos
  // entre UFs).
  const cmp = useMemo(
    () => montarComparativo({
      itens: pibComp.itens, foco: pibComp.foco, pares: pibComp.pares, fixados: pibComp.fixados,
      anoKey: "ano", valorKey: "pib_total",
    }),
    [pibComp]
  );
  const seriesComp = useMemo(
    () => (cmp.focusSeries ? [cmp.focusSeries, ...cmp.peerSeries, ...cmp.pinnedSeries] : []),
    [cmp]
  );

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

  if (needsMunicipio) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <NidPageHeader
          title="Núcleo de Dados"
          sub="Indicadores econômicos consolidados do município"
        />
        <SelecioneMunicipio />
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <NidPageHeader
        title="Núcleo de Dados"
        sub="Indicadores econômicos consolidados do município"
      />

      <div className="mt-4 mb-6">
        <PrioridadesPanel />
      </div>

      <h3 style={{
        color: "var(--text-mute)", fontSize: 11, fontFamily: "var(--font-mono)",
        letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 12,
      }}>
        Cenário do município
      </h3>

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
            label="VAF · IPM"
            badge={vafResumo?.ultimo_ano ? String(vafResumo.ultimo_ano) : null}
            value={vafResumo?.ultimo_ano && vafResumo?.ipm_ultimo_ano != null ? fmtBR(vafResumo.ipm_ultimo_ano, { maximumFractionDigits: 4 }) : "—"}
            unit=""
            delta={vafResumo?.ultimo_ano ? pctDelta(vafResumo?.variacao_ipm_percentual) : null}
            foot="índice de participação"
            color={A4}
          />
        </div>
      )}

      <MudancasRelevantes resumos={{ pib: pibResumo, vaf: vafResumo, arrecadacao: arrecResumo, caged: cagedResumo }} />

      <h3 style={{
        color: "var(--text-mute)", fontSize: 11, fontFamily: "var(--font-mono)",
        letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 12,
      }}>
        Riscos & oportunidades
      </h3>

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

      <h3 style={{
        color: "var(--text-mute)", fontSize: 11, fontFamily: "var(--font-mono)",
        letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 12,
      }}>
        Aprofundar
      </h3>
      <div className="grid gap-4 md:grid-cols-3" style={{ marginBottom: 22 }}>
        <AtalhoCard titulo="Análise Econômica" descricao="As 6 bases econômicas lidas em conjunto." icone={PresentationChartBarIcon} to="/app/analise-economica" />
        <AtalhoCard titulo="Visão do Prefeito" descricao="Panorama executivo de todas as áreas." icone={BuildingLibraryIcon} to="/app/painel-prefeito" planKey="painel_prefeito" />
        <AtalhoCard titulo="Benchmark" descricao="Seu município comparado aos pares." icone={ChartBarSquareIcon} to="/app/benchmark" planKey="benchmark" />
        <AtalhoCard titulo="Gestão Empresarial" descricao="Relacionamento com as empresas locais." icone={BuildingOffice2Icon} to="/app/desenvolvimento-economico/retencao" planKey="desenvolvimento_economico.retencao" />
        <AtalhoCard titulo="Certificações e Premiações" descricao="Oportunidades, captação e reconhecimentos." icone={TrophyIcon} to="/app/desenvolvimento-economico/premiacoes" planKey="desenvolvimento_economico.premiacoes" />
        <AtalhoCard titulo="Panorama Socioeconômico" descricao="IPS, benefícios e contexto social." icone={PresentationChartBarIcon} to="/app/ips" planKey="ips" />
      </div>

      <h3 style={{
        color: "var(--text-mute)", fontSize: 11, fontFamily: "var(--font-mono)",
        letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 12,
      }}>
        Panorama
      </h3>

      {/* PIB area chart + Receita Donut */}
      {/* Evolução do PIB e PIB Comparativo são independentes de propósito: o
          hover sincronizado entre os dois (grupo "annual") confundia o leitor —
          reportado como bug pelo cliente. */}
      <div className="nid-grid-2">
        <NidPanel title="Evolução do PIB" sub="Série anual · IBGE / SIDRA" tabs={["Anual"]} dataset="geral" indicadorKey="chart_evolucao_pib">
          <AreaLineChart data={pibChartData} color={A1} glow height={280} label="PIB Total" />
          <NidLegend items={[{ name: "PIB Total", color: A1 }]} />
        </NidPanel>

        <NidPanel
          title="Receita por Tipo"
          sub={arrecResumo?.total_geral != null ? "Composição YTD" : "Sem dados"}
          dataset="geral"
          indicadorKey="chart_receita_por_tipo"
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
        <NidPanel title="Valor Adicionado por Setor" sub="Decomposição setorial · R$ correntes" dataset="geral" indicadorKey="chart_va_setor">
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

        <NidPanel title="PIB Comparativo" sub={descreverPares(pibComp)} dataset="geral" indicadorKey="chart_pib_comparativo">
          <MultiLineChart
            data={cmp.data}
            series={seriesComp}
            colors={[A3, A1, A4, A2]}
            glow
            height={260}
           
            focusSeries={cmp.focusSeries}
            peerCount={cmp.peerSeries.length}
            showMedian
            showBand
            legend
          />
        </NidPanel>
      </div>

      {/* CAGED twin bars + Top setores */}
      <div className="nid-grid-1-1">
        <NidPanel title="Saldo CAGED" sub="Admissões vs Desligamentos · Últimos 12 meses" dataset="geral" indicadorKey="chart_saldo_caged">
          <TwinBarChart data={cagedTwinData} glow colorUp={A5} colorDown={A2} height={260} />
          <NidLegend items={[
            { name: "Admissões", color: A5 },
            { name: "Desligamentos", color: A2 },
          ]} />
        </NidPanel>

        <NidPanel title="Top Setores · VA" sub={vaSetorData.length ? `Maiores contribuições ${vaSetorData[vaSetorData.length - 1].label}` : "Sem dados"} dataset="geral" indicadorKey="chart_top_setores_va">
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
