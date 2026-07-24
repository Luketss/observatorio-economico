import { useEffect, useState, useMemo, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  PlusIcon,
  XMarkIcon,
  PencilIcon,
  TrashIcon,
  InformationCircleIcon,
  PencilSquareIcon,
  ViewColumnsIcon,
  TableCellsIcon,
} from "@heroicons/react/24/outline";
import api from "../../services/api";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import { useEscapeKey } from "../../hooks/useEscapeKey";
import { usePermissao } from "../../hooks/usePermissao";

const ESTAGIOS = ["ideia", "elaboracao", "submissao", "resultado"];
const ESTAGIO_CONFIG = {
  ideia:      { label: "Ideia",       dot: "bg-slate-400",  color: "bg-[var(--panel-2)] text-[var(--text-dim)]" },
  elaboracao: { label: "Elaboração",  dot: "bg-amber-500",  color: "bg-[var(--panel-2)] text-amber-400" },
  submissao:  { label: "Submissão",   dot: "bg-blue-500",   color: "bg-[var(--panel-2)] text-blue-400" },
  resultado:  { label: "Resultado",   dot: "bg-purple-500", color: "bg-[var(--panel-2)] text-[var(--accent-3)]" },
};

const RESULTADO_CONFIG = {
  aprovado:      { label: "Aprovado",       color: "bg-[var(--panel-2)] text-green-400" },
  reprovado:     { label: "Reprovado",      color: "bg-[var(--panel-2)] text-red-400" },
  em_avaliacao:  { label: "Em avaliação",   color: "bg-[var(--panel-2)] text-amber-400" },
};

const defaultForm = {
  titulo: "",
  descricao: "",
  estagio: "ideia",
  resultado: "",
  responsavel: "",
  prazo: "",
  valor_pleiteado: "",
  oportunidade_captacao_id: "",
};

function fmtMoeda(v) {
  if (!v) return null;
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", notation: "compact", maximumFractionDigits: 1 }).format(v);
}

function fmtDate(d) {
  if (!d) return null;
  return new Date(d + "T00:00:00").toLocaleDateString("pt-BR");
}

