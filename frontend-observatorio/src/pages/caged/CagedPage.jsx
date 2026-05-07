import { useEffect, useMemo, useState } from "react";
import api from "../../services/api";
import { useChartTheme } from "../../hooks/useChartTheme";
import { motion } from "framer-motion";
import InsightsPanel from "../../components/InsightsPanel";
import ReleasesPanel from "../../components/ReleasesPanel";
import InfoTooltip from "../../components/InfoTooltip";
import FilterBar from "../../components/FilterBar";
import KpiCard from "../../components/KpiCard";
import PlanGate from "../../components/PlanGate";
import {
  ResponsiveContainer,
  ComposedChart,
  BarChart,
  Bar,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  Cell,
  LineChart,
} from "recharts";

const COLORS = [
  "#3b82f6", "#f97316", "#10b981", "#8b5cf6", "#f59e0b",
  "#ec4899", "#06b6d4", "#84cc16", "#ef4444", "#6366f1",
];

const FAIXA_ORDER = [
  "Até 17 anos", "18 a 24 anos", "25 a 29 anos", "30 a 39 anos",
  "40 a 49 anos", "50 a 64 anos", "65 anos ou mais",
];

function ChartSkeleton({ height = "h-60" }) {
  return (
    <div className={`${height} animate-pulse bg-slate-100 dark:bg-slate-800 rounded-xl`} />
  );
}

function ChartCard({ title, children, empty, loading, skeletonHeight }) {
  return (
    <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800">
      <h3 className="text-base font-bold mb-5 text-slate-800 dark:text-white">{title}</h3>
      {loading ? (
        <ChartSkeleton height={skeletonHeight} />
      ) : empty ? (
        <div className="h-60 flex items-center justify-center text-slate-400 dark:text-slate-500 text-sm">
          Sem dados disponíveis
        </div>
      ) : (
        children
      )}
    </div>
  );
}

function aggregateBySexoTotal(data) {
  const acc = {};
  data.forEach((d) => {
    if (!acc[d.sexo]) acc[d.sexo] = { sexo: d.sexo, admissoes: 0, desligamentos: 0, saldo: 0 };
    acc[d.sexo].admissoes += d.admissoes ?? 0;
    acc[d.sexo].desligamentos += d.desligamentos ?? 0;
    acc[d.sexo].saldo += d.saldo ?? 0;
  });
  return Object.values(acc).sort((a, b) => b.admissoes - a.admissoes);
}

function aggregateByRacaTotal(data) {
  const acc = {};
  data.forEach((d) => {
    if (!acc[d.raca_cor]) acc[d.raca_cor] = { raca: d.raca_cor, admissoes: 0, desligamentos: 0, saldo: 0 };
    acc[d.raca_cor].admissoes += d.admissoes ?? 0;
    acc[d.raca_cor].desligamentos += d.desligamentos ?? 0;
    acc[d.raca_cor].saldo += d.saldo ?? 0;
  });
  return Object.values(acc).sort((a, b) => b.admissoes - a.admissoes);
}

function aggregateByCnaeTotal(data) {
  const acc = {};
  data.forEach((d) => {
    const key = d.descricao_secao;
    if (!acc[key]) acc[key] = { secao: d.secao, nome: key, admissoes: 0, desligamentos: 0, saldo: 0 };
    acc[key].admissoes += d.admissoes ?? 0;
    acc[key].desligamentos += d.desligamentos ?? 0;
    acc[key].saldo += d.saldo ?? 0;
  });
  return Object.values(acc).sort((a, b) => b.admissoes - a.admissoes).slice(0, 10);
}

function aggregateByEscolaridadeTotal(data) {
  const acc = {};
  data.forEach((d) => {
    const key = d.grau_instrucao;
    if (!acc[key]) acc[key] = { grau: key, admissoes: 0, desligamentos: 0, saldo: 0 };
    acc[key].admissoes += d.admissoes ?? 0;
    acc[key].desligamentos += d.desligamentos ?? 0;
    acc[key].saldo += d.saldo ?? 0;
  });
  return Object.values(acc).sort((a, b) => b.saldo - a.saldo);
}

