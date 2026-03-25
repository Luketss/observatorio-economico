import { useEffect, useState } from "react";
import api from "../../services/api";
import { motion } from "framer-motion";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
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

export default function PibPage() {
  const [serie, setSerie] = useState([]);
  const [resumo, setResumo] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api.get("/pib/serie"), api.get("/pib/resumo")])
      .then(([serieRes, resumoRes]) => {
        setSerie(serieRes.data || []);
        setResumo(resumoRes.data);
      })
      .catch((err) => console.error("Erro ao carregar PIB:", err))
      .finally(() => setLoading(false));
  }, []);

  const cards = [
    {
      label: "PIB Último Ano",
      value: resumo ? fmtBRL(resumo.pib_ultimo_ano) : "—",
      sub: resumo?.ultimo_ano ? `Ano ${resumo.ultimo_ano}` : null,
    },
    {
      label: "Crescimento",
      value:
        resumo?.crescimento_percentual != null
          ? `${resumo.crescimento_percentual > 0 ? "+" : ""}${resumo.crescimento_percentual.toFixed(1)}%`
          : "—",
      sub: "Variação vs ano anterior",
    },
    {
      label: "Anos na Série",
      value: serie.length > 0 ? serie.length : "—",
      sub:
        serie.length > 0
          ? `${serie[0].ano} – ${serie[serie.length - 1].ano}`
          : null,
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
          PIB — Produto Interno Bruto
        </h1>
        <p className="text-sm text-slate-400 mt-1">
          Série histórica do PIB municipal.
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

      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
        <h3 className="text-base font-bold mb-5 text-slate-800">
          Evolução Anual do PIB
        </h3>
        {serie.length === 0 ? (
          <div className="h-64 flex items-center justify-center text-slate-400 text-sm">
            Sem dados disponíveis
          </div>
        ) : (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={serie} barCategoryGap="30%">
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="ano" tick={{ fontSize: 12 }} stroke="#94a3b8" />
                <YAxis
                  tick={{ fontSize: 11 }}
                  stroke="#94a3b8"
                  width={75}
                  tickFormatter={(v) =>
                    `${(v / 1_000_000).toFixed(0)}M`
                  }
                />
                <Tooltip
                  formatter={(v) => [fmtBRL(v), "PIB Total"]}
                  cursor={{ fill: "#f8fafc" }}
                />
                <Bar dataKey="pib_total" radius={[4, 4, 0, 0]}>
                  {serie.map((_, i) => (
                    <Cell
                      key={i}
                      fill={i === serie.length - 1 ? "#10b981" : "#a7f3d0"}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {serie.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100">
            <h3 className="text-base font-bold text-slate-800">Série Anual</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-left text-xs uppercase text-slate-400 tracking-wider">
                  <th className="px-6 py-3">Ano</th>
                  <th className="px-6 py-3 text-right">PIB Total</th>
                  <th className="px-6 py-3">Tipo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {serie.slice().reverse().map((item, i) => (
                  <tr key={i} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-3 font-medium text-slate-700">{item.ano}</td>
                    <td className="px-6 py-3 text-right font-semibold text-slate-800">
                      {fmtBRL(item.pib_total)}
                    </td>
                    <td className="px-6 py-3 text-slate-500">{item.tipo_dado || "—"}</td>
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
