import { ArrowsRightLeftIcon } from "@heroicons/react/24/outline";

export default function CompareToggle({ active, onChange, disabled }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!active)}
      disabled={disabled}
      title={disabled ? "Sem ano anterior para comparar" : "Comparar com o ano anterior"}
      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
      style={{
        background: active ? "var(--accent-1)" : "var(--panel-2)",
        color: active ? "#fff" : "var(--text-dim)",
        border: "1px solid var(--border)",
      }}
    >
      <ArrowsRightLeftIcon className="w-4 h-4" />
      Comparar com ano anterior
    </button>
  );
}
