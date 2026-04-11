import { useEffect, useMemo, useState } from "react";
import api from "../../services/api";
import { motion } from "framer-motion";
import InsightsPanel from "../../components/InsightsPanel";
import ReleasesPanel from "../../components/ReleasesPanel";
import InfoTooltip from "../../components/InfoTooltip";
import FilterBar from "../../components/FilterBar";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  Cell,
} from "recharts";

const COLORS = [
  "#3b82f6",
  "#10b981",
  "#f59e0b",
  "#8b5cf6",
  "#ef4444",
  "#06b6d4",
];

function KpiCard({ label, value, sub, accent }) {
  return (
    <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800">
      <p className="text-xs uppercase tracking-wider text-slate-400 dark:text-slate-500 font-medium">
        {label}
      </p>
      <p className={`text-2xl font-bold mt-2 ${accent || "text-slate-800 dark:text-white"}`}>
        {value}
      </p>
      {sub && <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">{sub}</p>}
    </div>
  );
}

const fmtBRL = (v) =>
  v != null
    ? `R$ ${Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`
    : "—";

const fmtNum = (v) => (v != null ? Number(v).toLocaleString("pt-BR") : "—");

export default function EstbanPage() {
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
    },
    {
      label: "Operações de Crédito",
      value: fmtBRL(resumo?.total_operacoes_credito),
      sub: "Saldo total",
      accent: "text-green-600",
    },
    {
      label: "Total Depósitos",
      value: fmtBRL(resumo?.total_depositos),
      sub: "Vista + Poupança + Prazo",
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
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-800 dark:text-white">
            ESTBAN — Estatísticas Bancárias
          </h1>
          <InfoTooltip dataset="estban" />
        </div>
        <p className="text-sm text-slate-400 dark:text-slate-500 mt-1">
          Operações de crédito, depósitos e agências bancárias.
        </p>
      </div>

      <InsightsPanel dataset="estban" />

      <FilterBar years={years} value={filters} onChange={setFilters} />

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[...Array(3)].map((_, i) => (
            <div
              key={i}
              className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-100 dark:border-slate-800 animate-pulse h-28"
            />
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
      <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800">
        <h3 className="text-base font-bold mb-5 text-slate-800 dark:text-white">
          Evolução das Operações de Crédito
        </h3>
        {loading ? (
          <div className="animate-pulse h-64 bg-slate-50 dark:bg-slate-800 rounded-xl" />
        ) : serie.length === 0 ? (
          <div className="h-64 flex items-center justify-center text-slate-400 dark:text-slate-500 text-sm">
            Sem dados disponíveis
          </div>
        ) : (
          <div className="h-48 md:h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={serie}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis
                  dataKey="data_referencia"
                  tick={{ fontSize: 10 }}
                  stroke="#94a3b8"
                  interval="preserveStartEnd"
                />
                <YAxis
                  tick={{ fontSize: 11 }}
                  stroke="#94a3b8"
                  tickFormatter={(v) =>
                    `R$ ${(v / 1_000_000).toLocaleString("pt-BR", {
                      maximumFractionDigits: 0,
                    })}M`
                  }
                />
                <Tooltip formatter={(v) => [fmtBRL(v), "Operações de Crédito"]} />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="valor_operacoes_credito"
                  name="Operações de Crédito"
                  stroke="#3b82f6"
                  strokeWidth={2.5}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="valor_poupanca"
                  name="Poupança"
                  stroke="#10b981"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="valor_depositos_prazo"
                  name="Depósitos a Prazo"
                  stroke="#f59e0b"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Captação — Depósitos por Tipo */}
      <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800">
        <h3 className="text-base font-bold mb-5 text-slate-800 dark:text-white">
          Evolução da Captação — Depósitos por Tipo
        </h3>
        {loading ? (
          <div className="animate-pulse h-72 bg-slate-50 dark:bg-slate-800 rounded-xl" />
        ) : captacao.length === 0 ? (
          <div className="h-64 flex items-center justify-center text-slate-400 dark:text-slate-500 text-sm">
            Sem dados disponíveis
          </div>
        ) : (
          <div className="h-48 md:h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={captacao}>
                <defs>
                  <linearGradient id="gradVista" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.05} />
                  </linearGradient>
                  <linearGradient id="gradPoupanca" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0.05} />
                  </linearGradient>
                  <linearGradient id="gradPrazo" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis
                  dataKey="data_referencia"
                  tick={{ fontSize: 10 }}
                  stroke="#94a3b8"
                  interval="preserveStartEnd"
                />
                <YAxis
                  tick={{ fontSize: 11 }}
                  stroke="#94a3b8"
                  tickFormatter={(v) =>
                    `R$ ${(v / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}M`
                  }
                />
                <Tooltip formatter={(v) => [fmtBRL(v)]} />
                <Legend />
                <Area type="monotone" dataKey="depositos_vista" name="Depósitos à Vista" stroke="#3b82f6" fill="url(#gradVista)" strokeWidth={2} dot={false} />
                <Area type="monotone" dataKey="poupanca" name="Poupança" stroke="#10b981" fill="url(#gradPoupanca)" strokeWidth={2} dot={false} />
                <Area type="monotone" dataKey="depositos_prazo" name="Depósitos a Prazo" stroke="#f59e0b" fill="url(#gradPrazo)" strokeWidth={2} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Crédito vs. Captação Total */}
      <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800">
        <h3 className="text-base font-bold mb-5 text-slate-800 dark:text-white">
          Crédito vs. Captação Total
        </h3>
        {loading ? (
          <div className="animate-pulse h-64 bg-slate-50 dark:bg-slate-800 rounded-xl" />
        ) : captacao.length === 0 ? (
          <div className="h-64 flex items-center justify-center text-slate-400 dark:text-slate-500 text-sm">
            Sem dados disponíveis
          </div>
        ) : (
          <div className="h-44 md:h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={captacao}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="data_referencia" tick={{ fontSize: 10 }} stroke="#94a3b8" interval="preserveStartEnd" />
                <YAxis
                  tick={{ fontSize: 11 }}
                  stroke="#94a3b8"
                  tickFormatter={(v) =>
                    `R$ ${(v / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}M`
                  }
                />
                <Tooltip formatter={(v) => [fmtBRL(v)]} />
                <Legend />
                <Line type="monotone" dataKey="operacoes_credito" name="Operações de Crédito" stroke="#3b82f6" strokeWidth={2.5} dot={false} />
                <Line type="monotone" dataKey="total_captacao" name="Total Captação" stroke="#10b981" strokeWidth={2} dot={false} strokeDasharray="4 2" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Composição do Crédito */}
      <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800">
        <h3 className="text-base font-bold mb-5 text-slate-800 dark:text-white">
          Composição das Operações de Crédito
        </h3>
        {loading ? (
          <div className="animate-pulse h-72 bg-slate-50 dark:bg-slate-800 rounded-xl" />
        ) : composicao.length === 0 ? (
          <div className="h-72 flex items-center justify-center text-slate-400 dark:text-slate-500 text-sm">
            Sem dados disponíveis
          </div>
        ) : (
          <div className="h-48 md:h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={composicao}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="data_referencia" tick={{ fontSize: 10 }} stroke="#94a3b8" interval="preserveStartEnd" />
                <YAxis
                  tick={{ fontSize: 11 }}
                  stroke="#94a3b8"
                  tickFormatter={(v) =>
                    `R$ ${(v / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}M`
                  }
                />
                <Tooltip formatter={(v) => [fmtBRL(v)]} />
                <Legend />
                <Bar dataKey="emprestimos_titulos_descontados" name="Empréstimos/Títulos Desc." stackId="a" fill="#3b82f6" />
                <Bar dataKey="financiamentos_gerais" name="Financiamentos Gerais" stackId="a" fill="#10b981" />
                <Bar dataKey="financiamentos_imobiliarios" name="Financiamentos Imobiliários" stackId="a" fill="#f59e0b" />
                <Bar dataKey="financiamento_agropecuario" name="Financiamento Agropecuário" stackId="a" fill="#84cc16" />
                <Bar dataKey="arrendamento_mercantil" name="Arrendamento Mercantil" stackId="a" fill="#8b5cf6" />
                <Bar dataKey="emprestimos_setor_publico" name="Setor Público" stackId="a" fill="#06b6d4" />
                <Bar dataKey="outros_creditos" name="Outros Créditos" stackId="a" fill="#94a3b8" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Crédito por Instituição */}
      <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800">
        <h3 className="text-base font-bold mb-5 text-slate-800 dark:text-white">
          Operações de Crédito por Instituição
        </h3>
        {loading ? (
          <div className="animate-pulse h-64 bg-slate-50 dark:bg-slate-800 rounded-xl" />
        ) : porInstituicao.length === 0 ? (
          <div className="h-64 flex items-center justify-center text-slate-400 dark:text-slate-500 text-sm">
            Sem dados disponíveis
          </div>
        ) : (
          <div className="h-52 md:h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={porInstituicao.slice(0, 10)}
                layout="vertical"
                margin={{ left: 20, right: 20 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="#f1f5f9"
                  horizontal={false}
                />
                <XAxis
                  type="number"
                  tick={{ fontSize: 11 }}
                  stroke="#94a3b8"
                  tickFormatter={(v) =>
                    `R$ ${(v / 1_000_000).toLocaleString("pt-BR", {
                      maximumFractionDigits: 0,
                    })}M`
                  }
                />
                <YAxis
                  type="category"
                  dataKey="nome_instituicao"
                  tick={{ fontSize: 9 }}
                  stroke="#94a3b8"
                  width={140}
                />
                <Tooltip formatter={(v) => [fmtBRL(v), "Operações de Crédito"]} />
                <Bar
                  dataKey="valor_operacoes_credito"
                  name="Operações de Crédito"
                  radius={[0, 4, 4, 0]}
                >
                  {porInstituicao.slice(0, 10).map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Tabela de Instituições */}
      <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800">
        <h3 className="text-base font-bold mb-5 text-slate-800 dark:text-white">
          Detalhamento por Instituição
        </h3>
        {loading ? (
          <div className="animate-pulse h-40 bg-slate-50 dark:bg-slate-800 rounded-xl" />
        ) : porInstituicao.length === 0 ? (
          <div className="h-32 flex items-center justify-center text-slate-400 dark:text-slate-500 text-sm">
            Sem dados disponíveis
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800">
                  <th className="text-left py-3 px-4 text-xs uppercase tracking-wider text-slate-400 dark:text-slate-500 font-medium">
                    Instituição
                  </th>
                  <th className="text-right py-3 px-4 text-xs uppercase tracking-wider text-slate-400 dark:text-slate-500 font-medium">
                    Agências
                  </th>
                  <th className="text-right py-3 px-4 text-xs uppercase tracking-wider text-slate-400 dark:text-slate-500 font-medium">
                    Operações Crédito
                  </th>
                  <th className="text-right py-3 px-4 text-xs uppercase tracking-wider text-slate-400 dark:text-slate-500 font-medium">
                    Depósitos Vista
                  </th>
                  <th className="text-right py-3 px-4 text-xs uppercase tracking-wider text-slate-400 dark:text-slate-500 font-medium">
                    Poupança
                  </th>
                  <th className="text-right py-3 px-4 text-xs uppercase tracking-wider text-slate-400 dark:text-slate-500 font-medium">
                    Dep. Prazo
                  </th>
                </tr>
              </thead>
              <tbody>
                {porInstituicao.map((row, i) => (
                  <tr
                    key={i}
                    className="border-b border-slate-50 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                  >
                    <td className="py-3 px-4 text-slate-800 dark:text-white font-medium">
                      {row.nome_instituicao}
                    </td>
                    <td className="py-3 px-4 text-right text-slate-600 dark:text-slate-300">
                      {fmtNum(row.qtd_agencias)}
                    </td>
                    <td className="py-3 px-4 text-right text-slate-800 dark:text-white font-medium">
                      {fmtBRL(row.valor_operacoes_credito)}
                    </td>
                    <td className="py-3 px-4 text-right text-slate-600 dark:text-slate-300">
                      {fmtBRL(row.valor_depositos_vista)}
                    </td>
                    <td className="py-3 px-4 text-right text-slate-600 dark:text-slate-300">
                      {fmtBRL(row.valor_poupanca)}
                    </td>
                    <td className="py-3 px-4 text-right text-slate-600 dark:text-slate-300">
                      {fmtBRL(row.valor_depositos_prazo)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <ReleasesPanel dataset="estban" />

    </motion.div>
  );
}
