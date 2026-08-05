import { useEffect, useMemo, useState } from "react";
import api from "../../services/api";
import { motion } from "framer-motion";
import InsightsPanel from "../../components/InsightsPanel";
import ReleasesPanel from "../../components/ReleasesPanel";
import InfoTooltip from "../../components/InfoTooltip";
import FilterBar, { describeFilter, clearFilter } from "../../components/FilterBar";
import { janela12mCalendario, intervaloISO } from "../../utils/periodoCards";
import KpiCard from "../../components/KpiCard";
import PlanGate from "../../components/PlanGate";
import { NidPageHeader, NidPanel } from "../../components/nid/Panel";
import { DonutChart, HBarChart, StackedBarChart, AreaLineChart, fmtMoneyShort, fmtMoneyFull } from "../../components/nid/charts";
import DetalheModal from "../../components/nid/DetalheModal";
import { useAuth } from "../../context/AuthContext";
import { useViewAs } from "../../context/ViewAsContext";
import KpiSkeleton from "../../components/nid/KpiSkeleton";
import SelecioneMunicipio from "../../components/nid/SelecioneMunicipio";

const fmtNum = (v) => (v != null ? Number(v).toLocaleString("pt-BR") : "—");
const fmtBRL = (v) =>
  v != null ? `R$ ${Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}` : "—";
const fmtPct = (num, total) => {
  if (!num || !total) return "—";
  return `${((num / total) * 100).toFixed(1)}%`;
};

