import { useEffect, useState } from "react";

/**
 * Returns a human-readable period label from a filter object.
 * Returns null when no year filter is set (no chip should be shown).
 * Understands preset-style labels when a _preset field is present.
 */
export function describeFilter(filter) {
  if (!filter) return null;
  const { yearFrom, yearTo, monthFrom, monthTo, _preset } = filter;

  // Named presets take priority for the chip label
  if (_preset === "12m") return "Últimos 12 meses";
  if (_preset === "5a")  return "Últimos 5 anos";
  if (_preset === "10a") return "Últimos 10 anos";
  if (_preset === "tudo") return null; // no chip when "Tudo" is active

  // Janela completa ano+mês (default "12m ancorado"): "Ago/2023 – Jul/2024".
  // MONTHS é declarado mais abaixo no módulo, mas só é lido em runtime
  // (describeFilter é chamada depois da avaliação do módulo).
  if (yearFrom && yearTo && monthFrom && monthTo) {
    const de = MONTHS[+monthFrom - 1]?.label ?? monthFrom;
    const ate = MONTHS[+monthTo - 1]?.label ?? monthTo;
    return `${de}/${yearFrom} – ${ate}/${yearTo}`;
  }

  if (!yearFrom && !yearTo) return null;
  if (yearFrom && yearTo && yearFrom === yearTo) return `Ano ${yearFrom}`;
  if (yearFrom && yearTo) return `${yearFrom}–${yearTo}`;
  if (yearFrom) return `desde ${yearFrom}`;
  return `até ${yearTo}`;
}

/**
 * Returns a cleared filter object with all year/month fields reset.
 */
export function clearFilter() {
  return { yearFrom: "", yearTo: "" };
}

// ─── Preset definitions ──────────────────────────────────────────────────────

const PRESETS = [
  { key: "12m",        label: "12m" },
  { key: "5a",         label: "5a" },
  { key: "10a",        label: "10a" },
  { key: "tudo",       label: "Tudo" },
  { key: "personalizar", label: "Personalizar" },
];

/**
 * Compute the year range for a given preset key.
 * maxYear is the largest year available in the dataset.
 */
function presetRange(key, maxYear) {
  const cy = maxYear;
  if (key === "12m")  return { yearFrom: String(cy - 1), yearTo: String(cy) };
  if (key === "5a")   return { yearFrom: String(cy - 4), yearTo: String(cy) };
  if (key === "10a")  return { yearFrom: String(cy - 9), yearTo: String(cy) };
  if (key === "tudo") return { yearFrom: "", yearTo: "" };
  return null; // personalizar → no auto-fill
}

/**
 * Derive the active preset key from current yearFrom / yearTo values.
 * Returns "tudo" | "12m" | "5a" | "10a" | "personalizar".
 */
export function detectPreset(yearFrom, yearTo, maxYear) {
  const cy = maxYear;
  if (!yearFrom && !yearTo) return "tudo";
  if (!yearFrom || !yearTo) return "personalizar";
  const from = Number(yearFrom);
  const to   = Number(yearTo);
  if (to === cy) {
    const span = to - from + 1;
    // span 1 terminando no último ano com dado = janela "12m" ancorada
    // (jan..dez do último ano, ou série anual reduzida ao último ano).
    // Sem isso o default cairia em "personalizar" e abriria os selects.
    if (span === 1)  return "12m";
    if (span === 2)  return "12m";
    if (span === 5)  return "5a";
    if (span === 10) return "10a";
  }
  return "personalizar";
}

const MONTHS = [
  { value: 1, label: "Jan" }, { value: 2, label: "Fev" },
  { value: 3, label: "Mar" }, { value: 4, label: "Abr" },
  { value: 5, label: "Mai" }, { value: 6, label: "Jun" },
  { value: 7, label: "Jul" }, { value: 8, label: "Ago" },
  { value: 9, label: "Set" }, { value: 10, label: "Out" },
  { value: 11, label: "Nov" }, { value: 12, label: "Dez" },
];

// ─── Inline styles (NID tokens only — no Tailwind) ───────────────────────────

const S = {
  root: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 12,
    background: "var(--panel)",
    border: "1px solid var(--border)",
    borderRadius: 14,
    padding: "10px 16px",
    backdropFilter: "blur(10px)",
  },
  eyebrow: {
    fontSize: 10,
    fontWeight: 600,
    fontFamily: "var(--font-mono)",
    textTransform: "uppercase",
    letterSpacing: "0.14em",
    color: "var(--text-mute)",
    flexShrink: 0,
  },
  segGroup: {
    display: "flex",
    gap: 3,
    background: "var(--panel-2)",
    border: "1px solid var(--border)",
    borderRadius: 10,
    padding: 3,
  },
  segBtn: (active) => ({
    padding: "4px 10px",
    borderRadius: 7,
    border: "none",
    cursor: "pointer",
    fontFamily: "var(--font-mono)",
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: "0.04em",
    textTransform: "uppercase",
    transition: "all 0.14s",
    background: active ? "var(--accent-1)" : "transparent",
    color: active
      ? "#000"
      : "var(--text-dim)",
    boxShadow: active
      ? "0 1px 6px -2px var(--accent-1-glow)"
      : "none",
  }),
  rangeWrap: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  rangeLabel: {
    fontSize: 11,
    fontFamily: "var(--font-mono)",
    color: "var(--text-mute)",
    flexShrink: 0,
  },
  select: {
    fontSize: 12,
    fontFamily: "var(--font-mono)",
    border: "1px solid var(--border)",
    background: "var(--panel-2)",
    color: "var(--text)",
    borderRadius: 7,
    padding: "4px 8px",
    outline: "none",
    cursor: "pointer",
    transition: "border-color 0.14s",
  },
  sep: {
    color: "var(--text-mute)",
    fontSize: 13,
    fontFamily: "var(--font-mono)",
  },
  clearBtn: {
    fontSize: 11,
    fontFamily: "var(--font-mono)",
    letterSpacing: "0.04em",
    color: "var(--text-mute)",
    background: "transparent",
    border: "none",
    cursor: "pointer",
    padding: "3px 6px",
    borderRadius: 6,
    transition: "color 0.14s",
    flexShrink: 0,
  },
};

