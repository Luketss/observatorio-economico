import { useEffect, useState } from "react";
import api from "../../services/api";
import { motion } from "framer-motion";
import InsightsPanel from "../../components/InsightsPanel";
import ReleasesPanel from "../../components/ReleasesPanel";
import InfoTooltip from "../../components/InfoTooltip";
import KpiCard from "../../components/KpiCard";
import PlanGate from "../../components/PlanGate";
import { NidPageHeader, NidPanel } from "../../components/nid/Panel";
import { DonutChart, HBarChart, StackedBarChart, AreaLineChart, fmtMoneyShort, fmtMoneyFull } from "../../components/nid/charts";
import DetalheModal from "../../components/nid/DetalheModal";
import { useAuth } from "../../context/AuthContext";
import { useViewAs } from "../../context/ViewAsContext";


function MiniStat({ label, value, color }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-slate-50  last:border-0">
      <span className="text-sm text-[var(--text-dim)]">{label}</span>
      <span className={`text-sm font-bold ${color || "text-[var(--text)]"}`}>
        {value}
      </span>
    </div>
  );
}

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

  useEffect(() => {
    Promise.all([
      api.get("/empresas/resumo"),
      api.get("/empresas/por_porte"),
      api.get("/empresas/por_situacao"),
      api.get("/empresas/situacao_por_porte"),
      api.get("/empresas/por_cnae_secao"),
      api.get("/empresas/capital_por_porte"),
    ])
      .then(([resumoRes, porteRes, situacaoRes, situPorteRes, cnaeSecaoRes, capitalRes]) => {
        setResumo(resumoRes.data);
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

  const cards = [
    {
      label: "Total Empresas",
      value: fmtNum(resumo?.total_empresas),
      sub: "Cadastradas",
      accent: "var(--accent-1)",
      dataset: "empresas",
      indicadorKey: "total_empresas",
    },
    {
      label: "Empresas Ativas",
      value: fmtNum(resumo?.total_ativas),
      sub: fmtPct(resumo?.total_ativas, resumo?.total_empresas) + " do total",
      accent: "var(--accent-5)",
      dataset: "empresas",
      indicadorKey: "ativas",
    },
    {
      label: "MEI",
      value: fmtNum(resumo?.total_mei),
      sub: fmtPct(resumo?.total_mei, resumo?.total_empresas) + " do total",
      accent: "var(--accent-3)",
      dataset: "empresas",
      indicadorKey: "mei",
    },
    {
      label: "Simples Nacional",
      value: fmtNum(resumo?.total_simples),
      sub: fmtPct(resumo?.total_simples, resumo?.total_empresas) + " do total",
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
            município e visualizar os dados de Empresas.
          </p>
        </div>
      ) : (
      <>
      {/* KPI Cards */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          {[...Array(4)].map((_, i) => (
            <div
              key={i}
              className="bg-[var(--panel)] p-6 rounded-2xl border border-[var(--border)] animate-pulse h-28"
            />
          ))}
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
          colors={["#10b981", "#ef4444"]}
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

      {/* Composição Adicional */}
      <div className="bg-[var(--panel)] p-6 rounded-2xl shadow-sm border border-[var(--border)]">
        <h3 className="text-base font-bold mb-5 text-[var(--text)]">
          Indicadores de Composição
        </h3>
        {loading ? (
          <div className="animate-pulse h-48 bg-slate-50  rounded-xl" />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12">
            <div>
              <MiniStat label="Taxa de Atividade" value={fmtPct(resumo?.total_ativas, resumo?.total_empresas)} color="text-green-600" />
              <MiniStat label="Participação MEI" value={fmtPct(resumo?.total_mei, resumo?.total_empresas)} color="text-purple-600" />
              <MiniStat label="Simples Nacional" value={fmtPct(resumo?.total_simples, resumo?.total_empresas)} color="text-orange-500" />
            </div>
            <div>
              <MiniStat label="Total Cadastradas" value={fmtNum(resumo?.total_empresas)} color="text-blue-600" />
              <MiniStat label="Empresas Ativas" value={fmtNum(resumo?.total_ativas)} color="text-green-600" />
              <MiniStat label="MEI" value={fmtNum(resumo?.total_mei)} color="text-purple-600" />
            </div>
          </div>
        )}
      </div>
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


