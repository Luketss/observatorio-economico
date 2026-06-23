import { describe, it, expect } from "vitest";
import { splitByYear, pctChange } from "./periodos";

const MES = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

describe("splitByYear", () => {
  it("aligns latest year vs previous year by month", () => {
    const serie = [
      { ano: 2024, mes: 1, total: 10 },
      { ano: 2024, mes: 2, total: 20 },
      { ano: 2025, mes: 1, total: 15 },
    ];
    const r = splitByYear(serie, { valueKey: "total" });
    expect(r.anoAtual).toBe(2025);
    expect(r.anoAnterior).toBe(2024);
    expect(r.meses[0]).toEqual({ label: "Jan", atual: 15, anterior: 10 });
    expect(r.meses[1]).toEqual({ label: "Fev", atual: null, anterior: 20 });
  });

  it("returns null years when only one year present", () => {
    const r = splitByYear([{ ano: 2025, mes: 1, total: 5 }], { valueKey: "total" });
    expect(r.anoAtual).toBe(2025);
    expect(r.anoAnterior).toBe(null);
  });

  it("is empty-safe", () => {
    const r = splitByYear([], { valueKey: "total" });
    expect(r.anoAtual).toBe(null);
    expect(r.meses).toHaveLength(12);
  });
});

describe("pctChange", () => {
  it("computes percentage change", () => {
    expect(pctChange(150, 100)).toBeCloseTo(50);
  });
  it("returns null when base is 0 or null", () => {
    expect(pctChange(10, 0)).toBe(null);
    expect(pctChange(10, null)).toBe(null);
  });
});
