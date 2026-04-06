import { useEffect, useState } from "react";
import api from "../services/api";
import { useAuth } from "../context/AuthContext";
import { motion } from "framer-motion";
import InsightsPanel from "../components/InsightsPanel";
import ReleasesPanel from "../components/ReleasesPanel";
import MandatoTimeline from "../components/MandatoTimeline";
import {
  CurrencyDollarIcon,
  BanknotesIcon,
  BriefcaseIcon,
  ArrowTrendingUpIcon,
  StarIcon,
  UserGroupIcon,
  HomeIcon,
  HeartIcon,
  AcademicCapIcon,
  TruckIcon,
  ChartBarIcon,
  BuildingOfficeIcon,
  BoltIcon,
  GlobeAltIcon,
} from "@heroicons/react/24/outline";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";

const CUSTOM_ICON_MAP = {
  StarIcon,
  UserGroupIcon,
  HomeIcon,
  HeartIcon,
  AcademicCapIcon,
  TruckIcon,
  ChartBarIcon,
  BuildingOfficeIcon,
  BoltIcon,
  GlobeAltIcon,
};

const CUSTOM_COLOR_MAP = {
  blue: { bg: "bg-blue-50 dark:bg-blue-950/30", text: "text-blue-600" },
  green: { bg: "bg-green-50 dark:bg-green-950/30", text: "text-green-600" },
  purple: { bg: "bg-purple-50 dark:bg-purple-950/30", text: "text-purple-600" },
  orange: { bg: "bg-orange-50 dark:bg-orange-950/30", text: "text-orange-600" },
  red: { bg: "bg-red-50 dark:bg-red-950/30", text: "text-red-600" },
  slate: { bg: "bg-slate-100 dark:bg-slate-800", text: "text-slate-600 dark:text-slate-300" },
};

function KpiCard({ label, value, sub, icon: Icon, color, delay }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      className="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 hover:shadow-md transition-shadow duration-200"
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs uppercase tracking-wider text-slate-400 dark:text-slate-500 font-medium">
            {label}
          </p>
          <p className="text-2xl font-bold mt-2 text-slate-800 dark:text-white">{value}</p>
          {sub && <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">{sub}</p>}
        </div>
        <div className={`p-2 rounded-xl ${color.bg}`}>
          <Icon className={`w-5 h-5 ${color.text}`} />
        </div>
      </div>
    </motion.div>
  );
}

export default function DashboardGeralPage() {
  const { user } = useAuth();
  const [pibResumo, setPibResumo] = useState(null);
  const [arrecResumo, setArrecResumo] = useState(null);
  const [cagedResumo, setCagedResumo] = useState(null);
  const [pibSerie, setPibSerie] = useState([]);
  const [customCards, setCustomCards] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const isGlobal = user?.role === "ADMIN_GLOBAL";
        const promises = [
          api.get("/pib/resumo"),
          api.get("/arrecadacao/resumo"),
          api.get("/caged/resumo"),
          api.get("/pib/serie"),
        ];
        // Custom cards: ADMIN_GLOBAL has no municipio, skip
        const cardsPromise = isGlobal
          ? Promise.resolve({ data: [] })
          : api.get("/dashboard-cards");

        const [pibRes, arrecRes, cagedRes, pibSerieRes] = await Promise.all(promises);
        const cardsRes = await cardsPromise;

        setPibResumo(pibRes.data);
        setArrecResumo(arrecRes.data);
        setCagedResumo(cagedRes.data);
        setPibSerie(pibSerieRes.data || []);
        setCustomCards(cardsRes.data || []);
      } catch (error) {
        console.error("Erro ao carregar dashboard:", error);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [user]);

  const fmt = (v) =>
    v != null
      ? `R$ ${Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`
      : "—";

  const cards = [
    {
      label: "PIB Último Ano",
      value: fmt(pibResumo?.pib_ultimo_ano),
      sub: pibResumo?.ultimo_ano ? `Ano ${pibResumo.ultimo_ano}` : null,
      icon: CurrencyDollarIcon,
      color: { bg: "bg-green-50", text: "text-green-600" },
    },
    {
      label: "Arrecadação Total",
      value: fmt(arrecResumo?.total_geral),
      sub: arrecResumo?.crescimento_percentual != null
        ? `${arrecResumo.crescimento_percentual > 0 ? "+" : ""}${arrecResumo.crescimento_percentual.toFixed(1)}% vs ano anterior`
        : null,
      icon: BanknotesIcon,
      color: { bg: "bg-blue-50", text: "text-blue-600" },
    },
    {
      label: "Saldo CAGED",
      value:
        cagedResumo?.saldo_total != null
          ? Number(cagedResumo.saldo_total).toLocaleString("pt-BR")
          : "—",
      sub:
        cagedResumo
          ? `${Number(cagedResumo.total_admissoes).toLocaleString("pt-BR")} admissões`
          : null,
      icon: BriefcaseIcon,
      color: { bg: "bg-purple-50", text: "text-purple-600" },
    },
    {
      label: "Crescimento PIB",
      value:
        pibResumo?.crescimento_percentual != null
          ? `${pibResumo.crescimento_percentual > 0 ? "+" : ""}${pibResumo.crescimento_percentual.toFixed(1)}%`
          : "—",
      sub: "Variação último ano",
      icon: ArrowTrendingUpIcon,
      color: { bg: "bg-orange-50", text: "text-orange-600" },
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
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-800 dark:text-white">
          Dashboard Geral
        </h1>
        <p className="text-sm text-slate-400 dark:text-slate-500 mt-1">
          Indicadores econômicos consolidados do município.
        </p>
      </div>

      <InsightsPanel dataset="geral" />

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-100 dark:border-slate-800 animate-pulse h-28" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
          {cards.map((card, i) => (
            <KpiCard key={card.label} {...card} delay={i * 0.08} />
          ))}
          {customCards.map((card, i) => (
            <KpiCard
              key={card.id}
              label={card.titulo}
              value={card.valor}
              sub={card.subtitulo}
              icon={CUSTOM_ICON_MAP[card.icone] || StarIcon}
              color={CUSTOM_COLOR_MAP[card.cor] || CUSTOM_COLOR_MAP.blue}
              delay={(cards.length + i) * 0.08}
            />
          ))}
        </div>
      )}

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.35 }}
        className="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800"
      >
        <h3 className="text-base font-bold mb-5 text-slate-800 dark:text-white">
          Evolução do PIB
        </h3>
        {pibSerie.length === 0 ? (
          <div className="h-64 flex items-center justify-center text-slate-400 dark:text-slate-500 text-sm">
            Sem dados disponíveis
          </div>
        ) : (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={pibSerie}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="ano" tick={{ fontSize: 12 }} stroke="#94a3b8" />
                <YAxis tick={{ fontSize: 12 }} stroke="#94a3b8" width={60} />
                <Tooltip
                  formatter={(v) =>
                    `R$ ${Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`
                  }
                />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="pib_total"
                  name="PIB Total"
                  stroke="#2563eb"
                  strokeWidth={2.5}
                  dot={{ r: 3 }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </motion.div>
      <MandatoTimeline />
      <ReleasesPanel dataset="geral" />

    </motion.div>
  );
}
