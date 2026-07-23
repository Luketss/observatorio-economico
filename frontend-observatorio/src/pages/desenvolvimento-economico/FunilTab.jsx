import { useEffect, useState, useMemo, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  PlusIcon,
  XMarkIcon,
  PencilIcon,
  TrashIcon,
  CalendarDaysIcon,
  UserIcon,
  InformationCircleIcon,
  FunnelIcon,
} from "@heroicons/react/24/outline";
import NidFunnel from "../../components/nid/Funnel.jsx";
import api from "../../services/api";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import { useEscapeKey } from "../../hooks/useEscapeKey";
import { usePermissao } from "../../hooks/usePermissao";

const ESTAGIOS = ["lead", "contato", "negociacao", "implantacao"];
const ESTAGIO_CONFIG = {
  lead:        { label: "Lead",        color: "#94a3b8" },
  contato:     { label: "Contato",     color: "#60a5fa" },
  negociacao:  { label: "Negociação",  color: "#f59e0b" },
  implantacao: { label: "Implantação", color: "#22c55e" },
};

const defaultForm = {
  empresa_nome: "",
  setor: "",
  valor_estimado: "",
  estagio: "lead",
  responsavel: "",
  proxima_acao: "",
  proxima_acao_data: "",
  descricao: "",
};

function fmtMoeda(v) {
  if (!v) return "—";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", notation: "compact", maximumFractionDigits: 1 }).format(v);
}

function fmtDate(d) {
  if (!d) return null;
  return new Date(d + "T00:00:00").toLocaleDateString("pt-BR");
}

