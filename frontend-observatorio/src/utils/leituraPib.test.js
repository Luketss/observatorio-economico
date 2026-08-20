import { describe, it, expect } from "vitest";
import { montarLeituraPib } from "./leituraPib";

const SERIE = [
  { ano: 2021, pib_total: 100, tipo_dado: "REAL" },
  { ano: 2022, pib_total: 110, tipo_dado: "REAL" },
  { ano: 2023, pib_total: 121, tipo_dado: "REAL" },
];

const VA_FOCO = [
  { ano: 2022, va_agropecuaria: 10, va_industria: 20, va_servicos: 50, va_governo: 20 },
  { ano: 2023, va_agropecuaria: 15, va_industria: 25, va_servicos: 40, va_governo: 20 },
];

describe("montarLeituraPib", () => {
  it("crescimento positivo vira kind up", () => {
    const out = montarLeituraPib({ serie: SERIE, vaFoco: [] });
    const cresc = out.find((l) => l.texto.startsWith("PIB"));
    expect(cresc.kind).toBe("up");
    // (121-110)/110 = 10,0%
    expect(cresc.texto).toBe("PIB cresceu 10,0% em 2023.");
  });

  it("recuo vira kind down", () => {
    const serie = SERIE.map((d) => (d.ano === 2023 ? { ...d, pib_total: 90 } : d));
    const out = montarLeituraPib({ serie, vaFoco: [] });
    const cresc = out.find((l) => l.texto.startsWith("PIB"));
    expect(cresc.kind).toBe("down");
    // (90-110)/110 = -18,1818...% -> 18,2%
    expect(cresc.texto).toBe("PIB recuou 18,2% em 2023.");
  });

  it("último ano projetado acrescenta sufixo", () => {
    const serie = SERIE.map((d) => (d.ano === 2023 ? { ...d, tipo_dado: "PROJETADO" } : d));
    const out = montarLeituraPib({ serie, vaFoco: [] });
    const cresc = out.find((l) => l.texto.startsWith("PIB"));
    expect(cresc.texto).toContain("(valor projetado)");
    expect(cresc.texto).toBe("PIB cresceu 10,0% em 2023. (valor projetado)");
  });

  it("setor dominante com pct correto, do registro mais recente completo", () => {
    const out = montarLeituraPib({ serie: [], vaFoco: VA_FOCO });
    const setor = out.find((l) => l.texto.includes("valor adicionado"));
    // 2023: base = 15+25+40+20 = 100; Serviços = 40 -> 40,0%
    expect(setor.kind).toBe("info");
    expect(setor.texto).toBe("Serviços responde por 40,0% do valor adicionado (2023).");
  });

  it("ignora registro mais recente incompleto e usa o completo anterior", () => {
    const vaFoco = [
      ...VA_FOCO,
      { ano: 2024, va_agropecuaria: 5, va_industria: null, va_servicos: 60, va_governo: 10 },
    ];
    const out = montarLeituraPib({ serie: [], vaFoco });
    const setor = out.find((l) => l.texto.includes("valor adicionado"));
    expect(setor.texto).toContain("(2023)");
  });

  it("sem registro completo de vaFoco, omite a leitura de setor", () => {
    const vaFoco = [
      { ano: 2023, va_agropecuaria: 10, va_industria: null, va_servicos: 50, va_governo: 20 },
    ];
    const out = montarLeituraPib({ serie: [], vaFoco });
    expect(out.some((l) => l.texto.includes("valor adicionado"))).toBe(false);
  });

  it("tendência de 3 anos em alta vira kind up", () => {
    const out = montarLeituraPib({ serie: SERIE, vaFoco: [] });
    const trend = out.find((l) => l.texto.includes("Tendência"));
    expect(trend.kind).toBe("up");
    expect(trend.texto).toBe("Tendência 2021–2023: em alta.");
  });

  it("tendência estável vira kind info", () => {
    const serie = [
      { ano: 2021, pib_total: 100 },
      { ano: 2022, pib_total: 90 },
      { ano: 2023, pib_total: 100 },
    ];
    const out = montarLeituraPib({ serie, vaFoco: [] });
    const trend = out.find((l) => l.texto.includes("Tendência"));
    expect(trend.kind).toBe("info");
    expect(trend.texto).toContain("estável");
  });

  it("série com menos de 2 anos omite a leitura de crescimento", () => {
    const out = montarLeituraPib({ serie: [SERIE[0]], vaFoco: [] });
    expect(out.some((l) => l.texto.startsWith("PIB"))).toBe(false);
  });

  it("série com menos de 3 anos omite a tendência", () => {
    const out = montarLeituraPib({ serie: SERIE.slice(0, 2), vaFoco: [] });
    expect(out.some((l) => l.texto.includes("Tendência"))).toBe(false);
  });

  it("pib_total anterior <= 0 omite a leitura de crescimento (sem divisão inválida)", () => {
    const serie = [
      { ano: 2021, pib_total: 0, tipo_dado: "REAL" },
      { ano: 2022, pib_total: 100, tipo_dado: "REAL" },
    ];
    const out = montarLeituraPib({ serie, vaFoco: [] });
    expect(out.some((l) => l.texto.startsWith("PIB"))).toBe(false);
  });

  it("tudo vazio ou indefinido devolve lista vazia", () => {
    expect(montarLeituraPib({ serie: [], vaFoco: [] })).toEqual([]);
    expect(montarLeituraPib({})).toEqual([]);
  });
});
