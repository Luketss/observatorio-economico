import { GlobeAltIcon } from "@heroicons/react/24/outline";

/** Selo "Global" dos registros compartilhados com todos os municípios
 *  (ver ehGlobal em escopoGlobal.js). */
export default function OrigemGlobalBadge({ className = "" }) {
  return (
    <span
      title="Conteúdo global, compartilhado com todos os municípios"
      className={`inline-flex items-center gap-0.5 text-[10px] font-medium text-[var(--accent-1)] bg-[var(--panel-2)] px-1.5 py-0.5 rounded ${className}`}
    >
      <GlobeAltIcon className="w-3 h-3" />
      Especialista
    </span>
  );
}
