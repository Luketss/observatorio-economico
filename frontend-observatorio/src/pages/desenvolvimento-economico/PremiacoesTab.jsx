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
  TrophyIcon,
} from "@heroicons/react/24/outline";
import api from "../../services/api";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import { useEscapeKey } from "../../hooks/useEscapeKey";
import { usePermissao } from "../../hooks/usePermissao";
import NidDrawer from "../../components/nid/NidDrawer";
import MarkdownLite from "../../components/nid/MarkdownLite";
import { propsTituloClicavel } from "../../utils/cliqueAcessivel";

const STATUS_CONFIG = {
  oportunidade:   { label: "Oportunidade",    color: "bg-[var(--panel-2)] text-[var(--text-dim)]" },
  em_andamento:   { label: "Em andamento",    color: "bg-[var(--panel-2)] text-amber-400" },
  conquistado:    { label: "Conquistado",     color: "bg-[var(--panel-2)] text-green-400" },
  nao_participou: { label: "Não participou",  color: "bg-[var(--panel-2)] text-red-400" },
};

const TIPOS = ["premio", "ranking", "certificacao"];
const TIPO_LABEL = { premio: "Prêmio", ranking: "Ranking", certificacao: "Certificação" };

const defaultForm = {
  titulo: "",
  entidade: "",
  descricao: "",
  tipo: "premio",
  prazo: "",
  link: "",
  status: "oportunidade",
};

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

