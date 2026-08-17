import { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  InformationCircleIcon,
  XMarkIcon,
  PencilIcon,
  CheckIcon,
} from "@heroicons/react/24/outline";
import { useAuth } from "../context/AuthContext";
import { useEscapeKey } from "../hooks/useEscapeKey";
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
  const [erroSalvar, setErroSalvar] = useState("");
  const [tipPos, setTipPos] = useState({ bottom: 0, left: 0 });
  const iconRef = useRef(null);

  const showTooltip = () => {
    if (!info?.tooltip || !iconRef.current) return;
    const rect = iconRef.current.getBoundingClientRect();
    // w-56 = 224px — centraliza no ícone sem depender de transform
    // (framer-motion controla o transform durante a animação);
    // ancora pelo bottom porque a altura do tooltip é dinâmica
    setTipPos({
      bottom: window.innerHeight - rect.top + 8,
      left: rect.left + rect.width / 2 - 112,
    });
    setTooltipVisible(true);
  };

  // Posição é fixa no viewport; se a página rolar/redimensionar, esconde
  useEffect(() => {
    if (!tooltipVisible) return;
    const hide = () => setTooltipVisible(false);
    window.addEventListener("scroll", hide, true);
    window.addEventListener("resize", hide);
    return () => {
      window.removeEventListener("scroll", hide, true);
      window.removeEventListener("resize", hide);
    };
  }, [tooltipVisible]);

  useEscapeKey(useCallback(() => {
    if (editing) {
      setEditing(false);
      setErroSalvar("");
      return;
    }
    setModalOpen(false);
  }, [editing]), modalOpen);

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
    setErroSalvar("");
    try {
      const res = await api.put(`/indicadores/${dataset}/${indicadorKey}`, form);
      setInfo(res.data);
      setEditing(false);
    } catch {
      setErroSalvar("Não foi possível salvar — tente novamente.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="relative inline-flex items-center" ref={iconRef}>
        <button
          type="button"
          onMouseEnter={showTooltip}
          onMouseLeave={() => setTooltipVisible(false)}
          onClick={() => { setModalOpen(true); setEditing(false); }}
          className="p-0.5 rounded transition-colors nid-info-btn"
          style={{ color: hasContent ? "var(--accent-1)" : "var(--text-mute)" }}
          aria-label={hasContent ? "Ver descrição" : isGlobal ? "Adicionar descrição" : undefined}
          title={hasContent ? undefined : "Adicionar descrição"}
        >
          <InformationCircleIcon className="w-4 h-4" />
        </button>

        {/* Hover tooltip — portal no body: os cards têm backdrop-filter
            (stacking context próprio), então um z-50 interno ficaria atrás
            dos painéis irmãos seguintes */}
        {createPortal(
          <AnimatePresence>
            {tooltipVisible && info?.tooltip && (
              <motion.div
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 4 }}
                style={{ bottom: tipPos.bottom, left: tipPos.left }}
                className="fixed z-50 w-56 text-xs pointer-events-none nid-info-tip"
              >
                {info.tooltip}
                <div className="absolute left-1/2 -translate-x-1/2 -bottom-1.5 w-3 h-3 nid-info-tip__arrow nid-info-tip__arrow--down rotate-45 rounded-sm" />
              </motion.div>
            )}
          </AnimatePresence>,
          document.body
        )}
      </div>

      {/* Detail / edit modal — portal no body pelo mesmo motivo do tooltip:
          backdrop-filter no card vira containing block de position:fixed */}
      {createPortal(
      <AnimatePresence>
        {modalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
            onClick={(e) => { if (e.target === e.currentTarget) { setModalOpen(false); setEditing(false); } }}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 8 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.97, opacity: 0, y: 4 }}
              transition={{ duration: 0.22, ease: "easeOut" }}
              className="bg-[var(--panel)] rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4"
            >
              <div className="flex items-start justify-between gap-3">
                <h3 className="text-base font-bold text-[var(--text)]">
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
                  {erroSalvar && (
                    <p className="text-xs text-red-500">{erroSalvar}</p>
                  )}
                  <div className="flex gap-2 justify-end pt-1">
                    <button
                      onClick={() => {
                        setEditing(false);
                        setErroSalvar("");
                      }}
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
                    <p className="text-sm text-[var(--text-dim)] whitespace-pre-line leading-relaxed">
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
                      onClick={() => {
                        setEditing(true);
                        setErroSalvar("");
                      }}
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
      </AnimatePresence>,
      document.body
      )}
    </>
  );
}
