import { useEffect, useState, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ClipboardDocumentListIcon,
  PlusIcon,
  XMarkIcon,
  PencilIcon,
  TrashIcon,
  TableCellsIcon,
  ViewColumnsIcon,
} from "@heroicons/react/24/outline";
import api from "../../services/api";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import { useEscapeKey } from "../../hooks/useEscapeKey";

const STATUS_CONFIG = {
  nao_iniciado: { label: "Não iniciado", color: "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300", dot: "bg-slate-400" },
  em_andamento: { label: "Em andamento", color: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400", dot: "bg-amber-500" },
  concluido:    { label: "Concluído",    color: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400", dot: "bg-green-500" },
};

const defaultForm = {
  departamento: "", titulo: "", descricao: "", status: "nao_iniciado",
  data_inicio: "", data_prazo: "", responsavel: "", departamentos_envolvidos: "",
};

function fmtDate(d) {
  if (!d) return null;
  return new Date(d + "T00:00:00").toLocaleDateString("pt-BR");
}

export default function PlanoGovPage() {
  const { user } = useAuth();
  const { addToast } = useToast();
  const canEdit = user?.role === "ADMIN_GLOBAL" || user?.role === "ADMIN_MUNICIPIO";

  const [acoes, setAcoes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState("kanban");
  const [filterDept, setFilterDept] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(defaultForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);
  const [viewingAcao, setViewingAcao] = useState(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);

  useEscapeKey(useCallback(() => {
    if (deleteConfirmId) { setDeleteConfirmId(null); return; }
    if (viewingAcao) { setViewingAcao(null); return; }
    if (showForm) closeForm();
  }, [deleteConfirmId, viewingAcao, showForm]));

  async function load() {
    try {
      const res = await api.get("/dados_internos/plano_gov");
      setAcoes(res.data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const departamentos = useMemo(() => [...new Set(acoes.map((a) => a.departamento))].sort(), [acoes]);

  const filtradas = useMemo(
    () => filterDept ? acoes.filter((a) => a.departamento === filterDept) : acoes,
    [acoes, filterDept]
  );

  const kpis = useMemo(() => ({
    total: acoes.length,
    nao_iniciado: acoes.filter((a) => a.status === "nao_iniciado").length,
    em_andamento: acoes.filter((a) => a.status === "em_andamento").length,
    concluido: acoes.filter((a) => a.status === "concluido").length,
  }), [acoes]);

  function openCreate() {
    setEditingId(null);
    setForm(defaultForm);
    setFormError(null);
    setShowForm(true);
  }

  function openEdit(a) {
    setEditingId(a.id);
    setForm({
      departamento: a.departamento, titulo: a.titulo, descricao: a.descricao || "",
      status: a.status, data_inicio: a.data_inicio || "", data_prazo: a.data_prazo || "",
      responsavel: a.responsavel || "",
      departamentos_envolvidos: (a.departamentos_envolvidos || []).join(", "),
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
      data_inicio: form.data_inicio || null,
      data_prazo: form.data_prazo || null,
      departamentos_envolvidos: form.departamentos_envolvidos
        ? form.departamentos_envolvidos.split(",").map((s) => s.trim()).filter(Boolean)
        : null,
    };
    try {
      if (editingId) {
        await api.put(`/dados_internos/plano_gov/${editingId}`, payload);
        addToast("Ação atualizada", "success");
      } else {
        await api.post("/dados_internos/plano_gov", payload);
        addToast("Ação criada com sucesso", "success");
      }
      closeForm();
      await load();
    } catch (err) {
      setFormError(err?.response?.data?.detail || "Erro ao salvar.");
    } finally {
      setSaving(false);
    }
  }

  async function handleStatusChange(id, newStatus) {
    try {
      await api.put(`/dados_internos/plano_gov/${id}`, { status: newStatus });
      addToast("Status atualizado", "success");
      await load();
    } catch (err) {
      addToast("Erro ao atualizar status", "error");
    }
  }

  async function handleDelete(id) {
    try {
      await api.delete(`/dados_internos/plano_gov/${id}`);
      setDeleteConfirmId(null);
      addToast("Ação excluída", "success");
      await load();
    } catch (err) {
      addToast("Erro ao excluir", "error");
    }
  }

  function AcaoCard({ acao }) {
    const st = STATUS_CONFIG[acao.status];
    return (
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 p-4 space-y-2 hover:shadow-md transition-shadow">
        <div className="flex items-start justify-between gap-2">
          <h4
            className="font-medium text-slate-700 dark:text-slate-200 text-sm leading-snug cursor-pointer hover:text-blue-600 transition-colors flex-1"
            onClick={() => setViewingAcao(acao)}
          >
            {acao.titulo}
          </h4>
          {canEdit && (
            <div className="flex gap-1 shrink-0">
              <button onClick={() => openEdit(acao)} aria-label="Editar ação" className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/40 transition-colors cursor-pointer"><PencilIcon className="w-3.5 h-3.5" /></button>
              <button onClick={() => setDeleteConfirmId(acao.id)} aria-label="Excluir ação" className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors cursor-pointer"><TrashIcon className="w-3.5 h-3.5" /></button>
            </div>
          )}
        </div>
        <p className="text-xs text-slate-400">{acao.departamento}</p>
        {acao.data_prazo && <p className="text-xs text-slate-400">Prazo: {fmtDate(acao.data_prazo)}</p>}
        {acao.responsavel && <p className="text-xs text-slate-500">Resp.: {acao.responsavel}</p>}
        {canEdit && (
          <div className="pt-1 border-t border-slate-50 dark:border-slate-700">
            <select
              value={acao.status}
              onChange={(e) => handleStatusChange(acao.id, e.target.value)}
              className="w-full text-xs px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-600 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white dark:bg-slate-700"
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

  if (loading) return <div className="flex justify-center py-20"><div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ClipboardDocumentListIcon className="w-7 h-7 text-blue-600" />
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-slate-800 dark:text-slate-100">Plano de Governo</h1>
            <p className="text-sm text-slate-400 mt-0.5">Ações e metas por secretaria/departamento.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setViewMode("kanban")} aria-label="Visualização Kanban" aria-pressed={viewMode === "kanban"} className={`p-2 rounded-lg transition-colors cursor-pointer ${viewMode === "kanban" ? "bg-blue-100 text-blue-600" : "text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"}`}><ViewColumnsIcon className="w-5 h-5" aria-hidden="true" /></button>
          <button onClick={() => setViewMode("table")} aria-label="Visualização em tabela" aria-pressed={viewMode === "table"} className={`p-2 rounded-lg transition-colors cursor-pointer ${viewMode === "table" ? "bg-blue-100 text-blue-600" : "text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"}`}><TableCellsIcon className="w-5 h-5" aria-hidden="true" /></button>
          {canEdit && (
            <button onClick={openCreate} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-colors ml-2">
              <PlusIcon className="w-4 h-4" /> Nova Ação
            </button>
          )}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total", value: kpis.total, color: "text-slate-700 dark:text-slate-100" },
          { label: "Não iniciadas", value: kpis.nao_iniciado, color: "text-slate-500" },
          { label: "Em andamento", value: kpis.em_andamento, color: "text-amber-600" },
          { label: "Concluídas", value: kpis.concluido, color: "text-green-600" },
        ].map((k) => (
          <div key={k.label} className="bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 p-4">
            <p className="text-xs text-slate-400 uppercase tracking-wider">{k.label}</p>
            <p className={`text-3xl font-extrabold mt-1 ${k.color}`}>{k.value}</p>
          </div>
        ))}
      </div>

      {/* Filter */}
      <div className="flex items-center gap-3">
        <select
          value={filterDept}
          onChange={(e) => setFilterDept(e.target.value)}
          className="px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-slate-800 dark:border-slate-700"
        >
          <option value="">Todos os departamentos</option>
          {departamentos.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
      </div>

      {/* Kanban view */}
      {viewMode === "kanban" && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {Object.entries(STATUS_CONFIG).map(([status, cfg]) => {
            const cols = filtradas.filter((a) => a.status === status);
            return (
              <div key={status} className="space-y-3">
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${cfg.dot}`} />
                  <h3 className="font-semibold text-slate-600 dark:text-slate-300 text-sm">{cfg.label}</h3>
                  <span className="ml-auto text-xs text-slate-400 bg-slate-100 dark:bg-slate-700 px-2 py-0.5 rounded-full">{cols.length}</span>
                </div>
                <div className="space-y-3 min-h-[80px]">
                  {cols.map((a) => <AcaoCard key={a.id} acao={a} />)}
                  {cols.length === 0 && <div className="h-20 border-2 border-dashed border-slate-100 dark:border-slate-700 rounded-xl flex items-center justify-center text-xs text-slate-300">Vazio</div>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Table view */}
      {viewMode === "table" && (
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-700/50 text-xs uppercase text-slate-400 tracking-wider text-left">
                <th className="px-6 py-3">Título</th>
                <th className="px-6 py-3">Departamento</th>
                <th className="px-6 py-3">Status</th>
                <th className="px-6 py-3">Prazo</th>
                <th className="px-6 py-3">Responsável</th>
                {canEdit && <th className="px-6 py-3" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 dark:divide-slate-700">
              {filtradas.length === 0 ? (
                <tr><td colSpan={6} className="px-6 py-10 text-center text-slate-400">Nenhuma ação encontrada.</td></tr>
              ) : (
                filtradas.map((a) => {
                  const st = STATUS_CONFIG[a.status];
                  return (
                    <tr key={a.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                      <td className="px-6 py-3 font-medium text-slate-700 dark:text-slate-200 cursor-pointer hover:text-blue-600" onClick={() => setViewingAcao(a)}>{a.titulo}</td>
                      <td className="px-6 py-3 text-slate-500">{a.departamento}</td>
                      <td className="px-6 py-3"><span className={`px-2.5 py-1 rounded-full text-xs font-medium ${st.color}`}>{st.label}</span></td>
                      <td className="px-6 py-3 text-slate-400 text-xs">{fmtDate(a.data_prazo) || "—"}</td>
                      <td className="px-6 py-3 text-slate-400 text-xs">{a.responsavel || "—"}</td>
                      {canEdit && (
                        <td className="px-6 py-3">
                          <div className="flex items-center gap-2 justify-end">
                            <button onClick={() => openEdit(a)} className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"><PencilIcon className="w-4 h-4" /></button>
                            <button onClick={() => setDeleteConfirmId(a.id)} className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"><TrashIcon className="w-4 h-4" /></button>
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

      {/* Detail modal */}
      <AnimatePresence>
        {viewingAcao && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
            onClick={(e) => { if (e.target === e.currentTarget) setViewingAcao(null); }}
          >
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
              className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-lg p-6 space-y-4 max-h-[90vh] overflow-y-auto"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${STATUS_CONFIG[viewingAcao.status]?.color}`}>{STATUS_CONFIG[viewingAcao.status]?.label}</span>
                  <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100 mt-2">{viewingAcao.titulo}</h2>
                  <p className="text-sm text-slate-400">{viewingAcao.departamento}</p>
                </div>
                <button onClick={() => setViewingAcao(null)} className="text-slate-400 hover:text-slate-600"><XMarkIcon className="w-5 h-5" /></button>
              </div>
              {viewingAcao.descricao && <p className="text-sm text-slate-600 dark:text-slate-300">{viewingAcao.descricao}</p>}
              <div className="flex flex-wrap gap-4 text-xs text-slate-400 border-t border-slate-100 dark:border-slate-700 pt-3">
                {viewingAcao.responsavel && <span><span className="font-medium">Responsável:</span> {viewingAcao.responsavel}</span>}
                {viewingAcao.data_inicio && <span><span className="font-medium">Início:</span> {fmtDate(viewingAcao.data_inicio)}</span>}
                {viewingAcao.data_prazo && <span><span className="font-medium">Prazo:</span> {fmtDate(viewingAcao.data_prazo)}</span>}
                {viewingAcao.departamentos_envolvidos?.length > 0 && (
                  <span className="w-full"><span className="font-medium">Depts. envolvidos:</span> {viewingAcao.departamentos_envolvidos.join(", ")}</span>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Form modal */}
      <AnimatePresence>
        {showForm && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
            onClick={(e) => { if (e.target === e.currentTarget) closeForm(); }}
          >
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
              className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-xl p-6 max-h-[90vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">{editingId ? "Editar Ação" : "Nova Ação"}</h3>
                <button onClick={closeForm} className="text-slate-400 hover:text-slate-600"><XMarkIcon className="w-5 h-5" /></button>
              </div>
              <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2 flex flex-col gap-1">
                  <label className="text-xs font-medium text-slate-500 uppercase tracking-wider">Título</label>
                  <input value={form.titulo} onChange={(e) => setForm((p) => ({ ...p, titulo: e.target.value }))} required className="px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-slate-500 uppercase tracking-wider">Departamento</label>
                  <input value={form.departamento} onChange={(e) => setForm((p) => ({ ...p, departamento: e.target.value }))} required placeholder="Ex.: Secretaria de Saúde" className="px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-slate-500 uppercase tracking-wider">Status</label>
                  <select value={form.status} onChange={(e) => setForm((p) => ({ ...p, status: e.target.value }))} className="px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    {Object.entries(STATUS_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-slate-500 uppercase tracking-wider">Data de Início</label>
                  <input type="date" value={form.data_inicio} onChange={(e) => setForm((p) => ({ ...p, data_inicio: e.target.value }))} className="px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-slate-500 uppercase tracking-wider">Prazo</label>
                  <input type="date" value={form.data_prazo} onChange={(e) => setForm((p) => ({ ...p, data_prazo: e.target.value }))} className="px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-slate-500 uppercase tracking-wider">Responsável</label>
                  <input value={form.responsavel} onChange={(e) => setForm((p) => ({ ...p, responsavel: e.target.value }))} className="px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-slate-500 uppercase tracking-wider">Depts. envolvidos (vírgula)</label>
                  <input value={form.departamentos_envolvidos} onChange={(e) => setForm((p) => ({ ...p, departamentos_envolvidos: e.target.value }))} placeholder="Saúde, Educação..." className="px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div className="md:col-span-2 flex flex-col gap-1">
                  <label className="text-xs font-medium text-slate-500 uppercase tracking-wider">Descrição</label>
                  <textarea value={form.descricao} onChange={(e) => setForm((p) => ({ ...p, descricao: e.target.value }))} rows={3} className="px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
                </div>
                <div className="md:col-span-2 flex items-center gap-3 pt-2">
                  {formError && <p className="text-sm text-red-600 flex-1">{formError}</p>}
                  <div className="flex gap-3 ml-auto">
                    <button type="button" onClick={closeForm} className="px-4 py-2 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50">Cancelar</button>
                    <button type="submit" disabled={saving} className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium disabled:opacity-50">
                      {saving ? "Salvando..." : editingId ? "Salvar" : "Criar"}
                    </button>
                  </div>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Delete confirm */}
      <AnimatePresence>
        {deleteConfirmId && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
          >
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
              className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl p-6 w-full max-w-sm space-y-4"
            >
              <h3 className="font-bold text-slate-800 dark:text-slate-100">Excluir ação?</h3>
              <p className="text-sm text-slate-500">Esta ação não pode ser desfeita.</p>
              <div className="flex gap-3 justify-end">
                <button onClick={() => setDeleteConfirmId(null)} className="px-4 py-2 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50">Cancelar</button>
                <button onClick={() => handleDelete(deleteConfirmId)} className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm">Excluir</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