export default function EscritaTab() {
  const { user } = useAuth();
  const { addToast } = useToast();
  const isGlobal = user?.role === "ADMIN_GLOBAL";
  // ADMIN_GLOBAL não cria aqui: o registro nasce no município do usuário.
  const canCriar = usePermissao("escrita", "criar") && !isGlobal;
  const canEditar = usePermissao("escrita", "editar");
  const canExcluir = usePermissao("escrita", "excluir");

  const [items, setItems] = useState([]);
  const [captacoes, setCaptacoes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(defaultForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);
  const [viewingItem, setViewingItem] = useState(null);
  const [viewMode, setViewMode] = useState("kanban");

  useEscapeKey(useCallback(() => {
    if (deleteConfirmId) { setDeleteConfirmId(null); return; }
    if (viewingItem) { setViewingItem(null); return; }
    if (showForm) closeForm();
  }, [deleteConfirmId, viewingItem, showForm]));

  async function load() {
    try {
      const [escRes, capRes] = await Promise.all([
        api.get("/desenvolvimento-economico/escrita"),
        api.get("/desenvolvimento-economico/captacao"),
      ]);
      setItems(escRes.data || []);
      setCaptacoes(capRes.data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const kpis = useMemo(() => ({
    total: items.length,
    elaboracao: items.filter((i) => i.estagio === "elaboracao").length,
    submetidos: items.filter((i) => i.estagio === "submissao").length,
    aprovados: items.filter((i) => i.resultado === "aprovado").length,
  }), [items]);

  function openCreate() {
    setEditingId(null);
    setForm(defaultForm);
    setFormError(null);
    setShowForm(true);
  }

  function openEdit(item) {
    setEditingId(item.id);
    setForm({
      titulo: item.titulo,
      descricao: item.descricao || "",
      estagio: item.estagio,
      resultado: item.resultado || "",
      responsavel: item.responsavel || "",
      prazo: item.prazo || "",
      valor_pleiteado: item.valor_pleiteado != null ? String(item.valor_pleiteado) : "",
      oportunidade_captacao_id: item.oportunidade_captacao_id != null ? String(item.oportunidade_captacao_id) : "",
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
      valor_pleiteado: form.valor_pleiteado ? Number(form.valor_pleiteado) : null,
      prazo: form.prazo || null,
      resultado: form.resultado || null,
      oportunidade_captacao_id: form.oportunidade_captacao_id ? Number(form.oportunidade_captacao_id) : null,
    };
    try {
      if (editingId) {
        await api.put(`/desenvolvimento-economico/escrita/${editingId}`, payload);
        addToast("Projeto atualizado", "success");
      } else {
        await api.post("/desenvolvimento-economico/escrita", payload);
        addToast("Projeto criado", "success");
      }
      closeForm();
      await load();
    } catch (err) {
      setFormError(err?.response?.data?.detail || "Erro ao salvar.");
    } finally {
      setSaving(false);
    }
  }

  async function handleEstagioChange(id, newEstagio) {
    try {
      await api.put(`/desenvolvimento-economico/escrita/${id}`, { estagio: newEstagio });
      addToast("Estágio atualizado", "success");
      await load();
    } catch {
      addToast("Erro ao atualizar estágio", "error");
    }
  }

  async function handleDelete(id) {
    try {
      await api.delete(`/desenvolvimento-economico/escrita/${id}`);
      setDeleteConfirmId(null);
      addToast("Projeto excluído", "success");
      await load();
    } catch {
      addToast("Erro ao excluir", "error");
    }
  }

  const header = (
    <div className="flex items-center gap-3">
      <PencilSquareIcon className="w-7 h-7 text-blue-600" />
      <h1 className="text-2xl font-extrabold tracking-tight text-[var(--text)]">
        Escrita de Projetos
      </h1>
    </div>
  );

  if (loading) {
    return (
      <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="space-y-6">
        {header}
        <div className="flex justify-center py-20">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      </motion.div>
    );
  }

  if (isGlobal) {
    return (
      <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="space-y-6">
        {header}
        <div className="text-center py-20 text-slate-400">
          <InformationCircleIcon className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm font-medium text-[var(--text-dim)]">A escrita de projetos é específica por município.</p>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="space-y-6">
      {header}
      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total de projetos", value: kpis.total, color: "text-[var(--text)]" },
          { label: "Em elaboração", value: kpis.elaboracao, color: "text-amber-600" },
          { label: "Submetidos", value: kpis.submetidos, color: "text-blue-600" },
          { label: "Aprovados", value: kpis.aprovados, color: "text-green-600" },
        ].map((k) => (
          <div key={k.label} className="bg-[var(--panel)] rounded-xl border border-[var(--border)] p-4">
            <p className="text-xs text-slate-400 uppercase tracking-wider">{k.label}</p>
            <p className={`text-2xl font-extrabold mt-1 ${k.color}`}>{k.value}</p>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="inline-flex rounded-xl border border-[var(--border)] overflow-hidden">
          <button
            onClick={() => setViewMode("kanban")}
            aria-label="Kanban"
            aria-pressed={viewMode === "kanban"}
            className={`px-3 py-2 cursor-pointer transition-colors ${viewMode === "kanban" ? "bg-[var(--panel-2)] text-[var(--text)]" : "text-[var(--text-mute)] hover:bg-[var(--panel-2)]"}`}
          >
            <ViewColumnsIcon className="w-4 h-4" />
          </button>
          <button
            onClick={() => setViewMode("table")}
            aria-label="Tabela"
            aria-pressed={viewMode === "table"}
            className={`px-3 py-2 cursor-pointer transition-colors ${viewMode === "table" ? "bg-[var(--panel-2)] text-[var(--text)]" : "text-[var(--text-mute)] hover:bg-[var(--panel-2)]"}`}
          >
            <TableCellsIcon className="w-4 h-4" />
          </button>
        </div>
        {canCriar && (
          <button
            onClick={openCreate}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-colors cursor-pointer"
          >
            <PlusIcon className="w-4 h-4" />
            Novo Projeto
          </button>
        )}
      </div>

      {viewMode === "kanban" && (
      <>
      {/* Kanban board */}
      {items.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <p className="text-sm">Nenhum projeto de escrita cadastrado ainda.</p>
          {canCriar && <p className="text-xs mt-1">Clique em "Novo Projeto" para começar.</p>}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
          {ESTAGIOS.map((estagio) => {
            const cfg = ESTAGIO_CONFIG[estagio];
            const cols = items.filter((i) => i.estagio === estagio);
            return (
              <div key={estagio} className="space-y-3">
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${cfg.dot}`} />
                  <h3 className="font-semibold text-[var(--text-dim)] text-sm">{cfg.label}</h3>
                  <span className="ml-auto text-xs text-slate-400 bg-[var(--panel-2)] px-2 py-0.5 rounded-full">{cols.length}</span>
                </div>
                <div className="space-y-3 min-h-[80px]">
                  {cols.map((item) => {
                    const resCfg = item.resultado ? RESULTADO_CONFIG[item.resultado] : null;
                    const cap = captacoes.find((c) => c.id === item.oportunidade_captacao_id);
                    return (
                      <div key={item.id} className="bg-[var(--panel)] rounded-xl border border-[var(--border)] p-4 space-y-2.5 hover:shadow-md transition-shadow">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            {cap && (
                              <span className="inline-block text-[10px] font-medium text-[var(--accent-1)] bg-[var(--panel-2)] px-1.5 py-0.5 rounded mb-1">
                                {cap.titulo}
                              </span>
                            )}
                            <h4 className="font-medium text-[var(--text)] text-sm leading-snug cursor-pointer" onClick={() => setViewingItem(item)}>{item.titulo}</h4>
                          </div>
                          {(canEditar || canExcluir) && (
                            <div className="flex gap-1 shrink-0">
                              {canEditar && (
                                <button onClick={() => openEdit(item)} className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-[var(--panel-2)] transition-colors cursor-pointer">
                                  <PencilIcon className="w-3.5 h-3.5" />
                                </button>
                              )}
                              {canExcluir && (
                                <button onClick={() => setDeleteConfirmId(item.id)} className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-[var(--panel-2)] transition-colors cursor-pointer">
                                  <TrashIcon className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                        {resCfg && (
                          <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-medium ${resCfg.color}`}>{resCfg.label}</span>
                        )}
                        <div className="flex flex-col gap-1 text-xs text-slate-400">
                          {item.responsavel && <span>{item.responsavel}</span>}
                          {item.valor_pleiteado && <span className="font-semibold text-[var(--text-dim)]">{fmtMoeda(item.valor_pleiteado)}</span>}
                        </div>
                        {canEditar && (
                          <div className="pt-1.5 border-t border-[var(--border)]">
                            <select
                              value={item.estagio}
                              onChange={(e) => handleEstagioChange(item.id, e.target.value)}
                              className="w-full text-xs px-2 py-1.5 rounded-lg border border-[var(--border)] focus:outline-none focus:ring-1 focus:ring-blue-500 bg-[var(--panel-2)] text-[var(--text)] cursor-pointer"
                            >
                              {ESTAGIOS.map((e) => <option key={e} value={e}>{ESTAGIO_CONFIG[e].label}</option>)}
                            </select>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {cols.length === 0 && (
                    <div className="h-20 border-2 border-dashed border-[var(--border)] rounded-xl flex items-center justify-center text-xs text-[var(--text-mute)]">
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

      {viewMode === "table" && (
        <div className="bg-[var(--panel)] rounded-xl border border-[var(--border)] overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-[var(--panel-2)] text-[10px] uppercase tracking-wider text-[var(--text-mute)] text-left">
                <th className="px-4 py-2.5">Título</th>
                <th className="px-4 py-2.5">Captação vinculada</th>
                <th className="px-4 py-2.5">Resultado</th>
                <th className="px-4 py-2.5">Responsável</th>
                <th className="px-4 py-2.5">Prazo</th>
                <th className="px-4 py-2.5">Valor</th>
                <th className="px-4 py-2.5">Estágio</th>
                {(canEditar || canExcluir) && <th className="px-4 py-2.5" />}
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-10 text-center text-sm text-slate-400">Nenhum projeto de escrita cadastrado ainda.</td></tr>
              ) : (
                items.map((item) => {
                  const cfg = ESTAGIO_CONFIG[item.estagio] || ESTAGIO_CONFIG.ideia;
                  const resCfg = item.resultado ? RESULTADO_CONFIG[item.resultado] : null;
                  const cap = captacoes.find((c) => c.id === item.oportunidade_captacao_id);
                  return (
                    <tr key={item.id} className="border-t border-[var(--border)]">
                      <td className="px-4 py-2.5 font-medium text-[var(--text)] cursor-pointer" onClick={() => setViewingItem(item)}>{item.titulo}</td>
                      <td className="px-4 py-2.5 text-xs text-[var(--accent-1)]">{cap?.titulo || "—"}</td>
                      <td className="px-4 py-2.5">{resCfg ? <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${resCfg.color}`}>{resCfg.label}</span> : <span className="text-xs text-[var(--text-mute)]">—</span>}</td>
                      <td className="px-4 py-2.5 text-xs text-[var(--text-dim)]">{item.responsavel || "—"}</td>
                      <td className="px-4 py-2.5 text-xs text-[var(--text-mute)]">{fmtDate(item.prazo) || "—"}</td>
                      <td className="px-4 py-2.5 text-xs text-[var(--text-dim)]">{fmtMoeda(item.valor_pleiteado) || "—"}</td>
                      <td className="px-4 py-2.5"><span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${cfg.color}`}>{cfg.label}</span></td>
                      {(canEditar || canExcluir) && (
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-1 justify-end">
                            {canEditar && (<button onClick={() => openEdit(item)} className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-[var(--panel-2)] transition-colors cursor-pointer"><PencilIcon className="w-3.5 h-3.5" /></button>)}
                            {canExcluir && (<button onClick={() => setDeleteConfirmId(item.id)} className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-[var(--panel-2)] transition-colors cursor-pointer"><TrashIcon className="w-3.5 h-3.5" /></button>)}
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
        {viewingItem && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
            onClick={(e) => { if (e.target === e.currentTarget) setViewingItem(null); }}
          >
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className="bg-[var(--panel)] rounded-2xl shadow-xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto space-y-4"
            >
              {(() => {
                const cfg = ESTAGIO_CONFIG[viewingItem.estagio] || ESTAGIO_CONFIG.ideia;
                const resCfg = viewingItem.resultado ? RESULTADO_CONFIG[viewingItem.resultado] : null;
                const cap = captacoes.find((c) => c.id === viewingItem.oportunidade_captacao_id);
                return (
                  <>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${cfg.color}`}>{cfg.label}</span>
                        {resCfg && <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${resCfg.color}`}>{resCfg.label}</span>}
                      </div>
                      <button onClick={() => setViewingItem(null)} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-[var(--panel-2)] transition-colors cursor-pointer shrink-0">
                        <XMarkIcon className="w-5 h-5" />
                      </button>
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-[var(--text)] leading-snug">{viewingItem.titulo}</h3>
                      {cap && <p className="text-xs text-[var(--accent-1)] mt-1">Captação vinculada: {cap.titulo}</p>}
                    </div>
                    {viewingItem.descricao && (
                      <p className="text-sm text-[var(--text-dim)] leading-relaxed whitespace-pre-line border-t border-[var(--border)] pt-3">{viewingItem.descricao}</p>
                    )}
                    <div className="flex flex-col gap-1.5 text-xs text-slate-400 border-t border-[var(--border)] pt-3">
                      {viewingItem.responsavel && <span>Responsável: {viewingItem.responsavel}</span>}
                      {viewingItem.prazo && <span>Prazo: {fmtDate(viewingItem.prazo)}</span>}
                      {viewingItem.valor_pleiteado != null && <span className="font-semibold text-[var(--text-dim)]">Valor pleiteado: {fmtMoeda(viewingItem.valor_pleiteado)}</span>}
                    </div>
                  </>
                );
              })()}
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
              className="bg-[var(--panel)] rounded-2xl shadow-xl p-6 w-full max-w-sm space-y-4"
            >
              <h3 className="font-bold text-[var(--text)]">Excluir projeto?</h3>
              <p className="text-sm text-[var(--text-dim)]">Esta ação não pode ser desfeita.</p>
              <div className="flex gap-3 justify-end">
                <button onClick={() => setDeleteConfirmId(null)} className="px-4 py-2 rounded-lg border border-[var(--border)] text-sm text-[var(--text-dim)] hover:bg-[var(--panel-2)] cursor-pointer">Cancelar</button>
                <button onClick={() => handleDelete(deleteConfirmId)} className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm cursor-pointer">Excluir</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Form modal */}
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
              className="bg-[var(--panel)] rounded-2xl shadow-xl w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-base font-bold text-[var(--text)]">
                  {editingId ? "Editar Projeto" : "Novo Projeto"}
                </h3>
                <button onClick={closeForm} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-[var(--panel-2)] transition-colors cursor-pointer">
                  <XMarkIcon className="w-5 h-5" />
                </button>
              </div>
              <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2 flex flex-col gap-1">
                  <label className="text-xs font-semibold text-[var(--text-dim)] uppercase tracking-wider">Título *</label>
                  <input value={form.titulo} onChange={(e) => setForm((p) => ({ ...p, titulo: e.target.value }))} required className="px-3 py-2 rounded-lg border border-[var(--border)] text-sm bg-[var(--panel-2)] text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-[var(--text-dim)] uppercase tracking-wider">Estágio</label>
                  <select value={form.estagio} onChange={(e) => setForm((p) => ({ ...p, estagio: e.target.value }))} className="px-3 py-2 rounded-lg border border-[var(--border)] text-sm bg-[var(--panel-2)] text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-blue-500">
                    {ESTAGIOS.map((e) => <option key={e} value={e}>{ESTAGIO_CONFIG[e].label}</option>)}
                  </select>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-[var(--text-dim)] uppercase tracking-wider">Resultado</label>
                  <select value={form.resultado} onChange={(e) => setForm((p) => ({ ...p, resultado: e.target.value }))} className="px-3 py-2 rounded-lg border border-[var(--border)] text-sm bg-[var(--panel-2)] text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="">— Sem resultado ainda —</option>
                    {Object.entries(RESULTADO_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-[var(--text-dim)] uppercase tracking-wider">Responsável</label>
                  <input value={form.responsavel} onChange={(e) => setForm((p) => ({ ...p, responsavel: e.target.value }))} className="px-3 py-2 rounded-lg border border-[var(--border)] text-sm bg-[var(--panel-2)] text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-[var(--text-dim)] uppercase tracking-wider">Prazo</label>
                  <input type="date" value={form.prazo} onChange={(e) => setForm((p) => ({ ...p, prazo: e.target.value }))} className="px-3 py-2 rounded-lg border border-[var(--border)] text-sm bg-[var(--panel-2)] text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-[var(--text-dim)] uppercase tracking-wider">Valor pleiteado (R$)</label>
                  <input type="number" step="0.01" value={form.valor_pleiteado} onChange={(e) => setForm((p) => ({ ...p, valor_pleiteado: e.target.value }))} className="px-3 py-2 rounded-lg border border-[var(--border)] text-sm bg-[var(--panel-2)] text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>

                <div className="md:col-span-2 flex flex-col gap-1">
                  <label className="text-xs font-semibold text-[var(--text-dim)] uppercase tracking-wider">Oportunidade de captação vinculada</label>
                  <select value={form.oportunidade_captacao_id} onChange={(e) => setForm((p) => ({ ...p, oportunidade_captacao_id: e.target.value }))} className="px-3 py-2 rounded-lg border border-[var(--border)] text-sm bg-[var(--panel-2)] text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="">— Nenhuma —</option>
                    {captacoes.map((c) => <option key={c.id} value={String(c.id)}>{c.titulo}</option>)}
                  </select>
                </div>

                <div className="md:col-span-2 flex flex-col gap-1">
                  <label className="text-xs font-semibold text-[var(--text-dim)] uppercase tracking-wider">Descrição</label>
                  <textarea value={form.descricao} onChange={(e) => setForm((p) => ({ ...p, descricao: e.target.value }))} rows={3} className="px-3 py-2 rounded-lg border border-[var(--border)] text-sm bg-[var(--panel-2)] text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
                </div>

                <div className="md:col-span-2 flex items-center gap-3 pt-2">
                  {formError && <p className="text-sm text-red-600 flex-1">{formError}</p>}
                  <div className="flex gap-3 ml-auto">
                    <button type="button" onClick={closeForm} className="px-4 py-2 rounded-lg border border-[var(--border)] text-sm text-[var(--text-dim)] hover:bg-[var(--panel-2)] cursor-pointer">Cancelar</button>
                    <button type="submit" disabled={saving} className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium disabled:opacity-50 cursor-pointer">
                      {saving ? "Salvando..." : editingId ? "Salvar" : "Criar"}
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