export default function EmpresasPage() {
  const { user } = useAuth();
  const { viewAsId } = useViewAs();
  // ADMIN_GLOBAL precisa de um município selecionado (view-as) para escopar os
  // gráficos do dashboard; sem seleção, pedimos para escolher em vez de
  // sobrepor todos os municípios no mesmo gráfico.
  const needsMunicipio = user?.role === "ADMIN_GLOBAL" && viewAsId == null;

  const [resumo, setResumo] = useState(null);
  const [porPorte, setPorPorte] = useState([]);
  const [porSituacao, setPorSituacao] = useState([]);
  const [situacaoPorPorte, setSituacaoPorPorte] = useState([]);
  const [porCnaeSecao, setPorCnaeSecao] = useState([]);
  const [capitalPorPorte, setCapitalPorPorte] = useState([]);
  const [loading, setLoading] = useState(true);
  const [detalhe, setDetalhe] = useState(null);
  // Cadastro corrente: default = 12 meses de CALENDÁRIO (aqui a âncora certa).
  const [filters, setFilters] = useState(() => janela12mCalendario());

  // Não há série para derivar anos: FilterBar recebe anos de calendário (30).
  const anosEmpresas = useMemo(() => {
    const atual = new Date().getFullYear();
    return Array.from({ length: 30 }, (_, i) => atual - 29 + i);
  }, []);

  // Resumo reage ao período (abertas_de/ate); demais painéis são cadastrais.
  useEffect(() => {
    const { de, ate } = intervaloISO(filters);
    const params = {};
    if (de) params.abertas_de = de;
    if (ate) params.abertas_ate = ate;
    api.get("/empresas/resumo", { params })
      .then((res) => setResumo(res.data))
      .catch((err) => console.error("Erro ao carregar resumo de empresas:", err));
  }, [filters]);

  useEffect(() => {
    Promise.all([
      api.get("/empresas/por_porte"),
      api.get("/empresas/por_situacao"),
      api.get("/empresas/situacao_por_porte"),
      api.get("/empresas/por_cnae_secao"),
      api.get("/empresas/capital_por_porte"),
    ])
      .then(([porteRes, situacaoRes, situPorteRes, cnaeSecaoRes, capitalRes]) => {
        setPorPorte(
          (porteRes.data || []).map((d) => ({ name: d.porte, value: d.total }))
        );
        setPorSituacao(situacaoRes.data || []);
        setSituacaoPorPorte(situPorteRes.data || []);
        const sorted = (cnaeSecaoRes.data || []).sort(
          (a, b) => (b.total_vinculos ?? 0) - (a.total_vinculos ?? 0)
        );
        setPorCnaeSecao(sorted.slice(0, 12));
        setCapitalPorPorte(capitalRes.data || []);
      })
      .catch((err) => console.error("Erro ao carregar Empresas:", err))
      .finally(() => setLoading(false));
  }, []);

  const filtroLabel = describeFilter(filters);

  const cards = [
    {
      label: "Abertas no Período",
      value: fmtNum(resumo?.abertas_periodo),
      sub: filtroLabel
        ? `Por data de abertura · ${filtroLabel}`
        : "Por data de abertura · todo o histórico",
      accent: "var(--accent-2)",
      dataset: "empresas",
      indicadorKey: "abertas_periodo",
    },
    {
      label: "Total Empresas",
      value: fmtNum(resumo?.total_empresas),
      sub: "Cadastro atual",
      accent: "var(--accent-1)",
      dataset: "empresas",
      indicadorKey: "total_empresas",
    },
    {
      label: "Empresas Ativas",
      value: fmtNum(resumo?.total_ativas),
      sub: fmtPct(resumo?.total_ativas, resumo?.total_empresas) + " do total · cadastro atual",
      accent: "var(--accent-5)",
      dataset: "empresas",
      indicadorKey: "ativas",
    },
    {
      label: "MEI",
      value: fmtNum(resumo?.total_mei),
      sub: fmtPct(resumo?.total_mei, resumo?.total_empresas) + " do total · cadastro atual",
      accent: "var(--accent-3)",
      dataset: "empresas",
      indicadorKey: "mei",
    },
    {
      label: "Simples Nacional",
      value: fmtNum(resumo?.total_simples),
      sub: fmtPct(resumo?.total_simples, resumo?.total_empresas) + " do total · cadastro atual",
      accent: "var(--accent-4)",
      dataset: "empresas",
      indicadorKey: "simples",
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
        title={<>Empresas — CNPJ <InfoTooltip dataset="empresas" /></>}
        sub="Perfil e composição do tecido empresarial local."
        chips={describeFilter(filters) ? [{
          label: describeFilter(filters),
          active: true,
          onClick: () => document.getElementById("filter-bar-empresas")?.scrollIntoView({ block: "center", behavior: "smooth" }),
          onClear: () => setFilters(clearFilter()),
        }] : null}
      />

      {needsMunicipio ? (
        <SelecioneMunicipio />
      ) : (
      <>
      <FilterBar id="filter-bar-empresas" years={anosEmpresas} showMonths value={filters} onChange={setFilters} />

      {/* KPI Cards */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          {[...Array(5)].map((_, i) => <KpiSkeleton key={i} />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6">
          {cards.map((c) => (
            <KpiCard key={c.label} {...c} />
          ))}
        </div>
      )}

      <InsightsPanel dataset="empresas" />

      {/* Distribuição por Porte + Situação */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pie — porte */}
        <PlanGate planKey="empresas.por_porte">
        <NidPanel title="Distribuição por Porte">
          <DonutChart
            data={porPorte.map((d) => ({ label: d.name, value: d.value }))}
            colors={["var(--accent-1)", "var(--accent-3)", "var(--accent-5)", "var(--accent-4)", "var(--accent-2)"]}
            legend
            height={220}
            loading={loading}
            emptyMessage="Sem dados disponíveis"
            onSelect={(s) => setDetalhe({ titulo: s.label ?? s.name, valor: s.value })}
          />
        </NidPanel>

        </PlanGate>

        {/* Situação cadastral */}
        <NidPanel title="Empresas por Situação Cadastral">
          <HBarChart
            data={porSituacao.map((d) => ({ label: d.label, value: d.total || 0 }))}
            color="var(--accent-1)"
            fmt={fmtNum}
            loading={loading}
            emptyMessage="Sem dados disponíveis"
          />
        </NidPanel>
      </div>

      {/* Ativas vs Fechadas por Porte (Saldo) */}
      <NidPanel title="Ativas vs. Fechadas por Porte">
        <StackedBarChart
          data={situacaoPorPorte.map((d) => ({
            label: d.porte,
            "Ativas": d.ativas || 0,
            "Fechadas/Baixadas": d.fechadas || 0,
          }))}
          keys={["Ativas", "Fechadas/Baixadas"]}
          colors={["var(--accent-5)", "var(--accent-2)"]}
          legend
          height={280}
          yFmt={(v) => Number(v).toLocaleString("pt-BR")}
          tipFmt={(v) => Number(v).toLocaleString("pt-BR")}
          loading={loading}
          emptyMessage="Sem dados disponíveis"
        />
      </NidPanel>

      {/* Empresas por Setor CNAE */}
      <PlanGate planKey="empresas.por_cnae">
      <NidPanel title="Empresas por Setor de Atividade (CNAE — Seção)">
        <HBarChart
          data={porCnaeSecao.map((d) => ({ label: d.descricao, value: d.total_vinculos || 0 }))}
          color="var(--accent-1)"
          fmt={fmtNum}
          loading={loading}
          emptyMessage="Sem dados disponíveis"
        />
      </NidPanel>

      </PlanGate>

      {/* Capital Social por Porte */}
      {!loading && capitalPorPorte.length > 0 && (
        <NidPanel
          title="Capital Social por Porte de Empresa"
          sub="Capital médio declarado por empresas com registro ativo"
        >
          <HBarChart
            data={capitalPorPorte.map((d) => ({ label: d.porte, value: d.capital_medio || 0 }))}
            color="var(--accent-1)"
            fmt={fmtBRL}
          />
        </NidPanel>
      )}

      <ReleasesPanel dataset="empresas" />
      </>
      )}

      <DetalheModal
        open={!!detalhe}
        onClose={() => setDetalhe(null)}
        titulo={detalhe?.titulo}
        valor={detalhe?.valor}
        fmt={fmtNum}
      />
    </motion.div>
  );
}


