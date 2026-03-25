import { useEffect, useState } from "react";
import api from "../../services/api";
import { motion } from "framer-motion";
import { PlusIcon, XMarkIcon } from "@heroicons/react/24/outline";

const ROLES = [
  { id: 1, nome: "ADMIN_GLOBAL" },
  { id: 2, nome: "ADMIN_MUNICIPIO" },
  { id: 3, nome: "VISUALIZADOR" },
];

const defaultForm = { nome: "", email: "", senha: "", municipio_id: "", role_id: 3 };

export default function UsuariosAdminPage() {
  const [usuarios, setUsuarios] = useState([]);
  const [municipios, setMunicipios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(defaultForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);

  function loadUsuarios() {
    return api.get("/usuarios/").then((res) => {
      setUsuarios(res.data.items || []);
    });
  }

  useEffect(() => {
    Promise.all([loadUsuarios(), api.get("/municipios/")])
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

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    try {
      await api.post("/usuarios/", {
        ...form,
        municipio_id: form.municipio_id ? Number(form.municipio_id) : null,
        role_id: Number(form.role_id),
      });
      setForm(defaultForm);
      setShowForm(false);
      await loadUsuarios();
    } catch (err) {
      setFormError(
        err?.response?.data?.detail || "Erro ao criar usuário. Verifique os dados."
      );
    } finally {
      setSaving(false);
    }
  }

  const roleColor = (role) => {
    if (role === "ADMIN_GLOBAL") return "bg-blue-100 text-blue-700";
    if (role === "ADMIN_MUNICIPIO") return "bg-purple-100 text-purple-700";
    return "bg-slate-100 text-slate-600";
  };

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
          onClick={() => { setShowForm(true); setFormError(null); }}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-colors"
        >
          <PlusIcon className="w-4 h-4" />
          Novo Usuário
        </button>
      </div>

      {/* Create form */}
      {showForm && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-base font-bold text-slate-800">Criar Novo Usuário</h3>
            <button
              onClick={() => { setShowForm(false); setFormError(null); setForm(defaultForm); }}
              className="text-slate-400 hover:text-slate-600 transition-colors"
            >
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
              <label className="text-xs font-medium text-slate-500 uppercase tracking-wider">Senha</label>
              <input
                name="senha"
                type="password"
                value={form.senha}
                onChange={handleChange}
                required
                placeholder="Senha inicial"
                className="px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-500 uppercase tracking-wider">Município</label>
              <select
                name="municipio_id"
                value={form.municipio_id}
                onChange={handleChange}
                className="px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">— Sem município —</option>
                {municipios.map((m) => (
                  <option key={m.id} value={m.id}>{m.nome}</option>
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
              {formError && (
                <p className="text-sm text-red-600 flex-1">{formError}</p>
              )}
              <div className="flex gap-3 ml-auto">
                <button
                  type="button"
                  onClick={() => { setShowForm(false); setFormError(null); setForm(defaultForm); }}
                  className="px-4 py-2 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors disabled:opacity-50"
                >
                  {saving ? "Salvando..." : "Criar Usuário"}
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
                  <th className="px-6 py-3">Nome</th>
                  <th className="px-6 py-3">Email</th>
                  <th className="px-6 py-3">Município</th>
                  <th className="px-6 py-3">Perfil</th>
                  <th className="px-6 py-3 text-center">Ativo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {usuarios.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-center text-slate-400">
                      Nenhum usuário encontrado.
                    </td>
                  </tr>
                ) : (
                  usuarios.map((u) => (
                    <tr key={u.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-3 font-medium text-slate-700">{u.nome}</td>
                      <td className="px-6 py-3 text-slate-500">{u.email}</td>
                      <td className="px-6 py-3 text-slate-500">
                        {municipios.find((m) => m.id === u.municipio_id)?.nome || "—"}
                      </td>
                      <td className="px-6 py-3">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${roleColor(u.role)}`}>
                          {u.role}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-center">
                        <span
                          className={`inline-block w-2 h-2 rounded-full ${u.ativo ? "bg-green-500" : "bg-slate-300"}`}
                          title={u.ativo ? "Ativo" : "Inativo"}
                        />
                      </td>
                    </tr>
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
