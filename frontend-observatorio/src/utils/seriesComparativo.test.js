import { describe, it, expect } from "vitest";
import { montarComparativo, descreverPares } from "./seriesComparativo";

const FOCO = { municipio_id: 1, nome: "Foco", estado: "MG" };
const PAR = { municipio_id: 2, nome: "Par", estado: "MG" };
const FIXADO = { municipio_id: 3, nome: "Fixado", estado: "SP" };

const itens = [
  { ano: 2020, municipio_id: 1, pib_total: 10 },
  { ano: 2021, municipio_id: 1, pib_total: 12 },
  { ano: 2020, municipio_id: 2, pib_total: 20 },
  { ano: 2021, municipio_id: 2, pib_total: 22 },
  { ano: 2021, municipio_id: 3, pib_total: 30 },
];

const base = { itens, foco: FOCO, pares: [PAR], fixados: [FIXADO], anoKey: "ano", valorKey: "pib_total" };

describe("montarComparativo", () => {
  it("pivota por ano e mantem a ordem foco, pares, fixados", () => {
    const r = montarComparativo(base);
    expect(r.focusSeries).toBe("Foco");
    expect(r.peerSeries).toEqual(["Par"]);
    expect(r.pinnedSeries).toEqual(["Fixado"]);
    expect(r.data).toEqual([
      { label: "2020", Foco: 10, Par: 20 },
      { label: "2021", Foco: 12, Par: 22, Fixado: 30 },
    ]);
  });

  it("ausencia vira chave ausente, nunca zero", () => {
    const r = montarComparativo(base);
    expect("Fixado" in r.data[0]).toBe(false);
  });

  it("preserva valor zero real", () => {
    const r = montarComparativo({
      ...base,
      itens: [{ ano: 2020, municipio_id: 1, pib_total: 0 }],
      pares: [], fixados: [],
    });
    expect(r.data[0].Foco).toBe(0);
  });

  it("dominio de anos vem do foco", () => {
    const r = montarComparativo({
      ...base,
      itens: [...itens, { ano: 2019, municipio_id: 2, pib_total: 99 }],
    });
    expect(r.data.map((d) => d.label)).toEqual(["2020", "2021"]);
  });

  it("desambigua homonimos de UFs diferentes", () => {
    const r = montarComparativo({
      ...base,
      foco: { municipio_id: 1, nome: "Bom Jesus", estado: "PI" },
      pares: [{ municipio_id: 2, nome: "Bom Jesus", estado: "RS" }],
      fixados: [],
    });
    expect(r.focusSeries).toBe("Bom Jesus (PI)");
    expect(r.peerSeries).toEqual(["Bom Jesus (RS)"]);
    expect(r.data[0]).toEqual({ label: "2020", "Bom Jesus (PI)": 10, "Bom Jesus (RS)": 20 });
  });

  it("aceita as chaves do VAF", () => {
    const r = montarComparativo({
      itens: [{ ano_base: 2021, municipio_id: 1, indice_participacao_municipal: 0.5 }],
      foco: FOCO, pares: [], fixados: [],
      anoKey: "ano_base", valorKey: "indice_participacao_municipal",
    });
    expect(r.data).toEqual([{ label: "2021", Foco: 0.5 }]);
  });

  it("foco nulo devolve vazio", () => {
    const r = montarComparativo({ ...base, foco: null });
    expect(r).toEqual({ data: [], focusSeries: null, peerSeries: [], pinnedSeries: [] });
  });
});

describe("descreverPares", () => {
  it("descreve o grupo quando ha pares", () => {
    expect(descreverPares({ foco: FOCO, pares: [PAR, PAR], criterio_pares: "mesma UF · faixa FPM X" }))
      .toBe("Foco vs. 2 pares · mesma UF · faixa FPM X");
  });

  it("um par no singular", () => {
    expect(descreverPares({ foco: FOCO, pares: [PAR], criterio_pares: "mesma UF" }))
      .toBe("Foco vs. 1 par · mesma UF");
  });

  it("explica cada motivo em vez de calar", () => {
    expect(descreverPares({ foco: FOCO, pares: [], motivo: "sem_pares" }))
      .toBe("Foco · nenhum município par encontrado");
    expect(descreverPares({ foco: FOCO, pares: [], motivo: "sem_populacao" }))
      .toBe("Foco · sem população cadastrada, não há como escolher pares");
    expect(descreverPares({ foco: null, pares: [], motivo: "sem_municipio" }))
      .toBe("selecione um município");
  });
});
