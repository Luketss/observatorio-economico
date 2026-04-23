import { useEffect, useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  FolderOpenIcon,
  PlusIcon,
  XMarkIcon,
  PencilIcon,
  TrashIcon,
  CalendarDaysIcon,
  BuildingOfficeIcon,
} from "@heroicons/react/24/outline";
import api from "../../services/api";
import { useAuth } from "../../context/AuthContext";

const STATUS_CONFIG = {
  nao_iniciado: { label: "Não iniciado", color: "bg-slate-100 text-slate-600" },
  em_andamento: { label: "Em andamento", color: "bg-amber-100 text-amber-700" },
  concluido: { label: "Concluído", color: "bg-green-100 text-green-700" },
};

const defaultForm = {
  eixo_id: "",
  titulo: "",
  descricao: "",
  status: "nao_iniciado",
  data_inicio: "",
  data_prazo: "",
  departamento: "",
  conteudo: "",
};

function fmtDate(d) {
  if (!d) return null;
  return new Date(d + "T00:00:00").toLocaleDateString("pt-BR");
}

export default function ProjetosPage() {
  const { user } = useAuth();
  const canEdit = user?.role === "ADMIN_GLOBAL" || user?.role === "ADMIN_MUNICIPIO";

  const [eixos, setEixos] = useState([]);
  const [projetos, setProjetos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeEixo, setActiveEixo] = useState(null);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(defaultForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);

  const [viewingProjeto, setViewingProjeto] = useState(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);

  async function load() {
    try {
      const [eixosRes, projetosRes] = await Promise.all([
        api.get("/projetos/eixos"),
        api.get("/projetos"),
      ]);
      const eixosList = eixosRes.data || [];
      setEixos(eixosList);
      setProjetos(projetosRes.data || []);
      if (eixosList.length > 0 && !activeEixo) {
        setActiveEixo(eixosList[0].id);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const projetosFiltrados = useMemo(
    () => projetos.filter((p) => p.eixo_id === activeEixo),
    [projetos, activeEixo]
  );

  const kpis = useMemo(() => ({
    total: projetos.length,
    nao_iniciado: projetos.filter((p) => p.status === "nao_iniciado").length,
    em_andamento: projetos.filter((p) => p.status === "em_andamento").length,
    concluido: projetos.filter((p) => p.status === "concluido").length,
  }), [projetos]);

  function openCreate() {
    setEditingId(null);
    setForm({ ...defaultForm, eixo_id: activeEixo || "" });
    setFormError(null);
    setShowForm(true);
  }

  function openEdit(p) {
    setEditingId(p.id);
    setForm({
      eixo_id: p.eixo_id,
      titulo: p.titulo,
      descricao: p.descricao || "",
      status: p.status,
      data_inicio: p.data_inicio || "",
      data_prazo: p.data_prazo || "",
      departamento: p.departamento || "",
      conteudo: p.conteudo || "",
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
      eixo_id: Number(form.eixo_id),
      data_inicio: form.data_inicio || null,
      data_prazo: form.data_prazo || null,
    };
    try {
      if (editingId) {
        await api.put(`/projetos/${editingId}`, payload);
      } else {
        await api.post("/projetos", payload);
      }
      closeForm();
      await load();
    } catch (err) {
      setFormError(err?.response?.data?.detail || "Erro ao salvar projeto.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id) {
    try {
      await api.delete(`/projetos/${id}`);
      setDeleteConfirmId(null);
      await load();
    } catch (err) {
      console.error(err);
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
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-8"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <FolderOpenIcon className="w-7 h-7 text-blue-600" />
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-slate-800 dark:text-slate-100">
              Projetos
            </h1>
            <p className="text-sm text-slate-400 mt-0.5">
              Iniciativas e projetos municipais por eixo estratégico.
            </p>
          </div>
        </div>
        {canEdit && (
          <button
            onClick={openCreate}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-colors"
          >
            <PlusIcon className="w-4 h-4" />
            Novo Projeto
          </button>
        )}
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total", value: kpis.total, color: "text-slate-700" },
          { label: "Não Iniciados", value: kpis.nao_iniciado, color: "text-slate-500" },
          { label: "Em Andamento", value: kpis.em_andamento, color: "text-amber-600" },
          { label: "Concluídos", value: kpis.concluido, color: "text-green-600" },
        ].map((k) => (
          <div key={k.label} className="bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 p-4">
            <p className="text-xs text-slate-400 uppercase tracking-wider">{k.label}</p>
            <p className={`text-3xl font-extrabold mt-1 ${k.color}`}>{k.value}</p>
          </div>
        ))}
      </div>

      {/* Eixo tabs */}
      {eixos.length > 0 ? (
        <>
          <div className="flex gap-2 flex-wrap border-b border-slate-100 dark:border-slate-700 pb-1">
            {eixos.map((e) => (
              <button
                key={e.id}
                onClick={() => setActiveEixo(e.id)}
                className={`px-4 py-2 rounded-t-lg text-sm font-medium transition-colors ${
                  activeEixo === e.id
                    ? "bg-blue-600 text-white"
                    : "text-slate-500 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700"
                }`}
              >
                {e.nome}
              </button>
            ))}
          </div>

          {/* Project cards */}
          {projetosFiltrados.length === 0 ? (
            <div className="text-center py-16 text-slate-400">
              <FolderOpenIcon className="w-10 h-10 mx-auto mb-3 opacity-40" />
              <p className="text-sm">Nenhum projeto neste eixo ainda.</p>
              {canEdit && (
                <button onClick={openCreate} className="mt-3 text-blue-600 text-sm hover:underline">
                  Criar o primeiro projeto
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
              {projetosFiltrados.map((p) => {
                const st = STATUS_CONFIG[p.status] || STATUS_CONFIG.nao_iniciado;
                return (
                  <div
                    key={p.id}
                    className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 p-5 flex flex-col gap-3 hover:shadow-md transition-shadow"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <h3
                        className="font-semibold text-slate-800 dark:text-slate-100 leading-snug cursor-pointer hover:text-blue-600 transition-colors flex-1"
                        onClick={() => setViewingProjeto(p)}
                      >
                        {p.titulo}
                      </h3>
                      <span className={`shrink-0 px-2.5 py-1 rounded-full text-xs font-medium ${st.color}`}>
                        {st.label}
                      </span>
                    </div>

                    {p.descricao && (
                      <p className="text-sm text-slate-500 dark:text-slate-400 line-clamp-2">{p.descricao}</p>
                    )}

                    <div className="flex flex-wrap gap-3 text-xs text-slate-400 mt-auto">
                      {p.departamento && (
                        <span className="flex items-center gap-1">
                          <BuildingOfficeIcon className="w-3.5 h-3.5" />
                          {p.departamento}
                        </span>
                      )}
                      {p.data_prazo && (
                        <span className="flex items-center gap-1">
                          <CalendarDaysIcon className="w-3.5 h-3.5" />
                          Prazo: {fmtDate(p.data_prazo)}
                        </span>
                      )}
                    </div>

                    {canEdit && (
                      <div className="flex gap-2 pt-1 border-t border-slate-50 dark:border-slate-700">
                        <button
                          onClick={() => openEdit(p)}
                          className="flex items-center gap-1 text-xs text-slate-400 hover:text-blue-600 transition-colors"
                        >
                          <PencilIcon className="w-3.5 h-3.5" /> Editar
                        </button>
                        <button
                          onClick={() => setDeleteConfirmId(p.id)}
                          className="flex items-center gap-1 text-xs text-slate-400 hover:text-red-500 transition-colors"
                        >
                          <TrashIcon className="w-3.5 h-3.5" /> Excluir
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      ) : (
        <div className="text-center py-16 text-slate-400">
          <FolderOpenIcon className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm">Nenhum eixo cadastrado ainda.</p>
          <p className="text-xs mt-1">O ADMIN_GLOBAL pode criar eixos no painel de administração.</p>
        </div>
      )}

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
              <h3 className="font-bold text-slate-800 dark:text-slate-100">Excluir projeto?</h3>
              <p className="text-sm text-slate-500">Esta ação não pode ser desfeita.</p>
              <div className="flex gap-3 justify-end">
                <button onClick={() => setDeleteConfirmId(null)} className="px-4 py-2 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50">Cancelar</button>
                <button onClick={() => handleDelete(deleteConfirmId)} className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm">Excluir</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Project detail modal */}
      <AnimatePresence>
        {viewingProjeto && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
            onClick={(e) => { if (e.target === e.currentTarget) setViewingProjeto(null); }}
          >
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-lg p-6 space-y-4 max-h-[90vh] overflow-y-auto"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${STATUS_CONFIG[viewingProjeto.status]?.color}`}>
                    {STATUS_CONFIG[viewingProjeto.status]?.label}
                  </span>
                  <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100 mt-2">{viewingProjeto.titulo}</h2>
                </div>
                <button onClick={() => setViewingProjeto(null)} className="text-slate-400 hover:text-slate-600">
                  <XMarkIcon className="w-5 h-5" />
                </button>
              </div>
              {viewingProjeto.descricao && (
                <p className="text-sm text-slate-600 dark:text-slate-300">{viewingProjeto.descricao}</p>
              )}
              {viewingProjeto.conteudo && (
                <div className="text-sm text-slate-600 dark:text-slate-300 whitespace-pre-line border-t border-slate-100 dark:border-slate-700 pt-4">
                  {viewingProjeto.conteudo}
                </div>
              )}
              <div className="flex flex-wrap gap-4 text-xs text-slate-400 border-t border-slate-100 dark:border-slate-700 pt-3">
                {viewingProjeto.departamento && <span><span className="font-medium">Departamento:</span> {viewingProjeto.departamento}</span>}
                {viewingProjeto.data_inicio && <span><span className="font-medium">Início:</span> {fmtDate(viewingProjeto.data_inicio)}</span>}
                {viewingProjeto.data_prazo && <span><span className="font-medium">Prazo:</span> {fmtDate(viewingProjeto.data_prazo)}</span>}
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
              className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">
                  {editingId ? "Editar Projeto" : "Novo Projeto"}
                </h3>
                <button onClick={closeForm} className="text-slate-400 hover:text-slate-600">
                  <XMarkIcon className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2 flex flex-col gap-1">
                  <label className="text-xs font-medium text-slate-500 uppercase tracking-wider">Eixo</label>
                  <select
                    value={form.eixo_id}
                    onChange={(e) => setForm((p) => ({ ...p, eixo_id: e.target.value }))}
                    required
                    className="px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Selecione um eixo</option>
                    {eixos.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
                  </select>
                </div>

                <div className="md:col-span-2 flex flex-col gap-1">
                  <label className="text-xs font-medium text-slate-500 uppercase tracking-wider">Título</label>
                  <input
                    value={form.titulo}
                    onChange={(e) => setForm((p) => ({ ...p, titulo: e.target.value }))}
                    required
                    className="px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-slate-500 uppercase tracking-wider">Status</label>
                  <select
                    value={form.status}
                    onChange={(e) => setForm((p) => ({ ...p, status: e.target.value }))}
                    className="px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {Object.entries(STATUS_CONFIG).map(([k, v]) => (
                      <option key={k} value={k}>{v.label}</option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-slate-500 uppercase tracking-wider">Departamento</label>
                  <input
                    value={form.departamento}
                    onChange={(e) => setForm((p) => ({ ...p, departamento: e.target.value }))}
                    placeholder="Ex.: Secretaria de Obras"
                    className="px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-slate-500 uppercase tracking-wider">Data de Início</label>
                  <input
                    type="date"
                    value={form.data_inicio}
                    onChange={(e) => setForm((p) => ({ ...p, data_inicio: e.target.value }))}
                    className="px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-slate-500 uppercase tracking-wider">Prazo</label>
                  <input
                    type="date"
                    value={form.data_prazo}
                    onChange={(e) => setForm((p) => ({ ...p, data_prazo: e.target.value }))}
                    className="px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div className="md:col-span-2 flex flex-col gap-1">
                  <label className="text-xs font-medium text-slate-500 uppercase tracking-wider">Descrição resumida</label>
                  <textarea
                    value={form.descricao}
                    onChange={(e) => setForm((p) => ({ ...p, descricao: e.target.value }))}
                    rows={2}
                    className="px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  />
                </div>

                <div className="md:col-span-2 flex flex-col gap-1">
                  <label className="text-xs font-medium text-slate-500 uppercase tracking-wider">Conteúdo detalhado</label>
                  <textarea
                    value={form.conteudo}
                    onChange={(e) => setForm((p) => ({ ...p, conteudo: e.target.value }))}
                    rows={5}
                    placeholder="Descreva os detalhes, metas e progresso do projeto..."
                    className="px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  />
                </div>

                <div className="md:col-span-2 flex items-center gap-3 pt-2">
                  {formError && <p className="text-sm text-red-600 flex-1">{formError}</p>}
                  <div className="flex gap-3 ml-auto">
                    <button type="button" onClick={closeForm} className="px-4 py-2 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50">Cancelar</button>
                    <button type="submit" disabled={saving} className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium disabled:opacity-50">
                      {saving ? "Salvando..." : editingId ? "Salvar" : "Criar Projeto"}
                    </button>
                  </div>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
