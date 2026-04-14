import { useEffect, useMemo, useState } from "react";
import api from "../../services/api";
import { motion } from "framer-motion";
import InsightsPanel from "../../components/InsightsPanel";
import ReleasesPanel from "../../components/ReleasesPanel";
import InfoTooltip from "../../components/InfoTooltip";
import FilterBar from "../../components/FilterBar";
import KpiCard from "../../components/KpiCard";
import PlanGate from "../../components/PlanGate";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  LineChart,
  Line,
  Cell,
} from "recharts";

const COLORS = [
  "#8b5cf6", "#3b82f6", "#10b981", "#f97316", "#f59e0b",
  "#ec4899", "#06b6d4", "#84cc16", "#ef4444", "#6366f1",
];

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

function aggregateSexoByYear(data) {
  const acc = {};
  data.forEach((d) => {
    if (!acc[d.sexo]) acc[d.sexo] = { sexo: d.sexo, total: 0 };
    acc[d.sexo].total += d.total_vinculos;
  });
  return Object.values(acc).sort((a, b) => b.total - a.total);
}

function aggregateRacaByYear(data) {
  const acc = {};
  data.forEach((d) => {
    if (!acc[d.raca_cor]) acc[d.raca_cor] = { raca: d.raca_cor, total: 0 };
    acc[d.raca_cor].total += d.total_vinculos;
  });
  return Object.values(acc).sort((a, b) => b.total - a.total);
}

