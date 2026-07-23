import { describe, expect, it } from "vitest";
import { diasAtraso, progresso, tarefaAtrasada } from "./projetoStatus";

const HOJE = new Date("2026-07-23T12:00:00");

describe("diasAtraso", () => {
  it("null sem data_prazo", () => {
    expect(diasAtraso({ status: "em_andamento" }, HOJE)).toBe(null);
  });
  it("null quando concluido, mesmo vencido", () => {
    expect(diasAtraso({ data_prazo: "2026-07-01", status: "concluido" }, HOJE)).toBe(null);
  });
  it("prazo hoje nao e atraso", () => {
    expect(diasAtraso({ data_prazo: "2026-07-23", status: "em_andamento" }, HOJE)).toBe(null);
  });
  it("prazo ontem = 1 dia", () => {
    expect(diasAtraso({ data_prazo: "2026-07-22", status: "em_andamento" }, HOJE)).toBe(1);
  });
  it("12 dias de atraso", () => {
    expect(diasAtraso({ data_prazo: "2026-07-11", status: "nao_iniciado" }, HOJE)).toBe(12);
  });
});

describe("tarefaAtrasada", () => {
  it("false sem prazo", () => {
    expect(tarefaAtrasada({ concluida: false }, HOJE)).toBe(false);
  });
  it("false quando concluida", () => {
    expect(tarefaAtrasada({ prazo: "2026-07-01", concluida: true }, HOJE)).toBe(false);
  });
  it("false com prazo hoje", () => {
    expect(tarefaAtrasada({ prazo: "2026-07-23", concluida: false }, HOJE)).toBe(false);
  });
  it("true com prazo vencido e nao concluida", () => {
    expect(tarefaAtrasada({ prazo: "2026-07-22", concluida: false }, HOJE)).toBe(true);
  });
});

describe("progresso", () => {
  it("null para lista vazia ou ausente", () => {
    expect(progresso([])).toBe(null);
    expect(progresso(undefined)).toBe(null);
  });
  it("parcial", () => {
    expect(
      progresso([{ concluida: true }, { concluida: true }, { concluida: false }])
    ).toEqual({ feitas: 2, total: 3, pct: 67 });
  });
  it("completa", () => {
    expect(progresso([{ concluida: true }])).toEqual({ feitas: 1, total: 1, pct: 100 });
  });
});
