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
} from "@heroicons/react/24/outline";
import api from "../../services/api";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import { useEscapeKey } from "../../hooks/useEscapeKey";

const ESTAGIOS = ["oportunidade", "em_elaboracao", "enviado", "aprovado"];
const ESTAGIO_CONFIG = {
  oportunidade:   { label: "Oportunidade",   dot: "bg-slate-400",  color: "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300" },
  em_elaboracao:  { label: "Em elaboração",  dot: "bg-amber-500",  color: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
  enviado:        { label: "Enviado",         dot: "bg-blue-500",   color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
  aprovado:       { label: "Aprovado",        dot: "bg-green-500",  color: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
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
  const canEdit = user?.role === "ADMIN_MUNICIPIO";

  const [items, setItems] = useState([]);
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
      <h1 className="text-2xl font-extrabold tracking-tight text-slate-800 dark:text-slate-100">
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
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400">A captação de recursos é específica por município.</p>
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
          { label: "Total", value: kpis.total, color: "text-slate-700 dark:text-slate-100" },
          { label: "Valor potencial", value: fmtMoeda(kpis.valorTotal) || "—", color: "text-blue-600" },
          { label: "Aprovados", value: kpis.aprovados, color: "text-green-600" },
          { label: "Vencendo em 30 dias", value: kpis.vencendo, color: "text-amber-600" },
        ].map((k) => (
          <div key={k.label} className="bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 p-4">
            <p className="text-xs text-slate-400 uppercase tracking-wider">{k.label}</p>
            <p className={`text-2xl font-extrabold mt-1 ${k.color}`}>{k.value}</p>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex justify-end">
        {canEdit && (
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
      {items.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <p className="text-sm">Nenhuma oportunidade cadastrada ainda.</p>
          {canEdit && <p className="text-xs mt-1">Clique em "Nova Oportunidade" para começar.</p>}
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
                  <h3 className="font-semibold text-slate-600 dark:text-slate-300 text-sm">{cfg.label}</h3>
                  <span className="ml-auto text-xs text-slate-400 bg-slate-100 dark:bg-slate-700 px-2 py-0.5 rounded-full">{cols.length}</span>
                </div>
                <div className="space-y-3 min-h-[80px]">
                  {cols.map((item) => (
                    <div key={item.id} className="bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 p-4 space-y-2.5 hover:shadow-md transition-shadow">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <span className="inline-block text-[10px] font-medium text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 rounded mb-1">
                            {TIPO_LABEL[item.tipo] || item.tipo}
                          </span>
                          <h4 className="font-medium text-slate-700 dark:text-slate-200 text-sm leading-snug">{item.titulo}</h4>
                        </div>
                        {canEdit && (
                          <div className="flex gap-1 shrink-0">
                            <button onClick={() => openEdit(item)} className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/40 transition-colors cursor-pointer">
                              <PencilIcon className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => setDeleteConfirmId(item.id)} className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors cursor-pointer">
                              <TrashIcon className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </div>
                      <div className="flex flex-col gap-1 text-xs text-slate-400">
                        {item.entidade_origem && <span>{item.entidade_origem}</span>}
                        {item.valor_estimado && <span className="font-semibold text-slate-600 dark:text-slate-300">{fmtMoeda(item.valor_estimado)}</span>}
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
                      {canEdit && (
                        <div className="pt-1.5 border-t border-slate-50 dark:border-slate-700">
                          <select
                            value={item.estagio}
                            onChange={(e) => handleEstagioChange(item.id, e.target.value)}
                            className="w-full text-xs px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-600 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 cursor-pointer"
                          >
                            {ESTAGIOS.map((e) => <option key={e} value={e}>{ESTAGIO_CONFIG[e].label}</option>)}
                          </select>
                        </div>
                      )}
                    </div>
                  ))}
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
              <h3 className="font-bold text-slate-800 dark:text-slate-100">Excluir oportunidade?</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400">Esta ação não pode ser desfeita.</p>
              <div className="flex gap-3 justify-end">
                <button onClick={() => setDeleteConfirmId(null)} className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-600 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer">Cancelar</button>
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
              className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">
                  {editingId ? "Editar Oportunidade" : "Nova Oportunidade"}
                </h3>
                <button onClick={closeForm} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors cursor-pointer">
                  <XMarkIcon className="w-5 h-5" />
                </button>
              </div>
              <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2 flex flex-col gap-1">
                  <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Título *</label>
                  <input value={form.titulo} onChange={(e) => setForm((p) => ({ ...p, titulo: e.target.value }))} required className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 text-sm bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Tipo</label>
                  <select value={form.tipo} onChange={(e) => setForm((p) => ({ ...p, tipo: e.target.value }))} className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 text-sm bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500">
                    {TIPOS.map((t) => <option key={t} value={t}>{TIPO_LABEL[t]}</option>)}
                  </select>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Estágio</label>
                  <select value={form.estagio} onChange={(e) => setForm((p) => ({ ...p, estagio: e.target.value }))} className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 text-sm bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500">
                    {ESTAGIOS.map((e) => <option key={e} value={e}>{ESTAGIO_CONFIG[e].label}</option>)}
                  </select>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Entidade / Órgão</label>
                  <input value={form.entidade_origem} onChange={(e) => setForm((p) => ({ ...p, entidade_origem: e.target.value }))} className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 text-sm bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Valor estimado (R$)</label>
                  <input type="number" step="0.01" value={form.valor_estimado} onChange={(e) => setForm((p) => ({ ...p, valor_estimado: e.target.value }))} className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 text-sm bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Prazo</label>
                  <input type="date" value={form.prazo} onChange={(e) => setForm((p) => ({ ...p, prazo: e.target.value }))} className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 text-sm bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>

                <div className="md:col-span-2 flex flex-col gap-1">
                  <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Link do edital / convênio</label>
                  <input type="url" value={form.link} onChange={(e) => setForm((p) => ({ ...p, link: e.target.value }))} placeholder="https://" className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 text-sm bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>

                <div className="md:col-span-2 flex flex-col gap-1">
                  <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Descrição</label>
                  <textarea value={form.descricao} onChange={(e) => setForm((p) => ({ ...p, descricao: e.target.value }))} rows={3} className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 text-sm bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
                </div>

                <div className="md:col-span-2 flex items-center gap-3 pt-2">
                  {formError && <p className="text-sm text-red-600 flex-1">{formError}</p>}
                  <div className="flex gap-3 ml-auto">
                    <button type="button" onClick={closeForm} className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-600 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer">Cancelar</button>
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
