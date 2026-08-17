import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  InformationCircleIcon,
  XMarkIcon,
  PencilIcon,
  CheckIcon,
} from "@heroicons/react/24/outline";
import { useAuth } from "../context/AuthContext";
import api from "../services/api";
import { Sparkline } from "./nid/charts";

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
 *   period       — string? — appended to label as "· 2023"
 *   value        — string (required)
 *   unit         — string? — softer-weight unit rendered after value (e.g. "Bi")
 *   sub          — string? — subtitle below value (deprecated in favour of period)
 *   delta        — { value: number, direction: "up"|"down"|"flat", fmt?: fn }? — delta chip
 *   deltaLabel   — string? — text after the delta chip (e.g. "vs 2022")
 *   spark        — number[]? — sparkline data array
 *   sparkColor   — string? — CSS color for sparkline (defaults to --accent-1 or --accent-2 on down)
 *   icon         — Heroicon component (optional)
 *   color        — { bg, text } tailwind strings (optional, for icon background)
 *   accent       — CSS color (e.g. var(--accent-5)) for value text (optional)
 *   delay        — framer-motion animation delay (optional)
 *   dataset      — string — page key e.g. "pib"
 *   indicadorKey — string — slug e.g. "ultimo_ano"
 */

function DeltaChip({ value, direction }) {
  if (value == null) return null;
  const arrow = direction === "up" ? "▲" : direction === "down" ? "▼" : "—";
  const sign = value > 0 ? "+" : value < 0 ? "−" : "±";
  const cls = `nid-delta ${direction || "flat"}`;
  return (
    <span className={cls}>
      {arrow} {sign}{Math.abs(value).toFixed(1)}%
    </span>
  );
}

