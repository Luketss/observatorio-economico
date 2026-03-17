import { useEffect, useState } from "react";
import api from "../../services/api";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";

export default function ArrecadacaoPage() {
  const [data, setData] = useState([]);

  useEffect(() => {
    api.get("/arrecadacao").then((res) => {
      setData(res.data.items || []);
    });
  }, []);

  const totalArrecadado = data.reduce(
    (acc, item) => acc + (item.valor || 0),
    0
  );

  const ultimoAno = data.length ? data[data.length - 1].ano : "-";
  const ultimoValor = data.length
    ? data[data.length - 1].valor
    : 0;

  return (
    <div>
      <div className="header">
        <h1>Arrecadação Municipal</h1>
      </div>

      {/* KPI CARDS */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 20,
          marginBottom: 30,
        }}
      >
        <div className="card">
          <h3>Total Arrecadado</h3>
          <p>R$ {totalArrecadado.toLocaleString()}</p>
        </div>

        <div className="card">
          <h3>Último Ano</h3>
          <p>{ultimoAno}</p>
        </div>

        <div className="card">
          <h3>Arrecadação Último Ano</h3>
          <p>R$ {ultimoValor?.toLocaleString()}</p>
        </div>
      </div>

      {/* GRÁFICO */}
      <div className="card" style={{ height: 400 }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="ano" stroke="#64748b" />
            <YAxis stroke="#64748b" />
            <Tooltip />
            <Area
              type="monotone"
              dataKey="valor"
              stroke="#6366f1"
              fill="#6366f1"
              fillOpacity={0.2}
              strokeWidth={3}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
