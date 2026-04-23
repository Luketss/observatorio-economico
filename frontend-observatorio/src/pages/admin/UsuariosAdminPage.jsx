import { useEffect, useState } from "react";
import api from "../../services/api";
import { useAuth } from "../../context/AuthContext";
import { motion } from "framer-motion";
import { PlusIcon, XMarkIcon, PencilIcon, TrashIcon } from "@heroicons/react/24/outline";

const ROLES = [
  { id: 1, nome: "ADMIN_GLOBAL" },
  { id: 2, nome: "ADMIN_MUNICIPIO" },
  { id: 3, nome: "VISUALIZADOR" },
];

const defaultForm = { nome: "", email: "", senha: "", municipio_id: "", role_id: 3 };

export default function UsuariosAdminPage() {
  const { user: currentUser } = useAuth();
  const [usuarios, setUsuarios] = useState([]);
  const [municipios, setMunicipios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(defaultForm);
  const [estadoFiltro, setEstadoFiltro] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);
  const [deleting, setDeleting] = useState(false);

  function loadUsuarios() {
    return api.get("/usuarios").then((res) => {
      setUsuarios(res.data.items || []);
    });
  }

  useEffect(() => {
    Promise.all([loadUsuarios(), api.get("/municipios")])
      .then(([, munRes]) => {
        setMunicipios(munRes.data || []);
      })
      .catch((err) => console.error("Erro ao carregar usuários:", err))
      .finally(() => setLoading(false));
  }, []);

  function handleChange(e) {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  function openCreate() {
    setEditingId(null);
    setForm(defaultForm);
    setEstadoFiltro("");
    setFormError(null);
    setShowForm(true);
  }

  function openEdit(u) {
    const mun = municipios.find((m) => m.id === u.municipio_id);
    setEstadoFiltro(mun?.estado || "");
    setEditingId(u.id);
    setForm({
      nome: u.nome,
      email: u.email,
      senha: "",
      municipio_id: u.municipio_id ?? "",
      role_id: ROLES.find((r) => r.nome === u.role)?.id ?? 3,
    });
    setFormError(null);
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditingId(null);
    setForm(defaultForm);
    setFormError(null);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    const payload = {
      nome: form.nome,
      email: form.email,
      municipio_id: form.municipio_id ? Number(form.municipio_id) : null,
      role_id: Number(form.role_id),
    };
    try {
      if (editingId) {
        if (form.senha) payload.senha = form.senha;
        await api.put(`/usuarios/${editingId}`, payload);
      } else {
        await api.post("/usuarios", { ...payload, senha: form.senha });
      }
      closeForm();
      await loadUsuarios();
    } catch (err) {
      setFormError(err?.response?.data?.detail || "Erro ao salvar usuário.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id) {
    setDeleting(true);
    try {
      await api.delete(`/usuarios/${id}`);
      setDeleteConfirmId(null);
      await loadUsuarios();
    } catch (err) {
      console.error(err);
    } finally {
      setDeleting(false);
    }
  }

  const roleColor = (role) => {
    if (role === "ADMIN_GLOBAL") return "bg-blue-100 text-blue-700";
    if (role === "ADMIN_MUNICIPIO") return "bg-purple-100 text-purple-700";
    return "bg-slate-100 text-slate-600";
  };

  const estados = [...new Set(municipios.map((m) => m.estado).filter(Boolean))].sort();
  const municipiosFiltrados = estadoFiltro
    ? municipios.filter((m) => m.estado === estadoFiltro)
    : municipios;

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-8"
    >
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-800">
            Administração de Usuários
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Gerencie os usuários com acesso ao sistema.
          </p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-colors"
        >
          <PlusIcon className="w-4 h-4" />
          Novo Usuário
        </button>
      </div>

      {/* Create / Edit form */}
      {showForm && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-base font-bold text-slate-800">
              {editingId ? "Editar Usuário" : "Criar Novo Usuário"}
            </h3>
            <button onClick={closeForm} className="text-slate-400 hover:text-slate-600 transition-colors">
              <XMarkIcon className="w-5 h-5" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-500 uppercase tracking-wider">Nome</label>
              <input
                name="nome"
                value={form.nome}
                onChange={handleChange}
                required
                placeholder="Nome completo"
                className="px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-500 uppercase tracking-wider">Email</label>
              <input
                name="email"
                type="email"
                value={form.email}
                onChange={handleChange}
                required
                placeholder="email@exemplo.com"
                className="px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                Senha {editingId && <span className="normal-case font-normal text-slate-400">(deixe em branco para manter)</span>}
              </label>
              <input
                name="senha"
                type="password"
                value={form.senha}
                onChange={handleChange}
                required={!editingId}
                placeholder={editingId ? "Nova senha (opcional)" : "Senha inicial"}
                className="px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {estados.length > 1 && (
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-slate-500 uppercase tracking-wider">Estado</label>
                <select
                  value={estadoFiltro}
                  onChange={(e) => { setEstadoFiltro(e.target.value); setForm((prev) => ({ ...prev, municipio_id: "" })); }}
                  className="px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Todos os estados</option>
                  {estados.map((uf) => (
                    <option key={uf} value={uf}>{uf}</option>
                  ))}
                </select>
              </div>
            )}

            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-500 uppercase tracking-wider">Município</label>
              <select
                name="municipio_id"
                value={form.municipio_id}
                onChange={handleChange}
                className="px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">— Sem município —</option>
                {municipiosFiltrados.map((m) => (
                  <option key={m.id} value={m.id}>{m.nome}{m.estado ? ` (${m.estado})` : ""}</option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-500 uppercase tracking-wider">Perfil</label>
              <select
                name="role_id"
                value={form.role_id}
                onChange={handleChange}
                className="px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {ROLES.map((r) => (
                  <option key={r.id} value={r.id}>{r.nome}</option>
                ))}
              </select>
            </div>

            <div className="md:col-span-2 flex items-center gap-3 pt-2">
              {formError && <p className="text-sm text-red-600 flex-1">{formError}</p>}
              <div className="flex gap-3 ml-auto">
                <button
                  type="button"
                  onClick={closeForm}
                  className="px-4 py-2 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors disabled:opacity-50"
                >
                  {saving ? "Salvando..." : editingId ? "Salvar Alterações" : "Criar Usuário"}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* Users table */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        {loading ? (
          <div className="p-8 flex justify-center">
            <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-left text-xs uppercase text-slate-400 tracking-wider">
                  <th className="px-3 py-3 md:px-6">Nome</th>
                  <th className="px-3 py-3 md:px-6">Email</th>
                  <th className="px-3 py-3 md:px-6">Município</th>
                  <th className="px-3 py-3 md:px-6">Perfil</th>
                  <th className="px-3 py-3 md:px-6 text-center">Ativo</th>
                  <th className="px-3 py-3 md:px-6" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {usuarios.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-8 text-center text-slate-400">
                      Nenhum usuário encontrado.
                    </td>
                  </tr>
                ) : (
                  usuarios.map((u) => (
                    <>
                      <tr key={u.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-3 py-3 md:px-6 font-medium text-slate-700">{u.nome}</td>
                        <td className="px-3 py-3 md:px-6 text-slate-500">{u.email}</td>
                        <td className="px-3 py-3 md:px-6 text-slate-500">
                          {municipios.find((m) => m.id === u.municipio_id)?.nome || "—"}
                        </td>
                        <td className="px-3 py-3 md:px-6">
                          <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${roleColor(u.role)}`}>
                            {u.role}
                          </span>
                        </td>
                        <td className="px-3 py-3 md:px-6 text-center">
                          <span
                            className={`inline-block w-2 h-2 rounded-full ${u.ativo ? "bg-green-500" : "bg-slate-300"}`}
                            title={u.ativo ? "Ativo" : "Inativo"}
                          />
                        </td>
                        <td className="px-3 py-3 md:px-6">
                          {currentUser?.id !== u.id && (
                            <div className="flex items-center gap-2 justify-end">
                              <button
                                onClick={() => openEdit(u)}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                                title="Editar"
                              >
                                <PencilIcon className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => setDeleteConfirmId(u.id)}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                                title="Excluir"
                              >
                                <TrashIcon className="w-4 h-4" />
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                      {deleteConfirmId === u.id && (
                        <tr key={`confirm-${u.id}`} className="bg-red-50">
                          <td colSpan={6} className="px-6 py-3">
                            <div className="flex items-center gap-4 text-sm">
                              <span className="text-red-700 font-medium">
                                Excluir <strong>{u.nome}</strong>? Esta ação não pode ser desfeita.
                              </span>
                              <div className="flex gap-2 ml-auto">
                                <button
                                  onClick={() => setDeleteConfirmId(null)}
                                  className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-white transition-colors text-xs"
                                >
                                  Cancelar
                                </button>
                                <button
                                  onClick={() => handleDelete(u.id)}
                                  disabled={deleting}
                                  className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white transition-colors text-xs disabled:opacity-50"
                                >
                                  {deleting ? "Excluindo..." : "Excluir"}
                                </button>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </motion.div>
  );
}
