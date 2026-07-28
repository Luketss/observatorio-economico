// NidSelect — <select> nativo tokenizado (UX/UI C4). Seta nativa por
// precedente do FilterBar; aria-label obrigatório.
export default function NidSelect({ value, onChange, ariaLabel, children, className = "" }) {
  return (
    <select
      value={value}
      onChange={onChange}
      aria-label={ariaLabel}
      className={`rounded-xl border border-[var(--border)] bg-[var(--panel)] text-[var(--text)] text-sm px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-[var(--accent-1)] ${className}`}
    >
      {children}
    </select>
  );
}
