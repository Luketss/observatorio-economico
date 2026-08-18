import { useEffect, useState, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChartPieIcon,
  PlusIcon,
  XMarkIcon,
  PencilIcon,
  TrashIcon,
  ChevronRightIcon,
} from "@heroicons/react/24/outline";
import api from "../../services/api";
import { useToast } from "../../context/ToastContext";
import { useEscapeKey } from "../../hooks/useEscapeKey";
import { usePermissao } from "../../hooks/usePermissao";
import { Sparkline } from "../../components/nid/charts";

const defaultForm = {
  area: "", nome_metrica: "", valor: "", unidade: "",
  periodo_tipo: "anual", periodo_ano: new Date().getFullYear(), periodo_mes: "",
  fonte: "", observacoes: "",
};

const MESES = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

function fmtPeriodo(ind) {
  if (ind.periodo_tipo === "mensal" && ind.periodo_mes) {
    return `${MESES[ind.periodo_mes - 1]}/${ind.periodo_ano}`;
  }
  return String(ind.periodo_ano);
}

function fmtValue(v) {
  if (v == null) return "—";
  const n = Number(v);
  if (isNaN(n)) return String(v);
  // Use abbreviated form for large numbers
  if (Math.abs(n) >= 1_000_000) return (n / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 2 }) + " M";
  if (Math.abs(n) >= 1_000) return n.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
  return n.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}

/** Derive a delta chip object from all entries for the same (area, nome_metrica). */
function computeDelta(ind, allForMetric) {
  // Sort entries by year, then month ascending to find the previous entry
  const sorted = [...allForMetric].sort((a, b) => {
    if (a.periodo_ano !== b.periodo_ano) return a.periodo_ano - b.periodo_ano;
    return (a.periodo_mes || 0) - (b.periodo_mes || 0);
  });
  const idx = sorted.findIndex((e) => e.id === ind.id);
  if (idx < 1) return null;
  const prev = sorted[idx - 1];
  if (prev.valor == null || prev.valor === 0) return null;
  const pct = ((ind.valor - prev.valor) / Math.abs(prev.valor)) * 100;
  return {
    value: pct,
    direction: pct > 0.05 ? "up" : pct < -0.05 ? "down" : "flat",
  };
}

/** Given all entries for a metric, build a sparkline array (values in chronological order). */
function buildSpark(allForMetric) {
  const sorted = [...allForMetric].sort((a, b) => {
    if (a.periodo_ano !== b.periodo_ano) return a.periodo_ano - b.periodo_ano;
    return (a.periodo_mes || 0) - (b.periodo_mes || 0);
  });
  const vals = sorted.map((e) => Number(e.valor)).filter((v) => !isNaN(v));
  return vals.length >= 3 ? vals : null;
}

