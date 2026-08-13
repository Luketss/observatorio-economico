// Resumo puro de projetos para o card do modo gerencial do Painel.
// Reusa as derivações oficiais de status/atraso/progresso do app.
import { diasAtraso, progresso } from "./projetoStatus";

export function resumoProjetos(projetos, hoje = new Date()) {
  const lista = projetos || [];
  const emAndamento = lista.filter((p) => p.status === "em_andamento");
  const atrasados = lista.filter((p) => diasAtraso(p, hoje) !== null).length;
  const top = emAndamento
    .map((p) => ({
      id: p.id,
      titulo: p.titulo,
      pct: progresso(p.tarefas || [])?.pct ?? 0,
      diasAtraso: diasAtraso(p, hoje),
    }))
    .sort((a, b) => (b.diasAtraso ?? -1) - (a.diasAtraso ?? -1) || b.pct - a.pct)
    .slice(0, 3);
  return {
    total: lista.length,
    em_andamento: emAndamento.length,
    concluidos: lista.filter((p) => p.status === "concluido").length,
    atrasados,
    top,
  };
}
