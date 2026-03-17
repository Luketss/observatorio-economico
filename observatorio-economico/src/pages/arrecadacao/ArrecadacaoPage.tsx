import { useEffect, useMemo, useState } from "react";
import Card from "../../components/ui/Card";
import KpiCard from "../../components/kpis/KpiCard";
import { getArrecadacaoSerie, getArrecadacaoResumo } from "../../services/api";
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
import { formatCurrency } from "../../utils/format";

type ArrecadacaoItem = {
  ano: number;
  mes: number;
  total: number;
  icms: number;
  ipva: number;
  ipi: number;
};

export default function ArrecadacaoPage() {

  const [data, setData] = useState<ArrecadacaoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [resumo, setResumo] = useState<any>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        const serie = await getArrecadacaoSerie();
        const resumoData = await getArrecadacaoResumo();
        setData(serie as ArrecadacaoItem[]);
        setResumo(resumoData);
      } catch (error) {
        console.error("Erro ao carregar arrecadação", error);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, []);

  const totalGeral = resumo?.total_geral ?? 0;

  const ultimoAno = resumo?.total_ultimo_ano ? 
    Math.max(...data.map((d) => d.ano)) : 0;

  const totalUltimoAno = resumo?.total_ultimo_ano ?? 0;

  const crescimentoAnual = resumo?.crescimento_percentual ?? 0;

  const mediaMensal = resumo?.media_mensal ?? 0;

  const serieMensal = useMemo(
    () =>
      data.map((d) => ({
        periodo: `${d.ano}-${String(d.mes).padStart(2, "0")}`,
        total: d.total,
      })),
    [data]
  );

  const porAno = useMemo(() => {
    const mapa: Record<number, number> = {};
    data.forEach((d) => {
      if (!mapa[d.ano]) mapa[d.ano] = 0;
      mapa[d.ano] += d.total;
    });

    return Object.entries(mapa)
      .map(([ano, total]) => ({
        ano: Number(ano),
        total,
      }))
      .sort((a, b) => a.ano - b.ano);
  }, [data]);

  const porTributo = useMemo(
    () =>
      data.map((d) => ({
        periodo: `${d.ano}-${String(d.mes).padStart(2, "0")}`,
        icms: d.icms,
        ipva: d.ipva,
        ipi: d.ipi,
      })),
    [data]
  );

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold text-slate-800">
        Arrecadação Municipal — Oliveira
      </h1>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <KpiCard
          title="Arrecadação Total (Histórico)"
          value={formatCurrency(totalGeral)}
          trend={0}
        />
        <KpiCard
          title={`Arrecadação ${ultimoAno}`}
          value={formatCurrency(totalUltimoAno)}
          trend={crescimentoAnual}
        />
        <KpiCard
          title="Crescimento Anual (%)"
          value={`${crescimentoAnual}%`}
          trend={crescimentoAnual}
        />
        <KpiCard
          title="Média Mensal"
          value={formatCurrency(mediaMensal)}
          trend={0}
        />
      </div>

      {/* Linha Mensal */}
      <Card>
        <h2 className="text-lg font-semibold mb-4">
          Evolução Mensal da Arrecadação Total
        </h2>

        <div className="w-full h-80">
          <ResponsiveContainer>
            <LineChart data={serieMensal}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="periodo" />
              <YAxis
                tickFormatter={(v) =>
                  formatCurrency(Number(v)).replace("R$", "")
                }
              />
              <Tooltip
                formatter={(value) =>
                  formatCurrency(Number(value ?? 0))
                }
              />
              <Line
                type="monotone"
                dataKey="total"
                stroke="#2563EB"
                strokeWidth={3}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* Tributos Separados */}
      <Card>
        <h2 className="text-lg font-semibold mb-4">
          Evolução por Tributo (ICMS / IPVA / IPI)
        </h2>

        <div className="w-full h-80">
          <ResponsiveContainer>
            <LineChart data={porTributo}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="periodo" />
              <YAxis
                tickFormatter={(v) =>
                  formatCurrency(Number(v)).replace("R$", "")
                }
              />
              <Tooltip
                formatter={(value) =>
                  formatCurrency(Number(value ?? 0))
                }
              />
              <Legend />
              <Line type="monotone" dataKey="icms" stroke="#2563EB" />
              <Line type="monotone" dataKey="ipva" stroke="#10B981" />
              <Line type="monotone" dataKey="ipi" stroke="#F59E0B" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* Barras por Ano */}
      <Card>
        <h2 className="text-lg font-semibold mb-4">
          Arrecadação por Ano
        </h2>

        <div className="w-full h-80">
          <ResponsiveContainer>
            <BarChart data={porAno}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="ano" />
              <YAxis
                tickFormatter={(v) =>
                  formatCurrency(Number(v)).replace("R$", "")
                }
              />
              <Tooltip
                formatter={(value) =>
                  formatCurrency(Number(value ?? 0))
                }
              />
              <Bar dataKey="total" fill="#10B981" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>
    </div>
  );
}
