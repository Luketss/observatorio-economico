import { useMemo } from "react";
import Card from "../../components/ui/Card";
import KpiCard from "../../components/kpis/KpiCard";
import peMeiaData from "../../data/pe_meia_oliveira.json";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from "recharts";
import { formatNumber } from "../../utils/format";
import { useThemeStore } from "../../app/store/themeStore";

type PeMeiaItem = {
  ano: number; // formato YYYYMM (ex: 202405)
  total_beneficiarios: number;
};

export default function PeDeMeiaPage() {
  const rawData = peMeiaData as PeMeiaItem[];

  // 🔹 Ajuste: converter YYYYMM em ano e mês separados
  const data = rawData.map((item) => {
    const anoStr = item.ano.toString();
    const ano = Number(anoStr.slice(0, 4));
    const mes = Number(anoStr.slice(4, 6));

    return {
      ...item,
      ano,
      mes,
      periodo: `${ano}-${anoStr.slice(4, 6)}`,
    };
  });

  const { dark } = useThemeStore();

  const totalGeral = useMemo(
    () =>
      data.reduce(
        (acc, item) => acc + item.total_beneficiarios,
        0
      ),
    [data]
  );

  const ultimoRegistro = data[data.length - 1];

  const variacaoMensal = useMemo(() => {
    if (data.length < 2) return 0;
    const anterior = data[data.length - 2];
    const atual = ultimoRegistro;

    if (!anterior || !atual) return 0;

    return (
      ((atual.total_beneficiarios -
        anterior.total_beneficiarios) /
        anterior.total_beneficiarios) *
      100
    );
  }, [data, ultimoRegistro]);

  // 🔹 Agrupar por ano para o gráfico anual
  const porAno = useMemo(() => {
    const mapa: Record<number, number> = {};

    data.forEach((item) => {
      if (!mapa[item.ano]) mapa[item.ano] = 0;
      mapa[item.ano] += item.total_beneficiarios;
    });

    return Object.entries(mapa)
      .map(([ano, total]) => ({
        ano: Number(ano),
        total,
      }))
      .sort((a, b) => a.ano - b.ano);
  }, [data]);

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold text-slate-800">
        Programa Pé de Meia — Oliveira
      </h1>

      {/* KPI */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <KpiCard
          title="Total de Beneficiários (Histórico)"
          value={formatNumber(totalGeral)}
          trend={0}
        />
        <KpiCard
          title="Variação Mensal (%)"
          value={`${variacaoMensal.toFixed(1)}%`}
          trend={variacaoMensal}
        />
      </div>

      {/* Evolução Anual */}
      <Card>
        <h2 className="text-lg font-semibold mb-4">
          Evolução Anual de Beneficiários
        </h2>

        <div className="w-full h-80">
          <ResponsiveContainer>
            <LineChart data={porAno}>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke={dark ? "#334155" : "#e2e8f0"}
              />
              <XAxis
                dataKey="ano"
                stroke={dark ? "#94a3b8" : "#475569"}
              />
              <YAxis
                stroke={dark ? "#94a3b8" : "#475569"}
                tickFormatter={(value) => formatNumber(Number(value))}
              />
              <Tooltip
                formatter={(value) =>
                  formatNumber(Number(value ?? 0))
                }
                contentStyle={{
                  backgroundColor: dark ? "#0f172a" : "#ffffff",
                  border: "1px solid #334155",
                  borderRadius: "8px",
                }}
                labelStyle={{
                  color: dark ? "#e2e8f0" : "#0f172a",
                }}
              />
              <Legend />
              <Line
                type="monotone"
                dataKey="total"
                name="Total Beneficiários"
                stroke={dark ? "#60a5fa" : "#2563EB"}
                strokeWidth={3}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* Barras */}
      <Card>
        <h2 className="text-lg font-semibold mb-4">
          Comparativo Anual
        </h2>

        <div className="w-full h-80">
          <ResponsiveContainer>
            <BarChart data={porAno}>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke={dark ? "#334155" : "#e2e8f0"}
              />
              <XAxis
                dataKey="ano"
                stroke={dark ? "#94a3b8" : "#475569"}
              />
              <YAxis
                stroke={dark ? "#94a3b8" : "#475569"}
                tickFormatter={(value) => formatNumber(Number(value))}
              />
              <Tooltip
                formatter={(value) =>
                  formatNumber(Number(value ?? 0))
                }
                contentStyle={{
                  backgroundColor: dark ? "#0f172a" : "#ffffff",
                  border: "1px solid #334155",
                  borderRadius: "8px",
                }}
                labelStyle={{
                  color: dark ? "#e2e8f0" : "#0f172a",
                }}
              />
              <Bar
                dataKey="total"
                fill={dark ? "#34d399" : "#10B981"}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>
    </div>
  );
}
