import { useMemo } from "react";
import Card from "../../components/ui/Card";
import KpiCard from "../../components/kpis/KpiCard";
import empresasData from "../../data/empresas_oliveira.json";
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
  AreaChart,
  Area,
} from "recharts";
import { formatNumber, formatPercent } from "../../utils/format";
import DataTable from "../../components/tables/DataTable";
import type { ColumnDef } from "@tanstack/react-table";
import { useThemeStore } from "../../app/store/themeStore";

type SerieItem = {
  ano: number;
  mes: number;
  aberturas: number;
  fechamentos: number;
  saldo: number;
};

type SetorItem = {
  setor: string;
  total: number;
};

const CNAE_MAP: Record<string, string> = {
  "01": "Agropecuária",
  "10": "Indústria Alimentícia",
  "47": "Comércio Varejista",
  "56": "Alimentação",
  "86": "Saúde",
  "41": "Construção",
  "62": "Tecnologia",
};

export default function EmpresasPage() {
  const { dark } = useThemeStore();

  const data = empresasData as {
    serie: SerieItem[];
    setores: SetorItem[];
  };

  const serieOrdenada = useMemo(
    () =>
      [...data.serie].sort((a, b) =>
        a.ano === b.ano ? a.mes - b.mes : a.ano - b.ano
      ),
    [data]
  );

  const serieCalculada = useMemo(() => {
    let saldoAcumulado = 0;

    return serieOrdenada.map((item, index, arr) => {
      const anterior = arr[index - 1];

      const variacao =
        anterior && anterior.aberturas
          ? ((item.aberturas - anterior.aberturas) /
              anterior.aberturas) *
            100
          : 0;

      saldoAcumulado += item.saldo;

      return {
        periodo: `${item.ano}-${String(item.mes).padStart(2, "0")}`,
        ...item,
        variacao,
        saldoAcumulado,
      };
    });
  }, [serieOrdenada]);

  const totalAberturas = serieOrdenada.reduce(
    (acc, item) => acc + item.aberturas,
    0
  );

  const totalFechamentos = serieOrdenada.reduce(
    (acc, item) => acc + item.fechamentos,
    0
  );

  const saldoGeral = totalAberturas - totalFechamentos;

  const setoresFormatados = data.setores.map((s) => ({
    ...s,
    nome: CNAE_MAP[s.setor] || `Setor ${s.setor}`,
  }));

  const columns: ColumnDef<any>[] = [
    { header: "Ano", accessorKey: "ano" },
    { header: "Mês", accessorKey: "mes" },
    { header: "Aberturas", accessorKey: "aberturas" },
    { header: "Fechamentos", accessorKey: "fechamentos" },
    { header: "Saldo", accessorKey: "saldo" },
  ];

  return (
    <div className="space-y-10">
      <h1 className="text-2xl font-bold text-slate-800">
        Empresas — Oliveira
      </h1>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <KpiCard
          title="Total de Aberturas"
          value={formatNumber(totalAberturas)}
          trend={0}
        />
        <KpiCard
          title="Total de Fechamentos"
          value={formatNumber(totalFechamentos)}
          trend={0}
        />
        <KpiCard
          title="Saldo Geral"
          value={formatNumber(saldoGeral)}
          trend={0}
        />
      </div>

      {/* Aberturas + Variação */}
      <Card>
        <h2 className="text-lg font-semibold mb-4">
          Aberturas Mensais + Variação %
        </h2>

        <div className="w-full h-96">
          <ResponsiveContainer>
            <LineChart data={serieCalculada}>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke={dark ? "#334155" : "#e2e8f0"}
              />
              <XAxis dataKey="periodo" />
              <YAxis />
              <Tooltip
                formatter={(value, name) => {
                  if (name === "variacao")
                    return [
                      formatPercent(Number(value)),
                      "Variação %",
                    ];
                  return [
                    formatNumber(Number(value)),
                    "Aberturas",
                  ];
                }}
              />
              <Legend />
              <Line
                type="monotone"
                dataKey="aberturas"
                stroke="#2563EB"
                strokeWidth={3}
              />
              <Line
                type="monotone"
                dataKey="variacao"
                stroke="#F59E0B"
                strokeWidth={2}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* Saldo Acumulado */}
      <Card>
        <h2 className="text-lg font-semibold mb-4">
          Saldo Acumulado
        </h2>

        <div className="w-full h-96">
          <ResponsiveContainer>
            <AreaChart data={serieCalculada}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="periodo" />
              <YAxis />
              <Tooltip />
              <Area
                type="monotone"
                dataKey="saldoAcumulado"
                stroke="#10B981"
                fill="#10B98133"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* Setores */}
      <Card>
        <h2 className="text-lg font-semibold mb-4">
          Aberturas por Setor Econômico
        </h2>

        <div className="w-full h-96">
          <ResponsiveContainer>
            <BarChart data={setoresFormatados}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="nome" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="total" fill="#10B981" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* Tabela */}
      <Card>
        <h2 className="text-lg font-semibold mb-4">
          Dados Detalhados
        </h2>
        <DataTable data={serieOrdenada} columns={columns} />
      </Card>
    </div>
  );
}
