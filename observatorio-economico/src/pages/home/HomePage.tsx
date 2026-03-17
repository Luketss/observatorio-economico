import { useMemo } from "react";
import Card from "../../components/ui/Card";
import KpiCard from "../../components/kpis/KpiCard";

import empresasData from "../../data/empresas_oliveira.json";
import raisData from "../../data/rais_oliveira.json";
import peMeiaData from "../../data/pe_meia_oliveira.json";
import bolsaData from "../../data/bolsa_familia_oliveira.json";

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

export default function HomePage() {
  const empresas = (empresasData as any).serie as any[];
  const rais = raisData as any;
  const raisAnual = rais.anual as any[];
  const peMeia = peMeiaData as any[];
  const bolsa = bolsaData as any[];

  const ultimoAnoEmpresas = useMemo(() => {
    const anos = [...new Set(empresas.map((e) => e.ano))].sort();
    const ultimoAno = anos[anos.length - 1];

    return empresas
      .filter((e) => e.ano === ultimoAno)
      .reduce((acc, e) => acc + e.aberturas, 0);
  }, [empresas]);

  const ultimoRais = raisAnual[raisAnual.length - 1];
  const ultimoPeMeia = peMeia[peMeia.length - 1];
  const ultimoBolsa = bolsa[bolsa.length - 1];

  const serieEmpregos = useMemo(() => {
    const agrupado: Record<number, number> = {};

    raisAnual.forEach((r) => {
      if (!agrupado[r.ano]) {
        agrupado[r.ano] = 0;
      }
      agrupado[r.ano] += r.total_vinculos;
    });

    return Object.entries(agrupado).map(([ano, empregos]) => ({
      ano: Number(ano),
      empregos,
    }));
  }, [raisAnual]);

  return (
    <div className="space-y-10">
      <h1 className="text-3xl font-bold text-slate-800">
        Painel Executivo — Prefeitura de Oliveira
      </h1>

      {/* KPIs Executivos */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <KpiCard
          title="Empresas Abertas (Último Ano)"
          value={formatNumber(ultimoAnoEmpresas)}
          trend={0}
        />
        <KpiCard
          title="Empregos Formais (RAIS)"
          value={
            ultimoRais
              ? formatNumber(ultimoRais.total_vinculos)
              : "0"
          }
          trend={0}
        />
        <KpiCard
          title="Beneficiários Pé de Meia"
          value={
            ultimoPeMeia
              ? formatNumber(ultimoPeMeia.total_beneficiarios)
              : "0"
          }
          trend={0}
        />
        <KpiCard
          title="Beneficiários Bolsa Família"
          value={
            ultimoBolsa
              ? formatNumber(ultimoBolsa.total_beneficiarios)
              : "0"
          }
          trend={0}
        />
      </div>

      {/* Linha Consolidada de Empregos */}
      <Card>
        <h2 className="text-lg font-semibold mb-4">
          Evolução do Emprego Formal (RAIS)
        </h2>

        <div className="w-full h-80">
          <ResponsiveContainer>
            <LineChart data={serieEmpregos}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="ano" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line
                type="monotone"
                dataKey="empregos"
                stroke="#2563EB"
                strokeWidth={3}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>
    </div>
  );
}
