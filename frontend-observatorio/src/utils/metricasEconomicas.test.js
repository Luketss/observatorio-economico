// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import {
  fmtBR, moneyDisplay, kpiDelta,
  METRICAS_ECONOMICAS, ORDEM_ECONOMICA,
} from "./metricasEconomicas";

describe("helpers de formatação", () => {
  it("fmtBR formata pt-BR e devolve — para nulo", () => {
    expect(fmtBR(1234.5, { maximumFractionDigits: 1 })).toBe("1.234,5");
    expect(fmtBR(null)).toBe("—");
  });

  it("moneyDisplay escolhe a escala", () => {
    expect(moneyDisplay(2500000)).toEqual({ value: "R$ 2,5", unit: "Mi" });
    expect(moneyDisplay(1234567890.5)).toEqual({ value: "R$ 1,2", unit: "Bi" });
    expect(moneyDisplay(null)).toEqual({ value: "—", unit: "" });
  });

  it("kpiDelta mapeia direção e preserva zero", () => {
    expect(kpiDelta(5.2)).toEqual({ value: 5.2, direction: "up" });
    expect(kpiDelta(-3.1)).toEqual({ value: -3.1, direction: "down" });
    expect(kpiDelta(0)).toEqual({ value: 0, direction: "flat" });
    expect(kpiDelta(null)).toBeNull();
  });
});

describe("METRICAS_ECONOMICAS", () => {
  it("tem as 6 bases na ordem canônica, com rota/endpoint/chave", () => {
    expect(ORDEM_ECONOMICA).toEqual(["pib", "vaf", "empresas", "estban", "comex", "pix"]);
    ORDEM_ECONOMICA.forEach((key) => {
      const m = METRICAS_ECONOMICAS[key];
      expect(typeof m.label).toBe("string");
      expect(m.route).toBe(`/app/${key}`);
      expect(m.resumoPath).toBe(`/${key}/resumo`);
      expect(m.planKey).toBe(key);
      expect(typeof m.pick).toBe("function");
    });
  });

  it("pib.pick — payload completo", () => {
    const p = METRICAS_ECONOMICAS.pib.pick({ ultimo_ano: 2021, pib_ultimo_ano: 1234567890.5, crescimento_percentual: 5.2 });
    expect(p).toEqual({ value: "R$ 1,2", unit: "Bi", delta: { value: 5.2, direction: "up" }, foot: "2021" });
  });

  it("vaf.pick — IPM com 4 casas e delta negativo", () => {
    const p = METRICAS_ECONOMICAS.vaf.pick({ ultimo_ano: 2023, ipm_ultimo_ano: 0.012345, variacao_ipm_percentual: -3.1 });
    expect(p).toEqual({ value: "0,0123", unit: "", delta: { value: -3.1, direction: "down" }, foot: "2023" });
  });

  it("empresas.pick e estban.pick — valores e foots", () => {
    expect(METRICAS_ECONOMICAS.empresas.pick({ total_ativas: 585, total_mei: 320 }))
      .toEqual({ value: "585", unit: "", delta: null, foot: "320 MEI" });
    expect(METRICAS_ECONOMICAS.estban.pick({ total_operacoes_credito: 2500000, qtd_agencias: 3 }))
      .toEqual({ value: "R$ 2,5", unit: "Mi", delta: null, foot: "3 agências" });
  });

  it("comex.pick — balança em USD", () => {
    const p = METRICAS_ECONOMICAS.comex.pick({ balanca_comercial: 1500000 });
    expect(p).toEqual({ value: "US$ 1.500.000", unit: "", delta: null, foot: "exportação − importação" });
  });

  it("pix.pick — valor presente e foot fixo", () => {
    const p = METRICAS_ECONOMICAS.pix.pick({ total_transacoes: 12345 });
    expect(p.value).not.toBe("—");
    expect(p.foot).toBe("PF + PJ");
  });

  it("todo pick com resumo nulo/vazio degrada para —", () => {
    ORDEM_ECONOMICA.forEach((key) => {
      const p = METRICAS_ECONOMICAS[key].pick(null);
      expect(p.value).toBe("—");
    });
  });
});
