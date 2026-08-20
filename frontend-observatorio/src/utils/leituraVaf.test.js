import { describe, it, expect } from "vitest";
import { montarLeituraVaf } from "./leituraVaf";

const SERIE = [
  { ano_base: 2021, indice_participacao_municipal: 0.0200, pct_ipm: 5.0 },
  { ano_base: 2022, indice_participacao_municipal: 0.0220, pct_ipm: 10.0 },
  { ano_base: 2023, indice_participacao_municipal: 0.0250, pct_ipm: 13.6 },
];

describe("montarLeituraVaf", () => {
  it("IPM subiu vira kind up, com tradução logo em seguida", () => {
    const out = montarLeituraVaf({ serie: SERIE });
    const variacao = out.find((l) => l.texto.startsWith("Índice de participação"));
    expect(variacao.kind).toBe("up");
    expect(variacao.texto).toBe(
      "Índice de participação (IPM) subiu de 0,0220 para 0,0250 (ano-base 2023)."
    );
    const iVariacao = out.indexOf(variacao);
    expect(out[iVariacao + 1].kind).toBe("info");
    expect(out[iVariacao + 1].texto).toBe(
      "IPM maior significa fatia maior do repasse de ICMS do estado dois anos depois (ano de aplicação)."
    );
  });

  it("IPM caiu vira kind down, com tradução logo em seguida", () => {
    const serie = SERIE.map((d) =>
      d.ano_base === 2023 ? { ...d, indice_participacao_municipal: 0.0150, pct_ipm: -31.8 } : d
    );
    const out = montarLeituraVaf({ serie });
    const variacao = out.find((l) => l.texto.startsWith("Índice de participação"));
    expect(variacao.kind).toBe("down");
    expect(variacao.texto).toBe(
      "Índice de participação (IPM) caiu de 0,0220 para 0,0150 (ano-base 2023)."
    );
    const iVariacao = out.indexOf(variacao);
    expect(out[iVariacao + 1].texto).toContain("IPM maior significa");
  });

  it("IPM manteve-se vira kind info, sem tradução", () => {
    const serie = [
      { ano_base: 2022, indice_participacao_municipal: 0.0220, pct_ipm: 10.0 },
      { ano_base: 2023, indice_participacao_municipal: 0.0220, pct_ipm: 0.0 },
    ];
    const out = montarLeituraVaf({ serie });
    const variacao = out.find((l) => l.texto.startsWith("Índice de participação"));
    expect(variacao.kind).toBe("info");
    expect(variacao.texto).toBe(
      "Índice de participação (IPM) manteve-se em 0,0220 (ano-base 2023)."
    );
    expect(out.some((l) => l.texto.includes("IPM maior significa"))).toBe(false);
  });

  it("formata X/Y sempre com 4 casas decimais e vírgula, mesmo com zero à direita", () => {
    const serie = [
      { ano_base: 2022, indice_participacao_municipal: 0.026, pct_ipm: 1.0 },
      { ano_base: 2023, indice_participacao_municipal: 0.031, pct_ipm: 19.2 },
    ];
    const out = montarLeituraVaf({ serie });
    const variacao = out.find((l) => l.texto.startsWith("Índice de participação"));
    expect(variacao.texto).toBe(
      "Índice de participação (IPM) subiu de 0,0260 para 0,0310 (ano-base 2023)."
    );
  });

  it("ignora linhas sem índice e usa os dois últimos anos-base válidos", () => {
    const serie = [
      ...SERIE,
      { ano_base: 2024, indice_participacao_municipal: null, pct_ipm: 5.0 },
    ];
    const out = montarLeituraVaf({ serie });
    const variacao = out.find((l) => l.texto.startsWith("Índice de participação"));
    expect(variacao.texto).toBe(
      "Índice de participação (IPM) subiu de 0,0220 para 0,0250 (ano-base 2023)."
    );
  });

  it("linha com índice válido conta mesmo sem pct_ipm", () => {
    const serie = [
      { ano_base: 2022, indice_participacao_municipal: 0.0200, pct_ipm: null },
      { ano_base: 2023, indice_participacao_municipal: 0.0220, pct_ipm: null },
    ];
    const out = montarLeituraVaf({ serie });
    const variacao = out.find((l) => l.texto.startsWith("Índice de participação"));
    expect(variacao.texto).toBe(
      "Índice de participação (IPM) subiu de 0,0200 para 0,0220 (ano-base 2023)."
    );
  });

  it("tendência de 3 anos-base em alta vira kind up", () => {
    const out = montarLeituraVaf({ serie: SERIE });
    const trend = out.find((l) => l.texto.includes("Tendência"));
    expect(trend.kind).toBe("up");
    expect(trend.texto).toBe("Tendência 2021–2023: em alta.");
  });

  it("tendência de 3 anos-base em queda vira kind down", () => {
    const serie = [
      { ano_base: 2021, indice_participacao_municipal: 0.0300, pct_ipm: -2.0 },
      { ano_base: 2022, indice_participacao_municipal: 0.0250, pct_ipm: -16.7 },
      { ano_base: 2023, indice_participacao_municipal: 0.0200, pct_ipm: -20.0 },
    ];
    const out = montarLeituraVaf({ serie });
    const trend = out.find((l) => l.texto.includes("Tendência"));
    expect(trend.kind).toBe("down");
    expect(trend.texto).toBe("Tendência 2021–2023: em queda.");
  });

  it("tendência não monotônica vira kind info (estável)", () => {
    const serie = [
      { ano_base: 2021, indice_participacao_municipal: 0.0220, pct_ipm: 1.0 },
      { ano_base: 2022, indice_participacao_municipal: 0.0200, pct_ipm: -9.1 },
      { ano_base: 2023, indice_participacao_municipal: 0.0220, pct_ipm: 10.0 },
    ];
    const out = montarLeituraVaf({ serie });
    const trend = out.find((l) => l.texto.includes("Tendência"));
    expect(trend.kind).toBe("info");
    expect(trend.texto).toContain("estável");
  });

  it("menos de 2 anos-base com pct_ipm válido omite a leitura de variação (e a tradução)", () => {
    const serie = [{ ano_base: 2023, indice_participacao_municipal: 0.0220, pct_ipm: 10.0 }];
    const out = montarLeituraVaf({ serie });
    expect(out.some((l) => l.texto.startsWith("Índice de participação"))).toBe(false);
    expect(out.some((l) => l.texto.includes("IPM maior significa"))).toBe(false);
  });

  it("menos de 3 anos-base com pct_ipm válido omite a tendência mas mantém a variação", () => {
    const out = montarLeituraVaf({ serie: SERIE.slice(0, 2) });
    expect(out.some((l) => l.texto.includes("Tendência"))).toBe(false);
    expect(out.some((l) => l.texto.startsWith("Índice de participação"))).toBe(true);
  });

  it("série vazia ou indefinida devolve lista vazia", () => {
    expect(montarLeituraVaf({ serie: [] })).toEqual([]);
    expect(montarLeituraVaf({})).toEqual([]);
  });
});
