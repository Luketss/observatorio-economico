import { useEffect, useMemo, useState } from "react";
import api from "../../services/api";
import { motion } from "framer-motion";
import InsightsPanel from "../../components/InsightsPanel";
import ReleasesPanel from "../../components/ReleasesPanel";
import InfoTooltip from "../../components/InfoTooltip";
import FilterBar from "../../components/FilterBar";
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

function KpiCard({ label, value, sub, accent }) {
  return (
    <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800">
      <p className="text-xs uppercase tracking-wider text-slate-400 dark:text-slate-500 font-medium">{label}</p>
      <p className={`text-2xl font-bold mt-2 ${accent || "text-slate-800 dark:text-white"}`}>{value}</p>
      {sub && <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">{sub}</p>}
    </div>
  );
}

function ChartCard({ title, children, empty }) {
  return (
    <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800">
      <h3 className="text-base font-bold mb-5 text-slate-800 dark:text-white">{title}</h3>
      {empty ? (
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
    acc[d.sexo].admissoes += d.admissoes;
    acc[d.sexo].desligamentos += d.desligamentos;
    acc[d.sexo].saldo += d.saldo;
  });
  return Object.values(acc).sort((a, b) => b.admissoes - a.admissoes);
}

function aggregateByRacaTotal(data) {
  const acc = {};
  data.forEach((d) => {
    if (!acc[d.raca_cor]) acc[d.raca_cor] = { raca: d.raca_cor, admissoes: 0, desligamentos: 0, saldo: 0 };
    acc[d.raca_cor].admissoes += d.admissoes;
    acc[d.raca_cor].desligamentos += d.desligamentos;
    acc[d.raca_cor].saldo += d.saldo;
  });
  return Object.values(acc).sort((a, b) => b.admissoes - a.admissoes);
}

function aggregateByCnaeTotal(data) {
  const acc = {};
  data.forEach((d) => {
    const key = d.descricao_secao;
    if (!acc[key]) acc[key] = { secao: d.secao, nome: key, admissoes: 0, desligamentos: 0, saldo: 0 };
    acc[key].admissoes += d.admissoes;
    acc[key].desligamentos += d.desligamentos;
    acc[key].saldo += d.saldo;
  });
  return Object.values(acc).sort((a, b) => b.admissoes - a.admissoes).slice(0, 10);
}

export default function CagedPage() {
  const [rawSerie, setRawSerie] = useState([]);
  const [rawSexo, setRawSexo] = useState([]);
  const [rawRaca, setRawRaca] = useState([]);
  const [rawSalario, setRawSalario] = useState([]);
  const [rawCnae, setRawCnae] = useState([]);
  const [resumo, setResumo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ yearFrom: "", yearTo: "", monthFrom: "", monthTo: "" });

  useEffect(() => {
    Promise.all([
      api.get("/caged/serie"),
      api.get("/caged/resumo"),
      api.get("/caged/por_sexo"),
      api.get("/caged/por_raca"),
      api.get("/caged/salario"),
      api.get("/caged/por_cnae"),
    ])
      .then(([serieRes, resumoRes, sexoRes, racaRes, salRes, cnaeRes]) => {
        setRawSerie(serieRes.data || []);
        setResumo(resumoRes.data);
        setRawSexo(sexoRes.data || []);
        setRawRaca(racaRes.data || []);
        setRawSalario(salRes.data || []);
        setRawCnae(cnaeRes.data || []);
      })
      .catch((err) => console.error("Erro ao carregar CAGED:", err))
      .finally(() => setLoading(false));
  }, []);

  const years = useMemo(() => [...new Set(rawSerie.map((d) => d.ano))].sort(), [rawSerie]);

  const applyFilter = (d) => {
    const { yearFrom, yearTo, monthFrom, monthTo } = filters;
    if (yearFrom && d.ano < +yearFrom) return false;
    if (yearTo && d.ano > +yearTo) return false;
    if (monthFrom && d.mes < +monthFrom) return false;
    if (monthTo && d.mes > +monthTo) return false;
    return true;
  };

  const serie = useMemo(() => {
    const filtered = rawSerie.filter(applyFilter);
    const grouped = {};
    filtered.forEach((item) => {
      const key = `${item.ano}-${String(item.mes).padStart(2, "0")}`;
      if (!grouped[key]) grouped[key] = { periodo: key, admissoes: 0, desligamentos: 0, saldo: 0 };
      grouped[key].admissoes += item["admissões"] ?? 0;
      grouped[key].desligamentos += item.desligamentos ?? 0;
      grouped[key].saldo += item.saldo ?? 0;
    });
    return Object.values(grouped).sort((a, b) => a.periodo.localeCompare(b.periodo));
  }, [rawSerie, filters]);

  const porSexo = useMemo(() => rawSexo.filter(applyFilter), [rawSexo, filters]);
  const porRaca = useMemo(() => rawRaca.filter(applyFilter), [rawRaca, filters]);
  const porCnae = useMemo(() => rawCnae.filter(applyFilter), [rawCnae, filters]);
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

  // Salary chart: group by period
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
    { label: "Total Admissões", value: fmt(resumo?.total_admissoes), sub: "No período", accent: "text-blue-600" },
    { label: "Total Desligamentos", value: fmt(resumo?.total_desligamentos), sub: "No período", accent: "text-orange-500" },
    {
      label: "Saldo Líquido",
      value: resumo?.saldo_total != null
        ? `${resumo.saldo_total > 0 ? "+" : ""}${fmt(resumo.saldo_total)}`
        : "—",
      sub: "Admissões − Desligamentos",
      accent: saldoColor,
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
      <ChartCard title="Admissões vs Desligamentos (Mensal)" empty={serie.length === 0}>
        <div className="h-48 md:h-72">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={serie}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="periodo" tick={{ fontSize: 10 }} stroke="#94a3b8" interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" />
              <Tooltip formatter={(v, name) => [Number(v).toLocaleString("pt-BR"), name]} />
              <Legend />
              <Bar dataKey="admissoes" name="Admissões" fill="#3b82f6" opacity={0.8} radius={[2, 2, 0, 0]} />
              <Bar dataKey="desligamentos" name="Desligamentos" fill="#f97316" opacity={0.8} radius={[2, 2, 0, 0]} />
              <Line type="monotone" dataKey="saldo" name="Saldo" stroke="#10b981" strokeWidth={2.5} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </ChartCard>

      {/* Salary evolution */}
      <ChartCard title="Salário Médio — Admitidos vs Desligados" empty={salarioData.length === 0}>
        <div className="h-44 md:h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={salarioData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="periodo" tick={{ fontSize: 10 }} stroke="#94a3b8" interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" tickFormatter={(v) => `R$${(v / 1000).toFixed(1)}k`} />
              <Tooltip formatter={(v) => [fmtCurrency(v)]} />
              <Legend />
              <Line type="monotone" dataKey="adm" name="Admitidos" stroke="#3b82f6" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="des" name="Desligados" stroke="#f97316" strokeWidth={2} dot={false} strokeDasharray="4 2" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </ChartCard>

      {/* Two-column: sexo + raca */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <ChartCard title="Saldo por Sexo" empty={sexoTotais.length === 0}>
          <div className="h-40 md:h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={sexoTotais} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10 }} stroke="#94a3b8" tickFormatter={(v) => v.toLocaleString("pt-BR")} />
                <YAxis type="category" dataKey="sexo" tick={{ fontSize: 12 }} stroke="#94a3b8" width={80} />
                <Tooltip formatter={(v) => [Number(v).toLocaleString("pt-BR")]} />
                <Legend />
                <Bar dataKey="admissoes" name="Admissões" fill="#3b82f6" radius={[0, 3, 3, 0]} />
                <Bar dataKey="desligamentos" name="Desligamentos" fill="#f97316" radius={[0, 3, 3, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <ChartCard title="Saldo por Raça/Cor" empty={racaTotais.length === 0}>
          <div className="h-40 md:h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={racaTotais} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10 }} stroke="#94a3b8" tickFormatter={(v) => v.toLocaleString("pt-BR")} />
                <YAxis type="category" dataKey="raca" tick={{ fontSize: 11 }} stroke="#94a3b8" width={90} />
                <Tooltip formatter={(v) => [Number(v).toLocaleString("pt-BR")]} />
                <Legend />
                <Bar dataKey="admissoes" name="Admissões" fill="#8b5cf6" radius={[0, 3, 3, 0]} />
                <Bar dataKey="desligamentos" name="Desligamentos" fill="#ec4899" radius={[0, 3, 3, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
      </div>

      {/* CNAE top sectors */}
      <ChartCard title="Saldo por Setor (CNAE) — Top 10" empty={cnaeTotais.length === 0}>
        <div className="h-52 md:h-80">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={cnaeTotais} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 10 }} stroke="#94a3b8" tickFormatter={(v) => v.toLocaleString("pt-BR")} />
              <YAxis type="category" dataKey="nome" tick={{ fontSize: 10 }} stroke="#94a3b8" width={200} />
              <Tooltip formatter={(v) => [Number(v).toLocaleString("pt-BR")]} />
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
      <ReleasesPanel dataset="caged" />

    </motion.div>
  );
}
