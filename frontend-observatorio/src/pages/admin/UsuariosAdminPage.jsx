import { useEffect, useState, useCallback, useMemo } from "react";
import api from "../../services/api";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import { useEscapeKey } from "../../hooks/useEscapeKey";
import { useSearchPagination } from "../../hooks/useSearchPagination";
import AdminSearchInput from "../../components/nid/AdminSearchInput";
import AdminPagination from "../../components/nid/AdminPagination";
import MunicipioPicker from "../../components/nid/MunicipioPicker";
import { motion, AnimatePresence } from "framer-motion";
import {
  PlusIcon,
  XMarkIcon,
  PencilIcon,
  TrashIcon,
  EyeIcon,
  EyeSlashIcon,
} from "@heroicons/react/24/outline";

const ROLES = [
  { id: 1, nome: "ADMIN_GLOBAL" },
  { id: 2, nome: "ADMIN_MUNICIPIO" },
  { id: 3, nome: "VISUALIZADOR" },
];

const defaultForm = { nome: "", email: "", senha: "", municipio_id: "", role_id: 3 };

export default function UsuariosAdminPage() {
  const { user: currentUser } = useAuth();
  const { addToast } = useToast();
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
  const [showPassword, setShowPassword] = useState(false);

  useEscapeKey(useCallback(() => {
    if (deleteConfirmId) { setDeleteConfirmId(null); return; }
    if (showForm) closeForm();
  }, [deleteConfirmId, showForm]));

  function loadUsuarios() {
    return api.get("/usuarios").then((res) => {
      setUsuarios(res.data.items || []);
    });
  }

  useEffect(() => {
    Promise.all([loadUsuarios(), api.get("/municipios")])
      .then(([, munRes]) => setMunicipios(munRes.data || []))
      .catch((err) => console.error("Erro ao carregar usuários:", err))
      .finally(() => setLoading(false));
  }, []);

  // Join município name into each row so search can match it, and feed to the hook.
  const usuariosWithMunicipio = useMemo(
    () =>
      usuarios.map((u) => ({
        ...u,
        _municipio_nome: municipios.find((m) => m.id === u.municipio_id)?.nome || "",
      })),
    [usuarios, municipios]
  );
  const sp = useSearchPagination(usuariosWithMunicipio, (u, q) => {
    const norm = (s) => String(s ?? "").toLowerCase();
    return (
      norm(u.nome).includes(q) ||
      norm(u.email).includes(q) ||
      norm(u.role).includes(q) ||
      norm(u._municipio_nome).includes(q)
    );
  });

  function handleChange(e) {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  function openCreate() {
    setEditingId(null);
    setForm(defaultForm);
    setEstadoFiltro("");
    setFormError(null);
    setShowPassword(false);
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
    setShowPassword(false);
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
        addToast("Usuário atualizado com sucesso", "success");
      } else {
        await api.post("/usuarios", { ...payload, senha: form.senha });
        addToast("Usuário criado com sucesso", "success");
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
      addToast("Usuário excluído", "success");
      await loadUsuarios();
    } catch (err) {
      addToast("Erro ao excluir usuário", "error");
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
      transition={{ duration: 0.25, ease: "easeOut" }}
      className="space-y-8"
    >
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-[var(--text)]">
            Administração de Usuários
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Gerencie os usuários com acesso ao sistema.
            {sp.search && sp.filtered.length !== usuarios.length &&
              ` · ${sp.filtered.length} resultado${sp.filtered.length !== 1 ? "s" : ""} para "${sp.search}"`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <AdminSearchInput
            value={sp.search}
            onChange={sp.setSearch}
            placeholder="Buscar nome, email, perfil, município…"
            ariaLabel="Buscar usuários"
          />
          <button
            type="button"
            onClick={openCreate}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-colors cursor-pointer"
          >
            <PlusIcon className="w-4 h-4" aria-hidden="true" />
            Novo Usuário
          </button>
        </div>
      </div>

      {/* Create / Edit form */}
      <AnimatePresence>
        {showForm && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="bg-[var(--panel)] rounded-2xl shadow-sm border border-[var(--border)] p-6"
          >
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-base font-bold text-[var(--text)]">
                {editingId ? "Editar Usuário" : "Criar Novo Usuário"}
              </h3>
              <button
                type="button"
                onClick={closeForm}
                aria-label="Fechar formulário"
                className="text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
              >
                <XMarkIcon className="w-5 h-5" aria-hidden="true" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex flex-col gap-1">
                <label htmlFor="u-nome" className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Nome <span className="text-red-500" aria-hidden="true">*</span>
                </label>
                <input
                  id="u-nome"
                  name="nome"
                  value={form.nome}
                  onChange={handleChange}
                  required
                  autoComplete="name"
                  placeholder="Nome completo"
                  className="px-3 py-2 rounded-lg border border-[var(--border)] text-sm focus:outline-none focus:ring-2 focus:ring-blue-500  "
                />
              </div>

              <div className="flex flex-col gap-1">
                <label htmlFor="u-email" className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Email <span className="text-red-500" aria-hidden="true">*</span>
                </label>
                <input
                  id="u-email"
                  name="email"
                  type="email"
                  value={form.email}
                  onChange={handleChange}
                  required
                  autoComplete="email"
                  placeholder="email@exemplo.com"
                  className="px-3 py-2 rounded-lg border border-[var(--border)] text-sm focus:outline-none focus:ring-2 focus:ring-blue-500  "
                />
              </div>

              <div className="flex flex-col gap-1">
                <label htmlFor="u-senha" className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Senha {editingId && <span className="normal-case font-normal text-slate-400">(deixe em branco para manter)</span>}
                  {!editingId && <span className="text-red-500" aria-hidden="true"> *</span>}
                </label>
                <div className="relative">
                  <input
                    id="u-senha"
                    name="senha"
                    type={showPassword ? "text" : "password"}
                    value={form.senha}
                    onChange={handleChange}
                    required={!editingId}
                    autoComplete={editingId ? "new-password" : "new-password"}
                    placeholder={editingId ? "Nova senha (opcional)" : "Senha inicial"}
                    className="w-full px-3 py-2 pr-10 rounded-lg border border-[var(--border)] text-sm focus:outline-none focus:ring-2 focus:ring-blue-500  "
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                  >
                    {showPassword
                      ? <EyeSlashIcon className="w-4 h-4" aria-hidden="true" />
                      : <EyeIcon className="w-4 h-4" aria-hidden="true" />}
                  </button>
                </div>
              </div>

              {estados.length > 1 && (
                <div className="flex flex-col gap-1">
                  <label htmlFor="u-estado" className="text-xs font-medium text-slate-500 uppercase tracking-wider">Estado</label>
                  <select
                    id="u-estado"
                    value={estadoFiltro}
                    onChange={(e) => { setEstadoFiltro(e.target.value); setForm((prev) => ({ ...prev, municipio_id: "" })); }}
                    className="px-3 py-2 rounded-lg border border-[var(--border)] text-sm focus:outline-none focus:ring-2 focus:ring-blue-500  "
                  >
                    <option value="">Todos os estados</option>
                    {estados.map((uf) => <option key={uf} value={uf}>{uf}</option>)}
                  </select>
                </div>
              )}

              <div className="flex flex-col gap-1">
                <label htmlFor="u-municipio" className="text-xs font-medium text-slate-500 uppercase tracking-wider">Município</label>
                <MunicipioPicker
                  municipios={municipiosFiltrados}
                  value={form.municipio_id}
                  onChange={(id) => setForm((prev) => ({ ...prev, municipio_id: id }))}
                />
              </div>

              <div className="flex flex-col gap-1">
                <label htmlFor="u-perfil" className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Perfil <span className="text-red-500" aria-hidden="true">*</span>
                </label>
                <select
                  id="u-perfil"
                  name="role_id"
                  value={form.role_id}
                  onChange={handleChange}
                  className="px-3 py-2 rounded-lg border border-[var(--border)] text-sm focus:outline-none focus:ring-2 focus:ring-blue-500  "
                >
                  {ROLES.map((r) => <option key={r.id} value={r.id}>{r.nome}</option>)}
                </select>
              </div>

              <div className="md:col-span-2 flex items-center gap-3 pt-2">
                {formError && <p className="text-sm text-red-600 flex-1" role="alert">{formError}</p>}
                <div className="flex gap-3 ml-auto">
                  <button
                    type="button"
                    onClick={closeForm}
                    className="px-4 py-2 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                  >
                    {saving ? "Salvando..." : editingId ? "Salvar Alterações" : "Criar Usuário"}
                  </button>
                </div>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Users table */}
      <div className="bg-[var(--panel)] rounded-2xl shadow-sm border border-[var(--border)] overflow-hidden">
        {loading ? (
          <div className="p-8 space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-10 bg-[var(--panel-2)] rounded-lg animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50  text-left text-xs uppercase text-slate-400 tracking-wider">
                  <th className="px-3 py-3 md:px-6">Nome</th>
                  <th className="px-3 py-3 md:px-6">Email</th>
                  <th className="px-3 py-3 md:px-6">Município</th>
                  <th className="px-3 py-3 md:px-6">Perfil</th>
                  <th className="px-3 py-3 md:px-6 text-center">Ativo</th>
                  <th className="px-3 py-3 md:px-6 sr-only">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {sp.filtered.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-10 text-center text-slate-400">
                      {sp.search
                        ? `Nenhum usuário encontrado para "${sp.search}".`
                        : "Nenhum usuário encontrado."}
                    </td>
                  </tr>
                ) : (
                  sp.paged.map((u) => (
                    <>
                      <tr key={u.id} className="hover:bg-[var(--panel-2)]/30 transition-colors">
                        <td className="px-3 py-3 md:px-6 font-medium text-[var(--text)]">{u.nome}</td>
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
                            className={`inline-block w-2.5 h-2.5 rounded-full ${u.ativo ? "bg-green-500" : "bg-slate-300"}`}
                            role="img"
                            aria-label={u.ativo ? "Ativo" : "Inativo"}
                          />
                        </td>
                        <td className="px-3 py-3 md:px-6">
                          {currentUser?.id !== u.id && (
                            <div className="flex items-center gap-1 justify-end">
                              <button
                                type="button"
                                onClick={() => openEdit(u)}
                                aria-label={`Editar ${u.nome}`}
                                className="p-2 rounded-lg text-[var(--text-mute)] hover:text-blue-500 hover:bg-[var(--panel-2)] transition-colors cursor-pointer"
                              >
                                <PencilIcon className="w-4 h-4" aria-hidden="true" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setDeleteConfirmId(u.id)}
                                aria-label={`Excluir ${u.nome}`}
                                className="p-2 rounded-lg text-[var(--text-mute)] hover:text-red-400 hover:bg-[var(--panel-2)] transition-colors cursor-pointer"
                              >
                                <TrashIcon className="w-4 h-4" aria-hidden="true" />
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                      {deleteConfirmId === u.id && (
                        <tr key={`confirm-${u.id}`} className="bg-[var(--panel-2)]">
                          <td colSpan={6} className="px-6 py-3">
                            <div className="flex items-center gap-4 text-sm">
                              <span className="text-red-700  font-medium">
                                Excluir <strong>{u.nome}</strong>? Esta ação não pode ser desfeita.
                              </span>
                              <div className="flex gap-2 ml-auto">
                                <button
                                  type="button"
                                  onClick={() => setDeleteConfirmId(null)}
                                  className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-white transition-colors text-xs cursor-pointer"
                                >
                                  Cancelar
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDelete(u.id)}
                                  disabled={deleting}
                                  className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white transition-colors text-xs disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
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

      {!loading && (
        <AdminPagination
          filteredCount={sp.filtered.length}
          page={sp.page}
          setPage={sp.setPage}
          pageSize={sp.pageSize}
          setPageSize={sp.setPageSize}
          totalPages={sp.totalPages}
        />
      )}
    </motion.div>
  );
}
