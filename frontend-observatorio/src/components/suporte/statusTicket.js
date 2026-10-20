// Rotulos, cores e ordem dos status de ticket de suporte, compartilhados entre as telas.
export const STATUS_TICKET = {
  aberto: { label: "Aberto", cor: "var(--accent-4)" },
  em_atendimento: { label: "Em atendimento", cor: "var(--accent-1)" },
  resolvido: { label: "Resolvido", cor: "var(--accent-5)" },
};

export const STATUS_ORDEM = ["aberto", "em_atendimento", "resolvido"];

export function labelStatus(status) {
  return STATUS_TICKET[status]?.label ?? status;
}
