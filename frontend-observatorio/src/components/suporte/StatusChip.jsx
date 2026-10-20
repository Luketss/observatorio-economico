// Chip colorido com o status de um ticket de suporte.
import { STATUS_TICKET, labelStatus } from "./statusTicket";

export default function StatusChip({ status }) {
  const cor = STATUS_TICKET[status]?.cor ?? "var(--text-dim)";
  return (
    <span
      data-status={status}
      className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium"
      style={{ borderColor: cor, color: cor }}
    >
      {labelStatus(status)}
    </span>
  );
}
