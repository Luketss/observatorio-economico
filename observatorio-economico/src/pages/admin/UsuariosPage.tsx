import { useEffect, useState } from "react";
import Card from "../../components/ui/Card";
import {
  getUsuarios,
  createUsuario,
  updateUsuario,
} from "../../services/api";
import { useAuthStore } from "../../app/store/authStore";

export default function UsuariosPage() {
  const { role } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [usuarios, setUsuarios] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingUser, setEditingUser] = useState<any | null>(null);

  const [formData, setFormData] = useState({
    nome: "",
    email: "",
    senha: "",
    role_id: 1,
    municipio_id: null as number | null,
  });

  async function fetchUsuarios() {
    try {
      const data = await getUsuarios();
      setUsuarios(data as any[]);
    } catch (error) {
      console.error("Erro ao carregar usuários", error);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchUsuarios();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    try {
      if (editingUser) {
        await updateUsuario(editingUser.id, formData);
      } else {
        await createUsuario(formData);
      }

      setShowForm(false);
      setEditingUser(null);
      setFormData({
        nome: "",
        email: "",
        senha: "",
        role_id: 1,
        municipio_id: null,
      });

      fetchUsuarios();
    } catch (error) {
      console.error("Erro ao salvar usuário", error);
    }
  }

  if (loading) return <div>Carregando...</div>;

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold text-slate-800">
        Gestão de Usuários
      </h1>

      <button
        onClick={() => {
          setShowForm(true);
          setEditingUser(null);
        }}
        className="bg-blue-600 text-white px-4 py-2 rounded-xl"
      >
        Novo Usuário
      </button>

      {showForm && (
        <Card>
          <form onSubmit={handleSubmit} className="space-y-4">
            <input
              placeholder="Nome"
              value={formData.nome}
              onChange={(e) =>
                setFormData({ ...formData, nome: e.target.value })
              }
              className="w-full border p-2 rounded"
            />

            <input
              placeholder="Email"
              value={formData.email}
              onChange={(e) =>
                setFormData({ ...formData, email: e.target.value })
              }
              className="w-full border p-2 rounded"
            />

            <input
              placeholder="Senha"
              type="password"
              value={formData.senha}
              onChange={(e) =>
                setFormData({ ...formData, senha: e.target.value })
              }
              className="w-full border p-2 rounded"
            />

            <button
              type="submit"
              className="bg-green-600 text-white px-4 py-2 rounded-xl"
            >
              {editingUser ? "Atualizar" : "Criar"}
            </button>
          </form>
        </Card>
      )}

      <Card>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left border-b">
                <th className="py-2">Nome</th>
                <th>Email</th>
                <th>Role</th>
                <th>Status</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {usuarios.map((u) => (
                <tr key={u.id} className="border-b">
                  <td className="py-2">{u.nome}</td>
                  <td>{u.email}</td>
                  <td>{u.role?.nome}</td>
                  <td>{u.ativo ? "Ativo" : "Inativo"}</td>
                  <td>
                    <button
                      onClick={() => {
                        setEditingUser(u);
                        setFormData({
                          nome: u.nome,
                          email: u.email,
                          senha: "",
                          role_id: u.role_id,
                          municipio_id: u.municipio_id,
                        });
                        setShowForm(true);
                      }}
                      className="text-blue-600 mr-2"
                    >
                      Editar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
