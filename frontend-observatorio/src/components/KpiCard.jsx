import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  InformationCircleIcon,
  XMarkIcon,
  PencilIcon,
  CheckIcon,
} from "@heroicons/react/24/outline";
import { useAuth } from "../context/AuthContext";
import api from "../services/api";

/**
 * Shared KPI indicator card.
 *
 * Basic usage (no tooltip/modal):
 *   <KpiCard label="PIB Último Ano" value="R$ 1,2 bi" sub="2023" />
 *
 * With indicator description (tooltip on hover + modal on click of ⓘ):
 *   <KpiCard label="PIB Último Ano" value="R$ 1,2 bi" dataset="pib" indicadorKey="ultimo_ano" />
 *
 * Props:
 *   label        — string (required)
 *   value        — string (required)
 *   sub          — string? — subtitle below value
 *   icon         — Heroicon component (optional)
 *   color        — { bg, text } tailwind strings (optional, for icon background)
 *   accent       — tailwind color class for value text (optional)
 *   delay        — framer-motion animation delay (optional)
 *   dataset      — string — page key e.g. "pib"
 *   indicadorKey — string — slug e.g. "ultimo_ano"
 */
export default function KpiCard({
  label,
  value,
  sub,
  icon: Icon,
  color,
  accent,
  delay = 0,
  dataset,
  indicadorKey,
}) {
  const { user } = useAuth();
  const isGlobal = user?.role === "ADMIN_GLOBAL";
  const hasIndicador = dataset && indicadorKey;

  const [info, setInfo] = useState(null);
  const [tooltipVisible, setTooltipVisible] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ tooltip: "", descricao: "", fonte: "" });
  const [saving, setSaving] = useState(false);
  const tooltipRef = useRef(null);

  // Fetch indicator info if dataset+key provided
  useEffect(() => {
    if (!hasIndicador) return;
    api
      .get("/indicadores", { params: { dataset, indicador_key: indicadorKey } })
      .then((r) => {
        setInfo(r.data);
        setForm({
          tooltip: r.data.tooltip || "",
          descricao: r.data.descricao || "",
          fonte: r.data.fonte || "",
        });
      })
      .catch(() => {});
  }, [dataset, indicadorKey, hasIndicador]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await api.put(`/indicadores/${dataset}/${indicadorKey}`, form);
      setInfo(res.data);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const showInfoIcon = hasIndicador && (isGlobal || info?.tooltip || info?.descricao);
  const hasContent = info?.tooltip || info?.descricao;

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay }}
        className="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 hover:shadow-md transition-shadow duration-200 relative"
      >
        <div className="flex items-start justify-between">
          {/* Main content */}
          <div className="flex-1 min-w-0">
            <p className="text-xs uppercase tracking-wider text-slate-400 dark:text-slate-500 font-medium">
              {label}
            </p>
            <p className={`text-2xl font-bold mt-2 ${accent || "text-slate-800 dark:text-white"}`}>
              {value}
            </p>
            {sub && (
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">{sub}</p>
            )}
          </div>

          {/* Right side: icon (if any) + info button */}
          <div className="flex items-start gap-1.5 ml-2 flex-shrink-0">
            {Icon && color && (
              <div className={`p-2 rounded-xl ${color.bg}`}>
                <Icon className={`w-5 h-5 ${color.text}`} />
              </div>
            )}

            {/* ⓘ Info icon */}
            {showInfoIcon && (
              <div className="relative" ref={tooltipRef}>
                <button
                  onMouseEnter={() => hasContent && setTooltipVisible(true)}
                  onMouseLeave={() => setTooltipVisible(false)}
                  onClick={() => { setModalOpen(true); setEditing(false); }}
                  className={`p-1 rounded-lg transition-colors ${
                    hasContent
                      ? "text-teal-500 hover:bg-teal-50 dark:hover:bg-teal-950/40"
                      : "text-slate-300 dark:text-slate-600 hover:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                  }`}
                  title={hasContent ? "Ver descrição" : "Adicionar descrição (admin)"}
                >
                  <InformationCircleIcon className="w-4 h-4" />
                </button>

                {/* Hover tooltip */}
                <AnimatePresence>
                  {tooltipVisible && info?.tooltip && (
                    <motion.div
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      transition={{ duration: 0.12 }}
                      className="absolute right-0 top-8 z-50 w-56 bg-slate-800 dark:bg-slate-700 text-white text-xs rounded-xl px-3 py-2 shadow-xl pointer-events-none"
                    >
                      {info.tooltip}
                      {/* Arrow */}
                      <div className="absolute -top-1.5 right-2 w-3 h-3 bg-slate-800 dark:bg-slate-700 rotate-45 rounded-sm" />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}
          </div>
        </div>
      </motion.div>

      {/* Description Modal */}
      <AnimatePresence>
        {modalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
            onClick={(e) => { if (e.target === e.currentTarget) { setModalOpen(false); setEditing(false); } }}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-md"
            >
              {/* Modal header */}
              <div className="flex items-start justify-between p-6 border-b border-slate-100 dark:border-slate-800">
                <div>
                  <p className="text-xs uppercase tracking-wider text-teal-500 font-semibold mb-1">
                    Indicador
                  </p>
                  <h3 className="text-lg font-bold text-slate-800 dark:text-white">{label}</h3>
                </div>
                <button
                  onClick={() => { setModalOpen(false); setEditing(false); }}
                  className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  <XMarkIcon className="w-5 h-5" />
                </button>
              </div>

              {/* Modal body */}
              <div className="p-6">
                {editing ? (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
                        Tooltip (texto curto no hover)
                      </label>
                      <input
                        value={form.tooltip}
                        onChange={(e) => setForm({ ...form, tooltip: e.target.value })}
                        maxLength={250}
                        placeholder="Breve descrição do indicador (máx. 250 chars)"
                        className="w-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                      />
                      <p className="text-xs text-slate-400 mt-1 text-right">
                        {form.tooltip.length}/250
                      </p>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
                        Descrição completa
                      </label>
                      <textarea
                        rows={5}
                        value={form.descricao}
                        onChange={(e) => setForm({ ...form, descricao: e.target.value })}
                        placeholder="Explique o indicador em detalhes: metodologia, como interpretar, contexto..."
                        className="w-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 resize-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
                        Fonte
                      </label>
                      <input
                        value={form.fonte}
                        onChange={(e) => setForm({ ...form, fonte: e.target.value })}
                        placeholder="Ex: IBGE — SIDRA, MTE — CAGED"
                        className="w-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                      />
                    </div>
                    <div className="flex gap-2 pt-2">
                      <button
                        onClick={handleSave}
                        disabled={saving}
                        className="flex items-center gap-1.5 bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
                      >
                        <CheckIcon className="w-4 h-4" />
                        {saving ? "Salvando..." : "Salvar"}
                      </button>
                      <button
                        onClick={() => {
                          setEditing(false);
                          setForm({
                            tooltip: info?.tooltip || "",
                            descricao: info?.descricao || "",
                            fonte: info?.fonte || "",
                          });
                        }}
                        className="flex items-center gap-1.5 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 text-sm font-semibold px-4 py-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                      >
                        <XMarkIcon className="w-4 h-4" />
                        Cancelar
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {info?.descricao ? (
                      <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">
                        {info.descricao}
                      </p>
                    ) : (
                      <p className="text-sm text-slate-400 dark:text-slate-500 italic">
                        {isGlobal
                          ? "Nenhuma descrição configurada. Clique em Editar para adicionar."
                          : "Nenhuma descrição disponível para este indicador."}
                      </p>
                    )}

                    {info?.fonte && (
                      <div className="pt-3 border-t border-slate-100 dark:border-slate-800">
                        <p className="text-xs text-slate-400 dark:text-slate-500">
                          <span className="font-semibold">Fonte:</span> {info.fonte}
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Modal footer — admin edit button */}
              {isGlobal && !editing && (
                <div className="px-6 pb-6">
                  <button
                    onClick={() => setEditing(true)}
                    className="flex items-center gap-2 text-xs font-semibold text-slate-400 hover:text-teal-600 dark:hover:text-teal-400 transition-colors"
                  >
                    <PencilIcon className="w-3.5 h-3.5" />
                    Editar descrição
                  </button>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
