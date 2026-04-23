import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  InformationCircleIcon,
  XMarkIcon,
  PencilIcon,
  CheckIcon,
} from "@heroicons/react/24/outline";
import { useAuth } from "../context/AuthContext";
import api from "../services/api";

/**
 * Small info icon for chart section headers.
 * Reuses the same IndicadorInfo API as KpiCard.
 *
 * Usage:
 *   <div className="flex items-center gap-2">
 *     <h3>Saldo Mensal</h3>
 *     <ChartInfoIcon dataset="caged" indicadorKey="chart_saldo" />
 *   </div>
 */
export default function ChartInfoIcon({ dataset, indicadorKey }) {
  const { user } = useAuth();
  const isGlobal = user?.role === "ADMIN_GLOBAL";

  const [info, setInfo] = useState(null);
  const [tooltipVisible, setTooltipVisible] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ tooltip: "", descricao: "", fonte: "" });
  const [saving, setSaving] = useState(false);
  const iconRef = useRef(null);

  useEffect(() => {
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
  }, [dataset, indicadorKey]);

  const hasContent = info?.tooltip || info?.descricao;
  const showIcon = isGlobal || hasContent;

  if (!showIcon) return null;

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

  return (
    <>
      <div className="relative inline-flex items-center" ref={iconRef}>
        <button
          type="button"
          onMouseEnter={() => info?.tooltip && setTooltipVisible(true)}
          onMouseLeave={() => setTooltipVisible(false)}
          onClick={() => { setModalOpen(true); setEditing(false); }}
          className={`p-0.5 rounded transition-colors ${
            hasContent
              ? "text-teal-500 hover:text-teal-600"
              : "text-slate-300 hover:text-slate-400"
          }`}
          title={hasContent ? "Ver descrição" : isGlobal ? "Adicionar descrição" : undefined}
        >
          <InformationCircleIcon className="w-4 h-4" />
        </button>

        {/* Hover tooltip */}
        <AnimatePresence>
          {tooltipVisible && info?.tooltip && (
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 z-50 w-56 bg-slate-800 text-white text-xs rounded-lg px-3 py-2 shadow-lg pointer-events-none"
            >
              {info.tooltip}
              <div className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-x-4 border-x-transparent border-t-4 border-t-slate-800" />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Detail / edit modal */}
      <AnimatePresence>
        {modalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
            onClick={(e) => { if (e.target === e.currentTarget) { setModalOpen(false); setEditing(false); } }}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4"
            >
              <div className="flex items-start justify-between gap-3">
                <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">
                  Descrição do gráfico
                </h3>
                <button
                  onClick={() => { setModalOpen(false); setEditing(false); }}
                  className="text-slate-400 hover:text-slate-600 transition-colors"
                >
                  <XMarkIcon className="w-5 h-5" />
                </button>
              </div>

              {editing ? (
                <div className="space-y-3">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                      Tooltip (curto, máx. 250 chars)
                    </label>
                    <input
                      value={form.tooltip}
                      onChange={(e) => setForm((p) => ({ ...p, tooltip: e.target.value }))}
                      maxLength={250}
                      className="px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                    />
                    <span className="text-xs text-slate-400 text-right">{form.tooltip.length}/250</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-slate-500 uppercase tracking-wider">Descrição completa</label>
                    <textarea
                      value={form.descricao}
                      onChange={(e) => setForm((p) => ({ ...p, descricao: e.target.value }))}
                      rows={5}
                      className="px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 resize-none"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-slate-500 uppercase tracking-wider">Fonte</label>
                    <input
                      value={form.fonte}
                      onChange={(e) => setForm((p) => ({ ...p, fonte: e.target.value }))}
                      placeholder="Ex.: IBGE — SIDRA"
                      className="px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                    />
                  </div>
                  <div className="flex gap-2 justify-end pt-1">
                    <button
                      onClick={() => setEditing(false)}
                      className="px-3 py-1.5 text-sm rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={handleSave}
                      disabled={saving}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg bg-teal-600 hover:bg-teal-700 text-white transition-colors disabled:opacity-50"
                    >
                      <CheckIcon className="w-4 h-4" />
                      {saving ? "Salvando..." : "Salvar"}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {info?.descricao ? (
                    <p className="text-sm text-slate-600 dark:text-slate-300 whitespace-pre-line leading-relaxed">
                      {info.descricao}
                    </p>
                  ) : (
                    <p className="text-sm text-slate-400 italic">Nenhuma descrição adicionada ainda.</p>
                  )}
                  {info?.fonte && (
                    <p className="text-xs text-slate-400">
                      <span className="font-medium">Fonte:</span> {info.fonte}
                    </p>
                  )}
                  {isGlobal && (
                    <button
                      onClick={() => setEditing(true)}
                      className="flex items-center gap-1.5 text-xs text-teal-600 hover:text-teal-700 transition-colors"
                    >
                      <PencilIcon className="w-3.5 h-3.5" />
                      Editar descrição
                    </button>
                  )}
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
