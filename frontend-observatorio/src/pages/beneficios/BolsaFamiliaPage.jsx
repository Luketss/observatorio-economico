import { useEffect, useState } from "react";
import api from "../../services/api";
import { motion } from "framer-motion";
import InsightsPanel from "../../components/InsightsPanel";
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
} from "recharts";

function KpiCard({ label, value, sub, accent }) {
  return (
    <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
      <p className="text-xs uppercase tracking-wider text-slate-400 font-medium">
        {label}
      </p>
      <p className={`text-2xl font-bold mt-2 ${accent || "text-slate-800"}`}>
        {value}
      </p>
      {sub && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
    </div>
  );
}

const fmtBRL = (v) =>
  v != null
    ? `R$ ${Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`
    : "—";

const fmtNum = (v) => (v != null ? Number(v).toLocaleString("pt-BR") : "—");

export default function BolsaFamiliaPage() {
  const [serie, setSerie] = useState([]);
  const [resumo, setResumo] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get("/bolsa_familia/serie"),
      api.get("/bolsa_familia/resumo"),
    ])
      .then(([serieRes, resumoRes]) => {
        const raw = (serieRes.data || []).map((item) => ({
          ...item,
          periodo: `${item.ano}-${String(item.mes).padStart(2, "0")}`,
        }));
        raw.sort((a, b) => a.periodo.localeCompare(b.periodo));
        setSerie(raw);
        setResumo(resumoRes.data);
      })
      .catch((err) => console.error("Erro ao carregar Bolsa Família:", err))
      .finally(() => setLoading(false));
  }, []);

  const cards = [
    {
      label: "Total Beneficiários",
      value: fmtNum(resumo?.total_beneficiarios),
      sub: "No período",
      accent: "text-blue-600",
    },
    {
      label: "Valor Total",
      value: fmtBRL(resumo?.valor_total),
      sub: "Repasses totais",
      accent: "text-green-600",
    },
    {
      label: "Benef. Primeira Infância",
      value: fmtNum(resumo?.beneficiarios_primeira_infancia),
      sub: "Crianças até 7 anos",
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
          Bolsa Família
        </h1>
        <p className="text-sm text-slate-400 mt-1">
          Beneficiários e repasses do Programa Bolsa Família.
        </p>
      </div>

      <InsightsPanel dataset="bolsa_familia" />

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[...Array(3)].map((_, i) => (
            <div
              key={i}
              className="bg-white p-6 rounded-2xl border border-slate-100 animate-pulse h-28"
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

      {/* Evolução de Beneficiários */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
        <h3 className="text-base font-bold mb-5 text-slate-800">
          Evolução de Beneficiários
        </h3>
        {loading ? (
          <div className="animate-pulse h-64 bg-slate-50 rounded-xl" />
        ) : serie.length === 0 ? (
          <div className="h-64 flex items-center justify-center text-slate-400 text-sm">
            Sem dados disponíveis
          </div>
        ) : (
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={serie}>
                <defs>
                  <linearGradient id="colorBenef" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis
                  dataKey="periodo"
                  tick={{ fontSize: 10 }}
                  stroke="#94a3b8"
                  interval="preserveStartEnd"
                />
                <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" />
                <Tooltip
                  formatter={(v) => [
                    Number(v).toLocaleString("pt-BR"),
                    "Beneficiários",
                  ]}
                />
                <Area
                  type="monotone"
                  dataKey="total_beneficiarios"
                  name="Beneficiários"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  fill="url(#colorBenef)"
                  dot={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Comparativo Bolsa vs Primeira Infância */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
        <h3 className="text-base font-bold mb-5 text-slate-800">
          Repasses: Bolsa Família vs Primeira Infância
        </h3>
        {loading ? (
          <div className="animate-pulse h-64 bg-slate-50 rounded-xl" />
        ) : serie.length === 0 ? (
          <div className="h-64 flex items-center justify-center text-slate-400 text-sm">
            Sem dados disponíveis
          </div>
        ) : (
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={serie}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis
                  dataKey="periodo"
                  tick={{ fontSize: 10 }}
                  stroke="#94a3b8"
                  interval="preserveStartEnd"
                />
                <YAxis
                  tick={{ fontSize: 11 }}
                  stroke="#94a3b8"
                  tickFormatter={(v) =>
                    `R$ ${(v / 1000).toLocaleString("pt-BR", {
                      maximumFractionDigits: 0,
                    })}k`
                  }
                />
                <Tooltip
                  formatter={(v, name) => [fmtBRL(v), name]}
                />
                <Legend />
                <Bar
                  dataKey="valor_bolsa"
                  name="Valor Bolsa"
                  fill="#3b82f6"
                  radius={[2, 2, 0, 0]}
                  stackId="stack"
                />
                <Bar
                  dataKey="valor_primeira_infancia"
                  name="Primeira Infância"
                  fill="#8b5cf6"
                  radius={[2, 2, 0, 0]}
                  stackId="stack"
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </motion.div>
  );
}
