import { useEffect, useState } from "react";
import Card from "../../components/ui/Card";
import {
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

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

async function fetchComparativo(
  endpoint: string,
  ano: number
) {
  const token = localStorage.getItem("access_token");

  const response = await fetch(
    `${API_URL}/comparativo/${endpoint}?ano=${ano}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  if (!response.ok) {
    throw new Error("Erro ao buscar comparativo");
  }

  return response.json();
}

export default function ComparativoMunicipiosPage() {
  const [ano, setAno] = useState<number>(2024);
  const [arrecadacao, setArrecadacao] = useState<any[]>([]);
  const [caged, setCaged] = useState<any[]>([]);
  const [rais, setRais] = useState<any[]>([]);

  useEffect(() => {
    async function carregar() {
      try {
        const a = await fetchComparativo("arrecadacao", ano);
        const c = await fetchComparativo("caged", ano);
        const r = await fetchComparativo("rais", ano);

        setArrecadacao(a);
        setCaged(c);
        setRais(r);
      } catch (err) {
        console.error(err);
      }
    }

    carregar();
  }, [ano]);

  return (
    <div className="space-y-10">
      <h1 className="text-2xl font-bold">
        Dashboard Comparativo entre Municípios
      </h1>

      <div>
        <label className="mr-2 font-semibold">Ano:</label>
        <input
          type="number"
          value={ano}
          onChange={(e) =>
            setAno(Number(e.target.value))
          }
          className="border px-3 py-1 rounded"
        />
      </div>

      <Card>
        <h2 className="font-semibold mb-4">
          Arrecadação Total
        </h2>
        <div className="h-80">
          <ResponsiveContainer>
            <BarChart data={arrecadacao}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="municipio" />
              <YAxis />
              <Tooltip
                formatter={(v) =>
                  `R$ ${formatNumber(Number(v))}`
                }
              />
              <Legend />
              <Bar dataKey="total" fill="#2563EB" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card>
        <h2 className="font-semibold mb-4">
          Saldo CAGED
        </h2>
        <div className="h-80">
          <ResponsiveContainer>
            <BarChart data={caged}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="municipio" />
              <YAxis />
              <Tooltip
                formatter={(v) =>
                  formatNumber(Number(v))
                }
              />
              <Legend />
              <Bar
                dataKey="saldo_total"
                fill="#10B981"
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card>
        <h2 className="font-semibold mb-4">
          Total de Vínculos (RAIS)
        </h2>
        <div className="h-80">
          <ResponsiveContainer>
            <BarChart data={rais}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="municipio" />
              <YAxis />
              <Tooltip
                formatter={(v) =>
                  formatNumber(Number(v))
                }
              />
              <Legend />
              <Bar
                dataKey="total_vinculos"
                fill="#F59E0B"
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>
    </div>
  );
}
