import { describe, it, expect } from "vitest";
import { splitByYear, pctChange, comparePanelData, beforeAfter } from "./periodos";

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

describe("comparePanelData", () => {
  const serie = [
    { ano: 2024, mes: 1, total: 100 },
    { ano: 2025, mes: 1, total: 150 },
  ];
  it("builds two labeled series + delta", () => {
    const r = comparePanelData(serie, { valueKey: "total" });
    expect(r.series).toEqual(["2025", "2024"]);
    expect(r.temAnterior).toBe(true);
    expect(r.chartData[0]).toEqual({ label: "Jan", "2025": 150, "2024": 100 });
    expect(r.totalAtual).toBe(150);
    expect(r.totalAnterior).toBe(100);
    expect(r.deltaPct).toBeCloseTo(50);
  });
  it("flags no previous year", () => {
    const r = comparePanelData([{ ano: 2025, mes: 1, total: 5 }], { valueKey: "total" });
    expect(r.temAnterior).toBe(false);
  });

  it("trims chartData to last populated current-year month (partial year)", () => {
    // 2025: only Jan=10, Feb=20; 2024: Jan=100, Feb=100, Mar=100 (full+ coverage)
    const serie = [
      { ano: 2024, mes: 1, total: 100 },
      { ano: 2024, mes: 2, total: 100 },
      { ano: 2024, mes: 3, total: 100 },
      { ano: 2025, mes: 1, total: 10 },
      { ano: 2025, mes: 2, total: 20 },
    ];
    const r = comparePanelData(serie, { valueKey: "total" });
    // chartData trimmed to Jan+Feb only
    expect(r.chartData).toHaveLength(2);
    // totalAtual = 10+20 = 30
    expect(r.totalAtual).toBe(30);
    // totalAnterior = 100+100 = 200 (only the same Jan+Feb span, NOT 300)
    expect(r.totalAnterior).toBe(200);
    // no null atual values in chartData (trailing months removed)
    expect(r.chartData.every((d) => d["2025"] != null)).toBe(true);
    // deltaPct computed over the trimmed period
    expect(r.deltaPct).toBeCloseTo(pctChange(30, 200));
  });

  it("anterior summed over same span as atual (no trailing null contamination)", () => {
    // current year: Jan only; previous year: 12 full months each = 50
    const serie = [
      ...Array.from({ length: 12 }, (_, i) => ({ ano: 2024, mes: i + 1, total: 50 })),
      { ano: 2025, mes: 1, total: 75 },
    ];
    const r = comparePanelData(serie, { valueKey: "total" });
    expect(r.chartData).toHaveLength(1);
    expect(r.totalAnterior).toBe(50); // only Jan 2024, NOT 600
    expect(r.totalAtual).toBe(75);
    expect(r.deltaPct).toBeCloseTo(50);
  });
});

describe("beforeAfter", () => {
  const serie = [
    { ano: 2024, mes: 10, v: 100 },
    { ano: 2024, mes: 11, v: 100 },
    { ano: 2024, mes: 12, v: 100 },
    { ano: 2025, mes: 1, v: 150 },
    { ano: 2025, mes: 2, v: 150 },
  ];
  it("splits at the marker month and averages each side", () => {
    const r = beforeAfter(serie, "2025-01-15", { valueKey: "v" });
    expect(r.antes.media).toBeCloseTo(100);
    expect(r.antes.n).toBe(3);
    expect(r.depois.media).toBeCloseTo(150);
    expect(r.depois.n).toBe(2);
    expect(r.deltaPct).toBeCloseTo(50);
  });
  it("respects the janela window", () => {
    const r = beforeAfter(serie, "2025-01-15", { valueKey: "v", janela: 1 });
    expect(r.antes.n).toBe(1);
    expect(r.depois.n).toBe(1);
  });
});
