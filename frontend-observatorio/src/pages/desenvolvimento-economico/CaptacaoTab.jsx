import { useEffect, useState, useMemo, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  PlusIcon,
  XMarkIcon,
  PencilIcon,
  TrashIcon,
  LinkIcon,
  CalendarDaysIcon,
  InformationCircleIcon,
  BanknotesIcon,
  ViewColumnsIcon,
  TableCellsIcon,
} from "@heroicons/react/24/outline";
import api from "../../services/api";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import { useEscapeKey } from "../../hooks/useEscapeKey";
import { usePermissao } from "../../hooks/usePermissao";

const ESTAGIOS = ["oportunidade", "em_elaboracao", "enviado", "aprovado"];
const ESTAGIO_CONFIG = {
  oportunidade:   { label: "Oportunidade",   dot: "bg-slate-400",  color: "bg-[var(--panel-2)] text-[var(--text-dim)]" },
  em_elaboracao:  { label: "Em elaboração",  dot: "bg-amber-500",  color: "bg-[var(--panel-2)] text-amber-400" },
  enviado:        { label: "Enviado",         dot: "bg-blue-500",   color: "bg-[var(--panel-2)] text-blue-400" },
  aprovado:       { label: "Aprovado",        dot: "bg-green-500",  color: "bg-[var(--panel-2)] text-green-400" },
};

const TIPOS = ["edital", "convenio", "emenda", "outro"];
const TIPO_LABEL = { edital: "Edital", convenio: "Convênio", emenda: "Emenda", outro: "Outro" };

const defaultForm = {
  tipo: "edital",
  titulo: "",
  entidade_origem: "",
  valor_estimado: "",
  prazo: "",
  estagio: "oportunidade",
  descricao: "",
  link: "",
};

function fmtMoeda(v) {
  if (!v) return null;
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", notation: "compact", maximumFractionDigits: 1 }).format(v);
}

function fmtDate(d) {
  if (!d) return null;
  return new Date(d + "T00:00:00").toLocaleDateString("pt-BR");
}

function isVencendoEm30(prazo) {
  if (!prazo) return false;
  const d = new Date(prazo + "T00:00:00");
  const diff = (d - new Date()) / (1000 * 60 * 60 * 24);
  return diff >= 0 && diff <= 30;
}

