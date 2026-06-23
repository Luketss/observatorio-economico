import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import api from "../../services/api";
import InsightsPanel from "../../components/InsightsPanel";
import ReleasesPanel from "../../components/ReleasesPanel";
import {
  NidPageHeader, NidPanel, NidLegend, NidInsight, NidKpiHero,
} from "../../components/nid/Panel";
import {
  AreaLineChart, MultiLineChart, TwinBarChart, DonutChart, HBarChart, StackedBarChart,
  fmtNumber, fmtNumberShort,
} from "../../components/nid/charts";
import CompareToggle from "../../components/nid/CompareToggle";
import { comparePanelData } from "../../utils/periodos";
import ChartState from "../../components/nid/ChartState.jsx";
import InfoTooltip from "../../components/InfoTooltip";
import PlanGate from "../../components/PlanGate";
import DetalheModal from "../../components/nid/DetalheModal";
import { useAuth } from "../../context/AuthContext";
import { useViewAs } from "../../context/ViewAsContext";

const A1 = "var(--accent-1)";
const A2 = "var(--accent-2)";
const A3 = "var(--accent-3)";
const A4 = "var(--accent-4)";
const A5 = "var(--accent-5)";

const MES_LABEL = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const fmtBR = (v) => v != null ? Number(v).toLocaleString("pt-BR") : "—";
const fmtCurrency = (v) => v != null
  ? Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })
  : "—";
const pct = (n, d) => d > 0 ? `${((n / d) * 100).toFixed(1)}%` : "—";

