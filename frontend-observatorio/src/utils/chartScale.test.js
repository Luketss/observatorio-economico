import { describe, it, expect } from "vitest";
import { niceTicks, yBounds } from "./chartScale";

describe("yBounds", () => {
  it("série toda positiva mantém o baseline em 0 (comportamento atual dos charts)", () => {
    expect(yBounds([10, 250, 90])).toEqual({ lo: 0, hi: 250 * 1.12 });
  });

  it("série com negativos estende o domínio para baixo com o mesmo padding", () => {
    expect(yBounds([120, -80, 45, -10])).toEqual({ lo: -80 * 1.12, hi: 120 * 1.12 });
  });

  it("série toda negativa ancora o topo em 0", () => {
    expect(yBounds([-30, -5, -120])).toEqual({ lo: -120 * 1.12, hi: 0 });
  });

  it("série constante em 0 degrada sem NaN", () => {
    expect(yBounds([0, 0, 0])).toEqual({ lo: 0, hi: 0 });
  });
});

describe("niceTicks com domínio negativo", () => {
  it("cobre o domínio inteiro e inclui o tick 0 quando cruza zero", () => {
    const ticks = niceTicks(-89.6, 134.4, 4);
    expect(ticks[0]).toBeLessThanOrEqual(-89.6);
    expect(ticks[ticks.length - 1]).toBeGreaterThanOrEqual(134.4);
    expect(ticks).toContain(0);
    const sorted = [...ticks].sort((a, b) => a - b);
    expect(ticks).toEqual(sorted);
  });
});

describe("regressão CAGED: saldo negativo fica dentro do plot", () => {
  // Bug original: domínio fixo [0, max] fazia (v - 0) / (max - 0) < 0 para
  // saldo negativo → y abaixo da área do gráfico (linha "saía da tela").
  it("fração normalizada (v - lo)/(hi - lo) fica em [0, 1] para todos os pontos", () => {
    const saldoMensal = [120, -80, 45, -10, 0, 210, -35];
    const { lo, hi } = yBounds(saldoMensal);
    const ticks = niceTicks(lo, hi, 4);
    const yLo = ticks[0];
    const yHi = ticks[ticks.length - 1];
    for (const v of saldoMensal) {
      const frac = (v - yLo) / (yHi - yLo);
      expect(frac).toBeGreaterThanOrEqual(0);
      expect(frac).toBeLessThanOrEqual(1);
    }
  });
});
