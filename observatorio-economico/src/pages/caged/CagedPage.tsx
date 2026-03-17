import { useEffect, useMemo, useState } from "react";
import Card from "../../components/ui/Card";
import KpiCard from "../../components/kpis/KpiCard";
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
  Cell,
} from "recharts";
import { formatNumber } from "../../utils/format";
import { useThemeStore } from "../../app/store/themeStore";
import { getCagedSerie, getCagedResumo } from "../../services/api";

type CagedItem = {
  ano: number;
  mes: number;
  admissões: number;
  desligamentos: number;
  saldo: number;
  setor: string | null;
};

export default function CagedPage() {
  const [data, setData] = useState<CagedItem[]>([]);
  const [resumo, setResumo] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const { dark } = useThemeStore();

  useEffect(() => {
    async function fetchData() {
      try {
        const serie = await getCagedSerie();
        const resumoData = await getCagedResumo();
        setData(serie as CagedItem[]);
        setResumo(resumoData);
      } catch (error) {
        console.error("Erro ao carregar CAGED", error);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, []);

  const totalAdmissoes = resumo?.total_admissoes ?? 0;
  const totalDesligamentos = resumo?.total_desligamentos ?? 0;
  const saldoAcumulado = resumo?.saldo_total ?? 0;

  const serieMensal = useMemo(
    () =>
      data.map((d) => ({
        periodo: `${d.ano}-${String(d.mes).padStart(2, "0")}`,
        saldo: d.saldo,
        admissões: d.admissões,
        desligamentos: d.desligamentos,
      })),
    [data]
  );

  if (loading) return <div>Carregando...</div>;

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold text-slate-800">
        CAGED — Movimentação Mensal de Empregos
      </h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <KpiCard
          title="Total Admissões"
          value={formatNumber(totalAdmissoes)}
          trend={0}
        />
        <KpiCard
          title="Total Desligamentos"
          value={formatNumber(totalDesligamentos)}
          trend={0}
        />
        <KpiCard
          title="Saldo Acumulado"
          value={formatNumber(saldoAcumulado)}
          trend={saldoAcumulado}
        />
      </div>

      <Card>
        <h2 className="text-lg font-semibold mb-4">
          Evolução do Saldo Mensal
        </h2>

        <div className="w-full h-80">
          <ResponsiveContainer>
            <LineChart data={serieMensal}>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke={dark ? "#334155" : "#e2e8f0"}
              />
              <XAxis
                dataKey="periodo"
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
              />
              <Legend />
              <Line
                type="monotone"
                dataKey="saldo"
                stroke={dark ? "#60a5fa" : "#2563EB"}
                strokeWidth={3}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card>
        <h2 className="text-lg font-semibold mb-4">
          Saldo Mensal (Positivo/Negativo)
        </h2>

        <div className="w-full h-80">
          <ResponsiveContainer>
            <BarChart data={serieMensal}>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke={dark ? "#334155" : "#e2e8f0"}
              />
              <XAxis
                dataKey="periodo"
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
              />
              <Bar dataKey="saldo">
                {serieMensal.map((entry, index) => (
                  <Cell
                    key={index}
                    fill={
                      entry.saldo >= 0
                        ? dark
                          ? "#34d399"
                          : "#10B981"
                        : dark
                        ? "#f87171"
                        : "#EF4444"
                    }
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>
    </div>
  );
}