export default function CagedPage() {
  const { user } = useAuth();
  const { viewAsId } = useViewAs();
  // ADMIN_GLOBAL precisa de um município selecionado (view-as) para escopar os
  // gráficos do dashboard; sem seleção, pedimos para escolher em vez de
  // sobrepor todos os municípios no mesmo gráfico.
  const needsMunicipio = user?.role === "ADMIN_GLOBAL" && viewAsId == null;

  const [serie, setSerie] = useState([]);
  const [resumo, setResumo] = useState(null);
  const [porSexo, setPorSexo] = useState([]);
  const [porRaca, setPorRaca] = useState([]);
  const [salario, setSalario] = useState([]);
  const [porCnae, setPorCnae] = useState([]);
  const [porEscolaridade, setPorEscolaridade] = useState([]);
  const [porFaixaEtaria, setPorFaixaEtaria] = useState([]);
  const [porTipoMov, setPorTipoMov] = useState([]);
  // New endpoints
  const [porTipoDef, setPorTipoDef] = useState([]);
  const [porTamanho, setPorTamanho] = useState([]);
  const [porTipoEmp, setPorTipoEmp] = useState([]);
  const [porTipoEstab, setPorTipoEstab] = useState([]);
  const [indicadores, setIndicadores] = useState([]);

  const [loading, setLoading] = useState(true);
  const [turnoverMode, setTurnoverMode] = useState("saldo");
  const [comparar, setComparar] = useState(false);
  const [detalhe, setDetalhe] = useState(null);
  const cmp = useMemo(() => comparePanelData(serie, { valueKey: "saldo" }), [serie]);

  useEffect(() => {
    let alive = true;
    const safe = (url) => api.get(url).then((r) => r.data).catch(() => []);
    Promise.all([
      safe("/caged/serie"),
      api.get("/caged/resumo").then((r) => r.data).catch(() => null),
      safe("/caged/por_sexo"),
      safe("/caged/por_raca"),
      safe("/caged/salario"),
      safe("/caged/por_cnae"),
      safe("/caged/por_escolaridade"),
      safe("/caged/por_faixa_etaria"),
      safe("/caged/por_tipo_movimentacao"),
      safe("/caged/por_tipo_deficiencia"),
      safe("/caged/por_tamanho_estabelecimento"),
      safe("/caged/por_tipo_empregador"),
      safe("/caged/por_tipo_estabelecimento"),
      safe("/caged/indicadores_contrato"),
    ]).then(([
      serieRes, resumoRes, sexoRes, racaRes, salRes, cnaeRes,
      escRes, feRes, tipoMovRes,
      defRes, tamRes, empRes, estabRes, indRes,
    ]) => {
      if (!alive) return;
      setSerie(serieRes); setResumo(resumoRes);
      setPorSexo(sexoRes); setPorRaca(racaRes); setSalario(salRes);
      setPorCnae(cnaeRes); setPorEscolaridade(escRes);
      setPorFaixaEtaria(feRes); setPorTipoMov(tipoMovRes);
      setPorTipoDef(defRes); setPorTamanho(tamRes);
      setPorTipoEmp(empRes); setPorTipoEstab(estabRes); setIndicadores(indRes);
      setLoading(false);
    });
    return () => { alive = false; };
  }, []);

  const years = useMemo(
    () => [...new Set(serie.map((d) => d.ano))].sort((a, b) => a - b),
    [serie]
  );
  const ultimoAno = years[years.length - 1];
  const [anoFiltro, setAnoFiltro] = useState(null);
  const anoAtivo = anoFiltro || ultimoAno;

  // Monthly twin-bars for the current year
  const turnoverMes = useMemo(() => {
    const filtered = serie.filter((d) => d.ano === anoAtivo);
    return MES_LABEL.map((label, i) => {
      const row = filtered.find((d) => d.mes === i + 1);
      return {
        label,
        admissoes: row?.admissoes || 0,
        desligamentos: row?.desligamentos || 0,
      };
    });
  }, [serie, anoAtivo]);

  // Annual saldo over time
  const saldoAnual = useMemo(() => {
    const acc = new Map();
    serie.forEach((d) => acc.set(d.ano, (acc.get(d.ano) || 0) + (d.saldo || 0)));
    return Array.from(acc.entries())
      .sort(([a], [b]) => a - b)
      .map(([ano, v]) => ({ label: String(ano), value: v }));
  }, [serie]);

  // Monthly saldo (fallback when there's only a single year — an annual chart
  // with one point looks empty; the monthly breakdown shows a real trend).
  const saldoMensal = useMemo(() => {
    return [...serie]
      .sort((a, b) => (a.ano - b.ano) || ((a.mes || 0) - (b.mes || 0)))
      .map((d) => ({
        label: `${MES_LABEL[(d.mes || 1) - 1]}/${String(d.ano).slice(2)}`,
        value: d.saldo || 0,
      }));
  }, [serie]);

  // Show annual when there are ≥2 years, otherwise fall back to monthly.
  const usarSaldoMensal = saldoAnual.length < 2;
  const saldoSerie = usarSaldoMensal ? saldoMensal : saldoAnual;

  // Auto-annotate extremes on the saldo chart (ticket 04)
  const saldoAnnotations = useMemo(() => {
    if (!saldoSerie || saldoSerie.length < 2) return [];
    const sorted = [...saldoSerie].sort((a, b) => a.value - b.value);
    return [
      { x: sorted[0].label, kind: "negative", label: "mínimo" },
      { x: sorted[sorted.length - 1].label, kind: "positive", label: "máximo" },
    ];
  }, [saldoSerie]);

  // Spark series
  const admissoesSpark = useMemo(() => {
    const acc = new Map();
    serie.forEach((d) => acc.set(d.ano, (acc.get(d.ano) || 0) + (d.admissoes || 0)));
    return Array.from(acc.entries()).sort(([a], [b]) => a - b).map(([, v]) => v);
  }, [serie]);
  const desligamentosSpark = useMemo(() => {
    const acc = new Map();
    serie.forEach((d) => acc.set(d.ano, (acc.get(d.ano) || 0) + (d.desligamentos || 0)));
    return Array.from(acc.entries()).sort(([a], [b]) => a - b).map(([, v]) => v);
  }, [serie]);
  const salarioSpark = useMemo(() => salario.map((d) => d.salario_medio_admissoes || 0), [salario]);

  const indAtual = indicadores.find((i) => i.ano === anoAtivo) || indicadores.slice(-1)[0] || null;

  // Year totals
  const totaisAno = useMemo(() => {
    const filtered = serie.filter((d) => d.ano === anoAtivo);
    return {
      admissoes: filtered.reduce((s, d) => s + (d.admissoes || 0), 0),
      desligamentos: filtered.reduce((s, d) => s + (d.desligamentos || 0), 0),
      saldo: filtered.reduce((s, d) => s + (d.saldo || 0), 0),
    };
  }, [serie, anoAtivo]);

  const ultimoSalario = salario.slice(-1)[0]?.salario_medio_admissoes;

  // CNAE saldo for the year (donut)
  const cnaeSaldoAno = useMemo(() => {
    const acc = new Map();
    porCnae.filter((d) => d.ano === anoAtivo).forEach((d) => {
      acc.set(d.descricao_secao, (acc.get(d.descricao_secao) || 0) + (d.admissoes || 0));
    });
    return Array.from(acc.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);
  }, [porCnae, anoAtivo]);

  // CNAE saldo bars (admissões − desligamentos by sector)
  const cnaeRanking = useMemo(() => {
    const acc = new Map();
    porCnae.filter((d) => d.ano === anoAtivo).forEach((d) => {
      acc.set(d.descricao_secao, (acc.get(d.descricao_secao) || 0) + (d.saldo || 0));
    });
    return Array.from(acc.entries())
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value);
  }, [porCnae, anoAtivo]);

  // Demographic donuts
  const sexoAno = useMemo(() => {
    const acc = new Map();
    porSexo.filter((d) => d.ano === anoAtivo).forEach((d) => {
      acc.set(d.sexo, (acc.get(d.sexo) || 0) + (d.admissoes || 0));
    });
    return Array.from(acc.entries()).map(([name, value]) => ({ name, value }));
  }, [porSexo, anoAtivo]);

  const racaAno = useMemo(() => {
    const acc = new Map();
    porRaca.filter((d) => d.ano === anoAtivo).forEach((d) => {
      acc.set(d.raca_cor, (acc.get(d.raca_cor) || 0) + (d.admissoes || 0));
    });
    return Array.from(acc.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [porRaca, anoAtivo]);

  const faixaEtariaAno = useMemo(() => {
    const ORDER = ["Até 17 anos", "18 a 24 anos", "25 a 29 anos", "30 a 39 anos", "40 a 49 anos", "50 a 64 anos", "65 anos ou mais"];
    const acc = new Map();
    porFaixaEtaria.filter((d) => d.ano === anoAtivo).forEach((d) => {
      acc.set(d.faixa_etaria, (acc.get(d.faixa_etaria) || 0) + (d.admissoes || 0));
    });
    return Array.from(acc.entries())
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => {
        const ai = ORDER.indexOf(a.label), bi = ORDER.indexOf(b.label);
        if (ai === -1 && bi === -1) return 0;
        if (ai === -1) return 1;
        if (bi === -1) return -1;
        return ai - bi;
      });
  }, [porFaixaEtaria, anoAtivo]);

  const escolaridadeAno = useMemo(() => {
    const acc = new Map();
    porEscolaridade.filter((d) => d.ano === anoAtivo).forEach((d) => {
      acc.set(d.grau_instrucao, (acc.get(d.grau_instrucao) || 0) + (d.admissoes || 0));
    });
    return Array.from(acc.entries())
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
  }, [porEscolaridade, anoAtivo]);

  const tipoMovAno = useMemo(() => {
    const acc = new Map();
    porTipoMov.filter((d) => d.ano === anoAtivo).forEach((d) => {
      acc.set(d.tipo_movimentacao, (acc.get(d.tipo_movimentacao) || 0) + (d.admissoes || 0) + (d.desligamentos || 0));
    });
    return Array.from(acc.entries())
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
  }, [porTipoMov, anoAtivo]);

  // ── New: PCD por tipo (saldo)
  const tipoDefAno = useMemo(() => {
    const acc = new Map();
    porTipoDef.filter((d) => d.ano === anoAtivo).forEach((d) => {
      acc.set(d.tipo_deficiencia, (acc.get(d.tipo_deficiencia) || 0) + (d.admissoes || 0) - (d.desligamentos || 0));
    });
    return Array.from(acc.entries())
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value);
  }, [porTipoDef, anoAtivo]);

  // ── New: Tamanho estab (saldo)
  const tamanhoAno = useMemo(() => {
    const ORDER = ["Até 4 vínculos", "5 a 9", "10 a 19", "20 a 49", "50 a 99", "100 a 249", "250 a 499", "500 a 999", "1000 ou mais", "Zero / não classificado"];
    const acc = new Map();
    porTamanho.filter((d) => d.ano === anoAtivo).forEach((d) => {
      acc.set(d.tamanho, (acc.get(d.tamanho) || 0) + (d.saldo || 0));
    });
    return ORDER.filter((n) => acc.has(n)).map((label) => ({ label, value: acc.get(label) }));
  }, [porTamanho, anoAtivo]);

  // ── New: Tipo empregador (admissoes share)
  const tipoEmpAno = useMemo(() => {
    const acc = new Map();
    porTipoEmp.filter((d) => d.ano === anoAtivo).forEach((d) => {
      acc.set(d.tipo_empregador, (acc.get(d.tipo_empregador) || 0) + (d.admissoes || 0));
    });
    return Array.from(acc.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [porTipoEmp, anoAtivo]);

  // ── New: Tipo estabelecimento (admissoes share)
  const tipoEstabAno = useMemo(() => {
    const acc = new Map();
    porTipoEstab.filter((d) => d.ano === anoAtivo).forEach((d) => {
      acc.set(d.tipo_estabelecimento, (acc.get(d.tipo_estabelecimento) || 0) + (d.admissoes || 0));
    });
    return Array.from(acc.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [porTipoEstab, anoAtivo]);

  // CNAE stacked over years (top 5)
  const cnaeStacked = useMemo(() => {
    const totals = new Map();
    porCnae.forEach((d) => totals.set(d.descricao_secao, (totals.get(d.descricao_secao) || 0) + (d.admissoes || 0) + (d.desligamentos || 0)));
    const top5 = [...totals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k]) => k);
    const yearsSet = [...new Set(porCnae.map((d) => d.ano))].sort();
    const data = yearsSet.map((ano) => {
      const row = { label: String(ano) };
      top5.forEach((sec) => { row[sec] = 0; });
      porCnae.filter((d) => d.ano === ano && top5.includes(d.descricao_secao))
        .forEach((d) => { row[d.descricao_secao] += (d.admissoes || 0) + (d.desligamentos || 0); });
      return row;
    });
    return { data, keys: top5 };
  }, [porCnae]);

  const palette = [A1, A3, A2, A4, A5, "#8b5cf6", "#06b6d4"];

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <NidPageHeader
        title={<>CAGED — Movimentações de Emprego Formal <InfoTooltip dataset="caged" /></>}
        sub="Admissões e desligamentos mensais · Ministério do Trabalho"
        badge={anoAtivo ? `Foco · ${anoAtivo}` : null}
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
            município e visualizar os dados de CAGED.
          </p>
        </div>
      ) : (
      <>
      {years.length > 0 && (
        <div style={{ display: "flex", gap: 6, marginBottom: 18, flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {years.map((y) => (
              <button
                key={y}
                onClick={() => setAnoFiltro(y)}
                className={`nid-tab ${y === anoAtivo ? "active" : ""}`}
              >
                {y}
              </button>
            ))}
          </div>
          <CompareToggle active={comparar} onChange={setComparar} disabled={!cmp.temAnterior} />
        </div>
      )}

      {/* Hero KPIs */}
      {loading ? (
        <div className="nid-kpis">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="nid-kpi">
              <ChartState kind="loading" shape="kpi" height={120} />
            </div>
          ))}
        </div>
      ) : (
        <div className="nid-kpis">
          <NidKpiHero
            label="Saldo · Acumulado"
            badge="histórico"
            value={fmtBR(resumo?.saldo_total)}
            unit="vagas"
            delta={resumo ? {
              v: pct(Math.abs(resumo.saldo_total), resumo.total_admissoes + resumo.total_desligamentos),
              up: resumo.saldo_total >= 0,
            } : null}
            foot="empregos formais líquidos"
            color={(resumo?.saldo_total ?? 0) >= 0 ? A5 : A2}
          />
          <NidKpiHero
            label="Admissões"
            badge={ultimoAno ? String(ultimoAno) : null}
            value={fmtBR(totaisAno.admissoes)}
            unit=""
            foot={`${fmtBR(resumo?.total_admissoes)} no histórico`}
            color={A5}
            sparkData={admissoesSpark}
          />
          <NidKpiHero
            label="Desligamentos"
            badge={ultimoAno ? String(ultimoAno) : null}
            value={fmtBR(totaisAno.desligamentos)}
            unit=""
            foot={`${fmtBR(resumo?.total_desligamentos)} no histórico`}
            color={A2}
            sparkData={desligamentosSpark}
          />
          <NidKpiHero
            label="Salário Médio · Admissão"
            badge="último mês"
            value={fmtCurrency(ultimoSalario)}
            unit=""
            foot="média ponderada do período"
            color={A3}
            sparkData={salarioSpark}
          />
        </div>
      )}

      {/* Insight strip */}
      {!loading && resumo && (
        <div className="nid-insights">
          <NidInsight kind={totaisAno.saldo >= 0 ? "up" : "down"}>
            <b>Saldo {anoAtivo}:</b> {totaisAno.saldo > 0 ? "+" : ""}{fmtBR(totaisAno.saldo)} vagas formais.
          </NidInsight>
          {indAtual?.total_aprendiz > 0 && (
            <NidInsight kind="info">
              <b>{fmtBR(indAtual.total_aprendiz)}</b> movimentações de aprendizes em {indAtual.ano}
              {" "}({pct(indAtual.total_aprendiz, indAtual.total_movimentacoes)} do total).
            </NidInsight>
          )}
          {indAtual?.total_intermitente > 0 && (
            <NidInsight kind="info">
              <b>{fmtBR(indAtual.total_intermitente)}</b> trabalhos intermitentes
              {" "}({pct(indAtual.total_intermitente, indAtual.total_movimentacoes)} das movimentações).
            </NidInsight>
          )}
        </div>
      )}

      <div style={{ marginBottom: 22 }}>
        <InsightsPanel dataset="caged" />
      </div>

      {/* Saldo histórico + Turnover mensal */}
      <div className="nid-grid-2">
        <NidPanel
          title={usarSaldoMensal ? "Saldo Mensal" : "Saldo Anual"}
          sub={comparar && cmp.temAnterior
            ? `${cmp.series[0]} vs ${cmp.series[1]} · ${
                cmp.deltaPct != null
                  ? `${cmp.deltaPct >= 0 ? "+" : ""}${cmp.deltaPct.toFixed(1)}%`
                  : "—"
              } no acumulado`
            : usarSaldoMensal ? "Empregos formais líquidos por mês" : "Empregos formais líquidos por ano"}
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
                yFmt={fmtNumberShort}
                tipFmt={fmtNumber}
              />
            </>
          ) : (
            <>
              <AreaLineChart
                data={saldoSerie}
                color={A5}
                glow
                height={280}
                label="Saldo"
                yFmt={fmtNumberShort}
                tipFmt={fmtNumber}
                annotations={saldoAnnotations}
              />
              <NidLegend items={[{ name: "Saldo (admissões − desligamentos)", color: A5 }]} />
            </>
          )}
        </NidPanel>

        <NidPanel
          title="Movimentação CAGED"
          sub={turnoverMode === "saldo"
            ? `saldo mensal · acumulado YTD · ${anoAtivo || ""}`
            : `admissões vs. desligamentos · ${anoAtivo || ""}`}
          tabs={["Saldo", "Bruto"]}
          onTabChange={(i) => setTurnoverMode(i === 0 ? "saldo" : "bruto")}
        >
          <TwinBarChart
            data={turnoverMes}
            glow
            colorUp={A5}
            colorDown={A2}
            height={260}
            mode={turnoverMode}
          />
          {turnoverMode === "bruto" && (
            <NidLegend items={[
              { name: "Admissões", color: A5 },
              { name: "Desligamentos", color: A2 },
            ]} />
          )}
          {turnoverMode === "saldo" && (
            <NidLegend items={[
              { name: "Saldo (+/−)", color: A5 },
              { name: "Acumulado YTD", color: A1 },
            ]} />
          )}
        </NidPanel>
      </div>

      {/* CNAE saldo + composition */}
      <div className="nid-grid-1-1">
        <PlanGate planKey="caged.por_cnae">
          <NidPanel title="Setores · Saldo do Ano" sub={`${anoAtivo || ""} · admissões − desligamentos`}>
            {cnaeRanking.length > 0 ? (
              <HBarChart
                data={cnaeRanking.slice(0, 8).map((d) => ({ label: d.label, value: d.value }))}
                color={A1}
                glow
                height={260}
                fmt={(v) => `${v > 0 ? "+" : ""}${fmtBR(v)}`}
                onSelect={(d) => {
                  const serie = Object.entries(
                    porCnae
                      .filter((r) => r.descricao_secao === d.label)
                      .reduce((acc, r) => {
                        acc[r.ano] = (acc[r.ano] || 0) + (r.saldo || 0);
                        return acc;
                      }, {})
                  )
                    .sort(([a], [b]) => Number(a) - Number(b))
                    .map(([ano, value]) => ({ label: String(ano), value }));
                  setDetalhe({ titulo: d.label, serie });
                }}
              />
            ) : <EmptyMsg height={260} />}
          </NidPanel>
        </PlanGate>

        <PlanGate planKey="caged.por_cnae">
          <NidPanel title="Composição Setorial" sub={`Admissões por setor · ${anoAtivo || ""}`}>
            {cnaeSaldoAno.length > 0 ? (
              <DonutChart
                data={cnaeSaldoAno}
                colors={palette}
                legend
                glow
                height={210}
                centerLabel={fmtNumberShort(totaisAno.admissoes)}
                centerSub="ADMISSÕES"
              />
            ) : <EmptyMsg height={210} />}
          </NidPanel>
        </PlanGate>
      </div>

      {/* NEW: Tamanho estab + PCD tipo deficiência */}
      <div className="nid-grid-1-1">
        <NidPanel title="Por Tamanho de Estabelecimento" sub={`Saldo · ${anoAtivo || ""}`}>
          {tamanhoAno.length > 0 ? (
            <HBarChart
              data={tamanhoAno}
              color={A3}
              glow
              height={260}
              fmt={(v) => `${v > 0 ? "+" : ""}${fmtBR(v)}`}
            />
          ) : <EmptyMsg height={260} />}
        </NidPanel>

        <NidPanel title="PCD por Tipo de Deficiência" sub={`Saldo · ${anoAtivo || ""}`}>
          {tipoDefAno.length > 0 ? (
            <HBarChart
              data={tipoDefAno}
              color={A4}
              glow
              height={260}
              fmt={(v) => `${v > 0 ? "+" : ""}${fmtBR(v)}`}
            />
          ) : <EmptyMsg height={260} />}
        </NidPanel>
      </div>

      {/* NEW: Tipo empregador + Tipo estabelecimento */}
      <div className="nid-grid-1-1">
        <NidPanel title="Tipo de Empregador" sub={`Admissões · ${anoAtivo || ""}`}>
          {tipoEmpAno.length > 0 ? (
            <DonutChart
              data={tipoEmpAno}
              colors={palette}
              glow
              height={210}
              centerLabel={fmtNumberShort(tipoEmpAno.reduce((s, d) => s + d.value, 0))}
              centerSub="ADMISSÕES"
            />
          ) : <EmptyMsg height={210} />}
          <NidLegend items={tipoEmpAno.map((d, i) => ({ name: d.name, color: palette[i % palette.length] }))} />
        </NidPanel>

        <NidPanel title="Tipo de Estabelecimento" sub={`Admissões · ${anoAtivo || ""}`}>
          {tipoEstabAno.length > 0 ? (
            <DonutChart
              data={tipoEstabAno}
              colors={palette}
              glow
              height={210}
              centerLabel={fmtNumberShort(tipoEstabAno.reduce((s, d) => s + d.value, 0))}
              centerSub="ADMISSÕES"
            />
          ) : <EmptyMsg height={210} />}
          <NidLegend items={tipoEstabAno.map((d, i) => ({ name: d.name, color: palette[i % palette.length] }))} />
        </NidPanel>
      </div>

      {/* CNAE stacked over time */}
      {cnaeStacked.data.length > 0 && cnaeStacked.keys.length > 0 && (
        <PlanGate planKey="caged.por_cnae">
          <div style={{ marginBottom: 22 }}>
            <NidPanel title="Movimentações por Setor · Histórico" sub="Top 5 setores · admissões + desligamentos por ano">
              <StackedBarChart
                data={cnaeStacked.data}
                keys={cnaeStacked.keys}
                colors={palette}
                glow
                height={280}
                yFmt={fmtNumberShort}
                tipFmt={fmtNumber}
              />
              <NidLegend items={cnaeStacked.keys.map((k, i) => ({ name: k, color: palette[i % palette.length] }))} />
            </NidPanel>
          </div>
        </PlanGate>
      )}

      {/* Sexo + Raça */}
      <div className="nid-grid-1-1">
        <PlanGate planKey="caged.por_sexo">
          <NidPanel title="Admissões por Sexo" sub={`Distribuição · ${anoAtivo || ""}`}>
            {sexoAno.length > 0 ? (
              <DonutChart data={sexoAno} colors={[A1, A2, A3]} glow height={210}
                centerLabel={fmtNumberShort(sexoAno.reduce((s, d) => s + d.value, 0))}
                centerSub="ADMISSÕES" />
            ) : <EmptyMsg height={210} />}
            <NidLegend items={sexoAno.map((d, i) => ({ name: d.name, color: [A1, A2, A3][i % 3] }))} />
          </NidPanel>
        </PlanGate>

        <PlanGate planKey="caged.por_raca">
          <NidPanel title="Admissões por Raça/Cor" sub={`Distribuição · ${anoAtivo || ""}`}>
            {racaAno.length > 0 ? (
              <DonutChart data={racaAno} colors={palette} legend glow height={210}
                centerLabel={fmtNumberShort(racaAno.reduce((s, d) => s + d.value, 0))}
                centerSub="ADMISSÕES" />
            ) : <EmptyMsg height={210} />}
          </NidPanel>
        </PlanGate>
      </div>

      {/* Faixa etária + Escolaridade */}
      <div className="nid-grid-1-1">
        <NidPanel title="Admissões por Faixa Etária" sub={`${anoAtivo || ""}`}>
          {faixaEtariaAno.length > 0 ? (
            <HBarChart data={faixaEtariaAno} color={A3} glow height={260} fmt={fmtNumber} />
          ) : <EmptyMsg height={260} />}
        </NidPanel>

        <NidPanel title="Admissões por Escolaridade" sub={`${anoAtivo || ""}`}>
          {escolaridadeAno.length > 0 ? (
            <HBarChart data={escolaridadeAno} color={A4} glow height={260} fmt={fmtNumber} />
          ) : <EmptyMsg height={260} />}
        </NidPanel>
      </div>

      <div style={{ marginBottom: 22 }}>
        <NidPanel title="Tipo de Movimentação" sub={`Detalhamento · ${anoAtivo || ""}`}>
          {tipoMovAno.length > 0 ? (
            <HBarChart data={tipoMovAno} color={A1} glow height={260} fmt={fmtNumber} />
          ) : <EmptyMsg height={260} />}
        </NidPanel>
      </div>

      {/* NEW: contract-quality KPI strip */}
      {indAtual && (
        <div className="nid-kpis" style={{ marginBottom: 22 }}>
          <NidKpiHero
            label="Trabalho Parcial"
            badge={String(indAtual.ano)}
            value={fmtBR(indAtual.total_parcial)}
            unit="mov."
            foot={pct(indAtual.total_parcial, indAtual.total_movimentacoes)}
            color={A3}
          />
          <NidKpiHero
            label="Intermitente"
            badge={String(indAtual.ano)}
            value={fmtBR(indAtual.total_intermitente)}
            unit="mov."
            foot={pct(indAtual.total_intermitente, indAtual.total_movimentacoes)}
            color={A2}
          />
          <NidKpiHero
            label="Aprendizes"
            badge={String(indAtual.ano)}
            value={fmtBR(indAtual.total_aprendiz)}
            unit="mov."
            foot={pct(indAtual.total_aprendiz, indAtual.total_movimentacoes)}
            color={A5}
          />
          <NidKpiHero
            label="PCD"
            badge={String(indAtual.ano)}
            value={fmtBR(indAtual.total_pcd)}
            unit="mov."
            foot={pct(indAtual.total_pcd, indAtual.total_movimentacoes)}
            color={A4}
          />
        </div>
      )}

      <div style={{ marginTop: 8 }}>
        <ReleasesPanel dataset="caged" />
      </div>
      </>
      )}

      <DetalheModal
        open={!!detalhe}
        onClose={() => setDetalhe(null)}
        titulo={detalhe?.titulo}
        serie={detalhe?.serie}
        fmt={(v) => `${v > 0 ? "+" : ""}${fmtBR(v)}`}
      />
    </motion.div>
  );
}

function EmptyMsg({ height = 200 }) {
  return (
    <div style={{
      height, display: "grid", placeItems: "center",
      color: "var(--text-mute)", fontSize: 13, fontFamily: "var(--font-mono)",
    }}>
      Sem dados disponíveis
    </div>
  );
}
