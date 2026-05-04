import { useEffect, useState, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  PlusIcon,
  XMarkIcon,
  PencilIcon,
  TrashIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  CameraIcon,
  InformationCircleIcon,
} from "@heroicons/react/24/outline";
import api from "../../services/api";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import { useEscapeKey } from "../../hooks/useEscapeKey";

const RISCO_CONFIG = {
  baixo:  { label: "Risco baixo",  color: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
  medio:  { label: "Risco médio",  color: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
  alto:   { label: "Risco alto",   color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
};

const EXPANSAO_CONFIG = {
  baixo:  { label: "Expansão baixa",  color: "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300" },
  medio:  { label: "Expansão média",  color: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
  alto:   { label: "Expansão alta",   color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
};

const defaultForm = {
  nome: "",
  cnpj: "",
  setor: "",
  num_empregos: "",
  status_risco: "baixo",
  potencial_expansao: "baixo",
  responsavel: "",
};

const defaultVisitaForm = {
  data_visita: "",
  responsavel: "",
  observacoes: "",
  foto_base64: "",
};

function fmtDate(d) {
  if (!d) return "";
  return new Date(d + "T00:00:00").toLocaleDateString("pt-BR");
}

export default function RetencaoTab() {
  const { user } = useAuth();
  const { addToast } = useToast();
  const isGlobal = user?.role === "ADMIN_GLOBAL";
  const canEdit = user?.role === "ADMIN_MUNICIPIO";

  const [empresas, setEmpresas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState(null);
  const [detalhe, setDetalhe] = useState({});

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(defaultForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);

  const [visitaForm, setVisitaForm] = useState(defaultVisitaForm);
  const [savingVisita, setSavingVisita] = useState(false);
  const [deletingVisitaId, setDeletingVisitaId] = useState(null);

  useEscapeKey(useCallback(() => {
    if (deleteConfirmId) { setDeleteConfirmId(null); return; }
    if (showForm) closeForm();
  }, [deleteConfirmId, showForm]));

  async function load() {
    try {
      const res = await api.get("/desenvolvimento-economico/retencao");
      setEmpresas(res.data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function loadDetalhe(id) {
    try {
      const res = await api.get(`/desenvolvimento-economico/retencao/${id}`);
      setDetalhe((prev) => ({ ...prev, [id]: res.data }));
    } catch (err) {
      console.error(err);
    }
  }

  useEffect(() => { load(); }, []);

  async function toggleExpand(id) {
    if (expandedId === id) {
      setExpandedId(null);
    } else {
      setExpandedId(id);
      if (!detalhe[id]) await loadDetalhe(id);
    }
  }

  function openCreate() {
    setEditingId(null);
    setForm(defaultForm);
    setFormError(null);
    setShowForm(true);
  }

  function openEdit(e) {
    setEditingId(e.id);
    setForm({
      nome: e.nome,
      cnpj: e.cnpj || "",
      setor: e.setor || "",
      num_empregos: e.num_empregos != null ? String(e.num_empregos) : "",
      status_risco: e.status_risco,
      potencial_expansao: e.potencial_expansao,
      responsavel: e.responsavel || "",
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
    const payload = { ...form, num_empregos: form.num_empregos ? Number(form.num_empregos) : null };
    try {
      if (editingId) {
        await api.put(`/desenvolvimento-economico/retencao/${editingId}`, payload);
        addToast("Empresa atualizada", "success");
      } else {
        await api.post("/desenvolvimento-economico/retencao", payload);
        addToast("Empresa adicionada", "success");
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
      await api.delete(`/desenvolvimento-economico/retencao/${id}`);
      setDeleteConfirmId(null);
      setExpandedId(null);
      setDetalhe((prev) => { const n = { ...prev }; delete n[id]; return n; });
      addToast("Empresa removida", "success");
      await load();
    } catch {
      addToast("Erro ao excluir", "error");
    }
  }

  function handleFotoChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setVisitaForm((p) => ({ ...p, foto_base64: ev.target.result }));
    };
    reader.readAsDataURL(file);
  }

  async function handleAddVisita(empresaId) {
    if (!visitaForm.data_visita) { addToast("Informe a data da visita", "error"); return; }
    setSavingVisita(true);
    try {
      await api.post(`/desenvolvimento-economico/retencao/${empresaId}/visitas`, {
        ...visitaForm,
        foto_base64: visitaForm.foto_base64 || null,
      });
      addToast("Visita registrada", "success");
      setVisitaForm(defaultVisitaForm);
      await loadDetalhe(empresaId);
    } catch {
      addToast("Erro ao registrar visita", "error");
    } finally {
      setSavingVisita(false);
    }
  }

  async function handleDeleteVisita(visita, empresaId) {
    setDeletingVisitaId(visita.id);
    try {
      await api.delete(`/desenvolvimento-economico/retencao/visitas/${visita.id}`);
      addToast("Visita removida", "success");
      await loadDetalhe(empresaId);
    } catch {
      addToast("Erro ao remover visita", "error");
    } finally {
      setDeletingVisitaId(null);
    }
  }

  const kpis = {
    total: empresas.length,
    altoRisco: empresas.filter((e) => e.status_risco === "alto").length,
    altoExpansao: empresas.filter((e) => e.potencial_expansao === "alto").length,
    totalEmpregos: empresas.reduce((s, e) => s + (e.num_empregos || 0), 0),
  };

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
        <p className="text-sm font-medium text-slate-500 dark:text-slate-400">A retenção de empresas é específica por município.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total de empresas", value: kpis.total, color: "text-slate-700 dark:text-slate-100" },
          { label: "Alto risco", value: kpis.altoRisco, color: "text-red-600" },
          { label: "Alto potencial", value: kpis.altoExpansao, color: "text-blue-600" },
          { label: "Total empregos", value: kpis.totalEmpregos.toLocaleString("pt-BR"), color: "text-green-600" },
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
            Nova Empresa
          </button>
        )}
      </div>

      {/* Company cards */}
      {empresas.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <p className="text-sm">Nenhuma empresa monitorada ainda.</p>
          {canEdit && <p className="text-xs mt-1">Clique em "Nova Empresa" para começar.</p>}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {empresas.map((empresa) => {
            const risco = RISCO_CONFIG[empresa.status_risco] || RISCO_CONFIG.baixo;
            const expansao = EXPANSAO_CONFIG[empresa.potencial_expansao] || EXPANSAO_CONFIG.baixo;
            const isExpanded = expandedId === empresa.id;
            const det = detalhe[empresa.id];
            return (
              <div key={empresa.id} className="bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 overflow-hidden">
                {/* Card header */}
                <div className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <h4 className="font-semibold text-slate-700 dark:text-slate-200 text-sm leading-snug">{empresa.nome}</h4>
                      {empresa.setor && <p className="text-xs text-slate-400 mt-0.5">{empresa.setor}</p>}
                    </div>
                    {canEdit && (
                      <div className="flex gap-1 shrink-0">
                        <button onClick={() => openEdit(empresa)} className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/40 transition-colors cursor-pointer">
                          <PencilIcon className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => setDeleteConfirmId(empresa.id)} className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors cursor-pointer">
                          <TrashIcon className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${risco.color}`}>{risco.label}</span>
                    <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${expansao.color}`}>{expansao.label}</span>
                  </div>

                  {empresa.num_empregos != null && (
                    <p className="text-xs text-slate-400">{empresa.num_empregos.toLocaleString("pt-BR")} emprego(s)</p>
                  )}

                  <button
                    onClick={() => toggleExpand(empresa.id)}
                    className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium cursor-pointer"
                  >
                    {isExpanded ? <ChevronUpIcon className="w-3.5 h-3.5" /> : <ChevronDownIcon className="w-3.5 h-3.5" />}
                    {isExpanded ? "Ocultar" : "Ver"} histórico de visitas
                  </button>
                </div>

                {/* Expanded visit timeline */}
                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="border-t border-slate-100 dark:border-slate-700 overflow-hidden"
                    >
                      <div className="p-4 space-y-4">
                        {/* Visit list */}
                        {det ? (
                          det.visitas.length === 0 ? (
                            <p className="text-xs text-slate-400 text-center py-2">Nenhuma visita registrada.</p>
                          ) : (
                            <div className="space-y-3">
                              {det.visitas.map((v) => (
                                <div key={v.id} className="flex gap-3">
                                  <div className="flex flex-col items-center">
                                    <div className="w-2 h-2 rounded-full bg-blue-500 mt-1 shrink-0" />
                                    <div className="w-px flex-1 bg-slate-100 dark:bg-slate-700 mt-1" />
                                  </div>
                                  <div className="flex-1 pb-2 space-y-1">
                                    <div className="flex items-center justify-between gap-2">
                                      <p className="text-xs font-medium text-slate-600 dark:text-slate-300">{fmtDate(v.data_visita)}</p>
                                      {canEdit && (
                                        <button
                                          onClick={() => handleDeleteVisita(v, empresa.id)}
                                          disabled={deletingVisitaId === v.id}
                                          className="p-1 rounded text-slate-300 hover:text-red-500 transition-colors cursor-pointer"
                                        >
                                          <TrashIcon className="w-3 h-3" />
                                        </button>
                                      )}
                                    </div>
                                    {v.responsavel && <p className="text-xs text-slate-400">{v.responsavel}</p>}
                                    {v.observacoes && <p className="text-xs text-slate-500 dark:text-slate-400">{v.observacoes}</p>}
                                    {v.foto_base64 && (
                                      <img src={v.foto_base64} alt="Foto da visita" className="w-16 h-16 object-cover rounded mt-1" />
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )
                        ) : (
                          <div className="flex justify-center py-2">
                            <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                          </div>
                        )}

                        {/* Add visit form */}
                        {canEdit && (
                          <div className="border-t border-slate-100 dark:border-slate-700 pt-3 space-y-2">
                            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Registrar nova visita</p>
                            <input
                              type="date"
                              value={visitaForm.data_visita}
                              onChange={(e) => setVisitaForm((p) => ({ ...p, data_visita: e.target.value }))}
                              className="w-full px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-600 text-xs bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
                            />
                            <input
                              value={visitaForm.responsavel}
                              onChange={(e) => setVisitaForm((p) => ({ ...p, responsavel: e.target.value }))}
                              placeholder="Responsável"
                              className="w-full px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-600 text-xs bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
                            />
                            <textarea
                              value={visitaForm.observacoes}
                              onChange={(e) => setVisitaForm((p) => ({ ...p, observacoes: e.target.value }))}
                              placeholder="Observações"
                              rows={2}
                              className="w-full px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-600 text-xs bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
                            />
                            <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-400 hover:text-slate-600">
                              <CameraIcon className="w-4 h-4" />
                              {visitaForm.foto_base64 ? "Foto selecionada ✓" : "Adicionar foto"}
                              <input type="file" accept="image/*" className="hidden" onChange={handleFotoChange} />
                            </label>
                            <button
                              onClick={() => handleAddVisita(empresa.id)}
                              disabled={savingVisita}
                              className="w-full py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium disabled:opacity-50 cursor-pointer"
                            >
                              {savingVisita ? "Registrando..." : "Registrar visita"}
                            </button>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
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
              <h3 className="font-bold text-slate-800 dark:text-slate-100">Excluir empresa?</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400">Todas as visitas também serão removidas.</p>
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
              className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">
                  {editingId ? "Editar Empresa" : "Nova Empresa"}
                </h3>
                <button onClick={closeForm} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors cursor-pointer">
                  <XMarkIcon className="w-5 h-5" />
                </button>
              </div>
              <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2 flex flex-col gap-1">
                  <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Nome *</label>
                  <input value={form.nome} onChange={(e) => setForm((p) => ({ ...p, nome: e.target.value }))} required className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 text-sm bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">CNPJ</label>
                  <input value={form.cnpj} onChange={(e) => setForm((p) => ({ ...p, cnpj: e.target.value }))} placeholder="00.000.000/0001-00" className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 text-sm bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Setor</label>
                  <input value={form.setor} onChange={(e) => setForm((p) => ({ ...p, setor: e.target.value }))} className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 text-sm bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Empregos</label>
                  <input type="number" value={form.num_empregos} onChange={(e) => setForm((p) => ({ ...p, num_empregos: e.target.value }))} className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 text-sm bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Risco de saída</label>
                  <select value={form.status_risco} onChange={(e) => setForm((p) => ({ ...p, status_risco: e.target.value }))} className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 text-sm bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500">
                    {Object.entries(RISCO_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Potencial de expansão</label>
                  <select value={form.potencial_expansao} onChange={(e) => setForm((p) => ({ ...p, potencial_expansao: e.target.value }))} className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 text-sm bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500">
                    {Object.entries(EXPANSAO_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>

                <div className="md:col-span-2 flex flex-col gap-1">
                  <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Responsável</label>
                  <input value={form.responsavel} onChange={(e) => setForm((p) => ({ ...p, responsavel: e.target.value }))} className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 text-sm bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>

                <div className="md:col-span-2 flex items-center gap-3 pt-2">
                  {formError && <p className="text-sm text-red-600 flex-1">{formError}</p>}
                  <div className="flex gap-3 ml-auto">
                    <button type="button" onClick={closeForm} className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-600 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer">Cancelar</button>
                    <button type="submit" disabled={saving} className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium disabled:opacity-50 cursor-pointer">
                      {saving ? "Salvando..." : editingId ? "Salvar" : "Adicionar"}
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
