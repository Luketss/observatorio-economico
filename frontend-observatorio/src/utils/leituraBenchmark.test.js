import { describe, it, expect } from "vitest";
import { montarLeitura } from "./leituraBenchmark";

const FOCO = { municipio_id: 1, nome: "Alfa", estado: "MG" };
const PARES = [
  { municipio_id: 2, nome: "Beta", estado: "MG" },
  { municipio_id: 3, nome: "Gama", estado: "SP" },
];
const POSICAO = {
  ano: 2023,
  nacional: { rank: 12, total: 5000 },
  estadual: { rank: 3, total: 400 },
};
// foco: 100 → 110 → 121 (alta); pares em 2023: 100 e 200 (mediana 150)
const ITENS = [
  { ano: 2021, municipio_id: 1, cidade: "Alfa", valor: 100 },
  { ano: 2022, municipio_id: 1, cidade: "Alfa", valor: 110 },
  { ano: 2023, municipio_id: 1, cidade: "Alfa", valor: 121 },
  { ano: 2023, municipio_id: 2, cidade: "Beta", valor: 100 },
  { ano: 2023, municipio_id: 3, cidade: "Gama", valor: 200 },
];

describe("montarLeitura", () => {
  it("gera as 3 leituras com dados completos", () => {
    const out = montarLeitura({ posicao: POSICAO, itens: ITENS, foco: FOCO, pares: PARES });
    expect(out).toHaveLength(3);
    expect(out[0].texto).toContain("#12 de 5000");
    expect(out[0].texto).toContain("#3 de 400");
    // 121 vs mediana 150 → 19.3% abaixo
    expect(out[1].kind).toBe("down");
    expect(out[1].texto).toContain("19,3%");
    expect(out[1].texto).toContain("abaixo");
    expect(out[2].kind).toBe("up");
    expect(out[2].texto).toContain("2021–2023");
    expect(out[2].texto).toContain("alta");
  });

  it("acima da mediana vira kind up", () => {
    const itens = ITENS.map((i) =>
      i.municipio_id === 1 && i.ano === 2023 ? { ...i, valor: 300 } : i
    );
    const out = montarLeitura({ posicao: null, itens, foco: FOCO, pares: PARES });
    const mediana = out.find((l) => l.texto.includes("mediana"));
    expect(mediana.kind).toBe("up");
    expect(mediana.texto).toContain("acima");
  });

  it("sem posição, omite a leitura de posição", () => {
    const out = montarLeitura({ posicao: null, itens: ITENS, foco: FOCO, pares: PARES });
    expect(out.some((l) => l.texto.includes("#"))).toBe(false);
  });

  it("com menos de 3 anos do foco, omite a tendência", () => {
    const itens = ITENS.filter((i) => i.municipio_id !== 1 || i.ano >= 2022);
    const out = montarLeitura({ posicao: null, itens, foco: FOCO, pares: PARES });
    expect(out.some((l) => l.texto.includes("Tendência"))).toBe(false);
  });

  it("mediana zero é omitida (sem divisão por zero)", () => {
    const itens = [
      { ano: 2023, municipio_id: 1, cidade: "Alfa", valor: 10 },
      { ano: 2023, municipio_id: 2, cidade: "Beta", valor: 0 },
    ];
    const out = montarLeitura({ posicao: null, itens, foco: FOCO, pares: [PARES[0]] });
    expect(out.some((l) => l.texto.includes("mediana"))).toBe(false);
  });

  it("série estável vira kind info", () => {
    const itens = [
      { ano: 2021, municipio_id: 1, cidade: "Alfa", valor: 100 },
      { ano: 2022, municipio_id: 1, cidade: "Alfa", valor: 90 },
      { ano: 2023, municipio_id: 1, cidade: "Alfa", valor: 100 },
    ];
    const out = montarLeitura({ posicao: null, itens, foco: FOCO, pares: [] });
    const trend = out.find((l) => l.texto.includes("Tendência"));
    expect(trend.kind).toBe("info");
    expect(trend.texto).toContain("estável");
  });

  it("sem foco devolve lista vazia", () => {
    expect(montarLeitura({ posicao: null, itens: ITENS, foco: null, pares: PARES })).toEqual([]);
  });
});
