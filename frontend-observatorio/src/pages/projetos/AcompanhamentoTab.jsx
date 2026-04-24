import { useEffect, useState, useMemo, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  PlusIcon,
  XMarkIcon,
  PencilIcon,
  TrashIcon,
  ViewColumnsIcon,
  TableCellsIcon,
  CalendarDaysIcon,
  BuildingOfficeIcon,
  UserIcon,
  InformationCircleIcon,
} from "@heroicons/react/24/outline";
import api from "../../services/api";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import { useEscapeKey } from "../../hooks/useEscapeKey";

const STATUS_CONFIG = {
  nao_iniciado: {
    label: "Não iniciado",
    color: "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300",
    dot: "bg-slate-400",
  },
  em_andamento: {
    label: "Em andamento",
    color: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400",
    dot: "bg-amber-500",
  },
  concluido: {
    label: "Concluído",
    color: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400",
    dot: "bg-green-500",
  },
};

const defaultForm = {
  eixo_id: "",
  titulo: "",
  descricao: "",
  status: "nao_iniciado",
  data_inicio: "",
  data_prazo: "",
  departamento: "",
  responsavel: "",
  conteudo: "",
};

function fmtDate(d) {
  if (!d) return null;
  return new Date(d + "T00:00:00").toLocaleDateString("pt-BR");
}

