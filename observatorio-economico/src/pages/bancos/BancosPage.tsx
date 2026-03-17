import { useMemo } from "react";
import Card from "../../components/ui/Card";
import KpiCard from "../../components/kpis/KpiCard";
import bancosData from "../../data/bancos.json";
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

export default function BancosPage() {
  const data = bancosData;

  const ultimoAno = data[data.length - 1];
  const anoAnterior = data[data.length - 2];

  const crescimentoCredito = useMemo(() => {
    if (!anoAnterior) return 0;
    return (
      ((ultimoAno.credito - anoAnterior.credito) /
        anoAnterior.credito) *
      100
    ).toFixed(2);
  }, [ultimoAno, anoAnterior]);

  const crescimentoCaptacao = useMemo(() => {
    if (!anoAnterior) return 0;
    return (
      ((ultimoAno.captacao - anoAnterior.captacao) /
        anoAnterior.captacao) *
      100
    ).toFixed(2);
  }, [ultimoAno, anoAnterior]);

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold">
        Dados Bancários
      </h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <KpiCard
          title={`Crédito Concedido ${ultimoAno.ano}`}
          value={`R$ ${ultimoAno.credito} mi`}
          trend={Number(crescimentoCredito)}
        />
        <KpiCard
          title={`Captação ${ultimoAno.ano}`}
          value={`R$ ${ultimoAno.captacao} mi`}
          trend={Number(crescimentoCaptacao)}
        />
      </div>

      <Card>
        <h2 className="text-lg font-semibold mb-4">
          Evolução Financeira
        </h2>

        <div className="w-full h-80">
          <ResponsiveContainer>
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="ano" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line
                type="monotone"
                dataKey="credito"
                stroke="#2563EB"
                strokeWidth={3}
              />
              <Line
                type="monotone"
                dataKey="captacao"
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
