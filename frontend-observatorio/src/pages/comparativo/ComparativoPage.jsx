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
  Legend,
} from "recharts";

export default function ComparativoPage() {
  const [data, setData] = useState([]);

  useEffect(() => {
    api.get("/comparativo").then((res) => {
      setData(res.data.items || []);
    });
  }, []);

  return (
    <div>
      <div className="header">
        <h1>Comparativo entre Municípios</h1>
      </div>

      <div className="card" style={{ height: 450 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="ano" stroke="#64748b" />
            <YAxis stroke="#64748b" />
            <Tooltip />
            <Legend />
            <Line
              type="monotone"
              dataKey="municipioA"
              stroke="#3b82f6"
              strokeWidth={3}
            />
            <Line
              type="monotone"
              dataKey="municipioB"
              stroke="#f97316"
              strokeWidth={3}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
