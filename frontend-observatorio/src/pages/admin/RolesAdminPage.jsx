import { useEffect, useState, useCallback } from "react";
import api from "../../services/api";
import { useToast } from "../../context/ToastContext";
import { useEscapeKey } from "../../hooks/useEscapeKey";
import MunicipioPicker from "../../components/nid/MunicipioPicker";
import { motion, AnimatePresence } from "framer-motion";
import { PlusIcon, XMarkIcon, PencilIcon, TrashIcon, LockClosedIcon } from "@heroicons/react/24/outline";

// Espelho de app.core.permissions.AREA_LABELS/VERBOS (backend valida de verdade).
const AREAS = [
  ["projetos", "Projetos"],
  ["captacao", "Captação de Recursos"],
  ["funil", "Funil de Investimentos"],
  ["escrita", "Escrita de Projetos"],
  ["premiacoes", "Premiações"],
  ["retencao", "Retenção & Expansão"],
  ["dados_internos", "Dados Internos"],
  ["mandato", "Timeline do Mandato"],
  ["usuarios", "Usuários do Município"],
  ["prioridades", "Prioridades do Mês"],
];
const VERBOS = ["criar", "editar", "excluir"];
// Áreas com verbo único: só "editar" faz sentido para prioridades.
const AREA_VERBOS = { prioridades: ["editar"] };

const emptyForm = { nome: "", descricao: "", municipio_id: "", permissoes: {} };

