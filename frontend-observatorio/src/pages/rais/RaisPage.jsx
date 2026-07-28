import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import api from "../../services/api";
import InsightsPanel from "../../components/InsightsPanel";
import ReleasesPanel from "../../components/ReleasesPanel";
import {
  NidPageHeader, NidPanel, NidLegend, NidInsight, NidKpiHero,
} from "../../components/nid/Panel";
import {
  AreaLineChart, StackedBarChart, TwinBarChart, DonutChart, HBarChart,
  fmtNumber, fmtNumberShort, fmtMoneyFull,
} from "../../components/nid/charts";
import InfoTooltip from "../../components/InfoTooltip";
import PlanGate from "../../components/PlanGate";
import DetalheModal from "../../components/nid/DetalheModal";
import DataTable from "../../components/nid/DataTable";
import { useAuth } from "../../context/AuthContext";
import { useViewAs } from "../../context/ViewAsContext";

const A1 = "var(--accent-1)";
const A2 = "var(--accent-2)";
const A3 = "var(--accent-3)";
const A4 = "var(--accent-4)";
const A5 = "var(--accent-5)";

const MES_LABEL = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

const fmtBR = (v, opts = {}) => v != null ? Number(v).toLocaleString("pt-BR", opts) : "—";
const fmtCurrency = (v) => v != null
  ? Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })
  : "—";
const pct = (n, d) => d > 0 ? `${((n / d) * 100).toFixed(1)}%` : "—";

function aggregateByYear(rows, groupKey, valueKey = "total_vinculos") {
  const acc = new Map();
  rows.forEach((r) => {
    const k = r[groupKey];
    acc.set(k, (acc.get(k) || 0) + (Number(r[valueKey]) || 0));
  });
  return Array.from(acc.entries())
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);
}