export default function PremiacoesTab() {
  const { user } = useAuth();
  const { addToast } = useToast();
  const isGlobal = user?.role === "ADMIN_GLOBAL";
  // ADMIN_GLOBAL não cria aqui: o registro nasce no município do usuário.
  const canCriar = usePermissao("premiacoes", "criar") && !isGlobal;
  const canEditar = usePermissao("premiacoes", "editar");
  const canExcluir = usePermissao("premiacoes", "excluir");

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(defaultForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);
  const [viewingItem, setViewingItem] = useState(null);

  useEscapeKey(useCallback(() => {
    if (deleteConfirmId) { setDeleteConfirmId(null); return; }
    if (viewingItem) { setViewingItem(null); return; }
    if (showForm) closeForm();
  }, [deleteConfirmId, viewingItem, showForm]));

  async function load() {
    try {
      const res = await api.get("/desenvolvimento-economico/premiacoes");
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
    conquistados: items.filter((i) => i.status === "conquistado").length,
    emAndamento: items.filter((i) => i.status === "em_andamento").length,
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
      titulo: item.titulo,
      entidade: item.entidade || "",
      descricao: item.descricao || "",
      tipo: item.tipo,
      prazo: item.prazo || "",
      link: item.link || "",
      status: item.status,
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
    const payload = { ...form, prazo: form.prazo || null, link: form.link || null };
    try {
      if (editingId) {
        await api.put(`/desenvolvimento-economico/premiacoes/${editingId}`, payload);
        addToast("Premiação atualizada", "success");
      } else {
        await api.post("/desenvolvimento-economico/premiacoes", payload);
        addToast("Premiação criada", "success");
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
      await api.put(`/desenvolvimento-economico/premiacoes/${id}`, { status: newStatus });
      addToast("Status atualizado", "success");
      await load();
    } catch {
      addToast("Erro ao atualizar status", "error");
    }
  }

  async function handleDelete(id) {
    try {
      await api.delete(`/desenvolvimento-economico/premiacoes/${id}`);
      setDeleteConfirmId(null);
      addToast("Premiação excluída", "success");
      await load();
    } catch {
      addToast("Erro ao excluir", "error");
    }
  }

  const header = (
    <div className="flex items-center gap-3">
      <TrophyIcon className="w-7 h-7 text-blue-600" />
      <h1 className="text-2xl font-extrabold tracking-tight text-[var(--text)]">
        Premiações
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
          <p className="text-sm font-medium text-[var(--text-dim)]">As premiações são específicas por município.</p>
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
          { label: "Conquistados", value: kpis.conquistados, color: "text-green-600" },
          { label: "Em andamento", value: kpis.emAndamento, color: "text-amber-600" },
          { label: "Prazo em 30 dias", value: kpis.vencendo, color: "text-red-500" },
        ].map((k) => (
          <div key={k.label} className="bg-[var(--panel)] rounded-xl border border-[var(--border)] p-4">
            <p className="text-xs text-slate-400 uppercase tracking-wider">{k.label}</p>
            <p className={`text-2xl font-extrabold mt-1 ${k.color}`}>{k.value}</p>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex justify-end">
        {canCriar && (
          <button
            onClick={openCreate}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-colors cursor-pointer"
          >
            <PlusIcon className="w-4 h-4" />
            Nova Premiação
          </button>
        )}
      </div>

      {/* Cards grid */}
      {items.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <p className="text-sm">Nenhuma premiação cadastrada ainda.</p>
          {canCriar && <p className="text-xs mt-1">Clique em "Nova Premiação" para começar.</p>}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {items.map((item) => {
            const st = STATUS_CONFIG[item.status] || STATUS_CONFIG.oportunidade;
            return (
              <div key={item.id} className="bg-[var(--panel)] rounded-xl border border-[var(--border)] p-4 space-y-3 hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap mb-1">
                      <span className="text-[10px] font-medium text-[var(--text-dim)] bg-[var(--panel-2)] px-1.5 py-0.5 rounded">
                        {TIPO_LABEL[item.tipo] || item.tipo}
                      </span>
                      <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${st.color}`}>{st.label}</span>
                    </div>
                    <h4
                      className="font-semibold text-[var(--text)] text-sm leading-snug line-clamp-2 cursor-pointer rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                      {...propsTituloClicavel(() => setViewingItem(item))}
                    >
                      {item.titulo}
                    </h4>
                    {item.entidade && <p className="text-xs text-slate-400 mt-0.5">{item.entidade}</p>}
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

                {item.descricao && (
                  <p
                    className="text-xs text-[var(--text-dim)] leading-relaxed line-clamp-3 cursor-pointer rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                    {...propsTituloClicavel(() => setViewingItem(item))}
                  >
                    {item.descricao}
                  </p>
                )}

                <div className="flex flex-col gap-1 text-xs text-slate-400">
                  {item.prazo && (
                    <span className={`flex items-center gap-1 ${isVencendoEm30(item.prazo) ? "text-amber-600 font-medium" : ""}`}>
                      <CalendarDaysIcon className="w-3.5 h-3.5" /> Prazo: {fmtDate(item.prazo)}
                    </span>
                  )}
                  {item.link && (
                    <a href={item.link} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-blue-500 hover:underline">
                      <LinkIcon className="w-3.5 h-3.5" /> Ver detalhes
                    </a>
                  )}
                </div>

                {canEditar && (
                  <div className="pt-1.5 border-t border-[var(--border)]">
                    <select
                      value={item.status}
                      onChange={(e) => handleStatusChange(item.id, e.target.value)}
                      className="w-full text-xs px-2 py-1.5 rounded-lg border border-[var(--border)] focus:outline-none focus:ring-1 focus:ring-blue-500 bg-[var(--panel-2)] text-[var(--text)] cursor-pointer"
                    >
                      {Object.entries(STATUS_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                    </select>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Detail drawer */}
      {(() => {
        const item = viewingItem;
        const st = item ? (STATUS_CONFIG[item.status] || STATUS_CONFIG.oportunidade) : null;
        return (
          <NidDrawer
            open={!!item}
            onClose={() => setViewingItem(null)}
            ariaLabel={item ? `Detalhes da premiação ${item.titulo}` : "Detalhes da premiação"}
          >
            {item && (
              <div className="space-y-4">
                <div className="flex items-center gap-1.5 flex-wrap pr-8">
                  <span className="text-[10px] font-medium text-[var(--text-dim)] bg-[var(--panel-2)] px-1.5 py-0.5 rounded">
                    {TIPO_LABEL[item.tipo] || item.tipo}
                  </span>
                  <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${st.color}`}>{st.label}</span>
                </div>
                <div>
                  <h2 className="text-lg font-bold text-[var(--text)] leading-snug">{item.titulo}</h2>
                  {item.entidade && <p className="text-xs text-slate-400 mt-1">{item.entidade}</p>}
                </div>
                {item.descricao && (
                  <div className="border-t border-[var(--border)] pt-3">
                    <MarkdownLite texto={item.descricao} />
                  </div>
                )}
                <div className="flex flex-col gap-1.5 text-xs text-slate-400 border-t border-[var(--border)] pt-3">
                  {item.prazo && (
                    <span className={`flex items-center gap-1 ${isVencendoEm30(item.prazo) ? "text-amber-600 font-medium" : ""}`}>
                      <CalendarDaysIcon className="w-3.5 h-3.5" /> Prazo: {fmtDate(item.prazo)}
                      {isVencendoEm30(item.prazo) && " · vence em até 30 dias"}
                    </span>
                  )}
                  {item.link && (
                    <a href={item.link} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-blue-500 hover:underline">
                      <LinkIcon className="w-3.5 h-3.5" /> Ver detalhes
                    </a>
                  )}
                </div>
              </div>
            )}
          </NidDrawer>
        );
      })()}

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
              <h3 className="font-bold text-[var(--text)]">Excluir premiação?</h3>
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
              className="bg-[var(--panel)] rounded-2xl shadow-xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-base font-bold text-[var(--text)]">
                  {editingId ? "Editar Premiação" : "Nova Premiação"}
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
                  <label className="text-xs font-semibold text-[var(--text-dim)] uppercase tracking-wider">Tipo</label>
                  <select value={form.tipo} onChange={(e) => setForm((p) => ({ ...p, tipo: e.target.value }))} className="px-3 py-2 rounded-lg border border-[var(--border)] text-sm bg-[var(--panel-2)] text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-blue-500">
                    {TIPOS.map((t) => <option key={t} value={t}>{TIPO_LABEL[t]}</option>)}
                  </select>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-[var(--text-dim)] uppercase tracking-wider">Status</label>
                  <select value={form.status} onChange={(e) => setForm((p) => ({ ...p, status: e.target.value }))} className="px-3 py-2 rounded-lg border border-[var(--border)] text-sm bg-[var(--panel-2)] text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-blue-500">
                    {Object.entries(STATUS_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>

                <div className="md:col-span-2 flex flex-col gap-1">
                  <label className="text-xs font-semibold text-[var(--text-dim)] uppercase tracking-wider">Entidade</label>
                  <input value={form.entidade} onChange={(e) => setForm((p) => ({ ...p, entidade: e.target.value }))} className="px-3 py-2 rounded-lg border border-[var(--border)] text-sm bg-[var(--panel-2)] text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-[var(--text-dim)] uppercase tracking-wider">Prazo</label>
                  <input type="date" value={form.prazo} onChange={(e) => setForm((p) => ({ ...p, prazo: e.target.value }))} className="px-3 py-2 rounded-lg border border-[var(--border)] text-sm bg-[var(--panel-2)] text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-[var(--text-dim)] uppercase tracking-wider">Link</label>
                  <input type="url" value={form.link} onChange={(e) => setForm((p) => ({ ...p, link: e.target.value }))} placeholder="https://" className="px-3 py-2 rounded-lg border border-[var(--border)] text-sm bg-[var(--panel-2)] text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>

                <div className="md:col-span-2 flex flex-col gap-1">
                  <label className="text-xs font-semibold text-[var(--text-dim)] uppercase tracking-wider">Descrição</label>
                  <textarea value={form.descricao} onChange={(e) => setForm((p) => ({ ...p, descricao: e.target.value }))} rows={3} placeholder="Aceita ## títulos, - listas e **negrito**" className="px-3 py-2 rounded-lg border border-[var(--border)] text-sm bg-[var(--panel-2)] text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
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
