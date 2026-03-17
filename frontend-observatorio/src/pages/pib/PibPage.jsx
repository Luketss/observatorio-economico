import { useEffect, useState } from "react";
import api from "../../services/api";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";

export default function PibPage() {
  const [data, setData] = useState([]);

  useEffect(() => {
    api.get("/pib").then((res) => {
      setData(res.data.items || []);
    });
  }, []);

  const totalPib = data.reduce((acc, item) => acc + (item.valor || 0), 0);
  const ultimoAno = data.length ? data[data.length - 1].ano : "-";

  return (
    <div>
      <div className="header">
        <h1>PIB - Produto Interno Bruto</h1>
      </div>

      {/* KPI CARDS */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, 1fr)",
          gap: 20,
          marginBottom: 30,
        }}
      >
        <div className="card">
          <h3>Total PIB Período</h3>
          <p>R$ {totalPib.toLocaleString()}</p>
        </div>

        <div className="card">
          <h3>Último Ano</h3>
          <p>{ultimoAno}</p>
        </div>
      </div>

      {/* GRÁFICO */}
      <div className="card" style={{ height: 400 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="ano" stroke="#64748b" />
            <YAxis stroke="#64748b" />
            <Tooltip />
            <Bar dataKey="valor" fill="#10b981" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