export default function RaisPage() {
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
  const [porCnae, setPorCnae] = useState([]);
  const [porFaixaEtaria, setPorFaixaEtaria] = useState([]);
  const [porEscolaridade, setPorEscolaridade] = useState([]);
  const [porFaixaRem, setPorFaixaRem] = useState([]);
  const [porTempoEmprego, setPorTempoEmprego] = useState([]);
  const [metricas, setMetricas] = useState([]);
  // New endpoints
  const [porMotivo, setPorMotivo] = useState([]);
  const [porTipoAdmissao, setPorTipoAdmissao] = useState([]);
  const [porCbo, setPorCbo] = useState([]);
  const [porTamanho, setPorTamanho] = useState([]);
  const [porNatureza, setPorNatureza] = useState([]);
  const [turnover, setTurnover] = useState([]);

  const [loading, setLoading] = useState(true);
  const [detalhe, setDetalhe] = useState(null);

  useEffect(() => {
    let alive = true;
    const safe = (url) => api.get(url).then((r) => r.data).catch(() => []);
    Promise.all([
      safe("/rais/serie"),
      api.get("/rais/resumo").then((r) => r.data).catch(() => null),
      safe("/rais/por_sexo"),
      safe("/rais/por_raca"),
      safe("/rais/por_cnae"),
      safe("/rais/por_faixa_etaria"),
      safe("/rais/por_escolaridade"),
      safe("/rais/por_faixa_remuneracao"),
      safe("/rais/por_faixa_tempo_emprego"),
      safe("/rais/metricas_anuais"),
      safe("/rais/por_motivo_desligamento"),
      safe("/rais/por_tipo_admissao"),
      safe("/rais/por_cbo"),
      safe("/rais/por_tamanho_estabelecimento"),
      safe("/rais/por_natureza_juridica"),
      safe("/rais/turnover_mensal"),
    ]).then(([
      serieRes, resumoRes, sexoRes, racaRes, cnaeRes,
      feRes, escRes, frRes, teRes, metRes,
      motRes, tipoRes, cboRes, tamRes, natRes, turnRes,
    ]) => {
      if (!alive) return;
      setSerie(serieRes); setResumo(resumoRes);
      setPorSexo(sexoRes); setPorRaca(racaRes); setPorCnae(cnaeRes);
      setPorFaixaEtaria(feRes); setPorEscolaridade(escRes);
      setPorFaixaRem(frRes); setPorTempoEmprego(teRes); setMetricas(metRes);
      setPorMotivo(motRes); setPorTipoAdmissao(tipoRes); setPorCbo(cboRes);
      setPorTamanho(tamRes); setPorNatureza(natRes); setTurnover(turnRes);
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

  // Series for hero charts
  const serieChart = useMemo(() => {
    const acc = new Map();
    serie.forEach((d) => acc.set(d.ano, (acc.get(d.ano) || 0) + d.total_vinculos));
    return Array.from(acc.entries())
      .sort(([a], [b]) => a - b)
      .map(([ano, v]) => ({ label: String(ano), value: v }));
  }, [serie]);

  // Spark series for KPI cards
  const sparkVinculos = serieChart.map((d) => d.value);
  const sparkRem = useMemo(() => {
    const acc = new Map();
    serie.forEach((d) => {
      if (!d.remuneracao_media) return;
      if (!acc.has(d.ano)) acc.set(d.ano, []);
      acc.get(d.ano).push(d.remuneracao_media);
    });
    return Array.from(acc.entries())
      .sort(([a], [b]) => a - b)
      .map(([, vals]) => vals.reduce((s, v) => s + v, 0) / vals.length);
  }, [serie]);

  const metricasAtual = metricas.find((m) => m.ano === anoAtivo) || metricas.slice(-1)[0] || null;
  const sparkPCD = useMemo(() => metricas.map((m) => m.total_pcd), [metricas]);

  // Latest year metrics for KPI deltas
  const lastTwo = serieChart.slice(-2);
  const vinculosDelta = lastTwo.length === 2 && lastTwo[0].value > 0
    ? ((lastTwo[1].value - lastTwo[0].value) / lastTwo[0].value) * 100
    : null;
  const ultimoVinculos = serieChart[serieChart.length - 1]?.value;

  // Turnover for current year
  const turnoverAno = useMemo(() => {
    const filtered = turnover.filter((t) => t.ano === anoAtivo);
    return MES_LABEL.map((label, i) => {
      const row = filtered.find((t) => t.mes === i + 1);
      return {
        label,
        admissoes: row?.total_admissoes || 0,
        desligamentos: row?.total_desligamentos || 0,
      };
    });
  }, [turnover, anoAtivo]);

  // CNAE stacked-by-year (top 5 sectors)
  const cnaeStacked = useMemo(() => {
    const totalsBySector = aggregateByYear(porCnae, "descricao_secao");
    const top5 = totalsBySector.slice(0, 5).map((d) => d.name);
    const yearsSet = [...new Set(porCnae.map((d) => d.ano))].sort();
    const data = yearsSet.map((ano) => {
      const row = { label: String(ano) };
      top5.forEach((sec) => { row[sec] = 0; });
      porCnae.filter((d) => d.ano === ano && top5.includes(d.descricao_secao))
        .forEach((d) => { row[d.descricao_secao] = (row[d.descricao_secao] || 0) + d.total_vinculos; });
      return row;
    });
    return { data, keys: top5 };
  }, [porCnae]);

  const motivoAno = useMemo(
    () => porMotivo.filter((m) => m.ano === anoAtivo)
      .sort((a, b) => b.total_desligamentos - a.total_desligamentos)
      .slice(0, 8)
      .map((m) => ({ label: m.motivo, value: m.total_desligamentos })),
    [porMotivo, anoAtivo]
  );

  const tipoAdmissaoAno = useMemo(
    () => porTipoAdmissao.filter((m) => m.ano === anoAtivo)
      .sort((a, b) => b.total_admissoes - a.total_admissoes)
      .slice(0, 8)
      .map((m) => ({ label: m.tipo, value: m.total_admissoes })),
    [porTipoAdmissao, anoAtivo]
  );

  const tamanhoAno = useMemo(() => {
    const ORDER = ["Até 4 vínculos", "5 a 9", "10 a 19", "20 a 49", "50 a 99", "100 a 249", "250 a 499", "500 a 999", "1000 ou mais", "Zero / não classificado"];
    return porTamanho
      .filter((t) => t.ano === anoAtivo)
      .sort((a, b) => ORDER.indexOf(a.tamanho) - ORDER.indexOf(b.tamanho))
      .map((t) => ({ name: t.tamanho, value: t.total_vinculos }));
  }, [porTamanho, anoAtivo]);

  const naturezaAno = useMemo(
    () => porNatureza.filter((n) => n.ano === anoAtivo)
      .sort((a, b) => b.total_vinculos - a.total_vinculos)
      .map((n) => ({ name: n.grupo, value: n.total_vinculos })),
    [porNatureza, anoAtivo]
  );

  const cboAno = useMemo(
    () => porCbo.filter((c) => c.ano === anoAtivo)
      .sort((a, b) => b.total_vinculos - a.total_vinculos)
      .slice(0, 10),
    [porCbo, anoAtivo]
  );

  const sexoAno = useMemo(() => {
    const items = porSexo.filter((d) => d.ano === anoAtivo);
    return items.map((d) => ({ name: d.sexo, value: d.total_vinculos }));
  }, [porSexo, anoAtivo]);

  const racaAno = useMemo(() => {
    const items = porRaca.filter((d) => d.ano === anoAtivo);
    return items.map((d) => ({ name: d.raca_cor, value: d.total_vinculos }));
  }, [porRaca, anoAtivo]);

  const escolaridadeAgg = useMemo(() => {
    const acc = new Map();
    porEscolaridade.filter((d) => d.ano === anoAtivo)
      .forEach((d) => acc.set(d.grau_instrucao, (acc.get(d.grau_instrucao) || 0) + d.total_vinculos));
    return Array.from(acc.entries())
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value);
  }, [porEscolaridade, anoAtivo]);

  const faixaRemAgg = useMemo(() => {
    const acc = new Map();
    porFaixaRem.filter((d) => d.ano === anoAtivo)
      .forEach((d) => acc.set(d.faixa_remuneracao_sm, (acc.get(d.faixa_remuneracao_sm) || 0) + d.total_vinculos));
    return Array.from(acc.entries())
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value);
  }, [porFaixaRem, anoAtivo]);

  const faixaEtariaAgg = useMemo(() => {
    const ORDER = ["Até 17 anos", "18 a 24 anos", "25 a 29 anos", "30 a 39 anos", "40 a 49 anos", "50 a 64 anos", "65 anos ou mais"];
    const acc = new Map();
    porFaixaEtaria.filter((d) => d.ano === anoAtivo)
      .forEach((d) => acc.set(d.faixa_etaria, (acc.get(d.faixa_etaria) || 0) + d.total_vinculos));
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

  const tempoEmpregoAgg = useMemo(() => {
    const ORDER = ["Até 3 meses", "3 a 6 meses", "6 a 12 meses", "1 a 2 anos", "2 a 3 anos", "3 a 5 anos", "5 a 10 anos", "10 anos ou mais"];
    const acc = new Map();
    porTempoEmprego.filter((d) => d.ano === anoAtivo)
      .forEach((d) => acc.set(d.faixa_tempo_emprego, (acc.get(d.faixa_tempo_emprego) || 0) + d.total_vinculos));
    return Array.from(acc.entries())
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => {
        const ai = ORDER.indexOf(a.label), bi = ORDER.indexOf(b.label);
        if (ai === -1 && bi === -1) return 0;
        if (ai === -1) return 1;
        if (bi === -1) return -1;
        return ai - bi;
      });
  }, [porTempoEmprego, anoAtivo]);

  const palette = [A1, A3, A2, A4, A5, "#8b5cf6", "#06b6d4"];

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <NidPageHeader
        title={<>RAIS — Vínculos Empregatícios Formais <InfoTooltip dataset="rais" /></>}
        sub="Estoque anual de empregos com carteira · Ministério do Trabalho"
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
            município e visualizar os dados da RAIS.
          </p>
        </div>
      ) : (
      <>
      {/* Year picker */}
      {years.length > 0 && (
        <div style={{ display: "flex", gap: 6, marginBottom: 18, flexWrap: "wrap" }}>
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
      )}

      {/* Hero KPIs */}
      {loading ? (
        <div className="nid-kpis">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="nid-kpi" style={{ minHeight: 150, opacity: 0.4 }} />
          ))}
        </div>
      ) : (
        <div className="nid-kpis">
          <NidKpiHero
            label="Total de Vínculos"
            badge={ultimoAno ? String(ultimoAno) : null}
            value={fmtBR(ultimoVinculos)}
            unit=""
            delta={vinculosDelta != null ? {
              v: `${vinculosDelta > 0 ? "+" : ""}${vinculosDelta.toFixed(1)}%`,
              up: vinculosDelta > 0 ? true : vinculosDelta < 0 ? false : null,
            } : null}
            foot="vs ano anterior"
            color={A1}
            sparkData={sparkVinculos}
          />
          <NidKpiHero
            label="Ativos em 31/12"
            badge={metricasAtual ? String(metricasAtual.ano) : null}
            value={fmtBR(metricasAtual?.total_ativo_dezembro)}
            unit=""
            delta={metricasAtual ? {
              v: pct(metricasAtual.total_ativo_dezembro, metricasAtual.total_vinculos),
              up: null,
            } : null}
            foot="estoque ao final do ano"
            color={A5}
            sparkData={metricas.map((m) => m.total_ativo_dezembro)}
          />
          <NidKpiHero
            label="Remuneração Média"
            badge="anual"
            value={fmtCurrency(resumo?.remuneracao_media)}
            unit=""
            delta={null}
            foot="média do período"
            color={A3}
            sparkData={sparkRem}
          />
          <NidKpiHero
            label="PCD (Pessoas com Deficiência)"
            badge={metricasAtual ? String(metricasAtual.ano) : null}
            value={fmtBR(metricasAtual?.total_pcd)}
            unit="vínculos"
            delta={metricasAtual ? {
              v: pct(metricasAtual.total_pcd, metricasAtual.total_vinculos),
              up: null,
            } : null}
            foot="participação no estoque"
            color={A4}
            sparkData={sparkPCD}
          />
        </div>
      )}

      {/* Insight strip — auto-derived */}
      {!loading && metricasAtual && (
        <div className="nid-insights">
          {vinculosDelta != null && (
            <NidInsight kind={vinculosDelta >= 0 ? "up" : "down"}>
              <b>Estoque {vinculosDelta >= 0 ? "cresce" : "recua"} {Math.abs(vinculosDelta).toFixed(1)}%</b>
              {" "}em {ultimoAno} vs ano anterior.
            </NidInsight>
          )}
          {metricasAtual.total_intermitente > 0 && (
            <NidInsight kind="info">
              <b>{fmtBR(metricasAtual.total_intermitente)}</b> contratos intermitentes
              {" "}em {metricasAtual.ano} ({pct(metricasAtual.total_intermitente, metricasAtual.total_vinculos)} do total).
            </NidInsight>
          )}
          {metricasAtual.total_outro_municipio > 0 && (
            <NidInsight kind="info">
              <b>{fmtBR(metricasAtual.total_outro_municipio)}</b> trabalhadores residem em outro município
              ({pct(metricasAtual.total_outro_municipio, metricasAtual.total_vinculos)} dos vínculos).
            </NidInsight>
          )}
        </div>
      )}

      <div style={{ marginBottom: 22 }}>
        <InsightsPanel dataset="rais" />
      </div>

      {/* Evolution + CNAE composition */}
      <div className="nid-grid-2">
        <NidPanel title="Evolução de Vínculos" sub="Estoque total por ano">
          <AreaLineChart
            data={serieChart}
            color={A1}
            glow
            height={280}
            label="Vínculos"
            yFmt={fmtNumberShort}
            tipFmt={fmtNumber}
          />
          <NidLegend items={[{ name: "Vínculos formais", color: A1 }]} />
        </NidPanel>

        <PlanGate planKey="rais.por_cnae">
          <NidPanel title="Top Setores (CNAE)" sub={`Composição ${anoAtivo || ""}`}>
            {porCnae.filter((d) => d.ano === anoAtivo).length > 0 ? (
              <DonutChart
                data={aggregateByYear(porCnae.filter((d) => d.ano === anoAtivo), "descricao_secao").slice(0, 6).map((s) => ({ label: s.name, value: s.value }))}
                colors={palette}
                glow
                height={210}
                centerLabel={fmtNumberShort(metricasAtual?.total_vinculos || 0)}
                centerSub="VÍNCULOS"
                onSelect={(s) => {
                  const sectorName = s.label;
                  const serie = Object.entries(
                    porCnae
                      .filter((r) => r.descricao_secao === sectorName)
                      .reduce((acc, r) => {
                        acc[r.ano] = (acc[r.ano] || 0) + (r.total_vinculos || 0);
                        return acc;
                      }, {})
                  )
                    .sort(([a], [b]) => Number(a) - Number(b))
                    .map(([ano, value]) => ({ label: String(ano), value }));
                  setDetalhe({ titulo: sectorName, serie });
                }}
              />
            ) : (
              <EmptyMsg height={210} />
            )}
            <NidLegend items={aggregateByYear(porCnae.filter((d) => d.ano === anoAtivo), "descricao_secao").slice(0, 6).map((s, i) => ({
              name: `${s.name}`, color: palette[i % palette.length],
            }))} />
          </NidPanel>
        </PlanGate>
      </div>

      {/* Turnover + Motivos de Desligamento (NEW) */}
      <div className="nid-grid-1-1">
        <NidPanel title="Turnover Mensal" sub={`Admissões vs Desligamentos · ${anoAtivo || ""}`}>
          <TwinBarChart data={turnoverAno} glow colorUp={A5} colorDown={A2} height={260} />
          <NidLegend items={[
            { name: "Admissões", color: A5 },
            { name: "Desligamentos", color: A2 },
          ]} />
        </NidPanel>

        <NidPanel title="Natureza Jurídica" sub={`Composição público / privado / outros · ${anoAtivo || ""}`}>
          {naturezaAno.length > 0 ? (
            <DonutChart
              data={naturezaAno}
              colors={palette}
              glow
              height={210}
              centerLabel={fmtNumberShort(naturezaAno.reduce((s, d) => s + d.value, 0))}
              centerSub="VÍNCULOS"
            />
          ) : <EmptyMsg height={210} />}
          <NidLegend items={naturezaAno.map((d, i) => ({
            name: `${d.name}`, color: palette[i % palette.length],
          }))} />
        </NidPanel>
      </div>

      {/* Tipo Admissão + Tamanho Estab (NEW) */}
      <div className="nid-grid-1-1">
        <NidPanel title="Tipo de Admissão" sub={`Como as pessoas foram contratadas · ${anoAtivo || ""}`}>
          {tipoAdmissaoAno.length > 0 ? (
            <HBarChart data={tipoAdmissaoAno} color={A5} glow height={240} fmt={fmtNumber} />
          ) : <EmptyMsg height={240} />}
        </NidPanel>

        <NidPanel title="Por Tamanho de Estabelecimento" sub={`Onde estão os vínculos · ${anoAtivo || ""}`}>
          {tamanhoAno.length > 0 ? (
            <DonutChart
              data={tamanhoAno}
              colors={palette}
              glow
              height={210}
              centerLabel={fmtNumberShort(tamanhoAno.reduce((s, d) => s + d.value, 0))}
              centerSub="VÍNCULOS"
            />
          ) : <EmptyMsg height={210} />}
          <NidLegend items={tamanhoAno.map((d, i) => ({
            name: `${d.name}`, color: palette[i % palette.length],
          }))} />
        </NidPanel>
      </div>

      {/* CNAE stacked over time */}
      {cnaeStacked.data.length > 0 && cnaeStacked.keys.length > 0 && (
        <PlanGate planKey="rais.por_cnae">
          <div style={{ marginBottom: 22 }}>
            <NidPanel title="Evolução por Setor" sub="Top 5 setores · estoque por ano">
              <StackedBarChart
                data={cnaeStacked.data}
                keys={cnaeStacked.keys}
                colors={palette}
                glow
                height={280}
                yFmt={fmtNumberShort}
                tipFmt={fmtNumber}
              />
              <NidLegend items={cnaeStacked.keys.map((k, i) => ({
                name: k, color: palette[i % palette.length],
              }))} />
            </NidPanel>
          </div>
        </PlanGate>
      )}

      {/* Demographic breakdowns: Sexo + Raça */}
      <div className="nid-grid-1-1">
        <PlanGate planKey="rais.por_sexo">
          <NidPanel title="Vínculos por Sexo" sub={`Distribuição · ${anoAtivo || ""}`}>
            {sexoAno.length > 0 ? (
              <DonutChart data={sexoAno} colors={[A1, A2, A3]} glow height={210}
                centerLabel={fmtNumberShort(sexoAno.reduce((s, d) => s + d.value, 0))}
                centerSub="VÍNCULOS" />
            ) : <EmptyMsg height={210} />}
            <NidLegend items={sexoAno.map((d, i) => ({ name: d.name, color: [A1, A2, A3][i % 3] }))} />
          </NidPanel>
        </PlanGate>

        <PlanGate planKey="rais.por_raca">
          <NidPanel title="Vínculos por Raça/Cor" sub={`Distribuição · ${anoAtivo || ""}`}>
            {racaAno.length > 0 ? (
              <DonutChart data={racaAno} colors={palette} glow height={210}
                centerLabel={fmtNumberShort(racaAno.reduce((s, d) => s + d.value, 0))}
                centerSub="VÍNCULOS" />
            ) : <EmptyMsg height={210} />}
            <NidLegend items={racaAno.map((d, i) => ({ name: d.name, color: palette[i % palette.length] }))} />
          </NidPanel>
        </PlanGate>
      </div>

      {/* Faixa etária + Escolaridade */}
      <div className="nid-grid-1-1">
        <PlanGate planKey="rais.por_faixa_etaria">
          <NidPanel title="Faixa Etária" sub={`Distribuição · ${anoAtivo || ""}`}>
            {faixaEtariaAgg.length > 0 ? (
              <HBarChart data={faixaEtariaAgg} color={A3} glow height={260} fmt={fmtNumber} />
            ) : <EmptyMsg height={260} />}
          </NidPanel>
        </PlanGate>

        <PlanGate planKey="rais.por_escolaridade">
          <NidPanel title="Grau de Instrução" sub={`Escolaridade · ${anoAtivo || ""}`}>
            {escolaridadeAgg.length > 0 ? (
              <HBarChart data={escolaridadeAgg.slice(0, 8)} color={A4} glow height={260} fmt={fmtNumber} />
            ) : <EmptyMsg height={260} />}
          </NidPanel>
        </PlanGate>
      </div>

      {/* Faixa salarial + Tempo emprego */}
      <div className="nid-grid-1-1">
        <PlanGate planKey="rais.por_remuneracao">
          <NidPanel title="Faixa Salarial (Salários Mínimos)" sub={`Distribuição · ${anoAtivo || ""}`}>
            {faixaRemAgg.length > 0 ? (
              <HBarChart data={faixaRemAgg.slice(0, 10)} color={A1} glow height={280} fmt={fmtNumber} />
            ) : <EmptyMsg height={280} />}
          </NidPanel>
        </PlanGate>

        <NidPanel title="Tempo de Emprego" sub={`Permanência no vínculo · ${anoAtivo || ""}`}>
          {tempoEmpregoAgg.length > 0 ? (
            <HBarChart data={tempoEmpregoAgg} color={A5} glow height={280} fmt={fmtNumber} />
          ) : <EmptyMsg height={280} />}
        </NidPanel>
      </div>

      {/* Indicadores de Contrato (mini KPI strip from new metricas fields) */}
      {metricasAtual && (
        <div className="nid-kpis" style={{ marginTop: 8 }}>
          <NidKpiHero
            label="Trabalho Parcial"
            badge={String(metricasAtual.ano)}
            value={fmtBR(metricasAtual.total_parcial)}
            unit=""
            foot={pct(metricasAtual.total_parcial, metricasAtual.total_vinculos)}
            color={A3}
          />
          <NidKpiHero
            label="Intermitente"
            badge={String(metricasAtual.ano)}
            value={fmtBR(metricasAtual.total_intermitente)}
            unit=""
            foot={pct(metricasAtual.total_intermitente, metricasAtual.total_vinculos)}
            color={A2}
          />
          <NidKpiHero
            label="Empresa do Simples"
            badge={String(metricasAtual.ano)}
            value={fmtBR(metricasAtual.total_simples)}
            unit=""
            foot={pct(metricasAtual.total_simples, metricasAtual.total_vinculos)}
            color={A4}
          />
          <NidKpiHero
            label="Aprendizes (estim.)"
            badge={String(metricasAtual.ano)}
            value={fmtBR(metricasAtual.total_aprendiz_estimado)}
            unit=""
            foot={pct(metricasAtual.total_aprendiz_estimado, metricasAtual.total_vinculos)}
            color={A5}
          />
        </div>
      )}

      {/* Motivos de Desligamento + Top 10 Ocupações (movidos para o final) */}
      <div className="nid-grid-1-1">
        <NidPanel title="Motivos de Desligamento" sub={`Top causas · ${anoAtivo || ""}`}>
          {motivoAno.length > 0 ? (
            <HBarChart data={motivoAno} color={A2} glow height={260} fmt={fmtNumber} />
          ) : <EmptyMsg height={260} />}
        </NidPanel>

        <NidPanel title="Top 10 Ocupações (CBO 2002)" sub={`Família ocupacional · ${anoAtivo || ""}`}>
          <DataTable
            columns={[
              { key: "cbo_familia", label: "CBO", width: 70, mono: true },
              { key: "descricao", label: "Descrição" },
              { key: "total_vinculos", label: "Vínculos", align: "right", mono: true, fmt: fmtBR },
              { key: "remuneracao_media", label: "Rem. média", align: "right", mono: true, fmt: fmtCurrency },
            ]}
            data={cboAno}
            emptyMessage="Sem dados disponíveis"
          />
        </NidPanel>
      </div>

      <div style={{ marginTop: 8 }}>
        <ReleasesPanel dataset="rais" />
      </div>
      </>
      )}

      <DetalheModal
        open={!!detalhe}
        onClose={() => setDetalhe(null)}
        titulo={detalhe?.titulo}
        serie={detalhe?.serie}
        fmt={fmtNumber}
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

// Suppress unused import warnings (kept for future use)
void fmtMoneyFull;
