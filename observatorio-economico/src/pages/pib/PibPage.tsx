import { useEffect, useMemo, useState } from "react";
import Card from "../../components/ui/Card";
import KpiCard from "../../components/kpis/KpiCard";
import {
  getPibSerie,
  getPibResumo,
  getPibComparativo,
} from "../../services/api";
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

type PibItem = {
  ano: number;
  pib_total: number;
  tipo_dado: string;
};

type ComparativoItem = {
  ano: number;
  cidade: string;
  pib_total: number;
};

export default function PibPage() {
  const [serie, setSerie] = useState<PibItem[]>([]);
  const [resumo, setResumo] = useState<any>(null);
  const [comparativo, setComparativo] = useState<ComparativoItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const serieData = await getPibSerie();
        const resumoData = await getPibResumo();
        const comparativoData = await getPibComparativo();

        setSerie(serieData as PibItem[]);
        setResumo(resumoData);
        setComparativo(comparativoData as ComparativoItem[]);
      } catch (error) {
        console.error("Erro ao carregar PIB", error);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, []);

  const ultimo = serie.length ? serie[serie.length - 1] : null;

  const crescimento = resumo?.crescimento_percentual ?? 0;

  /* ================= PIB ABSOLUTO ================= */

  const serieAbsoluta = useMemo(() => {
    const mapa: Record<number, any> = {};

    comparativo.forEach((item) => {
      if (!mapa[item.ano]) {
        mapa[item.ano] = { ano: item.ano };
      }

      mapa[item.ano][item.cidade] = item.pib_total;
    });

    return Object.values(mapa).sort(
      (a: any, b: any) => a.ano - b.ano,
    );
  }, [comparativo]);

  const cidades = useMemo(() => {
    return [...new Set(comparativo.map((c) => c.cidade))];
  }, [comparativo]);

  const cores = [
    "#2563EB",
    "#EC4899",
    "#10B981",
    "#F59E0B",
    "#8B5CF6",
    "#EF4444",
    "#14B8A6",
    "#6366F1",
  ];

  return (
    <div className="space-y-10">
      <h1 className="text-2xl font-bold">
        Produto Interno Bruto (PIB)
      </h1>

      {/* KPI PRINCIPAL */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {ultimo && (
          <KpiCard
            title={`PIB ${ultimo.ano}`}
            value={`R$ ${ultimo.pib_total.toLocaleString(
              "pt-BR",
            )}`}
            trend={crescimento}
          />
        )}
      </div>

      {/* GRÁFICO PIB ABSOLUTO */}
      <Card>
        <h2 className="text-lg font-semibold mb-4">
          PIB Absoluto (R$)
        </h2>

        <div className="w-full h-96">
          <ResponsiveContainer>
            <LineChart data={serieAbsoluta}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="ano" />
              <YAxis
                tickFormatter={(v) =>
                  `R$ ${Number(v).toLocaleString("pt-BR")}`
                }
              />
              <Tooltip
                formatter={(v) =>
                  `R$ ${Number(v).toLocaleString("pt-BR")}`
                }
              />
              <Legend />

              {cidades.map((cidade, index) => (
                <Line
                  key={cidade}
                  type="monotone"
                  dataKey={cidade}
                  stroke={cores[index % cores.length]}
                  strokeWidth={3}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>
    </div>
  );
}