export default function FunilTab() {
  const { user } = useAuth();
  const { addToast } = useToast();
  const isGlobal = user?.role === "ADMIN_GLOBAL";
  // ADMIN_GLOBAL não cria aqui: o registro nasce no município do usuário.
  const canCriar = usePermissao("funil", "criar") && !isGlobal;
  const canEditar = usePermissao("funil", "editar");
  const canExcluir = usePermissao("funil", "excluir");

  const [items, setItems] = useState([]);
  const [resumo, setResumo] = useState(null);
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
      const [listRes, resumoRes] = await Promise.all([
        api.get("/desenvolvimento-economico/funil"),
        api.get("/desenvolvimento-economico/funil/resumo"),
      ]);
      setItems(listRes.data || []);
      setResumo(resumoRes.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const funnelStages = useMemo(() => {
    if (!resumo) return [];
    return ESTAGIOS.map((e) => ({
      key: e,
      label: ESTAGIO_CONFIG[e].label,
      value: resumo.por_estagio[e] || 0,
      color: ESTAGIO_CONFIG[e].color,
    }));
  }, [resumo]);

  function openCreate() {
    setEditingId(null);
    setForm(defaultForm);
    setFormError(null);
    setShowForm(true);
  }

  function openEdit(item) {
    setEditingId(item.id);
    setForm({
      empresa_nome: item.empresa_nome,
      setor: item.setor || "",
      valor_estimado: item.valor_estimado != null ? String(item.valor_estimado) : "",
      estagio: item.estagio,
      responsavel: item.responsavel || "",
      proxima_acao: item.proxima_acao || "",
      proxima_acao_data: item.proxima_acao_data || "",
      descricao: item.descricao || "",
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
      proxima_acao_data: form.proxima_acao_data || null,
    };
    try {
      if (editingId) {
        await api.put(`/desenvolvimento-economico/funil/${editingId}`, payload);
        addToast("Lead atualizado", "success");
      } else {
        await api.post("/desenvolvimento-economico/funil", payload);
        addToast("Lead criado com sucesso", "success");
      }
      closeForm();
      await load();
    } catch (err) {
      setFormError(err?.response?.data?.detail || "Erro ao salvar.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id) {
    try {
      await api.delete(`/desenvolvimento-economico/funil/${id}`);
      setDeleteConfirmId(null);
      addToast("Lead excluído", "success");
      await load();
    } catch {
      addToast("Erro ao excluir", "error");
    }
  }

  const header = (
    <div className="flex items-center gap-3">
      <FunnelIcon className="w-7 h-7 text-blue-600" />
      <h1 className="text-2xl font-extrabold tracking-tight text-[var(--text)]">
        Funil de Investimentos
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
          <p className="text-sm font-medium text-[var(--text-dim)]">O funil de investimentos é específico por município.</p>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="space-y-6">
      {header}
      {/* KPI row */}
      {resumo && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "Total de leads", value: items.length, color: "text-[var(--text)]" },
            { label: "Valor potencial", value: fmtMoeda(resumo.valor_total_estimado), color: "text-blue-600" },
            { label: "Taxa de conversão", value: `${resumo.taxa_conversao}%`, color: "text-green-600" },
            { label: "Em implantação", value: resumo.por_estagio?.implantacao || 0, color: "text-emerald-600" },
          ].map((k) => (
            <div key={k.label} className="bg-[var(--panel)] rounded-xl border border-[var(--border)] p-4">
              <p className="text-xs text-slate-400 uppercase tracking-wider">{k.label}</p>
              <p className={`text-2xl font-extrabold mt-1 ${k.color}`}>{k.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Toolbar */}
      <div className="flex justify-end">
        {canCriar && (
          <button
            onClick={openCreate}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-colors cursor-pointer"
          >
            <PlusIcon className="w-4 h-4" />
            Novo Lead
          </button>
        )}
      </div>

      {/* Funnel chart */}
      {funnelStages.some((d) => d.value > 0) && (
        <div className="bg-[var(--panel)] rounded-2xl border border-[var(--border)] p-6">
          <h3 className="text-sm font-semibold text-[var(--text-dim)] mb-4">Visão em Funil</h3>
          <NidFunnel stages={funnelStages} height={280} />
        </div>
      )}

      {/* Cards por estágio */}
      {ESTAGIOS.map((estagio) => {
        const cfg = ESTAGIO_CONFIG[estagio];
        const cols = items.filter((i) => i.estagio === estagio);
        if (cols.length === 0) return null;
        return (
          <div key={estagio} className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: cfg.color }} />
              <h3 className="font-semibold text-[var(--text-dim)] text-sm">{cfg.label}</h3>
              <span className="ml-auto text-xs text-slate-400 bg-[var(--panel-2)] px-2 py-0.5 rounded-full">{cols.length}</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {cols.map((item) => (
                <div key={item.id} className="bg-[var(--panel)] rounded-xl border border-[var(--border)] p-4 space-y-2.5 hover:shadow-md transition-shadow">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <h4 className="font-medium text-[var(--text)] text-sm leading-snug">{item.empresa_nome}</h4>
                      {item.setor && <p className="text-xs text-slate-400 mt-0.5">{item.setor}</p>}
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
                  <div className="flex flex-col gap-1 text-xs text-slate-400">
                    {item.valor_estimado && (
                      <span className="font-semibold text-[var(--text-dim)]">{fmtMoeda(item.valor_estimado)}</span>
                    )}
                    {item.responsavel && (
                      <span className="flex items-center gap-1"><UserIcon className="w-3.5 h-3.5" /> {item.responsavel}</span>
                    )}
                    {item.proxima_acao_data && (
                      <span className="flex items-center gap-1"><CalendarDaysIcon className="w-3.5 h-3.5" /> {fmtDate(item.proxima_acao_data)}</span>
                    )}
                    {item.proxima_acao && (
                      <span className="italic text-[var(--text-mute)]">{item.proxima_acao}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {items.length === 0 && (
        <div className="text-center py-16 text-slate-400">
          <p className="text-sm">Nenhum lead no funil ainda.</p>
          {canCriar && <p className="text-xs mt-1">Clique em "Novo Lead" para começar.</p>}
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
              className="bg-[var(--panel)] rounded-2xl shadow-xl p-6 w-full max-w-sm space-y-4"
            >
              <h3 className="font-bold text-[var(--text)]">Excluir lead?</h3>
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
                  {editingId ? "Editar Lead" : "Novo Lead"}
                </h3>
                <button onClick={closeForm} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-[var(--panel-2)] transition-colors cursor-pointer">
                  <XMarkIcon className="w-5 h-5" />
                </button>
              </div>
              <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[
                  { key: "empresa_nome", label: "Empresa *", required: true, full: true },
                ].map(({ key, label, required, full }) => (
                  <div key={key} className={`flex flex-col gap-1 ${full ? "md:col-span-2" : ""}`}>
                    <label className="text-xs font-semibold text-[var(--text-dim)] uppercase tracking-wider">{label}</label>
                    <input
                      value={form[key]}
                      onChange={(e) => setForm((p) => ({ ...p, [key]: e.target.value }))}
                      required={required}
                      className="px-3 py-2 rounded-lg border border-[var(--border)] text-sm bg-[var(--panel-2)] text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                ))}

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-[var(--text-dim)] uppercase tracking-wider">Setor</label>
                  <input value={form.setor} onChange={(e) => setForm((p) => ({ ...p, setor: e.target.value }))} placeholder="Ex.: Indústria, Comércio" className="px-3 py-2 rounded-lg border border-[var(--border)] text-sm bg-[var(--panel-2)] text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-[var(--text-dim)] uppercase tracking-wider">Valor estimado (R$)</label>
                  <input type="number" step="0.01" value={form.valor_estimado} onChange={(e) => setForm((p) => ({ ...p, valor_estimado: e.target.value }))} className="px-3 py-2 rounded-lg border border-[var(--border)] text-sm bg-[var(--panel-2)] text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-[var(--text-dim)] uppercase tracking-wider">Estágio</label>
                  <select value={form.estagio} onChange={(e) => setForm((p) => ({ ...p, estagio: e.target.value }))} className="px-3 py-2 rounded-lg border border-[var(--border)] text-sm bg-[var(--panel-2)] text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-blue-500">
                    {ESTAGIOS.map((e) => <option key={e} value={e}>{ESTAGIO_CONFIG[e].label}</option>)}
                  </select>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-[var(--text-dim)] uppercase tracking-wider">Responsável</label>
                  <input value={form.responsavel} onChange={(e) => setForm((p) => ({ ...p, responsavel: e.target.value }))} className="px-3 py-2 rounded-lg border border-[var(--border)] text-sm bg-[var(--panel-2)] text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-[var(--text-dim)] uppercase tracking-wider">Data da próxima ação</label>
                  <input type="date" value={form.proxima_acao_data} onChange={(e) => setForm((p) => ({ ...p, proxima_acao_data: e.target.value }))} className="px-3 py-2 rounded-lg border border-[var(--border)] text-sm bg-[var(--panel-2)] text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>

                <div className="md:col-span-2 flex flex-col gap-1">
                  <label className="text-xs font-semibold text-[var(--text-dim)] uppercase tracking-wider">Próxima ação</label>
                  <input value={form.proxima_acao} onChange={(e) => setForm((p) => ({ ...p, proxima_acao: e.target.value }))} placeholder="Descreva o próximo passo" className="px-3 py-2 rounded-lg border border-[var(--border)] text-sm bg-[var(--panel-2)] text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-blue-500" />
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
                      {saving ? "Salvando..." : editingId ? "Salvar" : "Criar Lead"}
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
