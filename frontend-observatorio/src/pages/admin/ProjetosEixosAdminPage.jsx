import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { PlusIcon, XMarkIcon, PencilIcon, TrashIcon, FolderOpenIcon } from "@heroicons/react/24/outline";
import api from "../../services/api";
import { useToast } from "../../context/ToastContext";
import { useEscapeKey } from "../../hooks/useEscapeKey";

const defaultForm = { nome: "", descricao: "", ordem: 0 };

export default function ProjetosEixosAdminPage() {
  const { addToast } = useToast();
  const [eixos, setEixos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(defaultForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);

  useEscapeKey(useCallback(() => {
    if (deleteConfirmId) { setDeleteConfirmId(null); return; }
    if (showForm) closeForm();
  }, [deleteConfirmId, showForm]));

  async function load() {
    try {
      const res = await api.get("/projetos/eixos");
      setEixos(res.data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  function openCreate() {
    setEditingId(null);
    setForm(defaultForm);
    setFormError(null);
    setShowForm(true);
  }

  function openEdit(e) {
    setEditingId(e.id);
    setForm({ nome: e.nome, descricao: e.descricao || "", ordem: e.ordem });
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
    try {
      if (editingId) {
        await api.put(`/projetos/eixos/${editingId}`, form);
        addToast("Eixo atualizado", "success");
      } else {
        await api.post("/projetos/eixos", form);
        addToast("Eixo criado com sucesso", "success");
      }
      closeForm();
      await load();
    } catch (err) {
      setFormError(err?.response?.data?.detail || "Erro ao salvar eixo.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id) {
    try {
      await api.delete(`/projetos/eixos/${id}`);
      setDeleteConfirmId(null);
      addToast("Eixo excluído", "success");
      await load();
    } catch (err) {
      addToast("Erro ao excluir eixo", "error");
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-8"
    >
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-800">Eixos de Projetos</h1>
          <p className="text-sm text-slate-400 mt-1">Gerencie as categorias estratégicas (eixos) dos projetos municipais.</p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-colors"
        >
          <PlusIcon className="w-4 h-4" />
          Novo Eixo
        </button>
      </div>

      {showForm && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-base font-bold text-slate-800">{editingId ? "Editar Eixo" : "Novo Eixo"}</h3>
            <button onClick={closeForm} className="text-slate-400 hover:text-slate-600">
              <XMarkIcon className="w-5 h-5" />
            </button>
          </div>
          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-500 uppercase tracking-wider">Nome</label>
              <input
                value={form.nome}
                onChange={(e) => setForm((p) => ({ ...p, nome: e.target.value }))}
                required
                placeholder="Ex.: Desenvolvimento Econômico"
                className="px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-500 uppercase tracking-wider">Ordem</label>
              <input
                type="number"
                value={form.ordem}
                onChange={(e) => setForm((p) => ({ ...p, ordem: Number(e.target.value) }))}
                className="px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="md:col-span-2 flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-500 uppercase tracking-wider">Descrição</label>
              <textarea
                value={form.descricao}
                onChange={(e) => setForm((p) => ({ ...p, descricao: e.target.value }))}
                rows={2}
                className="px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
            </div>
            <div className="md:col-span-2 flex items-center gap-3 pt-2">
              {formError && <p className="text-sm text-red-600 flex-1">{formError}</p>}
              <div className="flex gap-3 ml-auto">
                <button type="button" onClick={closeForm} className="px-4 py-2 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50">Cancelar</button>
                <button type="submit" disabled={saving} className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium disabled:opacity-50">
                  {saving ? "Salvando..." : editingId ? "Salvar" : "Criar Eixo"}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        {loading ? (
          <div className="p-8 flex justify-center">
            <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-left text-xs uppercase text-slate-400 tracking-wider">
                <th className="px-6 py-3">Ordem</th>
                <th className="px-6 py-3">Nome</th>
                <th className="px-6 py-3">Descrição</th>
                <th className="px-6 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {eixos.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-10 text-center text-slate-400">
                    <FolderOpenIcon className="w-8 h-8 mx-auto mb-2 opacity-40" />
                    Nenhum eixo cadastrado.
                  </td>
                </tr>
              ) : (
                eixos.map((e) => (
                  <>
                    <tr key={e.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-3 text-slate-500 w-16">{e.ordem}</td>
                      <td className="px-6 py-3 font-semibold text-slate-700">{e.nome}</td>
                      <td className="px-6 py-3 text-slate-400 max-w-xs truncate">{e.descricao || "—"}</td>
                      <td className="px-6 py-3">
                        <div className="flex items-center gap-2 justify-end">
                          <button onClick={() => openEdit(e)} aria-label={`Editar eixo ${e.nome}`} className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors cursor-pointer">
                            <PencilIcon className="w-4 h-4" aria-hidden="true" />
                          </button>
                          <button onClick={() => setDeleteConfirmId(e.id)} aria-label={`Excluir eixo ${e.nome}`} className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer">
                            <TrashIcon className="w-4 h-4" aria-hidden="true" />
                          </button>
                        </div>
                      </td>
                    </tr>
                    {deleteConfirmId === e.id && (
                      <tr key={`confirm-${e.id}`} className="bg-red-50">
                        <td colSpan={4} className="px-6 py-3">
                          <div className="flex items-center gap-4 text-sm">
                            <span className="text-red-700 font-medium">Excluir eixo <strong>{e.nome}</strong>? Todos os projetos neste eixo serão excluídos.</span>
                            <div className="flex gap-2 ml-auto">
                              <button onClick={() => setDeleteConfirmId(null)} className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 text-xs hover:bg-white">Cancelar</button>
                              <button onClick={() => handleDelete(e.id)} className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs">Excluir</button>
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
        )}
      </div>
    </motion.div>
  );
}
