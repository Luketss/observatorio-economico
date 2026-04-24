import { useEffect, useState, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  PlusIcon,
  XMarkIcon,
  PencilIcon,
  TrashIcon,
  BookOpenIcon,
  CheckIcon,
} from "@heroicons/react/24/outline";
import api from "../../services/api";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import { useEscapeKey } from "../../hooks/useEscapeKey";

const defaultForm = { eixo_id: "", titulo: "", descricao: "", conteudo: "" };

export default function AcervoTab({ onSelectSuccess }) {
  const { user } = useAuth();
  const { addToast } = useToast();
  const isGlobal = user?.role === "ADMIN_GLOBAL";

  const [templates, setTemplates] = useState([]);
  const [eixos, setEixos] = useState([]);
  const [acompanhamentos, setAcompanhamentos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterEixo, setFilterEixo] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(defaultForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);
  const [selecting, setSelecting] = useState(null);
  const [viewingTemplate, setViewingTemplate] = useState(null);

  useEscapeKey(useCallback(() => {
    if (deleteConfirmId) { setDeleteConfirmId(null); return; }
    if (viewingTemplate) { setViewingTemplate(null); return; }
    if (showForm) closeForm();
  }, [deleteConfirmId, viewingTemplate, showForm]));

  async function load() {
    try {
      const [tmplRes, eixosRes] = await Promise.all([
        api.get("/projetos/acervo"),
        api.get("/projetos/eixos"),
      ]);
      setTemplates(tmplRes.data || []);
      setEixos(eixosRes.data || []);
      if (!isGlobal) {
        const projRes = await api.get("/projetos");
        setAcompanhamentos(projRes.data || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const selectedTemplateIds = new Set(
    acompanhamentos.filter((p) => p.template_id).map((p) => p.template_id)
  );

  const filteredTemplates = filterEixo
    ? templates.filter((t) => String(t.eixo_id) === filterEixo)
    : templates;

  function eixoLabel(eixo_id) {
    return eixos.find((e) => e.id === eixo_id)?.nome || null;
  }

  function openCreate() {
    setEditingId(null);
    setForm(defaultForm);
    setFormError(null);
    setShowForm(true);
  }

  function openEdit(t) {
    setEditingId(t.id);
    setForm({
      eixo_id: t.eixo_id ? String(t.eixo_id) : "",
      titulo: t.titulo,
      descricao: t.descricao || "",
      conteudo: t.conteudo || "",
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
      ...form,
      eixo_id: form.eixo_id ? Number(form.eixo_id) : null,
    };
    try {
      if (editingId) {
        await api.put(`/projetos/acervo/${editingId}`, payload);
        addToast("Modelo atualizado", "success");
      } else {
        await api.post("/projetos/acervo", payload);
        addToast("Modelo criado com sucesso", "success");
      }
      closeForm();
      await load();
    } catch (err) {
      setFormError(err?.response?.data?.detail || "Erro ao salvar modelo.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id) {
    try {
      await api.delete(`/projetos/acervo/${id}`);
      setDeleteConfirmId(null);
      addToast("Modelo excluído", "success");
      await load();
    } catch {
      addToast("Erro ao excluir modelo", "error");
    }
  }

  async function handleSelecionar(template) {
    setSelecting(template.id);
    try {
      await api.post(`/projetos/acervo/${template.id}/selecionar`);
      addToast("Projeto adicionado ao acompanhamento!", "success");
      onSelectSuccess?.();
    } catch (err) {
      addToast(err?.response?.data?.detail || "Erro ao selecionar projeto", "error");
    } finally {
      setSelecting(null);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          {eixos.length > 0 && (
            <select
              value={filterEixo}
              onChange={(e) => setFilterEixo(e.target.value)}
              className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-sm text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Todos os eixos</option>
              {eixos.map((e) => (
                <option key={e.id} value={String(e.id)}>{e.nome}</option>
              ))}
            </select>
          )}
          <span className="text-xs text-slate-400">{filteredTemplates.length} modelo{filteredTemplates.length !== 1 ? "s" : ""}</span>
        </div>
        {isGlobal && (
          <button
            onClick={openCreate}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-colors cursor-pointer"
          >
            <PlusIcon className="w-4 h-4" />
            Novo Modelo
          </button>
        )}
      </div>

      {/* Empty state */}
      {filteredTemplates.length === 0 && (
        <div className="text-center py-20 text-slate-400">
          <BookOpenIcon className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm font-medium">Nenhum modelo disponível</p>
          <p className="text-xs mt-1 text-slate-400">
            {isGlobal
              ? "Clique em \"Novo Modelo\" para adicionar o primeiro projeto ao acervo."
              : "O administrador ainda não cadastrou projetos no acervo."}
          </p>
        </div>
      )}

      {/* Cards grid */}
      {filteredTemplates.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {filteredTemplates.map((t) => {
            const alreadyAdded = selectedTemplateIds.has(t.id);
            const label = eixoLabel(t.eixo_id);
            return (
              <div
                key={t.id}
                className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 p-5 flex flex-col gap-3 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    {label && (
                      <span className="inline-block text-xs font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/30 px-2 py-0.5 rounded-full mb-1.5">
                        {label}
                      </span>
                    )}
                    <h3
                      className="font-semibold text-slate-800 dark:text-slate-100 leading-snug cursor-pointer hover:text-blue-600 transition-colors"
                      onClick={() => setViewingTemplate(t)}
                    >
                      {t.titulo}
                    </h3>
                  </div>
                  {isGlobal && (
                    <div className="flex gap-1 shrink-0">
                      <button
                        onClick={() => openEdit(t)}
                        aria-label="Editar modelo"
                        className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/40 transition-colors cursor-pointer"
                      >
                        <PencilIcon className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setDeleteConfirmId(t.id)}
                        aria-label="Excluir modelo"
                        className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors cursor-pointer"
                      >
                        <TrashIcon className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>

                {t.descricao && (
                  <p className="text-sm text-slate-500 dark:text-slate-400 line-clamp-2 leading-relaxed">
                    {t.descricao}
                  </p>
                )}

                {!isGlobal && (
                  <div className="mt-auto pt-2 border-t border-slate-50 dark:border-slate-700">
                    {alreadyAdded ? (
                      <div className="flex items-center gap-1.5 text-xs text-green-600 dark:text-green-400 font-medium">
                        <CheckIcon className="w-4 h-4" />
                        Já adicionado ao acompanhamento
                      </div>
                    ) : (
                      <button
                        onClick={() => handleSelecionar(t)}
                        disabled={selecting === t.id}
                        className="w-full flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white px-3 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer"
                      >
                        {selecting === t.id ? (
                          <><div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> Adicionando...</>
                        ) : (
                          "Selecionar projeto"
                        )}
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Template detail modal */}
      <AnimatePresence>
        {viewingTemplate && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
            onClick={(e) => { if (e.target === e.currentTarget) setViewingTemplate(null); }}
          >
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-lg p-6 space-y-4 max-h-[90vh] overflow-y-auto"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  {eixoLabel(viewingTemplate.eixo_id) && (
                    <span className="inline-block text-xs font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/30 px-2 py-0.5 rounded-full mb-2">
                      {eixoLabel(viewingTemplate.eixo_id)}
                    </span>
                  )}
                  <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">{viewingTemplate.titulo}</h2>
                </div>
                <button
                  onClick={() => setViewingTemplate(null)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors cursor-pointer"
                >
                  <XMarkIcon className="w-5 h-5" />
                </button>
              </div>
              {viewingTemplate.descricao && (
                <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">{viewingTemplate.descricao}</p>
              )}
              {viewingTemplate.conteudo && (
                <div className="text-sm text-slate-600 dark:text-slate-300 whitespace-pre-line border-t border-slate-100 dark:border-slate-700 pt-4 leading-relaxed">
                  {viewingTemplate.conteudo}
                </div>
              )}
              {!isGlobal && (
                <div className="border-t border-slate-100 dark:border-slate-700 pt-4">
                  {selectedTemplateIds.has(viewingTemplate.id) ? (
                    <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400 font-medium">
                      <CheckIcon className="w-4 h-4" />
                      Já adicionado ao acompanhamento
                    </div>
                  ) : (
                    <button
                      onClick={() => { handleSelecionar(viewingTemplate); setViewingTemplate(null); }}
                      disabled={selecting === viewingTemplate.id}
                      className="w-full flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors cursor-pointer"
                    >
                      Selecionar projeto
                    </button>
                  )}
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Delete confirm modal */}
      <AnimatePresence>
        {deleteConfirmId && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
          >
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl p-6 w-full max-w-sm space-y-4"
            >
              <h3 className="font-bold text-slate-800 dark:text-slate-100">Excluir modelo?</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400">Esta ação não pode ser desfeita. Os projetos em acompanhamento derivados deste modelo não serão afetados.</p>
              <div className="flex gap-3 justify-end">
                <button onClick={() => setDeleteConfirmId(null)} className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-600 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer">Cancelar</button>
                <button onClick={() => handleDelete(deleteConfirmId)} className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm cursor-pointer">Excluir</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Create / Edit form modal */}
      <AnimatePresence>
        {showForm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
            onClick={(e) => { if (e.target === e.currentTarget) closeForm(); }}
          >
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">
                  {editingId ? "Editar Modelo" : "Novo Modelo de Projeto"}
                </h3>
                <button onClick={closeForm} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors cursor-pointer">
                  <XMarkIcon className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Eixo (opcional)</label>
                    <select
                      value={form.eixo_id}
                      onChange={(e) => setForm((p) => ({ ...p, eixo_id: e.target.value }))}
                      className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 text-sm bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">Sem eixo</option>
                      {eixos.map((e) => <option key={e.id} value={String(e.id)}>{e.nome}</option>)}
                    </select>
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Título *</label>
                    <input
                      value={form.titulo}
                      onChange={(e) => setForm((p) => ({ ...p, titulo: e.target.value }))}
                      required
                      placeholder="Nome do projeto modelo"
                      className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 text-sm bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Descrição resumida</label>
                  <textarea
                    value={form.descricao}
                    onChange={(e) => setForm((p) => ({ ...p, descricao: e.target.value }))}
                    rows={2}
                    placeholder="Breve descrição do projeto..."
                    className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 text-sm bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Conteúdo detalhado</label>
                  <textarea
                    value={form.conteudo}
                    onChange={(e) => setForm((p) => ({ ...p, conteudo: e.target.value }))}
                    rows={6}
                    placeholder="Detalhes, objetivos, metodologia, resultados esperados..."
                    className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 text-sm bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  />
                </div>

                <div className="flex items-center gap-3 pt-2">
                  {formError && <p className="text-sm text-red-600 flex-1">{formError}</p>}
                  <div className="flex gap-3 ml-auto">
                    <button type="button" onClick={closeForm} className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-600 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer">Cancelar</button>
                    <button type="submit" disabled={saving} className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium disabled:opacity-50 cursor-pointer">
                      {saving ? "Salvando..." : editingId ? "Salvar" : "Criar Modelo"}
                    </button>
                  </div>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
