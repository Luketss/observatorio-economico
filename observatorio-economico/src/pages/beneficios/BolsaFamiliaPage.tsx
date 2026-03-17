import { useMemo } from "react";
import Card from "../../components/ui/Card";
import KpiCard from "../../components/kpis/KpiCard";
import bolsaData from "../../data/bolsa_familia_oliveira.json";
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
import { formatNumber, formatCurrency } from "../../utils/format";
import { useThemeStore } from "../../app/store/themeStore";

type BolsaItem = {
  ano: number;
  total_beneficiarios: number;
  total_repasses: number;
};

export default function BolsaFamiliaPage() {
  const data = bolsaData as BolsaItem[];
  const { dark } = useThemeStore();

  const totalBeneficiarios = useMemo(
    () =>
      data.reduce(
        (acc, item) => acc + item.total_beneficiarios,
        0
      ),
    [data]
  );

  const totalRepasses = useMemo(
    () =>
      data.reduce(
        (acc, item) => acc + item.total_repasses,
        0
      ),
    [data]
  );

  const ultimoAno = data[data.length - 1];

  const variacaoAnual = useMemo(() => {
    if (data.length < 2) return 0;
    const anterior = data[data.length - 2];
    const atual = ultimoAno;

    if (!anterior || !atual) return 0;

    return (
      ((atual.total_beneficiarios -
        anterior.total_beneficiarios) /
        anterior.total_beneficiarios) *
      100
    );
  }, [data, ultimoAno]);

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold text-slate-800">
        Bolsa Família — Oliveira
      </h1>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <KpiCard
          title="Total Beneficiários (Histórico)"
          value={formatNumber(totalBeneficiarios)}
          trend={0}
        />
        <KpiCard
          title="Total Repasses (Histórico)"
          value={formatCurrency(totalRepasses)}
          trend={0}
        />
        <KpiCard
          title={`Variação ${ultimoAno?.ano ?? ""}`}
          value={
            ultimoAno
              ? formatNumber(ultimoAno.total_beneficiarios)
              : "0"
          }
          trend={Number(variacaoAnual.toFixed(1))}
        />
      </div>

      {/* Linha - Beneficiários */}
      <Card>
        <h2 className="text-lg font-semibold mb-4">
          Evolução de Beneficiários
        </h2>

        <div className="w-full h-80">
          <ResponsiveContainer>
            <LineChart data={data}>
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
                tickFormatter={(v) => formatNumber(Number(v))}
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
                dataKey="total_beneficiarios"
                stroke={dark ? "#60a5fa" : "#2563EB"}
                strokeWidth={3}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* Barras - Repasses */}
      <Card>
        <h2 className="text-lg font-semibold mb-4">
          Repasses Anuais
        </h2>

        <div className="w-full h-80">
          <ResponsiveContainer>
            <BarChart data={data}>
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
                tickFormatter={(v) =>
                  formatCurrency(Number(v)).replace("R$", "")
                }
              />
              <Tooltip
                formatter={(value) =>
                  formatCurrency(Number(value ?? 0))
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
                dataKey="total_repasses"
                fill={dark ? "#34d399" : "#10B981"}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>
    </div>
  );
}
