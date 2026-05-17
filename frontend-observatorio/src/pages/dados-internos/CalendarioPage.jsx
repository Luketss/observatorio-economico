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
  ListBulletIcon,
  Squares2X2Icon,
  ArrowTopRightOnSquareIcon,
} from "@heroicons/react/24/outline";
import api from "../../services/api";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import { useEscapeKey } from "../../hooks/useEscapeKey";
import { useCalendarEvents } from "../../hooks/useCalendarEvents";
import NidTabBar from "../../components/nid/NidTabBar";

// ── Kind config ───────────────────────────────────────────────────────────────
// Merges dados-internos tipos + mandato tipos + release kind.
// dotVar: CSS variable token for the colored dot/indicator.
const KIND_CONFIG = {
  // dados-internos tipos
  cultural:        { label: "Cultural",          dotVar: "--accent-3" },
  administrativo:  { label: "Administrativo",    dotVar: "--accent-1" },
  politico:        { label: "Político",          dotVar: "--accent-5" },
  saude:           { label: "Saúde",             dotVar: "--accent-5" },
  educacao:        { label: "Educação",          dotVar: "--accent-4" },
  outro:           { label: "Outro",             dotVar: "--text-dim" },
  // mandato tipos
  inicio_mandato:  { label: "Início de Mandato", dotVar: "--accent-1" },
  obras:           { label: "Obras",             dotVar: "--accent-4" },
  politica:        { label: "Política Pública",  dotVar: "--accent-5" },
  evento:          { label: "Evento",            dotVar: "--text-dim" },
  // releases
  release:         { label: "Release",           dotVar: "--accent-3" },
};

const FALLBACK_KIND = { label: "Evento", dotVar: "--text-dim" };

// dados-internos native tipos (for the create/edit form)
const DADOS_TIPOS = {
  cultural:        "Cultural",
  administrativo:  "Administrativo",
  politico:        "Político",
  saude:           "Saúde",
  educacao:        "Educação",
  outro:           "Outro",
};

const SOURCE_LABELS = {
  "dados-internos": "Calendário",
  mandato:          "Mandato",
  releases:         "Release",
};

const MESES = [
  "Janeiro","Fevereiro","Março","Abril","Maio","Junho",
  "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro",
];
const DIAS_SEMANA = ["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"];

const defaultForm = {
  titulo: "", descricao: "", data_inicio: "", data_fim: "",
  horario_inicio: "", horario_fim: "", local: "", tipo: "outro",
};

function pad(n) { return String(n).padStart(2, "0"); }

// ── Dot component ─────────────────────────────────────────────────────────────
function KindDot({ kind, size = 8 }) {
  const cfg = KIND_CONFIG[kind] || FALLBACK_KIND;
  return (
    <span
      style={{
        display: "inline-block",
        width: size,
        height: size,
        borderRadius: "50%",
        background: `var(${cfg.dotVar})`,
        flexShrink: 0,
      }}
    />
  );
}

// ── Source badge ──────────────────────────────────────────────────────────────
function SourceBadge({ source }) {
  return (
    <span
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: "9px",
        fontWeight: 600,
        letterSpacing: "0.1em",
        textTransform: "uppercase",
        color: "var(--text-mute)",
        background: "var(--panel-2)",
        border: "1px solid var(--border)",
        borderRadius: "4px",
        padding: "1px 5px",
      }}
    >
      {SOURCE_LABELS[source] || source}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