function aggregateCnaeByYear(data) {
  const acc = {};
  data.forEach((d) => {
    const key = d.descricao_secao;
    if (!acc[key]) acc[key] = { secao: d.secao, nome: key, total: 0, rem_sum: 0, rem_cnt: 0 };
    acc[key].total += d.total_vinculos;
    if (d.remuneracao_media) {
      acc[key].rem_sum += d.remuneracao_media;
      acc[key].rem_cnt += 1;
    }
  });
  return Object.values(acc)
    .map((e) => ({ ...e, rem_media: e.rem_cnt > 0 ? Math.round(e.rem_sum / e.rem_cnt) : null }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 10);
}

function remByYearBySexo(data) {
  const anos = [...new Set(data.map((d) => d.ano))].sort();
  return anos.map((ano) => {
    const obj = { ano };
    data.filter((d) => d.ano === ano && d.remuneracao_media).forEach((d) => {
      obj[d.sexo] = Math.round(d.remuneracao_media);
    });
    return obj;
  });
}

export default function RaisPage() {
  const [rawSerie, setRawSerie] = useState([]);
  const [resumo, setResumo] = useState(null);
  const [rawSexo, setRawSexo] = useState([]);
  const [rawRaca, setRawRaca] = useState([]);
  const [rawCnae, setRawCnae] = useState([]);
  const [rawFaixaEtaria, setRawFaixaEtaria] = useState([]);
  const [rawEscolaridade, setRawEscolaridade] = useState([]);
  const [rawFaixaRem, setRawFaixaRem] = useState([]);
  const [rawTempoEmprego, setRawTempoEmprego] = useState([]);
  const [metricas, setMetricas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ yearFrom: "", yearTo: "" });

  useEffect(() => {
    Promise.all([
      api.get("/rais/serie"),
      api.get("/rais/resumo"),
      api.get("/rais/por_sexo"),
      api.get("/rais/por_raca"),
      api.get("/rais/por_cnae"),
      api.get("/rais/por_faixa_etaria"),
      api.get("/rais/por_escolaridade"),
      api.get("/rais/por_faixa_remuneracao"),
      api.get("/rais/por_faixa_tempo_emprego"),
      api.get("/rais/metricas_anuais"),
    ])
      .then(([serieRes, resumoRes, sexoRes, racaRes, cnaeRes,
              faixaEtRes, escolRes, faixaRemRes, tempoRes, metricasRes]) => {
        setRawSerie(serieRes.data || []);
        setResumo(resumoRes.data);
        setRawSexo(sexoRes.data || []);
        setRawRaca(racaRes.data || []);
        setRawCnae(cnaeRes.data || []);
        setRawFaixaEtaria(faixaEtRes.data || []);
        setRawEscolaridade(escolRes.data || []);
        setRawFaixaRem(faixaRemRes.data || []);
        setRawTempoEmprego(tempoRes.data || []);
        setMetricas(metricasRes.data || []);
      })
      .catch((err) => console.error("Erro ao carregar RAIS:", err))
      .finally(() => setLoading(false));
  }, []);

  const years = useMemo(() => [...new Set(rawSerie.map((d) => d.ano))].sort(), [rawSerie]);

  const applyYearFilter = (d) => {
    const { yearFrom, yearTo } = filters;
    if (yearFrom && d.ano < +yearFrom) return false;
    if (yearTo && d.ano > +yearTo) return false;
    return true;
  };

  const serie = useMemo(() => rawSerie.filter(applyYearFilter), [rawSerie, filters]);
  const porSexo = useMemo(() => rawSexo.filter(applyYearFilter), [rawSexo, filters]);
  const porRaca = useMemo(() => rawRaca.filter(applyYearFilter), [rawRaca, filters]);
  const porCnae = useMemo(() => rawCnae.filter(applyYearFilter), [rawCnae, filters]);
  const porFaixaEtaria = useMemo(() => rawFaixaEtaria.filter(applyYearFilter), [rawFaixaEtaria, filters]);
  const porEscolaridade = useMemo(() => rawEscolaridade.filter(applyYearFilter), [rawEscolaridade, filters]);
  const porFaixaRem = useMemo(() => rawFaixaRem.filter(applyYearFilter), [rawFaixaRem, filters]);
  const porTempoEmprego = useMemo(() => rawTempoEmprego.filter(applyYearFilter), [rawTempoEmprego, filters]);
  const metricasFiltradas = useMemo(() => metricas.filter(applyYearFilter), [metricas, filters]);

  const fmt = (v) => (v != null ? Number(v).toLocaleString("pt-BR") : "—");
  const fmtCurrency = (v) =>
    v != null
      ? Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })
      : "—";

  const chartData = Object.values(
    serie.reduce((acc, item) => {
      if (!acc[item.ano]) acc[item.ano] = { ano: item.ano, total_vinculos: 0 };
      acc[item.ano].total_vinculos += item.total_vinculos;
      return acc;
    }, {})
  ).sort((a, b) => a.ano - b.ano);

  const ultimoAno = chartData.length ? chartData[chartData.length - 1].ano : "—";
  const vinculosUltimoAno = chartData.length ? chartData[chartData.length - 1].total_vinculos : null;

  const sexoTotais = aggregateSexoByYear(porSexo);
  const racaTotais = aggregateRacaByYear(porRaca);
  const cnaeTotais = aggregateCnaeByYear(porCnae);
  const remSexoAnual = remByYearBySexo(porSexo);
  const sexoLabels = [...new Set(porSexo.map((d) => d.sexo))];

  // Aggregate helpers for new datasets
  const faixaEtariaTotais = Object.values(
    porFaixaEtaria.reduce((acc, d) => {
      if (!acc[d.faixa_etaria]) acc[d.faixa_etaria] = { faixa: d.faixa_etaria, total: 0 };
      acc[d.faixa_etaria].total += d.total_vinculos;
      return acc;
    }, {})
  ).sort((a, b) => b.total - a.total);

  const escolaridadeTotais = Object.values(
    porEscolaridade.reduce((acc, d) => {
      if (!acc[d.grau_instrucao]) acc[d.grau_instrucao] = { grau: d.grau_instrucao, total: 0 };
      acc[d.grau_instrucao].total += d.total_vinculos;
      return acc;
    }, {})
  ).sort((a, b) => b.total - a.total);

  const faixaRemTotais = Object.values(
    porFaixaRem.reduce((acc, d) => {
      if (!acc[d.faixa_remuneracao_sm]) acc[d.faixa_remuneracao_sm] = { faixa: d.faixa_remuneracao_sm, total: 0 };
      acc[d.faixa_remuneracao_sm].total += d.total_vinculos;
      return acc;
    }, {})
  ).sort((a, b) => b.total - a.total);

  const tempoEmpregoTotais = Object.values(
    porTempoEmprego.reduce((acc, d) => {
      if (!acc[d.faixa_tempo_emprego]) acc[d.faixa_tempo_emprego] = { faixa: d.faixa_tempo_emprego, total: 0 };
      acc[d.faixa_tempo_emprego].total += d.total_vinculos;
      return acc;
    }, {})
  ).sort((a, b) => b.total - a.total);

  const metricasAnuais = metricasFiltradas.sort((a, b) => a.ano - b.ano);

  const cards = [
    { label: "Total de Vínculos", value: fmt(resumo?.total_vinculos), sub: "Acumulado no período", dataset: "rais", indicadorKey: "total_vinculos" },
    { label: "Último Ano", value: vinculosUltimoAno != null ? fmt(vinculosUltimoAno) : "—", sub: `Vínculos em ${ultimoAno}`, dataset: "rais", indicadorKey: "ultimo_ano" },
    {
      label: "Remuneração Média",
      value: fmtCurrency(resumo?.remuneracao_media),
      sub: "Média geral do período",
      accent: "text-purple-600",
      dataset: "rais",
      indicadorKey: "remuneracao_media",
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
            RAIS — Vínculos Empregatícios
          </h1>
          <InfoTooltip dataset="rais" />
        </div>
        <p className="text-sm text-slate-400 dark:text-slate-500 mt-1">
          Evolução dos vínculos formais de trabalho por ano.
        </p>
      </div>

      <InsightsPanel dataset="rais" />

      <FilterBar years={years} value={filters} onChange={setFilters} />

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

      {/* Annual vinculos */}
      <ChartCard title="Evolução Anual de Vínculos" empty={chartData.length === 0}>
        <div className="h-44 md:h-64">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="gradRais" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="ano" tick={{ fontSize: 12 }} stroke="#94a3b8" />
              <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" width={65} tickFormatter={(v) => v.toLocaleString("pt-BR")} />
              <Tooltip formatter={(v) => [Number(v).toLocaleString("pt-BR"), "Vínculos"]} />
              <Area type="monotone" dataKey="total_vinculos" stroke="#8b5cf6" strokeWidth={2.5} fill="url(#gradRais)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </ChartCard>

      {/* Sexo + Raca breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <PlanGate planKey="rais.por_sexo">
          <ChartCard title="Vínculos por Sexo" empty={sexoTotais.length === 0}>
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={sexoTotais} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 10 }} stroke="#94a3b8" tickFormatter={(v) => v.toLocaleString("pt-BR")} />
                  <YAxis type="category" dataKey="sexo" tick={{ fontSize: 12 }} stroke="#94a3b8" width={90} />
                  <Tooltip formatter={(v) => [Number(v).toLocaleString("pt-BR"), "Vínculos"]} />
                  <Bar dataKey="total" name="Vínculos" radius={[0, 4, 4, 0]}>
                    {sexoTotais.map((_, idx) => (
                      <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>
        </PlanGate>

        <PlanGate planKey="rais.por_raca">
          <ChartCard title="Vínculos por Raça/Cor" empty={racaTotais.length === 0}>
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={racaTotais} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 10 }} stroke="#94a3b8" tickFormatter={(v) => v.toLocaleString("pt-BR")} />
                  <YAxis type="category" dataKey="raca" tick={{ fontSize: 11 }} stroke="#94a3b8" width={100} />
                  <Tooltip formatter={(v) => [Number(v).toLocaleString("pt-BR"), "Vínculos"]} />
                  <Bar dataKey="total" name="Vínculos" radius={[0, 4, 4, 0]}>
                    {racaTotais.map((_, idx) => (
                      <Cell key={idx} fill={COLORS[(idx + 3) % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>
        </PlanGate>
      </div>

      {/* Remuneration by gender over years */}
      {remSexoAnual.length > 0 && sexoLabels.length > 0 && (
        <PlanGate planKey="rais.por_sexo">
          <ChartCard title="Remuneração Média por Sexo (Anual)" empty={remSexoAnual.length === 0}>
            <div className="h-60">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={remSexoAnual}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="ano" tick={{ fontSize: 12 }} stroke="#94a3b8" />
                  <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" tickFormatter={(v) => `R$${(v / 1000).toFixed(1)}k`} />
                  <Tooltip formatter={(v) => [fmtCurrency(v)]} />
                  <Legend />
                  {sexoLabels.map((s, i) => (
                    <Line key={s} type="monotone" dataKey={s} name={s} stroke={COLORS[i % COLORS.length]} strokeWidth={2} dot />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>
        </PlanGate>
      )}

      {/* CNAE top sectors */}
      <PlanGate planKey="rais.por_cnae">
        <ChartCard title="Vínculos por Setor (CNAE) — Top 10" empty={cnaeTotais.length === 0}>
          <div className="h-52 md:h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={cnaeTotais} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10 }} stroke="#94a3b8" tickFormatter={(v) => v.toLocaleString("pt-BR")} />
                <YAxis type="category" dataKey="nome" tick={{ fontSize: 10 }} stroke="#94a3b8" width={200} />
                <Tooltip formatter={(v) => [Number(v).toLocaleString("pt-BR")]} />
                <Bar dataKey="total" name="Vínculos" radius={[0, 4, 4, 0]}>
                  {cnaeTotais.map((_, idx) => (
                    <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
      </PlanGate>

      {/* Faixa Etária + Escolaridade */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <PlanGate planKey="rais.por_faixa_etaria">
          <ChartCard title="Vínculos por Faixa Etária" empty={faixaEtariaTotais.length === 0}>
            <div className="h-44 md:h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={faixaEtariaTotais} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 10 }} stroke="#94a3b8" tickFormatter={(v) => v.toLocaleString("pt-BR")} />
                  <YAxis type="category" dataKey="faixa" tick={{ fontSize: 10 }} stroke="#94a3b8" width={100} />
                  <Tooltip formatter={(v) => [Number(v).toLocaleString("pt-BR"), "Vínculos"]} />
                  <Bar dataKey="total" name="Vínculos" radius={[0, 4, 4, 0]}>
                    {faixaEtariaTotais.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>
        </PlanGate>

        <PlanGate planKey="rais.por_escolaridade">
          <ChartCard title="Vínculos por Grau de Instrução" empty={escolaridadeTotais.length === 0}>
            <div className="h-44 md:h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={escolaridadeTotais} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 10 }} stroke="#94a3b8" tickFormatter={(v) => v.toLocaleString("pt-BR")} />
                  <YAxis type="category" dataKey="grau" tick={{ fontSize: 9 }} stroke="#94a3b8" width={140} />
                  <Tooltip formatter={(v) => [Number(v).toLocaleString("pt-BR"), "Vínculos"]} />
                  <Bar dataKey="total" name="Vínculos" radius={[0, 4, 4, 0]}>
                    {escolaridadeTotais.map((_, i) => (
                      <Cell key={i} fill={COLORS[(i + 2) % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>
        </PlanGate>
      </div>

      {/* Faixa de Remuneração + Tempo de Emprego */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <PlanGate planKey="rais.por_remuneracao">
          <ChartCard title="Vínculos por Faixa Salarial (em SM)" empty={faixaRemTotais.length === 0}>
            <div className="h-44 md:h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={faixaRemTotais} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 10 }} stroke="#94a3b8" tickFormatter={(v) => v.toLocaleString("pt-BR")} />
                  <YAxis type="category" dataKey="faixa" tick={{ fontSize: 10 }} stroke="#94a3b8" width={110} />
                  <Tooltip formatter={(v) => [Number(v).toLocaleString("pt-BR"), "Vínculos"]} />
                  <Bar dataKey="total" name="Vínculos" radius={[0, 4, 4, 0]}>
                    {faixaRemTotais.map((_, i) => (
                      <Cell key={i} fill={COLORS[(i + 1) % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>
        </PlanGate>

        <ChartCard title="Vínculos por Tempo de Emprego" empty={tempoEmpregoTotais.length === 0}>
          <div className="h-44 md:h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={tempoEmpregoTotais} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10 }} stroke="#94a3b8" tickFormatter={(v) => v.toLocaleString("pt-BR")} />
                <YAxis type="category" dataKey="faixa" tick={{ fontSize: 10 }} stroke="#94a3b8" width={110} />
                <Tooltip formatter={(v) => [Number(v).toLocaleString("pt-BR"), "Vínculos"]} />
                <Bar dataKey="total" name="Vínculos" radius={[0, 4, 4, 0]}>
                  {tempoEmpregoTotais.map((_, i) => (
                    <Cell key={i} fill={COLORS[(i + 4) % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
      </div>

      {/* Métricas Anuais — PCD, Outro Município, Afastamento */}
      {metricasAnuais.length > 0 && (
        <PlanGate planKey="rais.metricas">
          <>
            <ChartCard title="PCD e Trabalhadores de Outro Município (Evolução Anual)" empty={false}>
              <div className="h-60">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={metricasAnuais} barCategoryGap="35%">
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                    <XAxis dataKey="ano" tick={{ fontSize: 12 }} stroke="#94a3b8" />
                    <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" tickFormatter={(v) => v.toLocaleString("pt-BR")} />
                    <Tooltip formatter={(v) => [Number(v).toLocaleString("pt-BR")]} />
                    <Legend />
                    <Bar dataKey="total_pcd" name="PCD" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="total_outro_municipio" name="Outro Município" fill="#06b6d4" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </ChartCard>

            <ChartCard title="Média de Dias de Afastamento Anual" empty={metricasAnuais.every((d) => !d.media_dias_afastamento)}>
              <div className="h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={metricasAnuais}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="ano" tick={{ fontSize: 12 }} stroke="#94a3b8" />
                    <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" tickFormatter={(v) => `${v.toFixed(1)} dias`} />
                    <Tooltip formatter={(v) => [`${Number(v).toFixed(1)} dias`, "Média de Afastamento"]} />
                    <Line type="monotone" dataKey="media_dias_afastamento" name="Média Afastamento" stroke="#f97316" strokeWidth={2.5} dot />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </ChartCard>
          </>
        </PlanGate>
      )}
      <ReleasesPanel dataset="rais" />

    </motion.div>
  );
}
