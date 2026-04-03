const MONTHS = [
  { value: 1, label: "Jan" }, { value: 2, label: "Fev" },
  { value: 3, label: "Mar" }, { value: 4, label: "Abr" },
  { value: 5, label: "Mai" }, { value: 6, label: "Jun" },
  { value: 7, label: "Jul" }, { value: 8, label: "Ago" },
  { value: 9, label: "Set" }, { value: 10, label: "Out" },
  { value: 11, label: "Nov" }, { value: 12, label: "Dez" },
];

const selectCls =
  "text-sm border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500";

/**
 * Generic client-side filter bar.
 *
 * Props:
 *  years      – number[] sorted asc  (derived from data by parent)
 *  showMonths – bool, show month selectors (default false)
 *  value      – { yearFrom, yearTo, monthFrom, monthTo } (all strings or "")
 *  onChange   – (newValue) => void
 */
export default function FilterBar({ years = [], showMonths = false, value, onChange }) {
  const { yearFrom = "", yearTo = "", monthFrom = "", monthTo = "" } = value || {};

  const hasFilter = yearFrom || yearTo || monthFrom || monthTo;

  const set = (key, v) => onChange({ ...value, [key]: v });

  const clear = () => onChange({ yearFrom: "", yearTo: "", monthFrom: "", monthTo: "" });

  if (years.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-3 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3">
      <span className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider shrink-0">
        Filtros
      </span>

      <div className="flex items-center gap-2">
        <label className="text-xs text-slate-500 dark:text-slate-400 shrink-0">Ano</label>
        <select value={yearFrom} onChange={(e) => set("yearFrom", e.target.value)} className={selectCls}>
          <option value="">De</option>
          {years.map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
        <span className="text-slate-300 dark:text-slate-600">–</span>
        <select value={yearTo} onChange={(e) => set("yearTo", e.target.value)} className={selectCls}>
          <option value="">Até</option>
          {years.map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
      </div>

      {showMonths && (
        <div className="flex items-center gap-2">
          <label className="text-xs text-slate-500 dark:text-slate-400 shrink-0">Mês</label>
          <select value={monthFrom} onChange={(e) => set("monthFrom", e.target.value)} className={selectCls}>
            <option value="">De</option>
            {MONTHS.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
          <span className="text-slate-300 dark:text-slate-600">–</span>
          <select value={monthTo} onChange={(e) => set("monthTo", e.target.value)} className={selectCls}>
            <option value="">Até</option>
            {MONTHS.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
        </div>
      )}

      {hasFilter && (
        <button
          onClick={clear}
          className="text-xs text-blue-500 hover:text-blue-700 dark:hover:text-blue-300 font-medium transition-colors"
        >
          Limpar filtros
        </button>
      )}
    </div>
  );
}
