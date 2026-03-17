import { useEffect, useState } from "react";
import api from "../../services/api";

export default function UsuariosAdminPage() {
  const [usuarios, setUsuarios] = useState([]);

  useEffect(() => {
    api.get("/usuarios").then((res) => {
      setUsuarios(res.data.items || []);
    });
  }, []);

  return (
    <div>
      <div className="header">
        <h1>Administração de Usuários</h1>
      </div>

      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>Email</th>
              <th>Role</th>
              <th>Ativo</th>
            </tr>
          </thead>
          <tbody>
            {usuarios.map((user) => (
              <tr key={user.id}>
                <td>{user.email}</td>
                <td>{user.role}</td>
                <td>{user.is_active ? "Sim" : "Não"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