export default function RolesAdminPage() {
  const { addToast } = useToast();
  const [roles, setRoles] = useState([]);
  const [municipios, setMunicipios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);

  useEscapeKey(useCallback(() => {
    if (deleteConfirmId) { setDeleteConfirmId(null); return; }
    if (showForm) closeForm();
  }, [deleteConfirmId, showForm]));

  function loadRoles() {
    return api
      .get("/roles")
      .then((res) => setRoles(res.data || []))
      .catch(() => addToast("Erro ao carregar roles.", "error"));
  }

  useEffect(() => {
    Promise.all([loadRoles(), api.get("/municipios")])
      .then(([, munRes]) => setMunicipios(munRes.data || []))
      .catch(() => addToast("Erro ao carregar municípios.", "error"))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function openCreate() {
    setEditingId(null);
    setForm(emptyForm);
    setFormError(null);
    setShowForm(true);
  }

  function openEdit(r) {
    setEditingId(r.id);
    setForm({
      nome: r.nome,
      descricao: r.descricao || "",
      municipio_id: r.municipio_id ?? "",
      permissoes: r.permissoes || {},
    });
    setFormError(null);
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditingId(null);
    setForm(emptyForm);
    setFormError(null);
  }

  function toggleVerbo(area, verbo) {
    setForm((prev) => {
      const atuais = prev.permissoes[area] || [];
      const novos = atuais.includes(verbo)
        ? atuais.filter((v) => v !== verbo)
        : [...atuais, verbo];
      const permissoes = { ...prev.permissoes };
      if (novos.length) permissoes[area] = novos;
      else delete permissoes[area];
      return { ...prev, permissoes };
    });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    const payload = {
      nome: form.nome,
      descricao: form.descricao || null,
      municipio_id: form.municipio_id === "" ? null : Number(form.municipio_id),
      permissoes: form.permissoes,
    };
    try {
      if (editingId) await api.put(`/roles/${editingId}`, payload);
      else await api.post("/roles", payload);
      addToast(editingId ? "Role atualizada." : "Role criada.", "success");
      closeForm();
      loadRoles();
    } catch (err) {
      setFormError(err.response?.data?.detail || "Erro ao salvar a role.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id) {
    try {
      await api.delete(`/roles/${id}`);
      addToast("Role excluída.", "success");
      setDeleteConfirmId(null);
      loadRoles();
    } catch (err) {
      addToast(err.response?.data?.detail || "Erro ao excluir.", "error");
      setDeleteConfirmId(null);
    }
  }

  if (loading) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm" style={{ color: "var(--text-dim)" }}>
          Roles definem o que usuários de município podem criar, editar e excluir.
          ADMIN_GLOBAL ignora roles (acesso total).
        </p>
        <button
          onClick={openCreate}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium cursor-pointer"
          style={{ background: "var(--admin-accent)", color: "#fff" }}
        >
          <PlusIcon className="w-4 h-4" /> Nova role
        </button>
      </div>

      <div className="grid gap-3">
        {roles.map((r) => (
          <div
            key={r.id}
            className="flex items-center justify-between rounded-xl px-4 py-3"
            style={{ background: "var(--panel)", border: "1px solid var(--border)" }}
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold" style={{ color: "var(--text)" }}>
                  {r.nome}
                </span>
                {r.builtin && <LockClosedIcon className="w-3.5 h-3.5" style={{ color: "var(--text-dim)" }} title="Role do sistema" />}
                <span
                  className="text-[10px] px-1.5 py-0.5 rounded"
                  style={{ background: "var(--panel-2)", color: "var(--text-dim)" }}
                >
                  {r.municipio_id
                    ? municipios.find((m) => m.id === r.municipio_id)?.nome || "Município"
                    : "Global"}
                </span>
                <span className="text-[10px]" style={{ color: "var(--text-dim)" }}>
                  {r.usuarios_count} usuário(s)
                </span>
              </div>
              <p className="text-xs truncate" style={{ color: "var(--text-dim)" }}>
                {r.builtin && r.nome === "ADMIN_GLOBAL"
                  ? "Acesso total à plataforma"
                  : Object.entries(r.permissoes || {})
                      .map(([a, vs]) => `${a}: ${vs.join("/")}`)
                      .join(" · ") || "Somente leitura"}
              </p>
            </div>
            {!r.builtin && (
              <div className="flex items-center gap-2 flex-shrink-0">
                <button onClick={() => openEdit(r)} title="Editar" className="cursor-pointer">
                  <PencilIcon className="w-4 h-4" style={{ color: "var(--text-dim)" }} />
                </button>
                {deleteConfirmId === r.id ? (
                  <button
                    onClick={() => handleDelete(r.id)}
                    className="text-xs px-2 py-1 rounded cursor-pointer"
                    style={{ background: "var(--accent-2)", color: "#fff" }}
                  >
                    Confirmar
                  </button>
                ) : (
                  <button onClick={() => setDeleteConfirmId(r.id)} title="Excluir" className="cursor-pointer">
                    <TrashIcon className="w-4 h-4" style={{ color: "var(--accent-2)" }} />
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      <AnimatePresence>
        {showForm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto"
            style={{ background: "rgba(0,0,0,0.5)" }}
            onClick={closeForm}
          >
            <motion.form
              initial={{ scale: 0.97, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.97, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              onSubmit={handleSubmit}
              className="w-full max-w-2xl rounded-xl p-5 space-y-4 my-8"
              style={{ background: "var(--panel)", border: "1px solid var(--border)" }}
            >
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold" style={{ color: "var(--text)" }}>
                  {editingId ? "Editar role" : "Nova role"}
                </h2>
                <button type="button" onClick={closeForm} aria-label="Fechar">
                  <XMarkIcon className="w-4 h-4" style={{ color: "var(--text-dim)" }} />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <input
                  placeholder="Nome (ex.: Assessor de Captação)"
                  value={form.nome}
                  onChange={(e) => setForm((p) => ({ ...p, nome: e.target.value }))}
                  required
                  className="px-3 py-2 rounded-lg text-sm outline-none col-span-2"
                  style={{ background: "var(--panel-2)", border: "1px solid var(--border)", color: "var(--text)" }}
                />
                <input
                  placeholder="Descrição (opcional)"
                  value={form.descricao}
                  onChange={(e) => setForm((p) => ({ ...p, descricao: e.target.value }))}
                  className="px-3 py-2 rounded-lg text-sm outline-none col-span-2"
                  style={{ background: "var(--panel-2)", border: "1px solid var(--border)", color: "var(--text)" }}
                />
                <div className="col-span-2">
                  <label className="text-xs block mb-1" style={{ color: "var(--text-dim)" }}>
                    Escopo — vazio = global (qualquer município)
                  </label>
                  <MunicipioPicker
                    municipios={municipios}
                    value={form.municipio_id}
                    onChange={(id) => setForm((p) => ({ ...p, municipio_id: id ?? "" }))}
                    placeholder="Global — nenhum município selecionado"
                  />
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr style={{ color: "var(--text-dim)" }}>
                      <th className="text-left py-1.5">Área</th>
                      {VERBOS.map((v) => (
                        <th key={v} className="text-center py-1.5 capitalize">{v}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {AREAS.map(([area, label]) => (
                      <tr key={area} style={{ borderTop: "1px solid var(--border)" }}>
                        <td className="py-1.5" style={{ color: "var(--text)" }}>{label}</td>
                        {VERBOS.map((verbo) => (
                          <td key={verbo} className="text-center py-1.5">
                            {(AREA_VERBOS[area] || VERBOS).includes(verbo) ? (
                              <input
                                type="checkbox"
                                checked={(form.permissoes[area] || []).includes(verbo)}
                                onChange={() => toggleVerbo(area, verbo)}
                                className="cursor-pointer"
                              />
                            ) : (
                              <span style={{ color: "var(--text-mute)" }}>—</span>
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {formError && (
                <p className="text-xs" style={{ color: "var(--accent-2)" }}>{formError}</p>
              )}

              <button
                type="submit"
                disabled={saving}
                className="w-full py-2 rounded-lg text-sm font-medium cursor-pointer disabled:opacity-60"
                style={{ background: "var(--admin-accent)", color: "#fff" }}
              >
                {saving ? "Salvando..." : editingId ? "Salvar alterações" : "Criar role"}
              </button>
            </motion.form>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
