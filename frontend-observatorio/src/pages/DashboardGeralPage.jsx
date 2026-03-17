import { useEffect, useState } from "react";
import api from "../services/api";
import { motion } from "framer-motion";
import {
  CurrencyDollarIcon,
  BanknotesIcon,
  BriefcaseIcon,
  BuildingOffice2Icon,
} from "@heroicons/react/24/outline";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";

export default function DashboardGeralPage() {
  const [stats, setStats] = useState({
    pib: 0,
    arrecadacao: 0,
    empregos: 1245,
    empresas: 342,
  });

  const [chartData, setChartData] = useState([]);

  useEffect(() => {
    async function fetchData() {
      try {
        const [pibRes, arrecRes] = await Promise.all([
          api.get("/pib"),
          api.get("/arrecadacao"),
        ]);

        setStats((prev) => ({
          ...prev,
          pib: pibRes.data?.total || 0,
          arrecadacao: arrecRes.data?.total || 0,
        }));

        // mock gráfico enquanto backend não fornece série histórica
        setChartData([
          { ano: "2019", valor: 400 },
          { ano: "2020", valor: 380 },
          { ano: "2021", valor: 450 },
          { ano: "2022", valor: 520 },
          { ano: "2023", valor: 610 },
        ]);
      } catch (error) {
        console.error("Erro ao carregar dashboard:", error);
      }
    }

    fetchData();
  }, []);

  const cards = [
    {
      label: "PIB Total",
      value: `R$ ${Number(stats.pib).toLocaleString("pt-BR")}`,
      icon: CurrencyDollarIcon,
      color: "text-green-600",
    },
    {
      label: "Arrecadação",
      value: `R$ ${Number(stats.arrecadacao).toLocaleString("pt-BR")}`,
      icon: BanknotesIcon,
      color: "text-blue-600",
    },
    {
      label: "Empregos",
      value: Number(stats.empregos).toLocaleString("pt-BR"),
      icon: BriefcaseIcon,
      color: "text-purple-600",
    },
    {
      label: "Empresas",
      value: Number(stats.empresas).toLocaleString("pt-BR"),
      icon: BuildingOffice2Icon,
      color: "text-orange-600",
    },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="space-y-10"
    >
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">
          Dashboard Geral
        </h1>
        <p className="text-muted mt-2">
          Indicadores econômicos consolidados do município.
        </p>
      </div>

      {/* Cards com ícones */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-8">
        {cards.map((card, index) => {
          const Icon = card.icon;
          return (
            <motion.div
              key={card.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 hover:shadow-xl transition-all duration-300"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-wider text-muted">
                    {card.label}
                  </p>
                  <h2 className="text-2xl font-bold mt-3 text-slate-800">
                    {card.value}
                  </h2>
                </div>
                <Icon className={`w-8 h-8 ${card.color}`} />
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Gráfico real com Recharts */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.4 }}
        className="bg-white p-8 rounded-2xl shadow-sm border border-slate-100"
      >
        <h3 className="text-lg font-bold mb-6 text-slate-800">
          Evolução do Indicador
        </h3>

        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="ano" />
              <YAxis />
              <Tooltip />
              <Line
                type="monotone"
                dataKey="valor"
                stroke="#2563eb"
                strokeWidth={3}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </motion.div>
    </motion.div>
  );
}