// ─── Component ───────────────────────────────────────────────────────────────

/**
 * Generic client-side filter bar — NID token edition.
 *
 * Props (unchanged from original):
 *  years      – number[] sorted asc  (derived from data by parent)
 *  showMonths – bool, show month selectors (default false)
 *  value      – { yearFrom, yearTo, monthFrom?, monthTo? } (all strings or "")
 *  onChange   – (newValue) => void
 *  id         – string, forwarded to root element
 */
export default function FilterBar({ years = [], showMonths = false, value, onChange, id }) {
  const { yearFrom = "", yearTo = "", monthFrom = "", monthTo = "" } = value || {};

  // "Personalizar" forces the custom pickers open even when the current
  // yearFrom/yearTo still resolve to a named preset (e.g. the default "12m"
  // ancorado span). Without this, clicking "Personalizar" from the default
  // state is a dead click: detectPreset keeps returning "12m" and the
  // selects never appear.
  const [forceCustom, setForceCustom] = useState(false);

  // If the value is cleared from outside (chip "Limpar" / onClear prop),
  // drop the forced custom state so the selects don't stay open with
  // phantom state. Runs before the years.length early return so hook order
  // stays stable across renders regardless of `years`.
  useEffect(() => {
    if (!yearFrom && !yearTo) {
      setForceCustom(false);
    }
  }, [yearFrom, yearTo]);

  if (years.length === 0) return null;

  const maxYear = years[years.length - 1];
  const detectedPreset = detectPreset(yearFrom, yearTo, maxYear);
  const activePreset = forceCustom ? "personalizar" : detectedPreset;

  const set = (key, v) => onChange({ ...value, [key]: v });

  const clear = () => onChange({ yearFrom: "", yearTo: "", monthFrom: "", monthTo: "" });

  const handlePreset = (key) => {
    if (key === "personalizar") {
      setForceCustom(true);
      // Reveal custom pickers; keep current range or reset to full span
      const from = yearFrom || String(years[0]);
      const to   = yearTo   || String(maxYear);
      onChange({ ...value, yearFrom: from, yearTo: to });
    } else {
      setForceCustom(false);
      const range = presetRange(key, maxYear);
      // Clear month fields when switching to a preset
      onChange({ yearFrom: range.yearFrom, yearTo: range.yearTo, monthFrom: "", monthTo: "" });
    }
  };

  const showCustom = activePreset === "personalizar";
  const hasFilter  = yearFrom || yearTo || monthFrom || monthTo;

  return (
    <div id={id} style={S.root} className="nid-filterbar">
      {/* Eyebrow label */}
      <span style={S.eyebrow}>Período</span>

      {/* Segmented preset control */}
      <div style={S.segGroup} role="group" aria-label="Preset de período">
        {PRESETS.map(({ key, label }) => {
          const isActive = activePreset === key;
          return (
            <button
              key={key}
              style={S.segBtn(isActive)}
              aria-pressed={isActive}
              onClick={() => handlePreset(key)}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* Custom year range — visible only for Personalizar */}
      {showCustom && (
        <div style={S.rangeWrap}>
          <span style={S.rangeLabel}>Ano</span>
          <select
            value={yearFrom}
            onChange={(e) => set("yearFrom", e.target.value)}
            style={S.select}
          >
            <option value="">De</option>
            {years.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          <span style={S.sep}>→</span>
          <select
            value={yearTo}
            onChange={(e) => set("yearTo", e.target.value)}
            style={S.select}
          >
            <option value="">Até</option>
            {years.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
      )}

      {/* Month selectors — only when showMonths prop is true AND in custom mode */}
      {showMonths && showCustom && (
        <div style={S.rangeWrap}>
          <span style={S.rangeLabel}>Mês</span>
          <select
            value={monthFrom}
            onChange={(e) => set("monthFrom", e.target.value)}
            style={S.select}
          >
            <option value="">De</option>
            {MONTHS.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
          <span style={S.sep}>→</span>
          <select
            value={monthTo}
            onChange={(e) => set("monthTo", e.target.value)}
            style={S.select}
          >
            <option value="">Até</option>
            {MONTHS.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
        </div>
      )}

      {/* Spacer */}
      <span style={{ flex: 1, minWidth: 0 }} />

      {/* Limpar — subtle, only visible when a non-"Tudo" filter is active */}
      {hasFilter && (
        <button
          style={S.clearBtn}
          onClick={clear}
          onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-mute)"; }}
        >
          Limpar
        </button>
      )}
    </div>
  );
}
