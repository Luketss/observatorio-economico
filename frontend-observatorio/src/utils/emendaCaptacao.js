import { fmtMoneyFull } from "../components/nid/charts";

const tipoCurto = (t) => (t || "").split(" - ")[0];

// Payload padrão do CTA emenda → kanban de captação. Mantém o formato
// que a EmendasPage sempre persistiu (fmtMoneyFull).
export function emendaParaCaptacaoPayload(e) {
  return {
    tipo: "emenda",
    titulo: `Emenda ${e.numero || e.codigo} — ${e.autor} (${e.ano})`,
    entidade_origem: e.autor,
    valor_estimado: e.empenhado || null,
    descricao: `Emenda ${tipoCurto(e.tipo)} · área ${e.funcao || "n/d"} · pago ${fmtMoneyFull(e.pago_total)} de ${fmtMoneyFull(e.empenhado)}.`,
  };
}
