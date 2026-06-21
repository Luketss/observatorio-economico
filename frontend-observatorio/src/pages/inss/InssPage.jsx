import { useEffect, useMemo, useState } from "react";
import api from "../../services/api";
import { motion } from "framer-motion";
import InsightsPanel from "../../components/InsightsPanel";
import ReleasesPanel from "../../components/ReleasesPanel";
import NidComparativoPanel from "../../components/nid/ComparativoPanel";
import InfoTooltip from "../../components/InfoTooltip";
import FilterBar, { describeFilter, clearFilter } from "../../components/FilterBar";
import KpiCard from "../../components/KpiCard";
import { NidPanel, NidPageHeader } from "../../components/nid/Panel";
import { HBarChart, AreaLineChart, fmtMoneyShort } from "../../components/nid/charts";
import DataTable from "../../components/nid/DataTable";
import ChartState from "../../components/nid/ChartState.jsx";
import { useAuth } from "../../context/AuthContext";
import { useViewAs } from "../../context/ViewAsContext";


const fmtBRL = (v) =>
  v != null
    ? `R$ ${Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`
    : "—";

const fmtNum = (v) => (v != null ? Number(v).toLocaleString("pt-BR") : "—");

export default function InssPage() {
  const { user } = useAuth();
  const { viewAsId } = useViewAs();
  // ADMIN_GLOBAL precisa de um município selecionado (view-as) para escopar os
  // gráficos do dashboard; sem seleção, pedimos para escolher em vez de
  // sobrepor todos os municípios no mesmo gráfico.
  const needsMunicipio = user?.role === "ADMIN_GLOBAL" && viewAsId == null;

  const [rawSerie, setRawSerie] = useState([]);
  const [resumo, setResumo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ yearFrom: "", yearTo: "" });

  useEffect(() => {
    Promise.all([api.get("/inss/serie"), api.get("/inss/resumo")])
      .then(([serieRes, resumoRes]) => {
        setRawSerie(serieRes.data || []);
        setResumo(resumoRes.data);
      })
      .catch((err) => console.error("Erro ao carregar INSS:", err))
      .finally(() => setLoading(false));
  }, []);

  const years = useMemo(() => [...new Set(rawSerie.map((d) => d.ano))].sort(), [rawSerie]);

  const serie = useMemo(() => {
    const { yearFrom, yearTo } = filters;
    return rawSerie.filter((d) => {
      if (yearFrom && d.ano < +yearFrom) return false;
      if (yearTo && d.ano > +yearTo) return false;
      return true;
    });
  }, [rawSerie, filters]);

  const topCategorias = useMemo(() => {
    const catMap = {};
    serie.forEach((item) => {
      if (!catMap[item.categoria]) {
        catMap[item.categoria] = { categoria: item.categoria, quantidade_beneficios: 0, valor_anual: 0 };
      }
      catMap[item.categoria].quantidade_beneficios += item.quantidade_beneficios ?? 0;
      catMap[item.categoria].valor_anual += item.valor_anual ?? 0;
    });
    return Object.values(catMap)
      .sort((a, b) => b.quantidade_beneficios - a.quantidade_beneficios)
      .slice(0, 10);
  }, [serie]);

  const evolucaoAnual = useMemo(() => {
    const anoMap = {};
    serie.forEach((item) => {
      if (!anoMap[item.ano]) anoMap[item.ano] = { ano: item.ano, quantidade_beneficios: 0 };
      anoMap[item.ano].quantidade_beneficios += item.quantidade_beneficios ?? 0;
    });
    return Object.values(anoMap).sort((a, b) => a.ano - b.ano);
  }, [serie]);

  // Table data: sorted by valor_anual desc
  const tableData = [...serie]
    .sort((a, b) => (b.valor_anual ?? 0) - (a.valor_anual ?? 0))
    .slice(0, 50);

  const cards = [
    {
      label: "Total Benefícios",
      value: fmtNum(resumo?.total_beneficios),
      sub: "No período",
      accent: "text-blue-600",
      dataset: "inss",
      indicadorKey: "total_beneficios",
    },
    {
      label: "Valor Total",
      value: fmtBRL(resumo?.valor_total),
      sub: "Pagamentos totais",
      accent: "text-green-600",
      dataset: "inss",
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
      <NidPageHeader
        title={<>INSS — Benefícios Previdenciários <InfoTooltip dataset="inss" /></>}
        sub="Quantidade e valor dos benefícios pagos pelo INSS."
        chips={describeFilter(filters) ? [{
          label: describeFilter(filters),
          active: true,
          onClick: () => document.getElementById("filter-bar-inss")?.scrollIntoView({ block: "center", behavior: "smooth" }),
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
            município e visualizar os dados de INSS.
          </p>
        </div>
      ) : (
      <>
      <InsightsPanel dataset="inss" />

      <FilterBar id="filter-bar-inss" years={years} value={filters} onChange={setFilters} />

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {[...Array(2)].map((_, i) => (
            <div key={i} className="bg-[var(--panel)] p-6 rounded-2xl border border-[var(--border)]">
              <ChartState kind="loading" shape="kpi" height={80} />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {cards.map((c) => (
            <KpiCard key={c.label} {...c} />
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Categorias */}
        <div className="bg-[var(--panel)] p-6 rounded-2xl shadow-sm border border-[var(--border)]">
          <h3 className="text-base font-bold mb-5 text-[var(--text)]">
            Top Categorias de Benefícios
          </h3>
          <HBarChart
            data={topCategorias.map((d) => ({ label: d.categoria, value: d.quantidade_beneficios || 0 }))}
            color="var(--accent-3)"
            fmt={(v) => Number(v).toLocaleString("pt-BR")}
            loading={loading}
            emptyMessage="Sem dados disponíveis"
          />
        </div>

        {/* Evolução Anual */}
        <div className="bg-[var(--panel)] p-6 rounded-2xl shadow-sm border border-[var(--border)]">
          <h3 className="text-base font-bold mb-5 text-[var(--text)]">
            Evolução Anual de Benefícios
          </h3>
          <AreaLineChart
            data={evolucaoAnual.map((d) => ({ label: String(d.ano), value: d.quantidade_beneficios || 0 }))}
            height={280}
            color="var(--accent-3)"
            label="Benefícios"
            yFmt={(v) => Number(v).toLocaleString("pt-BR")}
            tipFmt={(v) => Number(v).toLocaleString("pt-BR")}
            loading={loading}
            emptyMessage="Sem dados disponíveis"
          />
        </div>
      </div>

      {/* Tabela detalhada */}
      {!loading && tableData.length > 0 && (
        <NidPanel title="Detalhamento por Ano e Categoria" sub="top 50 · ordenado por valor anual">
          <DataTable
            columns={[
              { key: "ano",                   label: "Ano",           width: 80 },
              { key: "categoria",             label: "Categoria" },
              { key: "quantidade_beneficios", label: "Qtd. Benefícios", align: "right", fmt: fmtNum, mono: true },
              { key: "valor_anual",           label: "Valor Anual",    align: "right", fmt: fmtMoneyShort, mono: true, heatmap: true },
            ]}
            data={tableData}
            pageSize={12}
          />
        </NidPanel>
      )}
      <NidComparativoPanel
        title="Comparativo Municipal · INSS"
        sub="Ranking por valor anual de benefícios injetados"
        endpoint="/inss/comparativo"
        metric="valor_total"
        fmt={(v) => `R$ ${Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`}
        color="var(--accent-5)"
      />

      <ReleasesPanel dataset="inss" />
      </>
      )}

    </motion.div>
  );
}


