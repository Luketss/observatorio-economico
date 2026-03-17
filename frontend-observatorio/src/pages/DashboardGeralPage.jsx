import { useEffect, useState } from "react";
import api from "../services/api";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";

export default function DashboardGeralPage() {
  const [caged, setCaged] = useState([]);
  const [pib, setPib] = useState([]);
  const [arrecadacao, setArrecadacao] = useState([]);

  useEffect(() => {
    api.get("/caged").then((res) => {
      setCaged(res.data.items || []);
    });

    api.get("/pib").then((res) => {
      setPib(res.data.items || []);
    });

    api.get("/arrecadacao").then((res) => {
      setArrecadacao(res.data.items || []);
    });
  }, []);

  const totalEmpregos = caged.reduce((acc, item) => acc + (item.saldo || 0), 0);
  const totalPib = pib.reduce((acc, item) => acc + (item.valor || 0), 0);
  const totalArrecadacao = arrecadacao.reduce(
    (acc, item) => acc + (item.valor || 0),
    0
  );

  return (
    <div>
      <div className="header">
        <h1>Dashboard Geral Executivo</h1>
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
          <h3>Total Saldo Empregos</h3>
          <p>{totalEmpregos.toLocaleString()}</p>
        </div>

        <div className="card">
          <h3>Total PIB</h3>
          <p>R$ {totalPib.toLocaleString()}</p>
        </div>

        <div className="card">
          <h3>Total Arrecadação</h3>
          <p>R$ {totalArrecadacao.toLocaleString()}</p>
        </div>
      </div>

      {/* GRÁFICO CONSOLIDADO */}
      <div className="card" style={{ height: 400 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={caged}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="ano" stroke="#64748b" />
            <YAxis stroke="#64748b" />
            <Tooltip />
            <Line
              type="monotone"
              dataKey="saldo"
              stroke="#3b82f6"
              strokeWidth={3}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
