// Pill de estágio compartilhada pelos kanbans.
// Funil passa `color` (valor CSS, ex.: "#f59e0b"); Captação/Escrita passam
// `className` (classes Tailwind, ex.: "bg-[var(--panel-2)] text-amber-400").
export default function EstagioPill({ label, color, className = "" }) {
  if (color) {
    return (
      <span
        className="px-2 py-0.5 rounded-full text-[11px] font-medium"
        style={{ background: "var(--panel-2)", color }}
      >
        {label}
      </span>
    );
  }
  return <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${className}`}>{label}</span>;
}
