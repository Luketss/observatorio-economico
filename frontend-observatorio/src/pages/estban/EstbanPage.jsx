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
import { NidPageHeader } from "../../components/nid/Panel";
import { MultiLineChart, StackedBarChart, HBarChart, fmtMoneyShort, fmtMoneyFull } from "../../components/nid/charts";
import ChartState from "../../components/nid/ChartState.jsx";
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
      accent: "text-blue-600",
      dataset: "estban",
      indicadorKey: "agencias",
    },
    {
      label: "Operações de Crédito",
      value: fmtBRL(resumo?.total_operacoes_credito),
      sub: "Saldo total",
      accent: "text-green-600",
      dataset: "estban",
      indicadorKey: "credito_total",
    },
    {
      label: "Total Depósitos",
      value: fmtBRL(resumo?.total_depositos),
      sub: "Vista + Poupança + Prazo",
      accent: "text-purple-600",
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
      <InsightsPanel dataset="estban" />

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

      {/* Evolução das Operações de Crédito */}
      <div className="bg-[var(--panel)] p-6 rounded-2xl shadow-sm border border-[var(--border)]">
        <h3 className="text-base font-bold mb-5 text-[var(--text)]">
          Evolução das Operações de Crédito
        </h3>
        <MultiLineChart
          data={serie.map((d) => ({
            label: String(d.data_referencia),
            "Operações de Crédito": d.valor_operacoes_credito || 0,
            "Poupança": d.valor_poupanca || 0,
            "Depósitos a Prazo": d.valor_depositos_prazo || 0,
          }))}
          series={["Operações de Crédito", "Poupança", "Depósitos a Prazo"]}
          colors={["#3b82f6", "#10b981", "#f59e0b"]}
          height={280}
          yFmt={(v) => `R$ ${(v / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}M`}
          tipFmt={fmtBRL}
          loading={loading}
          emptyMessage="Sem dados disponíveis"
        />
      </div>

      {/* Captação — Depósitos por Tipo */}
      <div className="bg-[var(--panel)] p-6 rounded-2xl shadow-sm border border-[var(--border)]">
        <h3 className="text-base font-bold mb-5 text-[var(--text)]">
          Evolução da Captação — Depósitos por Tipo
        </h3>
        <MultiLineChart
          data={captacao.map((d) => ({
            label: String(d.data_referencia),
            "Depósitos à Vista": d.depositos_vista || 0,
            "Poupança": d.poupanca || 0,
            "Depósitos a Prazo": d.depositos_prazo || 0,
          }))}
          series={["Depósitos à Vista", "Poupança", "Depósitos a Prazo"]}
          colors={["#3b82f6", "#10b981", "#f59e0b"]}
          height={280}
          yFmt={(v) => `R$ ${(v / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}M`}
          tipFmt={fmtBRL}
          loading={loading}
          emptyMessage="Sem dados disponíveis"
        />
      </div>

      {/* Crédito vs. Captação Total */}
      <div className="bg-[var(--panel)] p-6 rounded-2xl shadow-sm border border-[var(--border)]">
        <h3 className="text-base font-bold mb-5 text-[var(--text)]">
          Crédito vs. Captação Total
        </h3>
        <MultiLineChart
          data={captacao.map((d) => ({
            label: String(d.data_referencia),
            "Operações de Crédito": d.operacoes_credito || 0,
            "Total Captação": d.total_captacao || 0,
          }))}
          series={["Operações de Crédito", "Total Captação"]}
          colors={["#3b82f6", "#10b981"]}
          height={240}
          yFmt={(v) => `R$ ${(v / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}M`}
          tipFmt={fmtBRL}
          loading={loading}
          emptyMessage="Sem dados disponíveis"
        />
      </div>

      {/* Composição do Crédito */}
      <div className="bg-[var(--panel)] p-6 rounded-2xl shadow-sm border border-[var(--border)]">
        <h3 className="text-base font-bold mb-5 text-[var(--text)]">
          Composição das Operações de Crédito
        </h3>
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
          colors={["#3b82f6", "#10b981", "#f59e0b", "#84cc16", "#8b5cf6", "#06b6d4", "#94a3b8"]}
          height={280}
          yFmt={(v) => `R$ ${(v / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}M`}
          tipFmt={fmtBRL}
          loading={loading}
          emptyMessage="Sem dados disponíveis"
        />
      </div>

      {/* Crédito por Instituição */}
      <PlanGate planKey="estban.por_instituicao">
      <div className="bg-[var(--panel)] p-6 rounded-2xl shadow-sm border border-[var(--border)]">
        <h3 className="text-base font-bold mb-5 text-[var(--text)]">
          Operações de Crédito por Instituição
        </h3>
        <HBarChart
          data={porInstituicao.slice(0, 10).map((d) => ({ label: d.nome_instituicao, value: d.valor_operacoes_credito || 0 }))}
          color="var(--accent-1)"
          fmt={fmtBRL}
          loading={loading}
          emptyMessage="Sem dados disponíveis"
        />
      </div>

      {/* Composição do Crédito por Instituição */}
      {!loading && porInstituicao.length > 0 && porInstituicao.some(r => r.financiamentos_gerais > 0 || r.emprestimos_titulos_descontados > 0) && (
        <div className="bg-[var(--panel)] p-6 rounded-2xl shadow-sm border border-[var(--border)]">
          <h3 className="text-base font-bold mb-5 text-[var(--text)]">
            Composição do Crédito por Instituição
          </h3>
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
            colors={["#3b82f6", "#10b981", "#f59e0b", "#84cc16", "#8b5cf6", "#06b6d4", "#94a3b8"]}
            height={280}
            yFmt={(v) => `R$ ${(v / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}M`}
            tipFmt={fmtBRL}
          />
        </div>
      )}

      {/* Tabela de Instituições — still inside PlanGate */}
      <div className="bg-[var(--panel)] p-6 rounded-2xl shadow-sm border border-[var(--border)]">
        <h3 className="text-base font-bold mb-5 text-[var(--text)]">
          Detalhamento por Instituição
        </h3>
        {loading ? (
          <div className="animate-pulse h-40 bg-slate-50  rounded-xl" />
        ) : porInstituicao.length === 0 ? (
          <div className="h-32 flex items-center justify-center text-[var(--text-mute)] text-sm">
            Sem dados disponíveis
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)]">
                  <th className="text-left py-3 px-4 text-xs uppercase tracking-wider text-[var(--text-mute)] font-medium">
                    Instituição
                  </th>
                  <th className="text-right py-3 px-4 text-xs uppercase tracking-wider text-[var(--text-mute)] font-medium">
                    Agências
                  </th>
                  <th className="text-right py-3 px-4 text-xs uppercase tracking-wider text-[var(--text-mute)] font-medium">
                    Operações Crédito
                  </th>
                  <th className="text-right py-3 px-4 text-xs uppercase tracking-wider text-[var(--text-mute)] font-medium">
                    Depósitos Vista
                  </th>
                  <th className="text-right py-3 px-4 text-xs uppercase tracking-wider text-[var(--text-mute)] font-medium">
                    Poupança
                  </th>
                  <th className="text-right py-3 px-4 text-xs uppercase tracking-wider text-[var(--text-mute)] font-medium">
                    Dep. Prazo
                  </th>
                </tr>
              </thead>
              <tbody>
                {porInstituicao.map((row, i) => (
                  <tr
                    key={i}
                    className="border-b border-slate-50  hover:bg-[var(--panel-2)] transition-colors"
                  >
                    <td className="py-3 px-4 text-[var(--text)] font-medium">
                      {row.nome_instituicao}
                    </td>
                    <td className="py-3 px-4 text-right text-[var(--text-dim)]">
                      {fmtNum(row.qtd_agencias)}
                    </td>
                    <td className="py-3 px-4 text-right text-[var(--text)] font-medium">
                      {fmtBRL(row.valor_operacoes_credito)}
                    </td>
                    <td className="py-3 px-4 text-right text-[var(--text-dim)]">
                      {fmtBRL(row.valor_depositos_vista)}
                    </td>
                    <td className="py-3 px-4 text-right text-[var(--text-dim)]">
                      {fmtBRL(row.valor_poupanca)}
                    </td>
                    <td className="py-3 px-4 text-right text-[var(--text-dim)]">
                      {fmtBRL(row.valor_depositos_prazo)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
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