/* ─── Compact KPI Cell ─────────────────────────────────────────────────── */
function IndCell({ ind, delta, spark, canEditar, canExcluir, onEdit, onDelete }) {
  const arrow = delta
    ? delta.direction === "up" ? "▲" : delta.direction === "down" ? "▼" : "—"
    : null;
  const sign  = delta ? (delta.value > 0 ? "+" : delta.value < 0 ? "−" : "±") : null;
  const deltaClass = delta ? `nid-delta ${delta.direction}` : "";

  return (
    <div className="ind-cell">
      <p className="ind-cell__label" title={ind.nome_metrica}>{ind.nome_metrica}</p>

      <div className="ind-cell__value">
        {fmtValue(ind.valor)}
        {ind.unidade && <span className="ind-cell__unit">{ind.unidade}</span>}
      </div>

      <div className="ind-cell__foot">
        {delta && (
          <span className={deltaClass}>
            {arrow} {sign}{Math.abs(delta.value).toFixed(1)}%
          </span>
        )}
        <span className="ind-cell__period">{fmtPeriodo(ind)}</span>
      </div>

      {spark && (
        <div className="ind-cell__spark">
          <Sparkline
            data={spark}
            color={delta?.direction === "down" ? "var(--accent-2)" : "var(--accent-1)"}
            height={32}
            width={200}
          />
        </div>
      )}

      {(canEditar || canExcluir) && (
        <div className="ind-cell__actions">
          {canEditar && (
            <button
              onClick={() => onEdit(ind)}
              title={`Editar ${ind.nome_metrica}`}
            >
              <PencilIcon style={{ width: 12, height: 12 }} />
            </button>
          )}
          {canExcluir && (
            <button
              className="del"
              onClick={() => onDelete(ind.id)}
              title={`Excluir ${ind.nome_metrica}`}
            >
              <TrashIcon style={{ width: 12, height: 12 }} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── "+ Adicionar" trailing cell ─────────────────────────────────────── */
function AddCell({ onClick }) {
  return (
    <button className="ind-cell ind-cell--add" onClick={onClick} type="button">
      <PlusIcon style={{ width: 18, height: 18 }} />
      <span>Adicionar</span>
    </button>
  );
}

/* ─── Main page ────────────────────────────────────────────────────────── */
export default function IndicadoresInternosPage() {
  const { addToast } = useToast();
  const canCriar = usePermissao("dados_internos", "criar");
  const canEditar = usePermissao("dados_internos", "editar");
  const canExcluir = usePermissao("dados_internos", "excluir");

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

  useEscapeKey(useCallback(() => {
    if (deleteConfirmId) { setDeleteConfirmId(null); return; }
    if (showForm) closeForm();
  }, [deleteConfirmId, showForm]));

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

  // Group by area, compute delta/spark per metric
  const grouped = useMemo(() => {
    const map = {};
    indicadores.forEach((d) => {
      if (!map[d.area]) map[d.area] = [];
      map[d.area].push(d);
    });
    return map;
  }, [indicadores]);

  // For each (area, nome_metrica) key, build the sorted list of entries
  const metricMap = useMemo(() => {
    const m = {};
    indicadores.forEach((d) => {
      const key = `${d.area}|||${d.nome_metrica}`;
      if (!m[key]) m[key] = [];
      m[key].push(d);
    });
    return m;
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
        addToast("Indicador atualizado", "success");
      } else {
        await api.post("/dados_internos/indicadores", payload);
        addToast("Indicador criado", "success");
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
      addToast("Indicador excluído", "success");
      await load();
    } catch (err) {
      addToast("Erro ao excluir", "error");
    }
  }

  function toggleArea(area) {
    setOpenAreas((prev) => {
      const next = new Set(prev);
      next.has(area) ? next.delete(area) : next.add(area);
      return next;
    });
  }

  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", padding: "80px 0" }}>
        <div style={{
          width: 32, height: 32,
          border: "3px solid var(--border-strong)",
          borderTopColor: "var(--accent-1)",
          borderRadius: "50%",
          animation: "spin 0.7s linear infinite",
        }} />
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      style={{ display: "flex", flexDirection: "column", gap: 28 }}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <ChartPieIcon style={{ width: 28, height: 28, color: "var(--accent-1)" }} />
          <div>
            <h1 style={{ margin: 0, font: "800 22px/1.1 var(--font-display)", color: "var(--text)", letterSpacing: "-0.02em" }}>
              Indicadores & Cidade Inteligente
            </h1>
            <p style={{ margin: "4px 0 0", font: "400 13px/1 var(--font-display)", color: "var(--text-dim)" }}>
              Dados estratégicos do município por área temática.
            </p>
          </div>
        </div>
        {canCriar && (
          <button
            onClick={openCreate}
            style={{
              display: "flex", alignItems: "center", gap: 8,
              background: "var(--accent-1)", color: "var(--bg)",
              padding: "9px 16px", borderRadius: 10, border: "none",
              font: "600 13px/1 var(--font-display)", cursor: "pointer",
              transition: "opacity 0.15s",
            }}
            onMouseEnter={(e) => e.currentTarget.style.opacity = "0.85"}
            onMouseLeave={(e) => e.currentTarget.style.opacity = "1"}
          >
            <PlusIcon style={{ width: 15, height: 15 }} />
            Novo Indicador
          </button>
        )}
      </div>

      {/* Summary KPIs */}
      <div className="nid-admin-stats" style={{ margin: 0 }}>
        <div className="nid-admin-stats__cell">
          <div className="nid-admin-stats__label">Total de registros</div>
          <div className="nid-admin-stats__value">{kpis.total}</div>
        </div>
        <div className="nid-admin-stats__cell">
          <div className="nid-admin-stats__label">Áreas temáticas</div>
          <div className="nid-admin-stats__value">{kpis.areas}</div>
        </div>
      </div>

      {/* Grouped grids */}
      {Object.keys(grouped).length === 0 ? (
        <div style={{ textAlign: "center", padding: "64px 20px", color: "var(--text-dim)" }}>
          <ChartPieIcon style={{ width: 40, height: 40, margin: "0 auto 12px", opacity: 0.4 }} />
          <p style={{ font: "400 13px/1 var(--font-display)" }}>Nenhum indicador cadastrado ainda.</p>
          {canCriar && (
            <button
              onClick={openCreate}
              style={{
                marginTop: 16, display: "inline-flex", alignItems: "center", gap: 6,
                background: "var(--accent-1)", color: "var(--bg)",
                padding: "8px 14px", borderRadius: 8, border: "none",
                font: "600 12px/1 var(--font-display)", cursor: "pointer",
              }}
            >
              <PlusIcon style={{ width: 14, height: 14 }} />
              Criar primeiro indicador
            </button>
          )}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {Object.entries(grouped)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([area, items]) => {
              const isOpen = openAreas.has(area);
              return (
                <div key={area}>
                  {/* Section heading */}
                  <div className="ind-section__head" onClick={() => toggleArea(area)}>
                    <span className="ind-section__title">{area}</span>
                    <span className="ind-section__count">{items.length} registro{items.length !== 1 ? "s" : ""}</span>
                    <ChevronRightIcon
                      className={`ind-section__chevron${isOpen ? " open" : ""}`}
                      style={{ width: 14, height: 14 }}
                    />
                  </div>

                  <AnimatePresence initial={false}>
                    {isOpen && (
                      <motion.div
                        key="grid"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.22, ease: "easeInOut" }}
                        style={{ overflow: "hidden" }}
                      >
                        <div className="ind-grid">
                          {items.map((ind) => {
                            const key = `${ind.area}|||${ind.nome_metrica}`;
                            const allForMetric = metricMap[key] || [ind];
                            const delta = computeDelta(ind, allForMetric);
                            const spark  = buildSpark(allForMetric);
                            return (
                              <IndCell
                                key={ind.id}
                                ind={ind}
                                delta={delta}
                                spark={spark}
                                canEditar={canEditar}
                                canExcluir={canExcluir}
                                onEdit={openEdit}
                                onDelete={(id) => setDeleteConfirmId(id)}
                              />
                            );
                          })}

                          {/* "+ Adicionar" cell — admin only */}
                          {canCriar && <AddCell onClick={openCreate} />}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
        </div>
      )}

      {/* ── Form modal ───────────────────────────────────────────── */}
      <AnimatePresence>
        {showForm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              position: "fixed", inset: 0, zIndex: 50,
              display: "flex", alignItems: "center", justifyContent: "center",
              background: "rgba(0,0,0,0.45)", backdropFilter: "blur(4px)", padding: 16,
            }}
            onClick={(e) => { if (e.target === e.currentTarget) closeForm(); }}
          >
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              style={{
                background: "var(--panel)",
                border: "1px solid var(--border-strong)",
                borderRadius: 18,
                boxShadow: "var(--shadow-card)",
                width: "100%", maxWidth: 560, padding: 24,
                maxHeight: "90vh", overflowY: "auto",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
                <h3 style={{ margin: 0, font: "700 15px/1 var(--font-display)", color: "var(--text)" }}>
                  {editingId ? "Editar Indicador" : "Novo Indicador"}
                </h3>
                <button
                  onClick={closeForm}
                  style={{ background: "none", border: "none", color: "var(--text-dim)", cursor: "pointer", padding: 4 }}
                >
                  <XMarkIcon style={{ width: 18, height: 18 }} />
                </button>
              </div>

              <form onSubmit={handleSubmit} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                {/* Area */}
                <div style={{ gridColumn: "1/-1", display: "flex", flexDirection: "column", gap: 5 }}>
                  <label style={{ font: "600 10.5px/1 var(--font-mono)", color: "var(--text-mute)", textTransform: "uppercase", letterSpacing: "0.12em" }}>
                    Área temática
                  </label>
                  <input
                    list="areas-list"
                    value={form.area}
                    onChange={(e) => setForm((p) => ({ ...p, area: e.target.value }))}
                    required
                    placeholder="Ex.: Energia, Saúde, Turismo..."
                    style={inputStyle}
                  />
                  <datalist id="areas-list">
                    {areasExistentes.map((a) => <option key={a} value={a} />)}
                  </datalist>
                </div>

                {/* Nome métrica */}
                <div style={{ gridColumn: "1/-1", display: "flex", flexDirection: "column", gap: 5 }}>
                  <label style={labelStyle}>Nome da métrica</label>
                  <input
                    value={form.nome_metrica}
                    onChange={(e) => setForm((p) => ({ ...p, nome_metrica: e.target.value }))}
                    required
                    placeholder="Ex.: Consumo per capita de energia"
                    style={inputStyle}
                  />
                </div>

                {/* Valor */}
                <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                  <label style={labelStyle}>Valor</label>
                  <input
                    type="number" step="any"
                    value={form.valor}
                    onChange={(e) => setForm((p) => ({ ...p, valor: e.target.value }))}
                    required
                    style={inputStyle}
                  />
                </div>

                {/* Unidade */}
                <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                  <label style={labelStyle}>Unidade</label>
                  <input
                    value={form.unidade}
                    onChange={(e) => setForm((p) => ({ ...p, unidade: e.target.value }))}
                    required
                    placeholder="Ex.: kWh, R$, hab."
                    style={inputStyle}
                  />
                </div>

                {/* Periodicidade */}
                <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                  <label style={labelStyle}>Periodicidade</label>
                  <select
                    value={form.periodo_tipo}
                    onChange={(e) => setForm((p) => ({ ...p, periodo_tipo: e.target.value, periodo_mes: "" }))}
                    style={inputStyle}
                  >
                    <option value="anual">Anual</option>
                    <option value="mensal">Mensal</option>
                  </select>
                </div>

                {/* Ano */}
                <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                  <label style={labelStyle}>Ano</label>
                  <input
                    type="number"
                    value={form.periodo_ano}
                    onChange={(e) => setForm((p) => ({ ...p, periodo_ano: e.target.value }))}
                    required
                    style={inputStyle}
                  />
                </div>

                {/* Mês (conditional) */}
                {form.periodo_tipo === "mensal" && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                    <label style={labelStyle}>Mês</label>
                    <select
                      value={form.periodo_mes}
                      onChange={(e) => setForm((p) => ({ ...p, periodo_mes: e.target.value }))}
                      style={inputStyle}
                    >
                      <option value="">Selecione</option>
                      {MESES.map((m, i) => (
                        <option key={i + 1} value={i + 1}>{m}</option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Fonte */}
                <div style={{ gridColumn: "1/-1", display: "flex", flexDirection: "column", gap: 5 }}>
                  <label style={labelStyle}>Fonte</label>
                  <input
                    value={form.fonte}
                    onChange={(e) => setForm((p) => ({ ...p, fonte: e.target.value }))}
                    placeholder="Ex.: ANEEL — Sistema SIGA"
                    style={inputStyle}
                  />
                </div>

                {/* Observações */}
                <div style={{ gridColumn: "1/-1", display: "flex", flexDirection: "column", gap: 5 }}>
                  <label style={labelStyle}>Observações</label>
                  <textarea
                    value={form.observacoes}
                    onChange={(e) => setForm((p) => ({ ...p, observacoes: e.target.value }))}
                    rows={2}
                    style={{ ...inputStyle, resize: "none" }}
                  />
                </div>

                {/* Footer */}
                <div style={{ gridColumn: "1/-1", display: "flex", alignItems: "center", gap: 10, paddingTop: 4 }}>
                  {formError && (
                    <p style={{ flex: 1, margin: 0, font: "500 12px/1.4 var(--font-display)", color: "var(--accent-2)" }}>
                      {formError}
                    </p>
                  )}
                  <div style={{ display: "flex", gap: 10, marginLeft: "auto" }}>
                    <button type="button" onClick={closeForm} style={btnSecondary}>Cancelar</button>
                    <button type="submit" disabled={saving} style={btnPrimary}>
                      {saving ? "Salvando..." : editingId ? "Salvar" : "Criar"}
                    </button>
                  </div>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Delete confirmation ──────────────────────────────────── */}
      <AnimatePresence>
        {deleteConfirmId && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              position: "fixed", inset: 0, zIndex: 50,
              display: "flex", alignItems: "center", justifyContent: "center",
              background: "rgba(0,0,0,0.45)", backdropFilter: "blur(4px)", padding: 16,
            }}
          >
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              style={{
                background: "var(--panel)",
                border: "1px solid var(--border-strong)",
                borderRadius: 18,
                boxShadow: "var(--shadow-card)",
                width: "100%", maxWidth: 360, padding: 24,
                display: "flex", flexDirection: "column", gap: 12,
              }}
            >
              <h3 style={{ margin: 0, font: "700 15px/1 var(--font-display)", color: "var(--text)" }}>
                Excluir indicador?
              </h3>
              <p style={{ margin: 0, font: "400 13px/1.5 var(--font-display)", color: "var(--text-dim)" }}>
                Esta ação não pode ser desfeita.
              </p>
              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 4 }}>
                <button onClick={() => setDeleteConfirmId(null)} style={btnSecondary}>Cancelar</button>
                <button
                  onClick={() => handleDelete(deleteConfirmId)}
                  style={{ ...btnPrimary, background: "var(--accent-2)" }}
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

/* ── Inline style helpers (avoids Tailwind dark: modifiers) ─────────── */
const inputStyle = {
  padding: "8px 12px",
  borderRadius: 8,
  border: "1px solid var(--border-strong)",
  background: "var(--panel-2)",
  color: "var(--text)",
  font: "500 13px/1 var(--font-display)",
  outline: "none",
  width: "100%",
  boxSizing: "border-box",
};

const labelStyle = {
  font: "600 10.5px/1 var(--font-mono)",
  color: "var(--text-mute)",
  textTransform: "uppercase",
  letterSpacing: "0.12em",
};

const btnPrimary = {
  padding: "8px 16px",
  borderRadius: 8,
  background: "var(--accent-1)",
  color: "var(--bg)",
  border: "none",
  font: "600 13px/1 var(--font-display)",
  cursor: "pointer",
};

const btnSecondary = {
  padding: "8px 16px",
  borderRadius: 8,
  background: "transparent",
  color: "var(--text-dim)",
  border: "1px solid var(--border-strong)",
  font: "500 13px/1 var(--font-display)",
  cursor: "pointer",
};
