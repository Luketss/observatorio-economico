import { useEffect, useState } from "react";
import api from "../../services/api";
import { motion } from "framer-motion";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";

function KpiCard({ label, value, sub }) {
  return (
    <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
      <p className="text-xs uppercase tracking-wider text-slate-400 font-medium">
        {label}
      </p>
      <p className="text-2xl font-bold mt-2 text-slate-800">{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
    </div>
  );
}

const fmtBRL = (v) =>
  `R$ ${Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`;

export default function ArrecadacaoPage() {
  const [serie, setSerie] = useState([]);
  const [resumo, setResumo] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api.get("/arrecadacao/serie"), api.get("/arrecadacao/resumo")])
      .then(([serieRes, resumoRes]) => {
        setSerie(serieRes.data || []);
        setResumo(resumoRes.data);
      })
      .catch((err) => console.error("Erro ao carregar arrecadação:", err))
      .finally(() => setLoading(false));
  }, []);

  const cards = [
    {
      label: "Total Arrecadado",
      value: resumo ? fmtBRL(resumo.total_geral) : "—",
      sub: "Todos os períodos",
    },
    {
      label: "Último Ano",
      value: resumo ? fmtBRL(resumo.total_ultimo_ano) : "—",
      sub: serie.length ? `Ano ${serie[serie.length - 1].ano}` : null,
    },
    {
      label: "Média Mensal",
      value: resumo ? fmtBRL(resumo.media_mensal) : "—",
      sub: "Por mês no período",
    },
    {
      label: "Crescimento",
      value:
        resumo?.crescimento_percentual != null
          ? `${resumo.crescimento_percentual > 0 ? "+" : ""}${resumo.crescimento_percentual.toFixed(1)}%`
          : "—",
      sub: "vs ano anterior",
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
          Arrecadação Municipal
        </h1>
        <p className="text-sm text-slate-400 mt-1">
          Evolução das receitas municipais por período.
        </p>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-white p-6 rounded-2xl border border-slate-100 animate-pulse h-28" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
          {cards.map((c) => (
            <KpiCard key={c.label} {...c} />
          ))}
        </div>
      )}

      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
        <h3 className="text-base font-bold mb-5 text-slate-800">
          Série Histórica Mensal
        </h3>
        {serie.length === 0 ? (
          <div className="h-64 flex items-center justify-center text-slate-400 text-sm">
            Sem dados disponíveis
          </div>
        ) : (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={serie}>
                <defs>
                  <linearGradient id="gradArrecadacao" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="periodo" tick={{ fontSize: 11 }} stroke="#94a3b8" />
                <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" width={70}
                  tickFormatter={(v) =>
                    `${(v / 1_000_000).toFixed(0)}M`
                  }
                />
                <Tooltip
                  formatter={(v) => [fmtBRL(v), "Total"]}
                  labelFormatter={(l) => `Período: ${l}`}
                />
                <Area
                  type="monotone"
                  dataKey="total"
                  stroke="#6366f1"
                  strokeWidth={2.5}
                  fill="url(#gradArrecadacao)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Breakdown table */}
      {serie.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100">
            <h3 className="text-base font-bold text-slate-800">Detalhamento por Período</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-left text-xs uppercase text-slate-400 tracking-wider">
                  <th className="px-6 py-3">Período</th>
                  <th className="px-6 py-3 text-right">Total</th>
                  <th className="px-6 py-3 text-right">ICMS</th>
                  <th className="px-6 py-3 text-right">IPVA</th>
                  <th className="px-6 py-3 text-right">IPI</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {serie.slice().reverse().map((item, i) => (
                  <tr key={i} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-3 font-medium text-slate-700">{item.periodo}</td>
                    <td className="px-6 py-3 text-right text-slate-800 font-semibold">{fmtBRL(item.total)}</td>
                    <td className="px-6 py-3 text-right text-slate-500">{fmtBRL(item.icms)}</td>
                    <td className="px-6 py-3 text-right text-slate-500">{fmtBRL(item.ipva)}</td>
                    <td className="px-6 py-3 text-right text-slate-500">{fmtBRL(item.ipi)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </motion.div>
  );
}
