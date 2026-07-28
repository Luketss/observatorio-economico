/** Barra de execução (empenhado → pago). pct null = sem valor.
 *  label opcional substitui o texto padrão "N%" (ex.: scores 0-100 do IPS). */
export default function BarraExecucao({ pct, label }) {
  if (pct == null) return <span className="text-xs text-[var(--text-dim)]">—</span>;
  return (
    <div className="flex items-center gap-2 min-w-[120px]">
      <div className="flex-1 h-2 rounded-full bg-[var(--panel-2)] overflow-hidden" aria-hidden>
        <div className="h-full rounded-full" style={{ width: `${Math.min(pct, 100)}%`, background: pct >= 100 ? "rgba(16,185,129,.8)" : "var(--accent-1)" }} />
      </div>
      <span className="text-xs text-[var(--text-dim)] w-10 text-right">
        {label ?? `${Number(pct).toLocaleString("pt-BR")}%`}
      </span>
    </div>
  );
}
