import { useEffect, useMemo, useRef, useState } from "react";
import api from "../../services/api";
import { motion } from "framer-motion";
import InsightsPanel from "../../components/InsightsPanel";
import ReleasesPanel from "../../components/ReleasesPanel";
import NidComparativoPanel from "../../components/nid/ComparativoPanel";
import InfoTooltip from "../../components/InfoTooltip";
import FilterBar, { describeFilter, clearFilter } from "../../components/FilterBar";
import { janela12m } from "../../utils/periodoCards";
import KpiCard from "../../components/KpiCard";
import { NidPanel, NidPageHeader } from "../../components/nid/Panel";
import { HBarChart, AreaLineChart, fmtMoneyShort } from "../../components/nid/charts";
import DataTable from "../../components/nid/DataTable";
import { useAuth } from "../../context/AuthContext";
import { useViewAs } from "../../context/ViewAsContext";
import KpiSkeleton from "../../components/nid/KpiSkeleton";
import SelecioneMunicipio from "../../components/nid/SelecioneMunicipio";


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
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ yearFrom: "", yearTo: "" });

  // Default "12m ancorado" = último ano com dado (série anual).
  const filtroTocado = useRef(false);
  const mudarFiltros = (v) => { filtroTocado.current = true; setFilters(v); };

  useEffect(() => {
    api.get("/inss/serie")
      .then((serieRes) => {
        const raw = serieRes.data || [];
        setRawSerie(raw);
        if (!filtroTocado.current) {
          setFilters(janela12m(raw, (d) => ({ ano: d.ano })));
        }
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

  // Fluxo: somas da série filtrada (linhas anuais por categoria).
  const totaisInss = useMemo(
    () =>
      serie.reduce(
        (acc, d) => ({
          beneficios: acc.beneficios + (d.quantidade_beneficios || 0),
          valor: acc.valor + (d.valor_anual || 0),
        }),
        { beneficios: 0, valor: 0 }
      ),
    [serie]
  );
  const filtroLabel = describeFilter(filters);

  const cards = [
    {
      label: "Total Benefícios",
      value: serie.length ? fmtNum(totaisInss.beneficios) : "—",
      sub: filtroLabel || "Toda a série",
      accent: "var(--accent-1)",
      dataset: "inss",
      indicadorKey: "total_beneficios",
    },
    {
      label: "Valor Total",
      value: serie.length ? fmtBRL(totaisInss.valor) : "—",
      sub: filtroLabel ? `Pagamentos · ${filtroLabel}` : "Pagamentos totais",
      accent: "var(--accent-5)",
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
          onClear: () => mudarFiltros(clearFilter()),
        }] : null}
      />

      {needsMunicipio ? (
        <SelecioneMunicipio />
      ) : (
      <>
      <FilterBar id="filter-bar-inss" years={years} value={filters} onChange={mudarFiltros} />

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {[...Array(2)].map((_, i) => <KpiSkeleton key={i} />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {cards.map((c) => (
            <KpiCard key={c.label} {...c} />
          ))}
        </div>
      )}

      <InsightsPanel dataset="inss" />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Categorias */}
        <NidPanel title="Top Categorias de Benefícios">
          <HBarChart
            data={topCategorias.map((d) => ({ label: d.categoria, value: d.quantidade_beneficios || 0 }))}
            color="var(--accent-3)"
            fmt={(v) => Number(v).toLocaleString("pt-BR")}
            loading={loading}
            emptyMessage="Sem dados disponíveis"
          />
        </NidPanel>

        {/* Evolução Anual */}
        <NidPanel title="Evolução Anual de Benefícios">
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
        </NidPanel>
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


