import { useEffect, useState } from "react";
import api from "../../services/api";
import { motion } from "framer-motion";
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

function KpiCard({ label, value, sub, accent }) {
  return (
    <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
      <p className="text-xs uppercase tracking-wider text-slate-400 font-medium">{label}</p>
      <p className={`text-2xl font-bold mt-2 ${accent || "text-slate-800"}`}>{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
    </div>
  );
}

function ChartCard({ title, children, empty }) {
  return (
    <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
      <h3 className="text-base font-bold mb-5 text-slate-800">{title}</h3>
      {empty ? (
        <div className="h-60 flex items-center justify-center text-slate-400 text-sm">
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
  const [serie, setSerie] = useState([]);
  const [resumo, setResumo] = useState(null);
  const [porSexo, setPorSexo] = useState([]);
  const [porRaca, setPorRaca] = useState([]);
  const [porCnae, setPorCnae] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get("/rais/serie"),
      api.get("/rais/resumo"),
      api.get("/rais/por_sexo"),
      api.get("/rais/por_raca"),
      api.get("/rais/por_cnae"),
    ])
      .then(([serieRes, resumoRes, sexoRes, racaRes, cnaeRes]) => {
        setSerie(serieRes.data || []);
        setResumo(resumoRes.data);
        setPorSexo(sexoRes.data || []);
        setPorRaca(racaRes.data || []);
        setPorCnae(cnaeRes.data || []);
      })
      .catch((err) => console.error("Erro ao carregar RAIS:", err))
      .finally(() => setLoading(false));
  }, []);

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

  const cards = [
    { label: "Total de Vínculos", value: fmt(resumo?.total_vinculos), sub: "Acumulado no período" },
    { label: "Último Ano", value: vinculosUltimoAno != null ? fmt(vinculosUltimoAno) : "—", sub: `Vínculos em ${ultimoAno}` },
    {
      label: "Remuneração Média",
      value: fmtCurrency(resumo?.remuneracao_media),
      sub: "Média geral do período",
      accent: "text-purple-600",
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
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-800">
          RAIS — Vínculos Empregatícios
        </h1>
        <p className="text-sm text-slate-400 mt-1">
          Evolução dos vínculos formais de trabalho por ano.
        </p>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="bg-white p-6 rounded-2xl border border-slate-100 animate-pulse h-28" />
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
        <div className="h-64">
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
      </div>

      {/* Remuneration by gender over years */}
      {remSexoAnual.length > 0 && sexoLabels.length > 0 && (
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
      )}

      {/* CNAE top sectors */}
      <ChartCard title="Vínculos por Setor (CNAE) — Top 10" empty={cnaeTotais.length === 0}>
        <div className="h-80">
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
    </motion.div>
  );
}