export default function AcompanhamentoTab() {
  const { user } = useAuth();
  const { addToast } = useToast();
  const isGlobal = user?.role === "ADMIN_GLOBAL";
  const canEdit = user?.role === "ADMIN_MUNICIPIO" || user?.role === "ADMIN_GLOBAL";

  const [projetos, setProjetos] = useState([]);
  const [eixos, setEixos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState("kanban");
  const [filterEixo, setFilterEixo] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(defaultForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);
  const [viewingProjeto, setViewingProjeto] = useState(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);

  useEscapeKey(useCallback(() => {
    if (deleteConfirmId) { setDeleteConfirmId(null); return; }
    if (viewingProjeto) { setViewingProjeto(null); return; }
    if (showForm) closeForm();
  }, [deleteConfirmId, viewingProjeto, showForm]));

  async function load() {
    try {
      const [projRes, eixosRes] = await Promise.all([
        api.get("/projetos"),
        api.get("/projetos/eixos"),
      ]);
      setProjetos(projRes.data || []);
      setEixos(eixosRes.data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const filtrados = useMemo(() => {
    if (!filterEixo) return projetos;
    return projetos.filter((p) => String(p.eixo_id) === filterEixo);
  }, [projetos, filterEixo]);

  const kpis = useMemo(() => ({
    total: projetos.length,
    nao_iniciado: projetos.filter((p) => p.status === "nao_iniciado").length,
    em_andamento: projetos.filter((p) => p.status === "em_andamento").length,
    concluido: projetos.filter((p) => p.status === "concluido").length,
  }), [projetos]);

  function eixoLabel(eixo_id) {
    return eixos.find((e) => e.id === eixo_id)?.nome || null;
  }

  function openCreate() {
    setEditingId(null);
    setForm(defaultForm);
    setFormError(null);
    setShowForm(true);
  }

  function openEdit(p) {
    setEditingId(p.id);
    setForm({
      eixo_id: String(p.eixo_id),
      titulo: p.titulo,
      descricao: p.descricao || "",
      status: p.status,
      data_inicio: p.data_inicio || "",
      data_prazo: p.data_prazo || "",
      departamento: p.departamento || "",
      responsavel: p.responsavel || "",
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
        addToast("Projeto atualizado", "success");
      } else {
        await api.post("/projetos", payload);
        addToast("Projeto criado com sucesso", "success");
      }
      closeForm();
      await load();
    } catch (err) {
      setFormError(err?.response?.data?.detail || "Erro ao salvar projeto.");
    } finally {
      setSaving(false);
    }
  }

  async function handleStatusChange(id, newStatus) {
    try {
      await api.put(`/projetos/${id}`, { status: newStatus });
      addToast("Status atualizado", "success");
      await load();
    } catch {
      addToast("Erro ao atualizar status", "error");
    }
  }

  async function handleDelete(id) {
    try {
      await api.delete(`/projetos/${id}`);
      setDeleteConfirmId(null);
      addToast("Projeto excluído", "success");
      await load();
    } catch {
      addToast("Erro ao excluir projeto", "error");
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (isGlobal) {
    return (
      <div className="text-center py-20 text-slate-400">
        <InformationCircleIcon className="w-12 h-12 mx-auto mb-3 opacity-30" />
        <p className="text-sm font-medium text-slate-500 dark:text-slate-400">O acompanhamento de projetos é específico por município.</p>
        <p className="text-xs mt-1">Faça login com uma conta de município para ver e gerenciar os projetos em andamento.</p>
      </div>
    );
  }

  function ProjetoCard({ projeto }) {
    const st = STATUS_CONFIG[projeto.status] || STATUS_CONFIG.nao_iniciado;
    const label = eixoLabel(projeto.eixo_id);
    return (
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 p-4 space-y-2.5 hover:shadow-md transition-shadow">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            {label && (
              <span className="inline-block text-[10px] font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/30 px-1.5 py-0.5 rounded mb-1">
                {label}
              </span>
            )}
            <h4
              className="font-medium text-slate-700 dark:text-slate-200 text-sm leading-snug cursor-pointer hover:text-blue-600 transition-colors"
              onClick={() => setViewingProjeto(projeto)}
            >
              {projeto.titulo}
            </h4>
          </div>
          {canEdit && (
            <div className="flex gap-1 shrink-0">
              <button onClick={() => openEdit(projeto)} aria-label="Editar" className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/40 transition-colors cursor-pointer">
                <PencilIcon className="w-3.5 h-3.5" />
              </button>
              <button onClick={() => setDeleteConfirmId(projeto.id)} aria-label="Excluir" className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors cursor-pointer">
                <TrashIcon className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-1 text-xs text-slate-400">
          {projeto.departamento && (
            <span className="flex items-center gap-1">
              <BuildingOfficeIcon className="w-3.5 h-3.5" /> {projeto.departamento}
            </span>
          )}
          {projeto.responsavel && (
            <span className="flex items-center gap-1">
              <UserIcon className="w-3.5 h-3.5" /> {projeto.responsavel}
            </span>
          )}
          {projeto.data_prazo && (
            <span className="flex items-center gap-1">
              <CalendarDaysIcon className="w-3.5 h-3.5" /> Prazo: {fmtDate(projeto.data_prazo)}
            </span>
          )}
        </div>

        {canEdit && (
          <div className="pt-1.5 border-t border-slate-50 dark:border-slate-700">
            <select
              value={projeto.status}
              onChange={(e) => handleStatusChange(projeto.id, e.target.value)}
              className="w-full text-xs px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-600 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 cursor-pointer"
            >
              {Object.entries(STATUS_CONFIG).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total", value: kpis.total, color: "text-slate-700 dark:text-slate-100" },
          { label: "Não iniciados", value: kpis.nao_iniciado, color: "text-slate-500" },
          { label: "Em andamento", value: kpis.em_andamento, color: "text-amber-600" },
          { label: "Concluídos", value: kpis.concluido, color: "text-green-600" },
        ].map((k) => (
          <div key={k.label} className="bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 p-4">
            <p className="text-xs text-slate-400 uppercase tracking-wider">{k.label}</p>
            <p className={`text-3xl font-extrabold mt-1 ${k.color}`}>{k.value}</p>
          </div>
        ))}
      </div>

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
          <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg">
            <button
              onClick={() => setViewMode("kanban")}
              aria-label="Visualização Kanban"
              aria-pressed={viewMode === "kanban"}
              className={`p-1.5 rounded transition-colors cursor-pointer ${viewMode === "kanban" ? "bg-white dark:bg-slate-700 text-blue-600 shadow-sm" : "text-slate-400 hover:text-slate-600"}`}
            >
              <ViewColumnsIcon className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode("table")}
              aria-label="Visualização Tabela"
              aria-pressed={viewMode === "table"}
              className={`p-1.5 rounded transition-colors cursor-pointer ${viewMode === "table" ? "bg-white dark:bg-slate-700 text-blue-600 shadow-sm" : "text-slate-400 hover:text-slate-600"}`}
            >
              <TableCellsIcon className="w-4 h-4" />
            </button>
          </div>
        </div>
        {canEdit && !isGlobal && (
          <button
            onClick={openCreate}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-colors cursor-pointer"
          >
            <PlusIcon className="w-4 h-4" />
            Novo Projeto
          </button>
        )}
      </div>

      {/* Kanban view */}
      {viewMode === "kanban" && (
        <>
          {filtrados.length === 0 ? (
            <div className="text-center py-16 text-slate-400">
              <ViewColumnsIcon className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">Nenhum projeto em acompanhamento.</p>
              <p className="text-xs mt-1">Selecione projetos do Acervo ou crie um novo diretamente.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {Object.entries(STATUS_CONFIG).map(([status, cfg]) => {
                const cols = filtrados.filter((p) => p.status === status);
                return (
                  <div key={status} className="space-y-3">
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${cfg.dot}`} />
                      <h3 className="font-semibold text-slate-600 dark:text-slate-300 text-sm">{cfg.label}</h3>
                      <span className="ml-auto text-xs text-slate-400 bg-slate-100 dark:bg-slate-700 px-2 py-0.5 rounded-full">{cols.length}</span>
                    </div>
                    <div className="space-y-3 min-h-[80px]">
                      {cols.map((p) => <ProjetoCard key={p.id} projeto={p} />)}
                      {cols.length === 0 && (
                        <div className="h-20 border-2 border-dashed border-slate-100 dark:border-slate-700 rounded-xl flex items-center justify-center text-xs text-slate-300 dark:text-slate-600">
                          Vazio
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Table view */}
      {viewMode === "table" && (
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-700/50 text-xs uppercase text-slate-400 tracking-wider text-left">
                <th className="px-6 py-3">Título</th>
                <th className="px-6 py-3">Eixo</th>
                <th className="px-6 py-3">Status</th>
                <th className="px-6 py-3">Responsável</th>
                <th className="px-6 py-3">Prazo</th>
                {canEdit && <th className="px-6 py-3" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 dark:divide-slate-700">
              {filtrados.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-10 text-center text-slate-400 text-sm">
                    Nenhum projeto em acompanhamento.
                  </td>
                </tr>
              ) : (
                filtrados.map((p) => {
                  const st = STATUS_CONFIG[p.status] || STATUS_CONFIG.nao_iniciado;
                  return (
                    <tr key={p.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                      <td className="px-6 py-3 font-medium text-slate-700 dark:text-slate-200 cursor-pointer hover:text-blue-600 transition-colors" onClick={() => setViewingProjeto(p)}>
                        {p.titulo}
                      </td>
                      <td className="px-6 py-3 text-slate-400 text-xs">{eixoLabel(p.eixo_id) || "—"}</td>
                      <td className="px-6 py-3">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${st.color}`}>{st.label}</span>
                      </td>
                      <td className="px-6 py-3 text-slate-500 dark:text-slate-400">{p.responsavel || "—"}</td>
                      <td className="px-6 py-3 text-slate-400 text-xs">{fmtDate(p.data_prazo) || "—"}</td>
                      {canEdit && (
                        <td className="px-6 py-3">
                          <div className="flex items-center gap-2 justify-end">
                            <button onClick={() => openEdit(p)} aria-label="Editar" className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/40 transition-colors cursor-pointer">
                              <PencilIcon className="w-4 h-4" />
                            </button>
                            <button onClick={() => setDeleteConfirmId(p.id)} aria-label="Excluir" className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors cursor-pointer">
                              <TrashIcon className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

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
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-lg p-6 space-y-4 max-h-[90vh] overflow-y-auto"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${STATUS_CONFIG[viewingProjeto.status]?.color}`}>
                    {STATUS_CONFIG[viewingProjeto.status]?.label}
                  </span>
                  <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100 mt-2">{viewingProjeto.titulo}</h2>
                </div>
                <button onClick={() => setViewingProjeto(null)} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors cursor-pointer">
                  <XMarkIcon className="w-5 h-5" />
                </button>
              </div>

              {viewingProjeto.descricao && (
                <p className="text-sm text-slate-600 dark:text-slate-300">{viewingProjeto.descricao}</p>
              )}
              {viewingProjeto.conteudo && (
                <div className="text-sm text-slate-600 dark:text-slate-300 whitespace-pre-line border-t border-slate-100 dark:border-slate-700 pt-4 leading-relaxed">
                  {viewingProjeto.conteudo}
                </div>
              )}
              <div className="flex flex-wrap gap-4 text-xs text-slate-400 border-t border-slate-100 dark:border-slate-700 pt-3">
                {eixoLabel(viewingProjeto.eixo_id) && <span><span className="font-medium">Eixo:</span> {eixoLabel(viewingProjeto.eixo_id)}</span>}
                {viewingProjeto.departamento && <span><span className="font-medium">Departamento:</span> {viewingProjeto.departamento}</span>}
                {viewingProjeto.responsavel && <span><span className="font-medium">Responsável:</span> {viewingProjeto.responsavel}</span>}
                {viewingProjeto.data_inicio && <span><span className="font-medium">Início:</span> {fmtDate(viewingProjeto.data_inicio)}</span>}
                {viewingProjeto.data_prazo && <span><span className="font-medium">Prazo:</span> {fmtDate(viewingProjeto.data_prazo)}</span>}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Delete confirm */}
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
              <p className="text-sm text-slate-500 dark:text-slate-400">Esta ação não pode ser desfeita.</p>
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
                  {editingId ? "Editar Projeto" : "Novo Projeto"}
                </h3>
                <button onClick={closeForm} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors cursor-pointer">
                  <XMarkIcon className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2 flex flex-col gap-1">
                  <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Título *</label>
                  <input
                    value={form.titulo}
                    onChange={(e) => setForm((p) => ({ ...p, titulo: e.target.value }))}
                    required
                    className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 text-sm bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Eixo *</label>
                  <select
                    value={form.eixo_id}
                    onChange={(e) => setForm((p) => ({ ...p, eixo_id: e.target.value }))}
                    required
                    className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 text-sm bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Selecione um eixo</option>
                    {eixos.map((e) => <option key={e.id} value={String(e.id)}>{e.nome}</option>)}
                  </select>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Status</label>
                  <select
                    value={form.status}
                    onChange={(e) => setForm((p) => ({ ...p, status: e.target.value }))}
                    className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 text-sm bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {Object.entries(STATUS_CONFIG).map(([k, v]) => (
                      <option key={k} value={k}>{v.label}</option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Departamento</label>
                  <input
                    value={form.departamento}
                    onChange={(e) => setForm((p) => ({ ...p, departamento: e.target.value }))}
                    placeholder="Ex.: Secretaria de Obras"
                    className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 text-sm bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Responsável</label>
                  <input
                    value={form.responsavel}
                    onChange={(e) => setForm((p) => ({ ...p, responsavel: e.target.value }))}
                    placeholder="Nome do responsável"
                    className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 text-sm bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Data de Início</label>
                  <input
                    type="date"
                    value={form.data_inicio}
                    onChange={(e) => setForm((p) => ({ ...p, data_inicio: e.target.value }))}
                    className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 text-sm bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Prazo</label>
                  <input
                    type="date"
                    value={form.data_prazo}
                    onChange={(e) => setForm((p) => ({ ...p, data_prazo: e.target.value }))}
                    className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 text-sm bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div className="md:col-span-2 flex flex-col gap-1">
                  <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Descrição resumida</label>
                  <textarea
                    value={form.descricao}
                    onChange={(e) => setForm((p) => ({ ...p, descricao: e.target.value }))}
                    rows={2}
                    className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 text-sm bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  />
                </div>

                <div className="md:col-span-2 flex flex-col gap-1">
                  <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Conteúdo / Progresso</label>
                  <textarea
                    value={form.conteudo}
                    onChange={(e) => setForm((p) => ({ ...p, conteudo: e.target.value }))}
                    rows={4}
                    placeholder="Descreva o andamento, metas, observações..."
                    className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 text-sm bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  />
                </div>

                <div className="md:col-span-2 flex items-center gap-3 pt-2">
                  {formError && <p className="text-sm text-red-600 flex-1">{formError}</p>}
                  <div className="flex gap-3 ml-auto">
                    <button type="button" onClick={closeForm} className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-600 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer">Cancelar</button>
                    <button type="submit" disabled={saving} className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium disabled:opacity-50 cursor-pointer">
                      {saving ? "Salvando..." : editingId ? "Salvar" : "Criar Projeto"}
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
