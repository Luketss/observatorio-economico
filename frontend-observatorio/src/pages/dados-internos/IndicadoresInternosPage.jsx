import { useEffect, useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChartPieIcon,
  PlusIcon,
  XMarkIcon,
  PencilIcon,
  TrashIcon,
  ChevronDownIcon,
  ChevronRightIcon,
} from "@heroicons/react/24/outline";
import api from "../../services/api";
import { useAuth } from "../../context/AuthContext";

const defaultForm = {
  area: "", nome_metrica: "", valor: "", unidade: "",
  periodo_tipo: "anual", periodo_ano: new Date().getFullYear(), periodo_mes: "",
  fonte: "", observacoes: "",
};

export default function IndicadoresInternosPage() {
  const { user } = useAuth();
  const canEdit = user?.role === "ADMIN_GLOBAL" || user?.role === "ADMIN_MUNICIPIO";

  const [indicadores, setIndicadores] = useState([]);
  const [areasExistentes, setAreasExistentes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(defaultForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);
  const [openAreas, setOpenAreas] = useState(new Set());

  async function load() {
    try {
      const res = await api.get("/dados_internos/indicadores");
      const data = res.data || [];
      setIndicadores(data);
      const areas = [...new Set(data.map((d) => d.area))].sort();
      setAreasExistentes(areas);
      setOpenAreas(new Set(areas));
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const grouped = useMemo(() => {
    const map = {};
    indicadores.forEach((d) => {
      if (!map[d.area]) map[d.area] = [];
      map[d.area].push(d);
    });
    return map;
  }, [indicadores]);

  const kpis = { total: indicadores.length, areas: Object.keys(grouped).length };

  function openCreate() {
    setEditingId(null);
    setForm(defaultForm);
    setFormError(null);
    setShowForm(true);
  }

  function openEdit(ind) {
    setEditingId(ind.id);
    setForm({
      area: ind.area, nome_metrica: ind.nome_metrica,
      valor: ind.valor, unidade: ind.unidade,
      periodo_tipo: ind.periodo_tipo, periodo_ano: ind.periodo_ano,
      periodo_mes: ind.periodo_mes || "",
      fonte: ind.fonte || "", observacoes: ind.observacoes || "",
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
      valor: Number(form.valor),
      periodo_ano: Number(form.periodo_ano),
      periodo_mes: form.periodo_tipo === "mensal" && form.periodo_mes ? Number(form.periodo_mes) : null,
    };
    try {
      if (editingId) {
        await api.put(`/dados_internos/indicadores/${editingId}`, payload);
      } else {
        await api.post("/dados_internos/indicadores", payload);
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
      await api.delete(`/dados_internos/indicadores/${id}`);
      setDeleteConfirmId(null);
      await load();
    } catch (err) {
      console.error(err);
    }
  }

  function toggleArea(area) {
    setOpenAreas((prev) => {
      const next = new Set(prev);
      next.has(area) ? next.delete(area) : next.add(area);
      return next;
    });
  }

  function fmtPeriodo(ind) {
    if (ind.periodo_tipo === "mensal" && ind.periodo_mes) {
      const meses = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
      return `${meses[ind.periodo_mes - 1]}/${ind.periodo_ano}`;
    }
    return String(ind.periodo_ano);
  }

  if (loading) return <div className="flex justify-center py-20"><div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="space-y-8">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ChartPieIcon className="w-7 h-7 text-blue-600" />
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-slate-800 dark:text-slate-100">Indicadores Internos</h1>
            <p className="text-sm text-slate-400 mt-0.5">Dados estratégicos do município por área temática.</p>
          </div>
        </div>
        {canEdit && (
          <button onClick={openCreate} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-colors">
            <PlusIcon className="w-4 h-4" /> Novo Indicador
          </button>
        )}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 p-4">
          <p className="text-xs text-slate-400 uppercase tracking-wider">Total de registros</p>
          <p className="text-3xl font-extrabold text-slate-700 dark:text-slate-100 mt-1">{kpis.total}</p>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 p-4">
          <p className="text-xs text-slate-400 uppercase tracking-wider">Áreas temáticas</p>
          <p className="text-3xl font-extrabold text-slate-700 dark:text-slate-100 mt-1">{kpis.areas}</p>
        </div>
      </div>

      {/* Grouped by area */}
      {Object.keys(grouped).length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <ChartPieIcon className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm">Nenhum indicador cadastrado ainda.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {Object.entries(grouped).sort(([a],[b]) => a.localeCompare(b)).map(([area, items]) => (
            <div key={area} className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 overflow-hidden">
              <button
                onClick={() => toggleArea(area)}
                className="w-full flex items-center justify-between px-6 py-4 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
              >
                <span className="font-semibold text-slate-700 dark:text-slate-100">{area}</span>
                <div className="flex items-center gap-2 text-slate-400">
                  <span className="text-xs">{items.length} registro{items.length !== 1 ? "s" : ""}</span>
                  {openAreas.has(area) ? <ChevronDownIcon className="w-4 h-4" /> : <ChevronRightIcon className="w-4 h-4" />}
                </div>
              </button>
              <AnimatePresence>
                {openAreas.has(area) && (
                  <motion.div
                    initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }}
                    style={{ overflow: "hidden" }}
                  >
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-slate-50 dark:bg-slate-700/50 text-xs uppercase text-slate-400 tracking-wider text-left">
                          <th className="px-6 py-2">Métrica</th>
                          <th className="px-6 py-2">Valor</th>
                          <th className="px-6 py-2">Período</th>
                          <th className="px-6 py-2">Fonte</th>
                          {canEdit && <th className="px-6 py-2" />}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50 dark:divide-slate-700">
                        {items.map((ind) => (
                          <tr key={ind.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                            <td className="px-6 py-3 font-medium text-slate-700 dark:text-slate-200">{ind.nome_metrica}</td>
                            <td className="px-6 py-3 text-slate-800 dark:text-slate-100 font-semibold">
                              {ind.valor.toLocaleString("pt-BR")} <span className="text-xs text-slate-400 font-normal">{ind.unidade}</span>
                            </td>
                            <td className="px-6 py-3 text-slate-500">{fmtPeriodo(ind)}</td>
                            <td className="px-6 py-3 text-slate-400 text-xs max-w-xs truncate">{ind.fonte || "—"}</td>
                            {canEdit && (
                              <td className="px-6 py-3">
                                <div className="flex items-center gap-2 justify-end">
                                  <button onClick={() => openEdit(ind)} className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"><PencilIcon className="w-4 h-4" /></button>
                                  <button onClick={() => setDeleteConfirmId(ind.id)} className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"><TrashIcon className="w-4 h-4" /></button>
                                </div>
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ))}
        </div>
      )}

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
                <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">{editingId ? "Editar Indicador" : "Novo Indicador"}</h3>
                <button onClick={closeForm} className="text-slate-400 hover:text-slate-600"><XMarkIcon className="w-5 h-5" /></button>
              </div>
              <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2 flex flex-col gap-1">
                  <label className="text-xs font-medium text-slate-500 uppercase tracking-wider">Área temática</label>
                  <input
                    list="areas-list"
                    value={form.area}
                    onChange={(e) => setForm((p) => ({ ...p, area: e.target.value }))}
                    required
                    placeholder="Ex.: Energia, Saúde, Turismo..."
                    className="px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <datalist id="areas-list">
                    {areasExistentes.map((a) => <option key={a} value={a} />)}
                  </datalist>
                </div>
                <div className="md:col-span-2 flex flex-col gap-1">
                  <label className="text-xs font-medium text-slate-500 uppercase tracking-wider">Nome da métrica</label>
                  <input
                    value={form.nome_metrica}
                    onChange={(e) => setForm((p) => ({ ...p, nome_metrica: e.target.value }))}
                    required
                    placeholder="Ex.: Consumo per capita de energia"
                    className="px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-slate-500 uppercase tracking-wider">Valor</label>
                  <input
                    type="number"
                    step="any"
                    value={form.valor}
                    onChange={(e) => setForm((p) => ({ ...p, valor: e.target.value }))}
                    required
                    className="px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-slate-500 uppercase tracking-wider">Unidade</label>
                  <input
                    value={form.unidade}
                    onChange={(e) => setForm((p) => ({ ...p, unidade: e.target.value }))}
                    required
                    placeholder="Ex.: kWh, R$, hab."
                    className="px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-slate-500 uppercase tracking-wider">Periodicidade</label>
                  <select
                    value={form.periodo_tipo}
                    onChange={(e) => setForm((p) => ({ ...p, periodo_tipo: e.target.value, periodo_mes: "" }))}
                    className="px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="anual">Anual</option>
                    <option value="mensal">Mensal</option>
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-slate-500 uppercase tracking-wider">Ano</label>
                  <input
                    type="number"
                    value={form.periodo_ano}
                    onChange={(e) => setForm((p) => ({ ...p, periodo_ano: e.target.value }))}
                    required
                    className="px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                {form.periodo_tipo === "mensal" && (
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-slate-500 uppercase tracking-wider">Mês</label>
                    <select
                      value={form.periodo_mes}
                      onChange={(e) => setForm((p) => ({ ...p, periodo_mes: e.target.value }))}
                      className="px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">Selecione</option>
                      {["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"].map((m, i) => (
                        <option key={i+1} value={i+1}>{m}</option>
                      ))}
                    </select>
                  </div>
                )}
                <div className="md:col-span-2 flex flex-col gap-1">
                  <label className="text-xs font-medium text-slate-500 uppercase tracking-wider">Fonte</label>
                  <input
                    value={form.fonte}
                    onChange={(e) => setForm((p) => ({ ...p, fonte: e.target.value }))}
                    placeholder="Ex.: ANEEL — Sistema SIGA"
                    className="px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="md:col-span-2 flex flex-col gap-1">
                  <label className="text-xs font-medium text-slate-500 uppercase tracking-wider">Observações</label>
                  <textarea
                    value={form.observacoes}
                    onChange={(e) => setForm((p) => ({ ...p, observacoes: e.target.value }))}
                    rows={2}
                    className="px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  />
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
              <h3 className="font-bold text-slate-800 dark:text-slate-100">Excluir indicador?</h3>
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
