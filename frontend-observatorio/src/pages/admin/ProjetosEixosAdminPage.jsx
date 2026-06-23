import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { PlusIcon, XMarkIcon, PencilIcon, TrashIcon, FolderOpenIcon } from "@heroicons/react/24/outline";
import api from "../../services/api";
import { useToast } from "../../context/ToastContext";
import { useEscapeKey } from "../../hooks/useEscapeKey";

const defaultForm = { nome: "", descricao: "", ordem: 0, imagem_id: null };
const MAX_PRESETS = 6;

export default function ProjetosEixosAdminPage() {
  const { addToast } = useToast();
  const [eixos, setEixos] = useState([]);
  const [presets, setPresets] = useState([]);
  const [uploading, setUploading] = useState(false);
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
      const [eixosRes, presetsRes] = await Promise.all([
        api.get("/projetos/eixos"),
        api.get("/projetos/imagens"),
      ]);
      setEixos(eixosRes.data || []);
      setPresets(presetsRes.data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function handleUploadPreset(file) {
    if (!file) return;
    setUploading(true);
    try {
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      await api.post("/projetos/imagens", { imagem: dataUrl, titulo: file.name });
      addToast("Imagem de capa adicionada", "success");
      await load();
    } catch (err) {
      addToast(err?.response?.data?.detail || "Erro ao enviar imagem", "error");
    } finally {
      setUploading(false);
    }
  }

  async function handleDeletePreset(id) {
    try {
      await api.delete(`/projetos/imagens/${id}`);
      addToast("Imagem removida", "success");
      await load();
    } catch (err) {
      addToast("Erro ao remover imagem", "error");
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
    setForm({ nome: e.nome, descricao: e.descricao || "", ordem: e.ordem, imagem_id: e.imagem_id ?? null });
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
            <div className="md:col-span-2 flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-500 uppercase tracking-wider">Imagem de capa</label>
              {presets.length === 0 ? (
                <p className="text-xs text-slate-400">Nenhuma imagem cadastrada — adicione na galeria abaixo.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setForm((p) => ({ ...p, imagem_id: null }))}
                    className={`w-20 h-14 rounded-lg border-2 flex items-center justify-center text-xs font-medium ${form.imagem_id == null ? "border-blue-500 text-blue-600" : "border-slate-200 text-slate-400"}`}
                  >
                    Nenhuma
                  </button>
                  {presets.map((img) => (
                    <button
                      key={img.id}
                      type="button"
                      onClick={() => setForm((p) => ({ ...p, imagem_id: img.id }))}
                      className={`w-20 h-14 rounded-lg overflow-hidden border-2 ${String(form.imagem_id) === String(img.id) ? "border-blue-500" : "border-transparent hover:border-slate-300"}`}
                      title={img.titulo || "capa"}
                    >
                      <img src={img.imagem} alt={img.titulo || "capa"} className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              )}
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

      {/* Cover-image gallery (global presets) */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
        <div className="mb-4">
          <h3 className="text-base font-bold text-slate-800">Imagens de Capa</h3>
          <p className="text-sm text-slate-400">
            Galeria global (até {MAX_PRESETS}) que os eixos usam como capa dos cards de projeto.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          {presets.map((img) => (
            <div key={img.id} className="relative w-32 h-20 rounded-xl overflow-hidden border border-slate-200 group">
              <img src={img.imagem} alt={img.titulo || "capa"} className="w-full h-full object-cover" />
              <button
                onClick={() => handleDeletePreset(img.id)}
                title="Remover imagem"
                aria-label="Remover imagem"
                className="absolute top-1 right-1 p-1 rounded-md bg-white/85 text-red-600 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <TrashIcon className="w-4 h-4" />
              </button>
            </div>
          ))}
          {presets.length < MAX_PRESETS && (
            <label
              className={`w-32 h-20 rounded-xl border-2 border-dashed border-slate-300 flex flex-col items-center justify-center gap-1 text-slate-400 text-xs cursor-pointer hover:border-blue-400 hover:text-blue-500 transition-colors ${uploading ? "opacity-50 pointer-events-none" : ""}`}
            >
              <PlusIcon className="w-5 h-5" />
              {uploading ? "Enviando…" : "Adicionar"}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => { handleUploadPreset(e.target.files?.[0]); e.target.value = ""; }}
              />
            </label>
          )}
        </div>
      </div>

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