export default function KpiCard({
  label,
  period,
  value,
  unit,
  sub,
  delta,
  deltaLabel,
  spark,
  sparkColor,
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
  const [tipPos, setTipPos] = useState({ top: 0, right: 0 });
  const tooltipRef = useRef(null);

  const showTooltip = () => {
    if (!tooltipRef.current) return;
    const rect = tooltipRef.current.getBoundingClientRect();
    setTipPos({ top: rect.bottom + 8, right: window.innerWidth - rect.right });
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

  const fullLabel = period ? `${label} · ${period}` : label;
  const autoSparkColor =
    sparkColor || (delta?.direction === "down" ? "var(--accent-2)" : "var(--accent-1)");
  const showFoot = delta || deltaLabel || sub;

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay }}
        className="nid-kpi"
      >
        <div className="flex items-start justify-between gap-2">
          {/* Main content */}
          <div className="flex-1 min-w-0">
            <p className="nid-kpi-label">{fullLabel}</p>
            <p className="nid-kpi-value" style={accent ? { color: accent } : undefined}>
              {value}
              {unit && <span className="nid-unit"> {unit}</span>}
            </p>
            {showFoot && (
              <p className="nid-kpi-foot">
                {delta && <DeltaChip {...delta} />}
                {deltaLabel && <span>{deltaLabel}</span>}
                {sub && <span className="foot-text" style={{ marginLeft: delta || deltaLabel ? "auto" : undefined }}>{sub}</span>}
              </p>
            )}
          </div>

          {/* Right side: icon (if any) + info button */}
          <div className="flex items-start gap-1.5 flex-shrink-0">
            {Icon && color && (
              <div className={`p-2 rounded-xl ${color.bg}`}>
                <Icon className="w-5 h-5" style={{ color: color.text }} />
              </div>
            )}

            {/* ⓘ Info icon */}
            {showInfoIcon && (
              <div className="relative" ref={tooltipRef}>
                <button
                  onMouseEnter={() => hasContent && showTooltip()}
                  onMouseLeave={() => setTooltipVisible(false)}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setModalOpen(true);
                    setEditing(false);
                  }}
                  className="p-1 rounded-lg transition-colors nid-info-btn"
                  style={{
                    color: hasContent ? "var(--accent-1)" : "var(--text-mute)",
                  }}
                  aria-label={hasContent ? "Ver descrição" : "Adicionar descrição"}
                  title={hasContent ? undefined : "Adicionar descrição"}
                >
                  <InformationCircleIcon className="w-4 h-4" />
                </button>

                {/* Hover tooltip — portal no body: .nid-kpi tem overflow:hidden
                    e backdrop-filter, que cortavam/escondiam o tooltip atrás
                    dos painéis seguintes */}
                {createPortal(
                  <AnimatePresence>
                    {tooltipVisible && info?.tooltip && (
                      <motion.div
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        transition={{ duration: 0.12 }}
                        style={{ top: tipPos.top, right: tipPos.right }}
                        className="fixed z-50 w-56 text-xs pointer-events-none nid-info-tip"
                      >
                        {info.tooltip}
                        {/* Arrow */}
                        <div className="absolute -top-1.5 right-2 w-3 h-3 nid-info-tip__arrow nid-info-tip__arrow--up rotate-45 rounded-sm" />
                      </motion.div>
                    )}
                  </AnimatePresence>,
                  document.body
                )}
              </div>
            )}
          </div>
        </div>

        {spark && spark.length > 1 && (
          <div className="nid-kpi-spark">
            <Sparkline data={spark} color={autoSparkColor} />
          </div>
        )}
      </motion.div>

      {/* Description Modal — portal no body pelo mesmo motivo do tooltip:
          backdrop-filter no card vira containing block de position:fixed */}
      {createPortal(
      <AnimatePresence>
        {modalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
            onClick={(e) => {
              e.stopPropagation();
              if (e.target === e.currentTarget) { setModalOpen(false); setEditing(false); }
            }}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className="bg-[var(--panel)] rounded-2xl shadow-2xl border border-[var(--border)] w-full max-w-md"
            >
              {/* Modal header */}
              <div className="flex items-start justify-between p-6 border-b border-[var(--border)]">
                <div>
                  <p className="text-xs uppercase tracking-wider text-teal-500 font-semibold mb-1">
                    Indicador
                  </p>
                  <h3 className="text-lg font-bold text-[var(--text)]">{label}</h3>
                </div>
                <button
                  onClick={() => { setModalOpen(false); setEditing(false); }}
                  className="p-2 rounded-xl text-[var(--text-mute)] hover:text-[var(--text-dim)] hover:bg-[var(--panel-2)] transition-colors"
                >
                  <XMarkIcon className="w-5 h-5" />
                </button>
              </div>

              {/* Modal body */}
              <div className="p-6">
                {editing ? (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-semibold text-[var(--text-dim)] uppercase tracking-wider mb-1.5">
                        Tooltip (texto curto no hover)
                      </label>
                      <input
                        value={form.tooltip}
                        onChange={(e) => setForm({ ...form, tooltip: e.target.value })}
                        maxLength={250}
                        placeholder="Breve descrição do indicador (máx. 250 chars)"
                        className="w-full border border-[var(--border)] bg-[var(--panel-2)] text-[var(--text)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                      />
                      <p className="text-xs text-slate-400 mt-1 text-right">
                        {form.tooltip.length}/250
                      </p>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-[var(--text-dim)] uppercase tracking-wider mb-1.5">
                        Descrição completa
                      </label>
                      <textarea
                        rows={5}
                        value={form.descricao}
                        onChange={(e) => setForm({ ...form, descricao: e.target.value })}
                        placeholder="Explique o indicador em detalhes: metodologia, como interpretar, contexto..."
                        className="w-full border border-[var(--border)] bg-[var(--panel-2)] text-[var(--text)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 resize-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-[var(--text-dim)] uppercase tracking-wider mb-1.5">
                        Fonte
                      </label>
                      <input
                        value={form.fonte}
                        onChange={(e) => setForm({ ...form, fonte: e.target.value })}
                        placeholder="Ex: IBGE — SIDRA, MTE — CAGED"
                        className="w-full border border-[var(--border)] bg-[var(--panel-2)] text-[var(--text)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
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
                        className="flex items-center gap-1.5 border border-[var(--border)] text-[var(--text-dim)] text-sm font-semibold px-4 py-2 rounded-lg hover:bg-[var(--panel-2)] transition-colors"
                      >
                        <XMarkIcon className="w-4 h-4" />
                        Cancelar
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {info?.descricao ? (
                      <p className="text-sm text-[var(--text-dim)] leading-relaxed whitespace-pre-wrap">
                        {info.descricao}
                      </p>
                    ) : (
                      <p className="text-sm text-[var(--text-mute)] italic">
                        {isGlobal
                          ? "Nenhuma descrição configurada. Clique em Editar para adicionar."
                          : "Nenhuma descrição disponível para este indicador."}
                      </p>
                    )}

                    {info?.fonte && (
                      <div className="pt-3 border-t border-[var(--border)]">
                        <p className="text-xs text-[var(--text-mute)]">
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
                    className="flex items-center gap-2 text-xs font-semibold text-[var(--text-mute)] hover:text-teal-400 transition-colors"
                  >
                    <PencilIcon className="w-3.5 h-3.5" />
                    Editar descrição
                  </button>
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
