import { describe, expect, it } from "vitest";
import { resumoProjetos } from "./projetosResumo";

const HOJE = new Date("2026-08-13");
const t = (concluidas, total) =>
  Array.from({ length: total }, (_, i) => ({ id: i, titulo: `t${i}`, concluida: i < concluidas }));

const PROJETOS = [
  { id: 1, titulo: "Creche Norte", status: "em_andamento", data_prazo: "2026-07-01", tarefas: t(1, 4) },   // atrasado 43d, 25%
  { id: 2, titulo: "Recapeamento", status: "em_andamento", data_prazo: "2026-12-01", tarefas: t(3, 4) },   // no prazo, 75%
  { id: 3, titulo: "Portal", status: "concluido", data_prazo: "2026-05-01", tarefas: t(4, 4) },
  { id: 4, titulo: "UBS Sul", status: "em_andamento", data_prazo: null, tarefas: [] },                     // sem prazo, 0%
  { id: 5, titulo: "Praça", status: "nao_iniciado", data_prazo: "2026-10-01", tarefas: t(0, 2) },
];

describe("resumoProjetos", () => {
  it("contadores por status + atrasados", () => {
    const r = resumoProjetos(PROJETOS, HOJE);
    expect(r.total).toBe(5);
    expect(r.em_andamento).toBe(3);
    expect(r.concluidos).toBe(1);
    expect(r.atrasados).toBe(1); // só o 1 (concluído não conta, sem prazo não conta)
  });

  it("top = em_andamento por atenção: atrasado primeiro, depois maior %", () => {
    const r = resumoProjetos(PROJETOS, HOJE);
    expect(r.top.map((p) => p.id)).toEqual([1, 2, 4]);
    expect(r.top[0]).toMatchObject({ titulo: "Creche Norte", pct: 25 });
    expect(r.top[0].diasAtraso).toBeGreaterThan(0);
    expect(r.top[2]).toMatchObject({ pct: 0, diasAtraso: null });
  });

  it("limita o top a 3 e aceita lista vazia", () => {
    const muitos = Array.from({ length: 6 }, (_, i) => ({
      id: i, titulo: `p${i}`, status: "em_andamento", data_prazo: null, tarefas: t(i, 6),
    }));
    expect(resumoProjetos(muitos, HOJE).top).toHaveLength(3);
    expect(resumoProjetos([], HOJE)).toMatchObject({ total: 0, em_andamento: 0, atrasados: 0, top: [] });
    expect(resumoProjetos(null, HOJE).total).toBe(0);
  });
});
