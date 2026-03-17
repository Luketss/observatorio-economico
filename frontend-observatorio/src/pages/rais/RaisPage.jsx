import { useEffect, useState } from "react";
import api from "../../services/api";
import { useAuth } from "../../context/AuthContext";

export default function RaisPage() {
  const { user } = useAuth();
  const [data, setData] = useState([]);

  useEffect(() => {
    api.get("/rais").then((res) => {
      let items = res.data.items;

      if (user?.role !== "ADMIN_GLOBAL") {
        items = items.filter(
          (item) => item.municipio_id === user.municipio_id
        );
      }

      setData(items);
    });
  }, [user]);

  return (
    <div>
      <div className="header">
        <h1>RAIS - Vínculos</h1>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 20,
          marginBottom: 30,
        }}
      >
        <div className="card">
          <h3>Total Registros</h3>
          <p>{data.length}</p>
        </div>
      </div>

      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>Ano</th>
              <th>Vínculos</th>
              <th>Remuneração Média</th>
            </tr>
          </thead>
          <tbody>
            {data.map((item, index) => (
              <tr key={index}>
                <td>{item.ano}</td>
                <td>{item.vinculos}</td>
                <td>{item.remuneracao_media}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
