import { useEffect, useState, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  CalendarIcon,
  PlusIcon,
  XMarkIcon,
  PencilIcon,
  TrashIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from "@heroicons/react/24/outline";
import api from "../../services/api";
import { useAuth } from "../../context/AuthContext";

const TIPO_CONFIG = {
  cultural:       { label: "Cultural",        color: "bg-purple-500",   text: "text-purple-700 bg-purple-100" },
  administrativo: { label: "Administrativo",  color: "bg-blue-500",     text: "text-blue-700 bg-blue-100" },
  politico:       { label: "Político",         color: "bg-slate-500",    text: "text-slate-700 bg-slate-100" },
  saude:          { label: "Saúde",            color: "bg-green-500",    text: "text-green-700 bg-green-100" },
  educacao:       { label: "Educação",         color: "bg-amber-500",    text: "text-amber-700 bg-amber-100" },
  outro:          { label: "Outro",            color: "bg-slate-400",    text: "text-slate-600 bg-slate-100" },
};

const MESES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
const DIAS_SEMANA = ["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"];

const defaultForm = {
  titulo: "", descricao: "", data_inicio: "", data_fim: "",
  horario_inicio: "", horario_fim: "", local: "", tipo: "outro",
};

function pad(n) { return String(n).padStart(2, "0"); }

export default function CalendarioPage() {
  const { user } = useAuth();
  const canEdit = user?.role === "ADMIN_GLOBAL" || user?.role === "ADMIN_MUNICIPIO";

  const today = new Date();
  const [ano, setAno] = useState(today.getFullYear());
  const [mes, setMes] = useState(today.getMonth() + 1);
  const [eventos, setEventos] = useState([]);
  const [loading, setLoading] = useState(true);

  const [selectedDay, setSelectedDay] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(defaultForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get("/dados_internos/eventos", { params: { ano, mes } });
      setEventos(res.data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [ano, mes]);

  useEffect(() => { load(); }, [load]);

  // Calendar grid
  const { days, startOffset } = useMemo(() => {
    const firstDay = new Date(ano, mes - 1, 1).getDay();
    const daysInMonth = new Date(ano, mes, 0).getDate();
    return { days: daysInMonth, startOffset: firstDay };
  }, [ano, mes]);

  const eventsByDay = useMemo(() => {
    const map = {};
    eventos.forEach((ev) => {
      const d = ev.data_inicio.split("-")[2];
      const day = parseInt(d, 10);
      if (!map[day]) map[day] = [];
      map[day].push(ev);
    });
    return map;
  }, [eventos]);

  const selectedEvents = selectedDay ? (eventsByDay[selectedDay] || []) : [];

  function prevMonth() {
    if (mes === 1) { setAno((y) => y - 1); setMes(12); }
    else setMes((m) => m - 1);
    setSelectedDay(null);
  }
  function nextMonth() {
    if (mes === 12) { setAno((y) => y + 1); setMes(1); }
    else setMes((m) => m + 1);
    setSelectedDay(null);
  }
  function goToday() { setAno(today.getFullYear()); setMes(today.getMonth() + 1); setSelectedDay(today.getDate()); }

  function openCreate(day) {
    setEditingId(null);
    const dateStr = `${ano}-${pad(mes)}-${pad(day)}`;
    setForm({ ...defaultForm, data_inicio: dateStr });
    setFormError(null);
    setShowForm(true);
  }

  function openEdit(ev) {
    setEditingId(ev.id);
    setForm({
      titulo: ev.titulo, descricao: ev.descricao || "",
      data_inicio: ev.data_inicio, data_fim: ev.data_fim || "",
      horario_inicio: ev.horario_inicio || "", horario_fim: ev.horario_fim || "",
      local: ev.local || "", tipo: ev.tipo,
    });
    setFormError(null);
    setShowForm(true);
  }

  function closeForm() { setShowForm(false); setEditingId(null); setForm(defaultForm); setFormError(null); }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    const payload = {
      ...form,
      data_fim: form.data_fim || null,
      horario_inicio: form.horario_inicio || null,
      horario_fim: form.horario_fim || null,
    };
    try {
      if (editingId) {
        await api.put(`/dados_internos/eventos/${editingId}`, payload);
      } else {
        await api.post("/dados_internos/eventos", payload);
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
      await api.delete(`/dados_internos/eventos/${id}`);
      setDeleteConfirmId(null);
      await load();
    } catch (err) { console.error(err); }
  }

  const isToday = (day) => ano === today.getFullYear() && mes === today.getMonth() + 1 && day === today.getDate();

  return (
    <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <CalendarIcon className="w-7 h-7 text-blue-600" />
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-slate-800 dark:text-slate-100">Calendário</h1>
            <p className="text-sm text-slate-400 mt-0.5">Eventos e agenda do município.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={goToday} className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">Hoje</button>
          <button onClick={prevMonth} className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors text-slate-600 dark:text-slate-300"><ChevronLeftIcon className="w-4 h-4" /></button>
          <span className="font-semibold text-slate-700 dark:text-slate-200 min-w-[160px] text-center text-sm">{MESES[mes - 1]} {ano}</span>
          <button onClick={nextMonth} className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors text-slate-600 dark:text-slate-300"><ChevronRightIcon className="w-4 h-4" /></button>
        </div>
      </div>

      <div className="flex gap-6">
        {/* Calendar grid */}
        <div className="flex-1 bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 overflow-hidden">
          {/* Day headers */}
          <div className="grid grid-cols-7 border-b border-slate-100 dark:border-slate-700">
            {DIAS_SEMANA.map((d) => (
              <div key={d} className="py-3 text-center text-xs font-semibold text-slate-400 uppercase tracking-wider">{d}</div>
            ))}
          </div>
          {/* Day cells */}
          <div className="grid grid-cols-7">
            {/* Empty cells before month start */}
            {Array.from({ length: startOffset }).map((_, i) => (
              <div key={`empty-${i}`} className="min-h-[80px] border-b border-r border-slate-50 dark:border-slate-700/50 bg-slate-50/50 dark:bg-slate-800/30" />
            ))}
            {/* Day cells */}
            {Array.from({ length: days }, (_, i) => i + 1).map((day) => {
              const dayEvents = eventsByDay[day] || [];
              const isSelected = selectedDay === day;
              const isTodayDay = isToday(day);
              return (
                <div
                  key={day}
                  onClick={() => setSelectedDay(day === selectedDay ? null : day)}
                  className={`min-h-[80px] border-b border-r border-slate-50 dark:border-slate-700/50 p-1.5 cursor-pointer transition-colors ${
                    isSelected
                      ? "bg-blue-50 dark:bg-blue-900/20"
                      : "hover:bg-slate-50 dark:hover:bg-slate-700/30"
                  }`}
                >
                  <div className={`w-6 h-6 flex items-center justify-center rounded-full text-xs font-medium mb-1 ${
                    isTodayDay
                      ? "bg-blue-600 text-white"
                      : "text-slate-600 dark:text-slate-300"
                  }`}>
                    {day}
                  </div>
                  <div className="space-y-0.5">
                    {dayEvents.slice(0, 2).map((ev) => {
                      const cfg = TIPO_CONFIG[ev.tipo] || TIPO_CONFIG.outro;
                      return (
                        <div key={ev.id} className={`w-full h-1.5 rounded-full ${cfg.color}`} title={ev.titulo} />
                      );
                    })}
                    {dayEvents.length > 2 && (
                      <div className="text-xs text-slate-400 pl-0.5">+{dayEvents.length - 2}</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Side panel */}
        <AnimatePresence>
          {selectedDay && (
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="w-72 shrink-0 space-y-3"
            >
              <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-slate-700 dark:text-slate-200 text-sm">
                    {selectedDay} de {MESES[mes - 1]}
                  </h3>
                  {canEdit && (
                    <button
                      onClick={() => openCreate(selectedDay)}
                      className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 transition-colors"
                    >
                      <PlusIcon className="w-3.5 h-3.5" /> Evento
                    </button>
                  )}
                </div>
                {selectedEvents.length === 0 ? (
                  <p className="text-xs text-slate-400 italic">Nenhum evento neste dia.</p>
                ) : (
                  <div className="space-y-2">
                    {selectedEvents.map((ev) => {
                      const cfg = TIPO_CONFIG[ev.tipo] || TIPO_CONFIG.outro;
                      return (
                        <div key={ev.id} className="rounded-lg border border-slate-100 dark:border-slate-700 p-3 space-y-1">
                          <div className="flex items-start justify-between gap-2">
                            <p className="font-medium text-slate-700 dark:text-slate-200 text-xs leading-snug">{ev.titulo}</p>
                            {canEdit && (
                              <div className="flex gap-1 shrink-0">
                                <button onClick={() => openEdit(ev)} className="text-slate-400 hover:text-blue-600 transition-colors"><PencilIcon className="w-3 h-3" /></button>
                                <button onClick={() => setDeleteConfirmId(ev.id)} className="text-slate-400 hover:text-red-500 transition-colors"><TrashIcon className="w-3 h-3" /></button>
                              </div>
                            )}
                          </div>
                          <span className={`inline-block px-1.5 py-0.5 rounded text-xs ${cfg.text}`}>{cfg.label}</span>
                          {ev.horario_inicio && <p className="text-xs text-slate-400">{ev.horario_inicio}{ev.horario_fim ? ` – ${ev.horario_fim}` : ""}</p>}
                          {ev.local && <p className="text-xs text-slate-400">{ev.local}</p>}
                          {ev.descricao && <p className="text-xs text-slate-500">{ev.descricao}</p>}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Legend */}
              <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 p-4">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Legenda</p>
                <div className="space-y-1.5">
                  {Object.entries(TIPO_CONFIG).map(([k, v]) => (
                    <div key={k} className="flex items-center gap-2">
                      <div className={`w-2.5 h-2.5 rounded-full ${v.color}`} />
                      <span className="text-xs text-slate-600 dark:text-slate-300">{v.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

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
                <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">{editingId ? "Editar Evento" : "Novo Evento"}</h3>
                <button onClick={closeForm} className="text-slate-400 hover:text-slate-600"><XMarkIcon className="w-5 h-5" /></button>
              </div>
              <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2 flex flex-col gap-1">
                  <label className="text-xs font-medium text-slate-500 uppercase tracking-wider">Título</label>
                  <input value={form.titulo} onChange={(e) => setForm((p) => ({ ...p, titulo: e.target.value }))} required className="px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-slate-500 uppercase tracking-wider">Tipo</label>
                  <select value={form.tipo} onChange={(e) => setForm((p) => ({ ...p, tipo: e.target.value }))} className="px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    {Object.entries(TIPO_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-slate-500 uppercase tracking-wider">Local</label>
                  <input value={form.local} onChange={(e) => setForm((p) => ({ ...p, local: e.target.value }))} className="px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-slate-500 uppercase tracking-wider">Data de início</label>
                  <input type="date" value={form.data_inicio} onChange={(e) => setForm((p) => ({ ...p, data_inicio: e.target.value }))} required className="px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-slate-500 uppercase tracking-wider">Data de fim</label>
                  <input type="date" value={form.data_fim} onChange={(e) => setForm((p) => ({ ...p, data_fim: e.target.value }))} className="px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-slate-500 uppercase tracking-wider">Horário início</label>
                  <input type="time" value={form.horario_inicio} onChange={(e) => setForm((p) => ({ ...p, horario_inicio: e.target.value }))} className="px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-slate-500 uppercase tracking-wider">Horário fim</label>
                  <input type="time" value={form.horario_fim} onChange={(e) => setForm((p) => ({ ...p, horario_fim: e.target.value }))} className="px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div className="md:col-span-2 flex flex-col gap-1">
                  <label className="text-xs font-medium text-slate-500 uppercase tracking-wider">Descrição</label>
                  <textarea value={form.descricao} onChange={(e) => setForm((p) => ({ ...p, descricao: e.target.value }))} rows={2} className="px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
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
              <h3 className="font-bold text-slate-800 dark:text-slate-100">Excluir evento?</h3>
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
