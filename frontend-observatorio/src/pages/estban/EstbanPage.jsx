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
import { MultiLineChart, StackedBarChart, HBarChart, fmtMoneyShort, fmtMoneyFull } from "../../components/nid/charts";
import CompareToggle from "../../components/nid/CompareToggle";
import { comparePanelData } from "../../utils/periodos";
import ChartState from "../../components/nid/ChartState.jsx";
import DataTable from "../../components/nid/DataTable";
import { useAuth } from "../../context/AuthContext";
import { useViewAs } from "../../context/ViewAsContext";


const fmtBRL = (v) =>
  v != null
    ? `R$ ${Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`
    : "—";

const fmtNum = (v) => (v != null ? Number(v).toLocaleString("pt-BR") : "—");

export default function EstbanPage() {
  const { user } = useAuth();
  const { viewAsId } = useViewAs();
  // ADMIN_GLOBAL precisa de um município selecionado (view-as) para escopar os
  // gráficos do dashboard; sem seleção, pedimos para escolher em vez de
  // sobrepor todos os municípios no mesmo gráfico.
  const needsMunicipio = user?.role === "ADMIN_GLOBAL" && viewAsId == null;

  const [rawSerie, setRawSerie] = useState([]);
  const [rawCaptacao, setRawCaptacao] = useState([]);
  const [rawComposicao, setRawComposicao] = useState([]);
  const [resumo, setResumo] = useState(null);
  const [porInstituicao, setPorInstituicao] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ yearFrom: "", yearTo: "" });
  const [comparar, setComparar] = useState(false);
  const rawSerieCmp = useMemo(
    () => rawSerie.map((d) => {
      const dt = new Date(d.data_referencia);
      return { ...d, ano: dt.getFullYear(), mes: dt.getMonth() + 1 };
    }),
    [rawSerie]
  );
  const cmp = useMemo(() => comparePanelData(rawSerieCmp, { valueKey: "valor_operacoes_credito" }), [rawSerieCmp]);

  useEffect(() => {
    Promise.all([
      api.get("/estban/serie"),
      api.get("/estban/resumo"),
      api.get("/estban/por_instituicao"),
      api.get("/estban/captacao_serie"),
      api.get("/estban/composicao_credito"),
    ])
      .then(([serieRes, resumoRes, instRes, captRes, composicaoRes]) => {
        const raw = (serieRes.data || []).sort((a, b) =>
          String(a.data_referencia).localeCompare(String(b.data_referencia))
        );
        setRawSerie(raw);
        setRawCaptacao((captRes.data || []).sort((a, b) =>
          String(a.data_referencia).localeCompare(String(b.data_referencia))
        ));
        setRawComposicao((composicaoRes.data || []).sort((a, b) =>
          String(a.data_referencia).localeCompare(String(b.data_referencia))
        ));
        setResumo(resumoRes.data);
        const sorted = (instRes.data || []).sort(
          (a, b) =>
            (b.valor_operacoes_credito ?? 0) - (a.valor_operacoes_credito ?? 0)
        );
        setPorInstituicao(sorted);
      })
      .catch((err) => console.error("Erro ao carregar ESTBAN:", err))
      .finally(() => setLoading(false));
  }, []);

  const years = useMemo(() => {
    const set = new Set(rawSerie.map((d) => parseInt(String(d.data_referencia).substring(0, 4))));
    return [...set].sort();
  }, [rawSerie]);

  const applyYearFilter = (d) => {
    const { yearFrom, yearTo } = filters;
    const y = parseInt(String(d.data_referencia).substring(0, 4));
    if (yearFrom && y < +yearFrom) return false;
    if (yearTo && y > +yearTo) return false;
    return true;
  };

  const serie = useMemo(() => rawSerie.filter(applyYearFilter), [rawSerie, filters]);
  const captacao = useMemo(() => rawCaptacao.filter(applyYearFilter), [rawCaptacao, filters]);
  const composicao = useMemo(() => rawComposicao.filter(applyYearFilter), [rawComposicao, filters]);

  const cards = [
    {
      label: "Agências",
      value: fmtNum(resumo?.qtd_agencias),
      sub: "Unidades ativas",
      accent: "var(--accent-1)",
      dataset: "estban",
      indicadorKey: "agencias",
    },
    {
      label: "Operações de Crédito",
      value: fmtBRL(resumo?.total_operacoes_credito),
      sub: "Saldo total",
      accent: "var(--accent-5)",
      dataset: "estban",
      indicadorKey: "credito_total",
    },
    {
      label: "Total Depósitos",
      value: fmtBRL(resumo?.total_depositos),
      sub: "Vista + Poupança + Prazo",
      accent: "var(--accent-3)",
      dataset: "estban",
      indicadorKey: "depositos_total",
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
        title={<>ESTBAN — Estatísticas Bancárias <InfoTooltip dataset="estban" /></>}
        sub="Operações de crédito, depósitos e agências bancárias."
        chips={describeFilter(filters) ? [{
          label: describeFilter(filters),
          active: true,
          onClick: () => document.getElementById("filter-bar-estban")?.scrollIntoView({ block: "center", behavior: "smooth" }),
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
            município e visualizar os dados de ESTBAN.
          </p>
        </div>
      ) : (
      <>
      <div className="flex items-center justify-end">
        <CompareToggle active={comparar} onChange={setComparar} disabled={!cmp.temAnterior} />
      </div>

      <FilterBar id="filter-bar-estban" years={years} value={filters} onChange={setFilters} />

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
          {cards.map((c) => (
            <KpiCard key={c.label} {...c} />
          ))}
        </div>
      )}

      <InsightsPanel dataset="estban" />

      {/* Evolução das Operações de Crédito */}
      <NidPanel
        title="Evolução das Operações de Crédito"
        sub={comparar && cmp.temAnterior
          ? `${cmp.series[0]} vs ${cmp.series[1]} · ${
              cmp.deltaPct != null
                ? `${cmp.deltaPct >= 0 ? "+" : ""}${cmp.deltaPct.toFixed(1)}%`
                : "—"
            } no acumulado`
          : "operações de crédito, poupança e depósitos a prazo"}
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
              yFmt={fmtMoneyShort}
              tipFmt={fmtMoneyFull}
            />
          </>
        ) : (
          <MultiLineChart
            data={serie.map((d) => ({
              label: String(d.data_referencia),
              "Operações de Crédito": d.valor_operacoes_credito || 0,
              "Poupança": d.valor_poupanca || 0,
              "Depósitos a Prazo": d.valor_depositos_prazo || 0,
            }))}
            series={["Operações de Crédito", "Poupança", "Depósitos a Prazo"]}
            colors={["var(--accent-1)", "var(--accent-5)", "var(--accent-4)"]}
            height={280}
            legend
            yFmt={(v) => `R$ ${(v / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}M`}
            tipFmt={fmtBRL}
            loading={loading}
            emptyMessage="Sem dados disponíveis"
          />
        )}
      </NidPanel>

      {/* Captação — Depósitos por Tipo */}
      <NidPanel title="Evolução da Captação — Depósitos por Tipo">
        <MultiLineChart
          data={captacao.map((d) => ({
            label: String(d.data_referencia),
            "Depósitos à Vista": d.depositos_vista || 0,
            "Poupança": d.poupanca || 0,
            "Depósitos a Prazo": d.depositos_prazo || 0,
          }))}
          series={["Depósitos à Vista", "Poupança", "Depósitos a Prazo"]}
          colors={["var(--accent-1)", "var(--accent-5)", "var(--accent-4)"]}
          height={280}
          legend
          yFmt={(v) => `R$ ${(v / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}M`}
          tipFmt={fmtBRL}
          loading={loading}
          emptyMessage="Sem dados disponíveis"
        />
      </NidPanel>

      {/* Crédito vs. Captação Total */}
      <NidPanel title="Crédito vs. Captação Total">
        <MultiLineChart
          data={captacao.map((d) => ({
            label: String(d.data_referencia),
            "Operações de Crédito": d.operacoes_credito || 0,
            "Total Captação": d.total_captacao || 0,
          }))}
          series={["Operações de Crédito", "Total Captação"]}
          colors={["var(--accent-1)", "var(--accent-5)"]}
          height={240}
          legend
          yFmt={(v) => `R$ ${(v / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}M`}
          tipFmt={fmtBRL}
          loading={loading}
          emptyMessage="Sem dados disponíveis"
        />
      </NidPanel>

      {/* Composição do Crédito */}
      <NidPanel title="Composição das Operações de Crédito">
        <StackedBarChart
          data={composicao.map((d) => ({
            label: String(d.data_referencia),
            "Empréstimos/Títulos": d.emprestimos_titulos_descontados || 0,
            "Financiamentos Gerais": d.financiamentos_gerais || 0,
            "Financiamentos Imobiliários": d.financiamentos_imobiliarios || 0,
            "Financiamento Agropecuário": d.financiamento_agropecuario || 0,
            "Arrendamento Mercantil": d.arrendamento_mercantil || 0,
            "Setor Público": d.emprestimos_setor_publico || 0,
            "Outros Créditos": d.outros_creditos || 0,
          }))}
          keys={["Empréstimos/Títulos", "Financiamentos Gerais", "Financiamentos Imobiliários", "Financiamento Agropecuário", "Arrendamento Mercantil", "Setor Público", "Outros Créditos"]}
          colors={["var(--accent-1)", "var(--accent-5)", "var(--accent-4)", "var(--accent-6)", "var(--accent-3)", "var(--accent-7)", "var(--chart-muted)"]}
          height={280}
          legend
          yFmt={(v) => `R$ ${(v / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}M`}
          tipFmt={fmtBRL}
          loading={loading}
          emptyMessage="Sem dados disponíveis"
        />
      </NidPanel>

      {/* Crédito por Instituição */}
      <PlanGate planKey="estban.por_instituicao">
      <NidPanel title="Operações de Crédito por Instituição">
        <HBarChart
          data={porInstituicao.slice(0, 10).map((d) => ({ label: d.nome_instituicao, value: d.valor_operacoes_credito || 0 }))}
          color="var(--accent-1)"
          fmt={fmtBRL}
          loading={loading}
          emptyMessage="Sem dados disponíveis"
        />
      </NidPanel>

      {/* Composição do Crédito por Instituição */}
      {!loading && porInstituicao.length > 0 && porInstituicao.some(r => r.financiamentos_gerais > 0 || r.emprestimos_titulos_descontados > 0) && (
        <NidPanel title="Composição do Crédito por Instituição">
          <StackedBarChart
            data={porInstituicao.slice(0, 8).map((d) => ({
              label: d.nome_instituicao,
              "Empréstimos/Títulos": d.emprestimos_titulos_descontados || 0,
              "Financiamentos Gerais": d.financiamentos_gerais || 0,
              "Imobiliário": d.financiamentos_imobiliarios || 0,
              "Agropecuário": d.financiamento_agropecuario || 0,
              "Arrendamento": d.arrendamento_mercantil || 0,
              "Setor Público": d.emprestimos_setor_publico || 0,
              "Outros": d.outros_creditos || 0,
            }))}
            keys={["Empréstimos/Títulos", "Financiamentos Gerais", "Imobiliário", "Agropecuário", "Arrendamento", "Setor Público", "Outros"]}
            colors={["var(--accent-1)", "var(--accent-5)", "var(--accent-4)", "var(--accent-6)", "var(--accent-3)", "var(--accent-7)", "var(--chart-muted)"]}
            height={280}
            legend
            yFmt={(v) => `R$ ${(v / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}M`}
            tipFmt={fmtBRL}
          />
        </NidPanel>
      )}

      {/* Tabela de Instituições — still inside PlanGate */}
      <NidPanel title="Detalhamento por Instituição">
        {loading ? (
          <div className="animate-pulse h-40 bg-slate-50 rounded-xl" />
        ) : (
          <DataTable
            columns={[
              { key: "nome_instituicao", label: "Instituição" },
              { key: "qtd_agencias", label: "Agências", align: "right", mono: true, fmt: fmtNum },
              { key: "valor_operacoes_credito", label: "Operações Crédito", align: "right", mono: true, fmt: fmtBRL },
              { key: "valor_depositos_vista", label: "Depósitos Vista", align: "right", mono: true, fmt: fmtBRL },
              { key: "valor_poupanca", label: "Poupança", align: "right", mono: true, fmt: fmtBRL },
              { key: "valor_depositos_prazo", label: "Dep. Prazo", align: "right", mono: true, fmt: fmtBRL },
            ]}
            data={porInstituicao}
            pageSize={12}
            emptyMessage="Sem dados disponíveis"
          />
        )}
      </NidPanel>
      </PlanGate>
      <NidComparativoPanel
        title="Comparativo Municipal · Crédito Bancário"
        sub="Ranking por total de operações de crédito do sistema bancário"
        endpoint="/estban/comparativo"
        metric="credito_total"
        fmt={(v) => `R$ ${Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`}
        color="var(--accent-1)"
      />

      <ReleasesPanel dataset="estban" />
      </>
      )}

    </motion.div>
  );
}


