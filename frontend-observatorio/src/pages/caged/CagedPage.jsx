import { useEffect, useState } from "react";
import api from "../../services/api";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";

export default function CagedPage() {
  const [data, setData] = useState([]);

  useEffect(() => {
    api.get("/caged/resumo").then((res) => {
      setData(res.data.items || []);
    });
  }, []);

  const totalSaldo = data.reduce((acc, item) => acc + (item.saldo || 0), 0);
  const ultimoAno = data.length ? data[data.length - 1].ano : "-";
  const ultimoSaldo = data.length ? data[data.length - 1].saldo : 0;

  return (
    <div>
      <div className="header">
        <h1>CAGED - Evolução de Empregos</h1>
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
          <h3>Total Saldo Período</h3>
          <p>{totalSaldo.toLocaleString()}</p>
        </div>

        <div className="card">
          <h3>Último Ano</h3>
          <p>{ultimoAno}</p>
        </div>

        <div className="card">
          <h3>Saldo Último Ano</h3>
          <p>{ultimoSaldo?.toLocaleString()}</p>
        </div>
      </div>

      {/* GRÁFICO */}
      <div className="card" style={{ height: 400 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="ano" stroke="#64748b" />
            <YAxis stroke="#64748b" />
            <Tooltip />
            <Line
              type="monotone"
              dataKey="saldo"
              stroke="#3b82f6"
              strokeWidth={3}
              dot={{ r: 4 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