export default function CalendarioPage() {
  const { user } = useAuth();
  const { addToast } = useToast();
  const canEdit = user?.role === "ADMIN_GLOBAL" || user?.role === "ADMIN_MUNICIPIO";

  const today = new Date();
  const [ano, setAno] = useState(today.getFullYear());
  const [mes, setMes] = useState(today.getMonth() + 1);
  const [view, setView] = useState("month"); // "month" | "list"

  const [selectedDay, setSelectedDay] = useState(null);

  // Form / CRUD state (dados-internos events only)
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(defaultForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);

  // Unified events from the hook
  const { events, loading, error: hookError } = useCalendarEvents();

  useEscapeKey(useCallback(() => {
    if (deleteConfirmId) { setDeleteConfirmId(null); return; }
    if (showForm) { closeForm(); return; }
    if (selectedDay) setSelectedDay(null);
  }, [deleteConfirmId, showForm, selectedDay]));

  // ── Calendar grid helpers ─────────────────────────────────────────────────
  const { days, startOffset } = useMemo(() => {
    const firstDay = new Date(ano, mes - 1, 1).getDay();
    const daysInMonth = new Date(ano, mes, 0).getDate();
    return { days: daysInMonth, startOffset: firstDay };
  }, [ano, mes]);

  // Filter events for the current month
  const monthEvents = useMemo(() => {
    const prefix = `${ano}-${pad(mes)}-`;
    return events.filter((e) => e.date && e.date.startsWith(prefix));
  }, [events, ano, mes]);

  const eventsByDay = useMemo(() => {
    const map = {};
    monthEvents.forEach((ev) => {
      const day = parseInt(ev.date.split("-")[2], 10);
      if (!map[day]) map[day] = [];
      map[day].push(ev);
    });
    return map;
  }, [monthEvents]);

  const selectedEvents = selectedDay ? (eventsByDay[selectedDay] || []) : [];

  // ── List view: group all events by year-month ─────────────────────────────
  const eventsByMonth = useMemo(() => {
    const groups = {};
    events.forEach((ev) => {
      if (!ev.date) return;
      const [y, m] = ev.date.split("-");
      const key = `${y}-${m}`;
      if (!groups[key]) groups[key] = { year: parseInt(y), month: parseInt(m), items: [] };
      groups[key].items.push(ev);
    });
    return Object.values(groups).sort((a, b) => {
      if (a.year !== b.year) return a.year - b.year;
      return a.month - b.month;
    });
  }, [events]);

  // ── Navigation ────────────────────────────────────────────────────────────
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
  function goToday() {
    setAno(today.getFullYear());
    setMes(today.getMonth() + 1);
    setSelectedDay(today.getDate());
  }

  // ── CRUD (dados-internos only) ────────────────────────────────────────────
  function openCreate(day) {
    setEditingId(null);
    const dateStr = `${ano}-${pad(mes)}-${pad(day)}`;
    setForm({ ...defaultForm, data_inicio: dateStr });
    setFormError(null);
    setShowForm(true);
  }

  function openEditDados(ev) {
    // Only datos-internos events are editable
    if (ev.source !== "dados-internos") return;
    const rawId = parseInt(ev.id.replace("d-", ""), 10);
    setEditingId(rawId);
    setForm({
      titulo: ev.title,
      descricao: ev._raw?.descricao || "",
      data_inicio: ev.date,
      data_fim: ev._raw?.data_fim || "",
      horario_inicio: ev._raw?.horario_inicio || "",
      horario_fim: ev._raw?.horario_fim || "",
      local: ev._raw?.local || "",
      tipo: ev.kind,
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
      data_fim: form.data_fim || null,
      horario_inicio: form.horario_inicio || null,
      horario_fim: form.horario_fim || null,
    };
    try {
      if (editingId) {
        await api.put(`/dados_internos/eventos/${editingId}`, payload);
        addToast("Evento atualizado", "success");
      } else {
        await api.post("/dados_internos/eventos", payload);
        addToast("Evento criado com sucesso", "success");
      }
      closeForm();
      // Trigger a page reload of the hook by forcing a remount isn't ideal;
      // instead we reload the page data via window.location.reload() — or better,
      // we just note that the hook data won't refresh without remount.
      // For simplicity we reload once.
      window.location.reload();
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
      addToast("Evento excluído", "success");
      window.location.reload();
    } catch {
      addToast("Erro ao excluir evento", "error");
    }
  }

  const isToday = (day) =>
    ano === today.getFullYear() &&
    mes === today.getMonth() + 1 &&
    day === today.getDate();

  // ── View tabs ─────────────────────────────────────────────────────────────
  const VIEW_TABS = [
    { key: "month", label: "Mês" },
    { key: "list",  label: "Lista" },
  ];

  // ── Legend entries (deduplicated kinds present in data) ───────────────────
  const legendKinds = useMemo(() => {
    const seen = new Set();
    events.forEach((e) => seen.add(e.kind));
    return [...seen]
      .filter((k) => KIND_CONFIG[k])
      .sort();
  }, [events]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      style={{ display: "flex", flexDirection: "column", gap: "24px" }}
    >
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <CalendarIcon style={{ width: "28px", height: "28px", color: "var(--accent-1)", flexShrink: 0 }} />
          <div>
            <h1
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "22px",
                fontWeight: 700,
                letterSpacing: "-0.02em",
                color: "var(--text)",
                margin: 0,
              }}
            >
              Calendário
            </h1>
            <p
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "11.5px",
                color: "var(--text-dim)",
                marginTop: "2px",
                letterSpacing: "0.02em",
              }}
            >
              Eventos do calendário, marcos do mandato e releases.
            </p>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
          {/* Month/List toggle */}
          <NidTabBar
            tabs={VIEW_TABS}
            value={view}
            onChange={setView}
            ariaLabel="Alternar visualização"
          />

          {/* Month navigation (only in month view) */}
          {view === "month" && (
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <button
                onClick={goToday}
                style={{
                  padding: "6px 12px",
                  borderRadius: "8px",
                  border: "1px solid var(--border)",
                  background: "var(--panel-2)",
                  color: "var(--text-dim)",
                  fontFamily: "var(--font-mono)",
                  fontSize: "11.5px",
                  fontWeight: 600,
                  cursor: "pointer",
                  letterSpacing: "0.04em",
                }}
              >
                Hoje
              </button>
              <button
                onClick={prevMonth}
                aria-label="Mês anterior"
                style={{
                  padding: "6px 8px",
                  borderRadius: "8px",
                  border: "1px solid var(--border)",
                  background: "var(--panel-2)",
                  color: "var(--text-dim)",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                }}
              >
                <ChevronLeftIcon style={{ width: "14px", height: "14px" }} />
              </button>
              <span
                aria-live="polite"
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: "13px",
                  fontWeight: 600,
                  color: "var(--text)",
                  minWidth: "140px",
                  textAlign: "center",
                }}
              >
                {MESES[mes - 1]} {ano}
              </span>
              <button
                onClick={nextMonth}
                aria-label="Próximo mês"
                style={{
                  padding: "6px 8px",
                  borderRadius: "8px",
                  border: "1px solid var(--border)",
                  background: "var(--panel-2)",
                  color: "var(--text-dim)",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                }}
              >
                <ChevronRightIcon style={{ width: "14px", height: "14px" }} />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Loading / Error ─────────────────────────────────────────────────── */}
      {loading && (
        <div
          style={{
            padding: "48px",
            textAlign: "center",
            fontFamily: "var(--font-mono)",
            fontSize: "12px",
            color: "var(--text-dim)",
          }}
        >
          Carregando eventos…
        </div>
      )}

      {!loading && hookError && (
        <div
          style={{
            padding: "16px 20px",
            borderRadius: "12px",
            background: "color-mix(in oklab, var(--accent-2) 10%, transparent)",
            border: "1px solid color-mix(in oklab, var(--accent-2) 28%, transparent)",
            color: "var(--accent-2)",
            fontFamily: "var(--font-mono)",
            fontSize: "12px",
          }}
        >
          Erro ao carregar alguns eventos. Os dados disponíveis são exibidos abaixo.
        </div>
      )}

      {/* ── Month View ──────────────────────────────────────────────────────── */}
      {!loading && view === "month" && (
        <div style={{ display: "flex", gap: "20px", alignItems: "flex-start" }}>
          {/* Calendar grid */}
          <div
            className="nid-panel"
            style={{ flex: 1, padding: 0, overflow: "hidden" }}
          >
            {/* Day headers */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(7, 1fr)",
                borderBottom: "1px solid var(--border)",
              }}
            >
              {DIAS_SEMANA.map((d) => (
                <div
                  key={d}
                  style={{
                    padding: "10px 0",
                    textAlign: "center",
                    fontFamily: "var(--font-mono)",
                    fontSize: "10px",
                    fontWeight: 700,
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                    color: "var(--text-mute)",
                  }}
                >
                  {d}
                </div>
              ))}
            </div>

            {/* Day cells */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)" }}>
              {/* Empty offset cells */}
              {Array.from({ length: startOffset }).map((_, i) => (
                <div
                  key={`empty-${i}`}
                  style={{
                    minHeight: "80px",
                    borderBottom: "1px solid var(--border)",
                    borderRight: "1px solid var(--border)",
                    background: "color-mix(in oklab, var(--bg) 60%, transparent)",
                    opacity: 0.4,
                  }}
                />
              ))}

              {/* Actual day cells */}
              {Array.from({ length: days }, (_, i) => i + 1).map((day) => {
                const dayEvents = eventsByDay[day] || [];
                const isSelected = selectedDay === day;
                const isTodayDay = isToday(day);

                return (
                  <div
                    key={day}
                    onClick={() => setSelectedDay(day === selectedDay ? null : day)}
                    style={{
                      minHeight: "80px",
                      borderBottom: "1px solid var(--border)",
                      borderRight: "1px solid var(--border)",
                      padding: "6px",
                      cursor: "pointer",
                      transition: "background 0.12s",
                      background: isSelected
                        ? "color-mix(in oklab, var(--accent-1) 10%, transparent)"
                        : isTodayDay
                        ? "color-mix(in oklab, var(--accent-1) 6%, transparent)"
                        : "transparent",
                    }}
                  >
                    {/* Day number */}
                    <div
                      style={{
                        width: "24px",
                        height: "24px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        borderRadius: "50%",
                        fontFamily: "var(--font-mono)",
                        fontSize: "11px",
                        fontWeight: isTodayDay ? 700 : 500,
                        color: isTodayDay ? "var(--bg)" : "var(--text-dim)",
                        background: isTodayDay ? "var(--accent-1)" : "transparent",
                        marginBottom: "4px",
                        flexShrink: 0,
                      }}
                    >
                      {day}
                    </div>

                    {/* Event dots */}
                    <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                      {dayEvents.slice(0, 3).map((ev) => {
                        const cfg = KIND_CONFIG[ev.kind] || FALLBACK_KIND;
                        return (
                          <div
                            key={ev.id}
                            title={ev.title}
                            style={{
                              width: "100%",
                              height: "4px",
                              borderRadius: "2px",
                              background: `var(${cfg.dotVar})`,
                              opacity: 0.85,
                            }}
                          />
                        );
                      })}
                      {dayEvents.length > 3 && (
                        <span
                          style={{
                            fontFamily: "var(--font-mono)",
                            fontSize: "9px",
                            color: "var(--text-mute)",
                          }}
                        >
                          +{dayEvents.length - 3}
                        </span>
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
                initial={{ opacity: 0, x: 16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 16 }}
                style={{ width: "272px", flexShrink: 0, display: "flex", flexDirection: "column", gap: "12px" }}
              >
                {/* Day events */}
                <div className="nid-panel" style={{ padding: "16px" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
                    <h3
                      style={{
                        fontFamily: "var(--font-display)",
                        fontSize: "13px",
                        fontWeight: 600,
                        color: "var(--text)",
                        margin: 0,
                      }}
                    >
                      {selectedDay} de {MESES[mes - 1]}
                    </h3>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      {canEdit && (
                        <button
                          onClick={() => openCreate(selectedDay)}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "4px",
                            fontFamily: "var(--font-mono)",
                            fontSize: "10px",
                            fontWeight: 600,
                            color: "var(--accent-1)",
                            background: "none",
                            border: "none",
                            cursor: "pointer",
                            letterSpacing: "0.04em",
                          }}
                        >
                          <PlusIcon style={{ width: "12px", height: "12px" }} />
                          Evento
                        </button>
                      )}
                      <button
                        onClick={() => setSelectedDay(null)}
                        style={{
                          background: "none",
                          border: "none",
                          cursor: "pointer",
                          color: "var(--text-mute)",
                          display: "flex",
                          alignItems: "center",
                        }}
                        aria-label="Fechar painel"
                      >
                        <XMarkIcon style={{ width: "14px", height: "14px" }} />
                      </button>
                    </div>
                  </div>

                  {selectedEvents.length === 0 ? (
                    <p
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: "11px",
                        color: "var(--text-mute)",
                        fontStyle: "italic",
                      }}
                    >
                      Nenhum evento neste dia.
                    </p>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                      {selectedEvents.map((ev) => {
                        const cfg = KIND_CONFIG[ev.kind] || FALLBACK_KIND;
                        const isDados = ev.source === "dados-internos";
                        const rawId = isDados ? parseInt(ev.id.replace("d-", ""), 10) : null;
                        return (
                          <div
                            key={ev.id}
                            style={{
                              borderRadius: "10px",
                              border: "1px solid var(--border)",
                              padding: "10px 12px",
                              display: "flex",
                              flexDirection: "column",
                              gap: "4px",
                            }}
                          >
                            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "8px" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: "6px", flex: 1, minWidth: 0 }}>
                                <KindDot kind={ev.kind} />
                                <p
                                  style={{
                                    fontFamily: "var(--font-display)",
                                    fontSize: "12px",
                                    fontWeight: 600,
                                    color: "var(--text)",
                                    margin: 0,
                                    lineHeight: 1.3,
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    whiteSpace: "nowrap",
                                  }}
                                  title={ev.title}
                                >
                                  {ev.title}
                                </p>
                              </div>
                              {canEdit && isDados && (
                                <div style={{ display: "flex", gap: "4px", flexShrink: 0 }}>
                                  <button
                                    onClick={() => openEditDados(ev)}
                                    style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-mute)", display: "flex", alignItems: "center" }}
                                  >
                                    <PencilIcon style={{ width: "11px", height: "11px" }} />
                                  </button>
                                  <button
                                    onClick={() => setDeleteConfirmId(rawId)}
                                    style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-mute)", display: "flex", alignItems: "center" }}
                                  >
                                    <TrashIcon style={{ width: "11px", height: "11px" }} />
                                  </button>
                                </div>
                              )}
                            </div>

                            <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                              <span
                                style={{
                                  fontFamily: "var(--font-mono)",
                                  fontSize: "9px",
                                  fontWeight: 700,
                                  letterSpacing: "0.12em",
                                  textTransform: "uppercase",
                                  color: `var(${cfg.dotVar})`,
                                }}
                              >
                                {cfg.label}
                              </span>
                              <SourceBadge source={ev.source} />
                            </div>

                            {ev.link && (
                              <a
                                href={ev.link}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: "3px",
                                  fontFamily: "var(--font-mono)",
                                  fontSize: "10px",
                                  fontWeight: 600,
                                  color: "var(--accent-1)",
                                  textDecoration: "none",
                                  letterSpacing: "0.04em",
                                }}
                              >
                                Ver mais
                                <ArrowTopRightOnSquareIcon style={{ width: "10px", height: "10px" }} />
                              </a>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Legend */}
                {legendKinds.length > 0 && (
                  <div className="nid-panel" style={{ padding: "14px 16px" }}>
                    <p
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: "9px",
                        fontWeight: 700,
                        letterSpacing: "0.14em",
                        textTransform: "uppercase",
                        color: "var(--text-mute)",
                        marginBottom: "10px",
                      }}
                    >
                      Legenda
                    </p>
                    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                      {legendKinds.map((k) => {
                        const cfg = KIND_CONFIG[k];
                        return (
                          <div key={k} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                            <KindDot kind={k} size={8} />
                            <span
                              style={{
                                fontFamily: "var(--font-display)",
                                fontSize: "11.5px",
                                color: "var(--text-dim)",
                              }}
                            >
                              {cfg.label}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* ── List View ───────────────────────────────────────────────────────── */}
      {!loading && view === "list" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          {eventsByMonth.length === 0 && (
            <div
              className="nid-panel"
              style={{
                padding: "48px",
                textAlign: "center",
                fontFamily: "var(--font-mono)",
                fontSize: "12px",
                color: "var(--text-mute)",
              }}
            >
              Nenhum evento encontrado.
            </div>
          )}

          {eventsByMonth.map(({ year, month, items }) => (
            <div key={`${year}-${pad(month)}`}>
              {/* Month header */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  marginBottom: "12px",
                }}
              >
                <span
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: "13px",
                    fontWeight: 700,
                    color: "var(--text)",
                    letterSpacing: "-0.01em",
                  }}
                >
                  {MESES[month - 1]} {year}
                </span>
                <div
                  style={{
                    flex: 1,
                    height: "1px",
                    background: "var(--border)",
                  }}
                />
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "10px",
                    color: "var(--text-mute)",
                  }}
                >
                  {items.length} evento{items.length !== 1 ? "s" : ""}
                </span>
              </div>

              {/* Events */}
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                {items.map((ev) => {
                  const cfg = KIND_CONFIG[ev.kind] || FALLBACK_KIND;
                  const dayNum = ev.date ? parseInt(ev.date.split("-")[2], 10) : null;
                  return (
                    <div
                      key={ev.id}
                      className="nid-panel"
                      style={{
                        padding: "12px 16px",
                        display: "flex",
                        alignItems: "center",
                        gap: "14px",
                      }}
                    >
                      {/* Date column */}
                      <div
                        style={{
                          width: "38px",
                          flexShrink: 0,
                          textAlign: "center",
                        }}
                      >
                        <span
                          style={{
                            fontFamily: "var(--font-mono)",
                            fontSize: "18px",
                            fontWeight: 700,
                            color: "var(--text)",
                            display: "block",
                            lineHeight: 1,
                          }}
                        >
                          {dayNum !== null ? pad(dayNum) : "--"}
                        </span>
                        <span
                          style={{
                            fontFamily: "var(--font-mono)",
                            fontSize: "9px",
                            color: "var(--text-mute)",
                            textTransform: "uppercase",
                            letterSpacing: "0.08em",
                          }}
                        >
                          {MESES[month - 1].slice(0, 3)}
                        </span>
                      </div>

                      {/* Color bar */}
                      <div
                        style={{
                          width: "3px",
                          alignSelf: "stretch",
                          borderRadius: "2px",
                          background: `var(${cfg.dotVar})`,
                          flexShrink: 0,
                        }}
                      />

                      {/* Content */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            fontFamily: "var(--font-mono)",
                            fontSize: "9px",
                            fontWeight: 700,
                            letterSpacing: "0.12em",
                            textTransform: "uppercase",
                            color: `var(${cfg.dotVar})`,
                            marginBottom: "2px",
                          }}
                        >
                          {cfg.label}
                        </div>
                        <p
                          style={{
                            fontFamily: "var(--font-display)",
                            fontSize: "13px",
                            fontWeight: 600,
                            color: "var(--text)",
                            margin: 0,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {ev.title}
                        </p>
                      </div>

                      {/* Source + link */}
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
                        <SourceBadge source={ev.source} />
                        {ev.link && (
                          <a
                            href={ev.link}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              color: "var(--accent-1)",
                              display: "flex",
                              alignItems: "center",
                            }}
                            aria-label="Ver mais"
                          >
                            <ArrowTopRightOnSquareIcon style={{ width: "13px", height: "13px" }} />
                          </a>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Form modal (dados-internos only) ────────────────────────────────── */}
      <AnimatePresence>
        {showForm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 50,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "rgba(0,0,0,0.5)",
              backdropFilter: "blur(4px)",
              padding: "16px",
            }}
            onClick={(e) => { if (e.target === e.currentTarget) closeForm(); }}
          >
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              className="nid-panel"
              style={{
                width: "100%",
                maxWidth: "560px",
                padding: "24px",
                maxHeight: "90vh",
                overflowY: "auto",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px" }}>
                <h3
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: "15px",
                    fontWeight: 700,
                    color: "var(--text)",
                    margin: 0,
                  }}
                >
                  {editingId ? "Editar Evento" : "Novo Evento"}
                </h3>
                <button
                  onClick={closeForm}
                  style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-mute)", display: "flex" }}
                >
                  <XMarkIcon style={{ width: "18px", height: "18px" }} />
                </button>
              </div>

              <form onSubmit={handleSubmit} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
                {/* Title */}
                <div style={{ gridColumn: "1 / -1", display: "flex", flexDirection: "column", gap: "4px" }}>
                  <label style={{ fontFamily: "var(--font-mono)", fontSize: "10px", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-dim)" }}>Título</label>
                  <input
                    value={form.titulo}
                    onChange={(e) => setForm((p) => ({ ...p, titulo: e.target.value }))}
                    required
                    style={{
                      padding: "8px 12px",
                      borderRadius: "8px",
                      border: "1px solid var(--border)",
                      background: "var(--panel-2)",
                      color: "var(--text)",
                      fontFamily: "var(--font-body)",
                      fontSize: "13px",
                      outline: "none",
                    }}
                  />
                </div>

                {/* Tipo */}
                <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                  <label style={{ fontFamily: "var(--font-mono)", fontSize: "10px", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-dim)" }}>Tipo</label>
                  <select
                    value={form.tipo}
                    onChange={(e) => setForm((p) => ({ ...p, tipo: e.target.value }))}
                    style={{
                      padding: "8px 12px",
                      borderRadius: "8px",
                      border: "1px solid var(--border)",
                      background: "var(--panel-2)",
                      color: "var(--text)",
                      fontFamily: "var(--font-body)",
                      fontSize: "13px",
                      outline: "none",
                    }}
                  >
                    {Object.entries(DADOS_TIPOS).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </div>

                {/* Local */}
                <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                  <label style={{ fontFamily: "var(--font-mono)", fontSize: "10px", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-dim)" }}>Local</label>
                  <input
                    value={form.local}
                    onChange={(e) => setForm((p) => ({ ...p, local: e.target.value }))}
                    style={{
                      padding: "8px 12px",
                      borderRadius: "8px",
                      border: "1px solid var(--border)",
                      background: "var(--panel-2)",
                      color: "var(--text)",
                      fontFamily: "var(--font-body)",
                      fontSize: "13px",
                      outline: "none",
                    }}
                  />
                </div>

                {/* Data início */}
                <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                  <label style={{ fontFamily: "var(--font-mono)", fontSize: "10px", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-dim)" }}>Data de início</label>
                  <input
                    type="date"
                    value={form.data_inicio}
                    onChange={(e) => setForm((p) => ({ ...p, data_inicio: e.target.value }))}
                    required
                    style={{
                      padding: "8px 12px",
                      borderRadius: "8px",
                      border: "1px solid var(--border)",
                      background: "var(--panel-2)",
                      color: "var(--text)",
                      fontFamily: "var(--font-mono)",
                      fontSize: "13px",
                      outline: "none",
                    }}
                  />
                </div>

                {/* Data fim */}
                <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                  <label style={{ fontFamily: "var(--font-mono)", fontSize: "10px", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-dim)" }}>Data de fim</label>
                  <input
                    type="date"
                    value={form.data_fim}
                    onChange={(e) => setForm((p) => ({ ...p, data_fim: e.target.value }))}
                    style={{
                      padding: "8px 12px",
                      borderRadius: "8px",
                      border: "1px solid var(--border)",
                      background: "var(--panel-2)",
                      color: "var(--text)",
                      fontFamily: "var(--font-mono)",
                      fontSize: "13px",
                      outline: "none",
                    }}
                  />
                </div>

                {/* Horário início */}
                <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                  <label style={{ fontFamily: "var(--font-mono)", fontSize: "10px", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-dim)" }}>Horário início</label>
                  <input
                    type="time"
                    value={form.horario_inicio}
                    onChange={(e) => setForm((p) => ({ ...p, horario_inicio: e.target.value }))}
                    style={{
                      padding: "8px 12px",
                      borderRadius: "8px",
                      border: "1px solid var(--border)",
                      background: "var(--panel-2)",
                      color: "var(--text)",
                      fontFamily: "var(--font-mono)",
                      fontSize: "13px",
                      outline: "none",
                    }}
                  />
                </div>

                {/* Horário fim */}
                <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                  <label style={{ fontFamily: "var(--font-mono)", fontSize: "10px", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-dim)" }}>Horário fim</label>
                  <input
                    type="time"
                    value={form.horario_fim}
                    onChange={(e) => setForm((p) => ({ ...p, horario_fim: e.target.value }))}
                    style={{
                      padding: "8px 12px",
                      borderRadius: "8px",
                      border: "1px solid var(--border)",
                      background: "var(--panel-2)",
                      color: "var(--text)",
                      fontFamily: "var(--font-mono)",
                      fontSize: "13px",
                      outline: "none",
                    }}
                  />
                </div>

                {/* Descrição */}
                <div style={{ gridColumn: "1 / -1", display: "flex", flexDirection: "column", gap: "4px" }}>
                  <label style={{ fontFamily: "var(--font-mono)", fontSize: "10px", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-dim)" }}>Descrição</label>
                  <textarea
                    value={form.descricao}
                    onChange={(e) => setForm((p) => ({ ...p, descricao: e.target.value }))}
                    rows={2}
                    style={{
                      padding: "8px 12px",
                      borderRadius: "8px",
                      border: "1px solid var(--border)",
                      background: "var(--panel-2)",
                      color: "var(--text)",
                      fontFamily: "var(--font-body)",
                      fontSize: "13px",
                      outline: "none",
                      resize: "none",
                    }}
                  />
                </div>

                {/* Actions */}
                <div style={{ gridColumn: "1 / -1", display: "flex", alignItems: "center", gap: "10px", paddingTop: "4px" }}>
                  {formError && (
                    <p style={{ fontFamily: "var(--font-mono)", fontSize: "12px", color: "var(--accent-2)", flex: 1, margin: 0 }}>
                      {formError}
                    </p>
                  )}
                  <div style={{ display: "flex", gap: "10px", marginLeft: "auto" }}>
                    <button
                      type="button"
                      onClick={closeForm}
                      style={{
                        padding: "8px 16px",
                        borderRadius: "8px",
                        border: "1px solid var(--border)",
                        background: "var(--panel-2)",
                        color: "var(--text-dim)",
                        fontFamily: "var(--font-body)",
                        fontSize: "13px",
                        fontWeight: 500,
                        cursor: "pointer",
                      }}
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={saving}
                      style={{
                        padding: "8px 16px",
                        borderRadius: "8px",
                        border: "none",
                        background: "var(--accent-1)",
                        color: "var(--bg)",
                        fontFamily: "var(--font-display)",
                        fontSize: "13px",
                        fontWeight: 700,
                        cursor: saving ? "not-allowed" : "pointer",
                        opacity: saving ? 0.6 : 1,
                      }}
                    >
                      {saving ? "Salvando…" : editingId ? "Salvar" : "Criar"}
                    </button>
                  </div>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Delete confirm ───────────────────────────────────────────────────── */}
      <AnimatePresence>
        {deleteConfirmId && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 50,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "rgba(0,0,0,0.5)",
              backdropFilter: "blur(4px)",
              padding: "16px",
            }}
          >
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              className="nid-panel"
              style={{ width: "100%", maxWidth: "360px", padding: "24px", display: "flex", flexDirection: "column", gap: "16px" }}
            >
              <h3
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: "15px",
                  fontWeight: 700,
                  color: "var(--text)",
                  margin: 0,
                }}
              >
                Excluir evento?
              </h3>
              <p style={{ fontFamily: "var(--font-body)", fontSize: "13px", color: "var(--text-dim)", margin: 0 }}>
                Esta ação não pode ser desfeita.
              </p>
              <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
                <button
                  onClick={() => setDeleteConfirmId(null)}
                  style={{
                    padding: "8px 16px",
                    borderRadius: "8px",
                    border: "1px solid var(--border)",
                    background: "var(--panel-2)",
                    color: "var(--text-dim)",
                    fontFamily: "var(--font-body)",
                    fontSize: "13px",
                    cursor: "pointer",
                  }}
                >
                  Cancelar
                </button>
                <button
                  onClick={() => handleDelete(deleteConfirmId)}
                  style={{
                    padding: "8px 16px",
                    borderRadius: "8px",
                    border: "none",
                    background: "var(--accent-2)",
                    color: "white",
                    fontFamily: "var(--font-display)",
                    fontSize: "13px",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  Excluir
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