export default function CaptacaoTab() {
  const { user } = useAuth();
  const { addToast } = useToast();
  const isGlobal = user?.role === "ADMIN_GLOBAL";
  // ADMIN_GLOBAL não cria aqui: o registro nasce no município do usuário.
  const canCriar = usePermissao("captacao", "criar") && !isGlobal;
  const canEditar = usePermissao("captacao", "editar");
  const canExcluir = usePermissao("captacao", "excluir");

  const [items, setItems] = useState([]);
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
      const res = await api.get("/desenvolvimento-economico/captacao");
      setItems(res.data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const kpis = useMemo(() => ({
    total: items.length,
    valorTotal: items.reduce((s, i) => s + (i.valor_estimado || 0), 0),
    aprovados: items.filter((i) => i.estagio === "aprovado").length,
    vencendo: items.filter((i) => isVencendoEm30(i.prazo)).length,
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
      tipo: item.tipo,
      titulo: item.titulo,
      entidade_origem: item.entidade_origem || "",
      valor_estimado: item.valor_estimado != null ? String(item.valor_estimado) : "",
      prazo: item.prazo || "",
      estagio: item.estagio,
      descricao: item.descricao || "",
      link: item.link || "",
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
      valor_estimado: form.valor_estimado ? Number(form.valor_estimado) : null,
      prazo: form.prazo || null,
      link: form.link || null,
    };
    try {
      if (editingId) {
        await api.put(`/desenvolvimento-economico/captacao/${editingId}`, payload);
        addToast("Oportunidade atualizada", "success");
      } else {
        await api.post("/desenvolvimento-economico/captacao", payload);
        addToast("Oportunidade criada", "success");
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
      await api.put(`/desenvolvimento-economico/captacao/${id}`, { estagio: newEstagio });
      addToast("Estágio atualizado", "success");
      await load();
    } catch {
      addToast("Erro ao atualizar estágio", "error");
    }
  }

  async function handleDelete(id) {
    try {
      await api.delete(`/desenvolvimento-economico/captacao/${id}`);
      setDeleteConfirmId(null);
      addToast("Oportunidade excluída", "success");
      await load();
    } catch {
      addToast("Erro ao excluir", "error");
    }
  }

  const header = (
    <div className="flex items-center gap-3">
      <BanknotesIcon className="w-7 h-7 text-blue-600" />
      <h1 className="text-2xl font-extrabold tracking-tight text-[var(--text)]">
        Captação de Recursos
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
          <p className="text-sm font-medium text-[var(--text-dim)]">A captação de recursos é específica por município.</p>
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
          { label: "Total", value: kpis.total, color: "text-[var(--text)]" },
          { label: "Valor potencial", value: fmtMoeda(kpis.valorTotal) || "—", color: "text-blue-600" },
          { label: "Aprovados", value: kpis.aprovados, color: "text-green-600" },
          { label: "Vencendo em 30 dias", value: kpis.vencendo, color: "text-amber-600" },
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
            Nova Oportunidade
          </button>
        )}
      </div>

      {/* Kanban board */}
      {viewMode === "kanban" && (
      <>
      {items.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <p className="text-sm">Nenhuma oportunidade cadastrada ainda.</p>
          {canCriar && <p className="text-xs mt-1">Clique em "Nova Oportunidade" para começar.</p>}
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
                  <span className="ml-auto text-xs text-[var(--text-mute)] bg-[var(--panel-2)] px-2 py-0.5 rounded-full">{cols.length}</span>
                </div>
                <div className="space-y-3 min-h-[80px]">
                  {cols.map((item) => (
                    <div key={item.id} className="bg-[var(--panel)] rounded-xl border border-[var(--border)] p-4 space-y-2.5 hover:shadow-md transition-shadow">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <span className="inline-block text-[10px] font-medium text-[var(--text-dim)] bg-[var(--panel-2)] px-1.5 py-0.5 rounded mb-1">
                            {TIPO_LABEL[item.tipo] || item.tipo}
                          </span>
                          <h4 className="font-medium text-[var(--text)] text-sm leading-snug cursor-pointer" onClick={() => setViewingItem(item)}>{item.titulo}</h4>
                        </div>
                        {(canEditar || canExcluir) && (
                          <div className="flex gap-1 shrink-0">
                            {canEditar && (
                              <button onClick={() => openEdit(item)} className="p-1.5 rounded-lg text-[var(--text-mute)] hover:text-blue-500 hover:bg-[var(--panel-2)] transition-colors cursor-pointer">
                                <PencilIcon className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {canExcluir && (
                              <button onClick={() => setDeleteConfirmId(item.id)} className="p-1.5 rounded-lg text-[var(--text-mute)] hover:text-red-400 hover:bg-[var(--panel-2)] transition-colors cursor-pointer">
                                <TrashIcon className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="flex flex-col gap-1 text-xs text-slate-400">
                        {item.entidade_origem && <span>{item.entidade_origem}</span>}
                        {item.valor_estimado && <span className="font-semibold text-[var(--text-dim)]">{fmtMoeda(item.valor_estimado)}</span>}
                        {item.prazo && (
                          <span className={`flex items-center gap-1 ${isVencendoEm30(item.prazo) ? "text-amber-600 font-medium" : ""}`}>
                            <CalendarDaysIcon className="w-3.5 h-3.5" /> {fmtDate(item.prazo)}
                          </span>
                        )}
                        {item.link && (
                          <a href={item.link} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-blue-500 hover:underline">
                            <LinkIcon className="w-3.5 h-3.5" /> Ver edital
                          </a>
                        )}
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
                  ))}
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
                <th className="px-4 py-2.5">Tipo</th>
                <th className="px-4 py-2.5">Entidade</th>
                <th className="px-4 py-2.5">Valor</th>
                <th className="px-4 py-2.5">Prazo</th>
                <th className="px-4 py-2.5">Estágio</th>
                {(canEditar || canExcluir) && <th className="px-4 py-2.5" />}
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-sm text-slate-400">Nenhuma oportunidade cadastrada ainda.</td></tr>
              ) : (
                items.map((item) => {
                  const cfg = ESTAGIO_CONFIG[item.estagio] || ESTAGIO_CONFIG.oportunidade;
                  return (
                    <tr key={item.id} className="border-t border-[var(--border)]">
                      <td className="px-4 py-2.5 font-medium text-[var(--text)] cursor-pointer" onClick={() => setViewingItem(item)}>{item.titulo}</td>
                      <td className="px-4 py-2.5 text-xs text-[var(--text-dim)]">{TIPO_LABEL[item.tipo] || item.tipo}</td>
                      <td className="px-4 py-2.5 text-xs text-[var(--text-dim)]">{item.entidade_origem || "—"}</td>
                      <td className="px-4 py-2.5 text-xs text-[var(--text-dim)]">{fmtMoeda(item.valor_estimado) || "—"}</td>
                      <td className={`px-4 py-2.5 text-xs ${isVencendoEm30(item.prazo) ? "text-amber-600 font-medium" : "text-[var(--text-mute)]"}`}>{fmtDate(item.prazo) || "—"}</td>
                      <td className="px-4 py-2.5"><span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${cfg.color}`}>{cfg.label}</span></td>
                      {(canEditar || canExcluir) && (
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-1 justify-end">
                            {canEditar && (
                              <button onClick={() => openEdit(item)} className="p-1.5 rounded-lg text-[var(--text-mute)] hover:text-blue-500 hover:bg-[var(--panel-2)] transition-colors cursor-pointer"><PencilIcon className="w-3.5 h-3.5" /></button>
                            )}
                            {canExcluir && (
                              <button onClick={() => setDeleteConfirmId(item.id)} className="p-1.5 rounded-lg text-[var(--text-mute)] hover:text-red-400 hover:bg-[var(--panel-2)] transition-colors cursor-pointer"><TrashIcon className="w-3.5 h-3.5" /></button>
                            )}
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
                const cfg = ESTAGIO_CONFIG[viewingItem.estagio] || ESTAGIO_CONFIG.oportunidade;
                return (
                  <>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[10px] font-medium text-[var(--text-dim)] bg-[var(--panel-2)] px-1.5 py-0.5 rounded">{TIPO_LABEL[viewingItem.tipo] || viewingItem.tipo}</span>
                        <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${cfg.color}`}>{cfg.label}</span>
                      </div>
                      <button onClick={() => setViewingItem(null)} className="p-1.5 rounded-lg text-[var(--text-mute)] hover:text-[var(--text)] hover:bg-[var(--panel-2)] transition-colors cursor-pointer shrink-0">
                        <XMarkIcon className="w-5 h-5" />
                      </button>
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-[var(--text)] leading-snug">{viewingItem.titulo}</h3>
                      {viewingItem.entidade_origem && <p className="text-xs text-slate-400 mt-1">{viewingItem.entidade_origem}</p>}
                    </div>
                    {viewingItem.descricao && (
                      <p className="text-sm text-[var(--text-dim)] leading-relaxed whitespace-pre-line border-t border-[var(--border)] pt-3">{viewingItem.descricao}</p>
                    )}
                    <div className="flex flex-col gap-1.5 text-xs text-slate-400 border-t border-[var(--border)] pt-3">
                      {viewingItem.valor_estimado != null && <span className="font-semibold text-[var(--text-dim)]">Valor estimado: {fmtMoeda(viewingItem.valor_estimado)}</span>}
                      {viewingItem.prazo && (
                        <span className={`flex items-center gap-1 ${isVencendoEm30(viewingItem.prazo) ? "text-amber-600 font-medium" : ""}`}>
                          <CalendarDaysIcon className="w-3.5 h-3.5" /> Prazo: {fmtDate(viewingItem.prazo)}
                          {isVencendoEm30(viewingItem.prazo) && " · vence em até 30 dias"}
                        </span>
                      )}
                      {viewingItem.link && (
                        <a href={viewingItem.link} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-blue-500 hover:underline"><LinkIcon className="w-3.5 h-3.5" /> Ver edital</a>
                      )}
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
              <h3 className="font-bold text-[var(--text)]">Excluir oportunidade?</h3>
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
                  {editingId ? "Editar Oportunidade" : "Nova Oportunidade"}
                </h3>
                <button onClick={closeForm} className="p-1.5 rounded-lg text-[var(--text-mute)] hover:text-[var(--text)] hover:bg-[var(--panel-2)] transition-colors cursor-pointer">
                  <XMarkIcon className="w-5 h-5" />
                </button>
              </div>
              <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2 flex flex-col gap-1">
                  <label className="text-xs font-semibold text-[var(--text-dim)] uppercase tracking-wider">Título *</label>
                  <input value={form.titulo} onChange={(e) => setForm((p) => ({ ...p, titulo: e.target.value }))} required className="px-3 py-2 rounded-lg border border-[var(--border)] text-sm bg-[var(--panel-2)] text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-[var(--text-dim)] uppercase tracking-wider">Tipo</label>
                  <select value={form.tipo} onChange={(e) => setForm((p) => ({ ...p, tipo: e.target.value }))} className="px-3 py-2 rounded-lg border border-[var(--border)] text-sm bg-[var(--panel-2)] text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-blue-500">
                    {TIPOS.map((t) => <option key={t} value={t}>{TIPO_LABEL[t]}</option>)}
                  </select>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-[var(--text-dim)] uppercase tracking-wider">Estágio</label>
                  <select value={form.estagio} onChange={(e) => setForm((p) => ({ ...p, estagio: e.target.value }))} className="px-3 py-2 rounded-lg border border-[var(--border)] text-sm bg-[var(--panel-2)] text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-blue-500">
                    {ESTAGIOS.map((e) => <option key={e} value={e}>{ESTAGIO_CONFIG[e].label}</option>)}
                  </select>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-[var(--text-dim)] uppercase tracking-wider">Entidade / Órgão</label>
                  <input value={form.entidade_origem} onChange={(e) => setForm((p) => ({ ...p, entidade_origem: e.target.value }))} className="px-3 py-2 rounded-lg border border-[var(--border)] text-sm bg-[var(--panel-2)] text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-[var(--text-dim)] uppercase tracking-wider">Valor estimado (R$)</label>
                  <input type="number" step="0.01" value={form.valor_estimado} onChange={(e) => setForm((p) => ({ ...p, valor_estimado: e.target.value }))} className="px-3 py-2 rounded-lg border border-[var(--border)] text-sm bg-[var(--panel-2)] text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-[var(--text-dim)] uppercase tracking-wider">Prazo</label>
                  <input type="date" value={form.prazo} onChange={(e) => setForm((p) => ({ ...p, prazo: e.target.value }))} className="px-3 py-2 rounded-lg border border-[var(--border)] text-sm bg-[var(--panel-2)] text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>

                <div className="md:col-span-2 flex flex-col gap-1">
                  <label className="text-xs font-semibold text-[var(--text-dim)] uppercase tracking-wider">Link do edital / convênio</label>
                  <input type="url" value={form.link} onChange={(e) => setForm((p) => ({ ...p, link: e.target.value }))} placeholder="https://" className="px-3 py-2 rounded-lg border border-[var(--border)] text-sm bg-[var(--panel-2)] text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-blue-500" />
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
