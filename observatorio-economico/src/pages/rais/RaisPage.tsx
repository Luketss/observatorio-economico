import { useEffect, useMemo, useState } from "react";
import Card from "../../components/ui/Card";
import KpiCard from "../../components/kpis/KpiCard";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from "recharts";
import { formatNumber } from "../../utils/format";
import { getRaisSerie, getRaisResumo } from "../../services/api";

type RaisItem = {
  ano: number;
  total_vinculos: number;
  setor: string | null;
};

export default function RaisPage() {
  const [data, setData] = useState<RaisItem[]>([]);
  const [resumo, setResumo] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const serie = await getRaisSerie();
        const resumoData = await getRaisResumo();
        setData(serie as RaisItem[]);
        setResumo(resumoData);
      } catch (error) {
        console.error("Erro ao carregar RAIS", error);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, []);

  const totalVinculos = resumo?.total_vinculos ?? 0;

  const serieAnual = useMemo(
    () =>
      data.map((item) => ({
        ano: item.ano,
        total: item.total_vinculos,
      })),
    [data]
  );

  const crescimento = useMemo(() => {
    if (serieAnual.length < 2) return [];

    return serieAnual.map((item, index, arr) => {
      if (index === 0) {
        return { ano: item.ano, crescimento: 0 };
      }

      const prev = arr[index - 1].total;
      const atual = item.total;

      const percentual =
        prev > 0 ? ((atual - prev) / prev) * 100 : 0;

      return {
        ano: item.ano,
        crescimento: Number(percentual.toFixed(2)),
      };
    });
  }, [serieAnual]);

  if (loading) return <div>Carregando...</div>;

  return (
    <div className="space-y-10">
      <h1 className="text-2xl font-bold">
        RAIS — Estoque de Vínculos Formais
      </h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <KpiCard
          title="Total de Vínculos"
          value={formatNumber(totalVinculos)}
          trend={0}
        />
      </div>

      <Card>
        <h2 className="font-semibold mb-4">
          Evolução Anual de Vínculos
        </h2>
        <div className="h-96">
          <ResponsiveContainer>
            <LineChart data={serieAnual}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="ano" />
              <YAxis />
              <Tooltip
                formatter={(v) =>
                  formatNumber(Number(v))
                }
              />
              <Legend />
              <Line
                dataKey="total"
                stroke="#2563EB"
                strokeWidth={3}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card>
        <h2 className="font-semibold mb-4">
          Crescimento Anual (%)
        </h2>
        <div className="h-80">
          <ResponsiveContainer>
            <LineChart data={crescimento}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="ano" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line
                dataKey="crescimento"
                stroke="#F59E0B"
                strokeWidth={3}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>
    </div>
  );
}
