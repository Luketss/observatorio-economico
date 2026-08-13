import { describe, expect, it } from "vitest";
import {
  PRESETS_PAINEL,
  aplicarPresetSerie,
  resolverSeriePainel,
} from "./periodoGrafico";

// série mensal: 18 meses de jul/2024 a dez/2025
const MENSAL = [];
for (let a = 2024, m = 7; a < 2026; ) {
  MENSAL.push({ ano: a, mes: m, valor: a * 100 + m });
  m += 1;
  if (m > 12) { m = 1; a += 1; }
}
// série anual 2015..2025
const ANUAL = Array.from({ length: 11 }, (_, i) => ({ ano: 2015 + i, valor: i }));
const EX_MENSAL = (d) => ({ ano: d.ano, mes: d.mes });
const EX_ANUAL = (d) => ({ ano: d.ano });

describe("aplicarPresetSerie", () => {
  it("12m em série mensal = 12 meses ancorados no último dado", () => {
    const r = aplicarPresetSerie(MENSAL, "12m", EX_MENSAL);
    expect(r).toHaveLength(12);
    expect(r[0]).toMatchObject({ ano: 2025, mes: 1 });
    expect(r[r.length - 1]).toMatchObject({ ano: 2025, mes: 12 });
  });

  it("12m em série anual = só o último ano", () => {
    const r = aplicarPresetSerie(ANUAL, "12m", EX_ANUAL);
    expect(r.map((d) => d.ano)).toEqual([2025]);
  });

  it("5a e 10a ancoram no maior ano DA SÉRIE", () => {
    expect(aplicarPresetSerie(ANUAL, "5a", EX_ANUAL).map((d) => d.ano)).toEqual([2021, 2022, 2023, 2024, 2025]);
    expect(aplicarPresetSerie(ANUAL, "10a", EX_ANUAL)).toHaveLength(10);
    // série com domínio deslocado (ex.: icms_projetado do VAF)
    const deslocada = [{ ano: 2020 }, { ano: 2021 }, { ano: 2022 }];
    expect(aplicarPresetSerie(deslocada, "5a", EX_ANUAL).map((d) => d.ano)).toEqual([2020, 2021, 2022]);
  });

  it("5a em série mensal traz todos os meses dos 5 anos", () => {
    const r = aplicarPresetSerie(MENSAL, "5a", EX_MENSAL);
    expect(r).toHaveLength(MENSAL.length); // 2021..2025 cobre tudo
  });

  it("tudo devolve a série completa; preset desconhecido idem", () => {
    expect(aplicarPresetSerie(ANUAL, "tudo", EX_ANUAL)).toHaveLength(11);
    expect(aplicarPresetSerie(ANUAL, "xyz", EX_ANUAL)).toHaveLength(11);
  });

  it("série vazia devolve vazia sem quebrar", () => {
    expect(aplicarPresetSerie([], "12m", EX_MENSAL)).toEqual([]);
  });
});

describe("resolverSeriePainel", () => {
  const seriePagina = ANUAL.slice(-2);
  it("sem preset segue a série da página (mesma referência)", () => {
    const r = resolverSeriePainel({ rawSerie: ANUAL, seriePagina, preset: null, extrair: EX_ANUAL });
    expect(r).toBe(seriePagina);
  });
  it("com preset aplica sobre a CRUA (amplia além do filtro da página)", () => {
    const r = resolverSeriePainel({ rawSerie: ANUAL, seriePagina, preset: "10a", extrair: EX_ANUAL });
    expect(r).toHaveLength(10);
  });
});

describe("PRESETS_PAINEL", () => {
  it("são 4 presets na ordem 12m/5a/10a/tudo", () => {
    expect(PRESETS_PAINEL.map((p) => p.key)).toEqual(["12m", "5a", "10a", "tudo"]);
  });
});