function aggregateByFaixaEtariaTotal(data) {
  const acc = {};
  data.forEach((d) => {
    const key = d.faixa_etaria;
    if (!acc[key]) acc[key] = { faixa: key, admissoes: 0, desligamentos: 0, saldo: 0 };
    acc[key].admissoes += d.admissoes ?? 0;
    acc[key].desligamentos += d.desligamentos ?? 0;
    acc[key].saldo += d.saldo ?? 0;
  });
  return FAIXA_ORDER
    .filter((f) => acc[f])
    .map((f) => acc[f]);
}

function aggregateByTipoMovTotal(data) {
  const acc = {};
  data.forEach((d) => {
    const key = d.tipo_movimentacao;
    if (!acc[key]) acc[key] = { tipo: key, admissoes: 0, desligamentos: 0, saldo: 0 };
    acc[key].admissoes += d.admissoes ?? 0;
    acc[key].desligamentos += d.desligamentos ?? 0;
    acc[key].saldo += d.saldo ?? 0;
  });
  return Object.values(acc).sort((a, b) => (b.admissoes + b.desligamentos) - (a.admissoes + a.desligamentos));
}

export default function CagedPage() {
  const ct = useChartTheme();
  const [rawSerie, setRawSerie] = useState([]);
  const [rawSexo, setRawSexo] = useState([]);
  const [rawRaca, setRawRaca] = useState([]);
  const [rawSalario, setRawSalario] = useState([]);
  const [rawCnae, setRawCnae] = useState([]);
  const [rawEscolaridade, setRawEscolaridade] = useState([]);
  const [rawFaixaEtaria, setRawFaixaEtaria] = useState([]);
  const [rawTipoMov, setRawTipoMov] = useState([]);
  const [resumo, setResumo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [filters, setFilters] = useState({ yearFrom: "", yearTo: "", monthFrom: "", monthTo: "" });

  useEffect(() => {
    Promise.all([
      api.get("/caged/serie"),
      api.get("/caged/resumo"),
      api.get("/caged/por_sexo"),
      api.get("/caged/por_raca"),
      api.get("/caged/salario"),
      api.get("/caged/por_cnae"),
      api.get("/caged/por_escolaridade"),
      api.get("/caged/por_faixa_etaria"),
      api.get("/caged/por_tipo_movimentacao"),
    ])
      .then(([serieRes, resumoRes, sexoRes, racaRes, salRes, cnaeRes, escRes, faixaRes, tipoRes]) => {
        setRawSerie(serieRes.data || []);
        setResumo(resumoRes.data);
        setRawSexo(sexoRes.data || []);
        setRawRaca(racaRes.data || []);
        setRawSalario(salRes.data || []);
        setRawCnae(cnaeRes.data || []);
        setRawEscolaridade(escRes.data || []);
        setRawFaixaEtaria(faixaRes.data || []);
        setRawTipoMov(tipoRes.data || []);
      })
      .catch((err) => {
        console.error("Erro ao carregar CAGED:", err);
        setError(true);
      })
      .finally(() => setLoading(false));
  }, []);

  const years = useMemo(() => [...new Set(rawSerie.map((d) => d.ano))].sort(), [rawSerie]);

  const applyFilter = (d) => {
    const { yearFrom, yearTo, monthFrom, monthTo } = filters;
    const val = d.ano * 100 + d.mes;
    const from = yearFrom ? Number(yearFrom) * 100 + (Number(monthFrom) || 1) : 0;
    const to = yearTo ? Number(yearTo) * 100 + (Number(monthTo) || 12) : 999999;
    return val >= from && val <= to;
  };

  const serie = useMemo(() => {
    const filtered = rawSerie.filter(applyFilter);
    const grouped = {};
    filtered.forEach((item) => {
      const key = `${item.ano}-${String(item.mes).padStart(2, "0")}`;
      if (!grouped[key]) grouped[key] = { periodo: key, admissoes: 0, desligamentos: 0, saldo: 0 };
      grouped[key].admissoes += item.admissoes ?? 0;
      grouped[key].desligamentos += item.desligamentos ?? 0;
      grouped[key].saldo += item.saldo ?? 0;
    });
    return Object.values(grouped).sort((a, b) => a.periodo.localeCompare(b.periodo));
  }, [rawSerie, filters]);

  const porSexo = useMemo(() => rawSexo.filter(applyFilter), [rawSexo, filters]);
  const porRaca = useMemo(() => rawRaca.filter(applyFilter), [rawRaca, filters]);
  const porCnae = useMemo(() => rawCnae.filter(applyFilter), [rawCnae, filters]);
  const porEscolaridade = useMemo(() => rawEscolaridade.filter(applyFilter), [rawEscolaridade, filters]);
  const porFaixaEtaria = useMemo(() => rawFaixaEtaria.filter(applyFilter), [rawFaixaEtaria, filters]);
  const porTipoMov = useMemo(() => rawTipoMov.filter(applyFilter), [rawTipoMov, filters]);
  const salario = useMemo(() => rawSalario.filter(applyFilter), [rawSalario, filters]);

  const fmt = (v) => (v != null ? Number(v).toLocaleString("pt-BR") : "—");
  const fmtCurrency = (v) =>
    v != null
      ? Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })
      : "—";

  const saldoColor =
    resumo?.saldo_total > 0
      ? "text-green-600"
      : resumo?.saldo_total < 0
      ? "text-red-600"
      : "text-slate-800";

  const sexoTotais = aggregateBySexoTotal(porSexo);
  const racaTotais = aggregateByRacaTotal(porRaca);
  const cnaeTotais = aggregateByCnaeTotal(porCnae);
  const escolaridadeTotais = aggregateByEscolaridadeTotal(porEscolaridade);
  const faixaEtariaTotais = aggregateByFaixaEtariaTotal(porFaixaEtaria);
  const tipoMovTotais = aggregateByTipoMovTotal(porTipoMov);

  const salarioChart = {};
  salario.forEach((d) => {
    const key = `${d.ano}-${String(d.mes).padStart(2, "0")}`;
    salarioChart[key] = {
      periodo: key,
      adm: d.salario_medio_admissoes != null ? Math.round(d.salario_medio_admissoes) : null,
      des: d.salario_medio_desligamentos != null ? Math.round(d.salario_medio_desligamentos) : null,
    };
  });
  const salarioData = Object.values(salarioChart).sort((a, b) => a.periodo.localeCompare(b.periodo));

  const cards = [
    { label: "Total Admissões", value: fmt(resumo?.total_admissoes), sub: "No período", accent: "text-blue-600", dataset: "caged", indicadorKey: "admissoes" },
    { label: "Total Desligamentos", value: fmt(resumo?.total_desligamentos), sub: "No período", accent: "text-orange-500", dataset: "caged", indicadorKey: "desligamentos" },
    {
      label: "Saldo Líquido",
      value: resumo?.saldo_total != null
        ? `${resumo.saldo_total > 0 ? "+" : ""}${fmt(resumo.saldo_total)}`
        : "—",
      sub: "Admissões − Desligamentos",
      accent: saldoColor,
      dataset: "caged",
      indicadorKey: "saldo_liquido",
    },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-8"
    >
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-800 dark:text-white">
            CAGED — Movimentação de Empregos
          </h1>
          <InfoTooltip dataset="caged" />
        </div>
        <p className="text-sm text-slate-400 dark:text-slate-500 mt-1">
          Admissões, desligamentos e saldo líquido de empregos formais.
        </p>
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-xl px-5 py-4 text-sm text-red-700 dark:text-red-400">
          Erro ao carregar dados do CAGED. Verifique sua conexão e tente novamente.
        </div>
      )}

      <InsightsPanel dataset="caged" />

      <FilterBar years={years} showMonths value={filters} onChange={setFilters} />

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-100 dark:border-slate-800 animate-pulse h-28" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {cards.map((c) => (
            <KpiCard key={c.label} {...c} />
          ))}
        </div>
      )}

      {/* Monthly series */}
      <ChartCard title="Admissões vs Desligamentos (Mensal)" empty={!loading && serie.length === 0} loading={loading} skeletonHeight="h-72">
        <div className="h-48 md:h-72">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={serie}>
              <CartesianGrid strokeDasharray="3 3" stroke={ct.grid} />
              <XAxis dataKey="periodo" tick={{ fontSize: 10, fill: ct.tick }} stroke={ct.axis} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 11, fill: ct.tick }} stroke={ct.axis} />
              <Tooltip contentStyle={ct.tooltipStyle} formatter={(v, name) => [Number(v).toLocaleString("pt-BR"), name]} />
              <Legend />
              <Bar dataKey="admissoes" name="Admissões" fill="#3b82f6" opacity={0.8} radius={[2, 2, 0, 0]} />
              <Bar dataKey="desligamentos" name="Desligamentos" fill="#f97316" opacity={0.8} radius={[2, 2, 0, 0]} />
              <Line type="monotone" dataKey="saldo" name="Saldo" stroke="#10b981" strokeWidth={2.5} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </ChartCard>

      {/* Salary evolution */}
      <PlanGate planKey="caged.salario">
        <ChartCard title="Salário Médio — Admitidos vs Desligados" empty={!loading && salarioData.length === 0} loading={loading} skeletonHeight="h-64">
          <div className="h-44 md:h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={salarioData}>
                <CartesianGrid strokeDasharray="3 3" stroke={ct.grid} />
                <XAxis dataKey="periodo" tick={{ fontSize: 10, fill: ct.tick }} stroke={ct.axis} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 11, fill: ct.tick }} stroke={ct.axis} tickFormatter={(v) => `R$${(v / 1000).toFixed(1)}k`} />
                <Tooltip contentStyle={ct.tooltipStyle} formatter={(v) => [fmtCurrency(v)]} />
                <Legend />
                <Line type="monotone" dataKey="adm" name="Admitidos" stroke="#3b82f6" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="des" name="Desligados" stroke="#f97316" strokeWidth={2} dot={false} strokeDasharray="4 2" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
      </PlanGate>

      {/* Two-column: sexo + raca */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <PlanGate planKey="caged.por_sexo">
          <ChartCard title="Saldo por Sexo" empty={!loading && sexoTotais.length === 0} loading={loading} skeletonHeight="h-56">
            <div className="h-40 md:h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={sexoTotais} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke={ct.grid} horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 10, fill: ct.tick }} stroke={ct.axis} tickFormatter={(v) => v.toLocaleString("pt-BR")} />
                  <YAxis type="category" dataKey="sexo" tick={{ fontSize: 12, fill: ct.tick }} stroke={ct.axis} width={80} />
                  <Tooltip contentStyle={ct.tooltipStyle} formatter={(v) => [Number(v).toLocaleString("pt-BR")]} />
                  <Legend />
                  <Bar dataKey="admissoes" name="Admissões" fill="#3b82f6" radius={[0, 3, 3, 0]} />
                  <Bar dataKey="desligamentos" name="Desligamentos" fill="#f97316" radius={[0, 3, 3, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>
        </PlanGate>

        <PlanGate planKey="caged.por_raca">
          <ChartCard title="Saldo por Raça/Cor" empty={!loading && racaTotais.length === 0} loading={loading} skeletonHeight="h-56">
            <div className="h-40 md:h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={racaTotais} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke={ct.grid} horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 10, fill: ct.tick }} stroke={ct.axis} tickFormatter={(v) => v.toLocaleString("pt-BR")} />
                  <YAxis type="category" dataKey="raca" tick={{ fontSize: 11, fill: ct.tick }} stroke={ct.axis} width={90} />
                  <Tooltip contentStyle={ct.tooltipStyle} formatter={(v) => [Number(v).toLocaleString("pt-BR")]} />
                  <Legend />
                  <Bar dataKey="admissoes" name="Admissões" fill="#8b5cf6" radius={[0, 3, 3, 0]} />
                  <Bar dataKey="desligamentos" name="Desligamentos" fill="#ec4899" radius={[0, 3, 3, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>
        </PlanGate>
      </div>

      {/* CNAE top sectors */}
      <PlanGate planKey="caged.por_cnae">
        <ChartCard title="Saldo por Setor (CNAE) — Top 10" empty={!loading && cnaeTotais.length === 0} loading={loading} skeletonHeight="h-80">
          <div className="h-52 md:h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={cnaeTotais} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke={ct.grid} horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10, fill: ct.tick }} stroke={ct.axis} tickFormatter={(v) => v.toLocaleString("pt-BR")} />
                <YAxis type="category" dataKey="nome" tick={{ fontSize: 10, fill: ct.tick }} stroke={ct.axis} width={200} />
                <Tooltip contentStyle={ct.tooltipStyle} formatter={(v) => [Number(v).toLocaleString("pt-BR")]} />
                <Legend />
                <Bar dataKey="admissoes" name="Admissões" radius={[0, 3, 3, 0]}>
                  {cnaeTotais.map((_, idx) => (
                    <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
                  ))}
                </Bar>
                <Bar dataKey="saldo" name="Saldo" fill="#10b981" opacity={0.7} radius={[0, 3, 3, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
      </PlanGate>

      {/* Education level */}
      <ChartCard title="Admissões e Desligamentos por Nível de Escolaridade" empty={!loading && escolaridadeTotais.length === 0} loading={loading} skeletonHeight="h-80">
        <div className="h-52 md:h-80">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={escolaridadeTotais} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke={ct.grid} horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 10, fill: ct.tick }} stroke={ct.axis} tickFormatter={(v) => v.toLocaleString("pt-BR")} />
              <YAxis type="category" dataKey="grau" tick={{ fontSize: 10, fill: ct.tick }} stroke={ct.axis} width={160} />
              <Tooltip contentStyle={ct.tooltipStyle} formatter={(v) => [Number(v).toLocaleString("pt-BR")]} />
              <Legend />
              <Bar dataKey="admissoes" name="Admissões" fill="#3b82f6" opacity={0.85} radius={[0, 3, 3, 0]} />
              <Bar dataKey="desligamentos" name="Desligamentos" fill="#f97316" opacity={0.85} radius={[0, 3, 3, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </ChartCard>

      {/* Age group */}
      <ChartCard title="Admissões e Desligamentos por Faixa Etária" empty={!loading && faixaEtariaTotais.length === 0} loading={loading} skeletonHeight="h-72">
        <div className="h-48 md:h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={faixaEtariaTotais} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke={ct.grid} horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 10, fill: ct.tick }} stroke={ct.axis} tickFormatter={(v) => v.toLocaleString("pt-BR")} />
              <YAxis type="category" dataKey="faixa" tick={{ fontSize: 11, fill: ct.tick }} stroke={ct.axis} width={110} />
              <Tooltip contentStyle={ct.tooltipStyle} formatter={(v) => [Number(v).toLocaleString("pt-BR")]} />
              <Legend />
              <Bar dataKey="admissoes" name="Admissões" fill="#10b981" opacity={0.85} radius={[0, 3, 3, 0]} />
              <Bar dataKey="desligamentos" name="Desligamentos" fill="#f59e0b" opacity={0.85} radius={[0, 3, 3, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </ChartCard>

      {/* Movement type */}
      <ChartCard title="Motivo das Movimentações (Tipo de Admissão / Desligamento)" empty={!loading && tipoMovTotais.length === 0} loading={loading} skeletonHeight="h-80">
        <div className="h-56 md:h-80">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={tipoMovTotais} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke={ct.grid} horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 10, fill: ct.tick }} stroke={ct.axis} tickFormatter={(v) => v.toLocaleString("pt-BR")} />
              <YAxis type="category" dataKey="tipo" tick={{ fontSize: 10, fill: ct.tick }} stroke={ct.axis} width={220} />
              <Tooltip contentStyle={ct.tooltipStyle} formatter={(v) => [Number(v).toLocaleString("pt-BR")]} />
              <Legend />
              <Bar dataKey="admissoes" name="Admissões" fill="#3b82f6" opacity={0.85} radius={[0, 3, 3, 0]} />
              <Bar dataKey="desligamentos" name="Desligamentos" fill="#ef4444" opacity={0.85} radius={[0, 3, 3, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </ChartCard>

      <ReleasesPanel dataset="caged" />
    </motion.div>
  );
}
