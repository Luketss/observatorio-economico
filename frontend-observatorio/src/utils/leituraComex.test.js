import { describe, it, expect } from "vitest";
import { montarLeituraComex } from "./leituraComex";

// Exportações em alta ano a ano, com superávit no último ano — base "feliz"
// usada para exercitar leitura de balança, variação e tendência de uma vez.
const SERIE = [
  { ano: 2021, mes: 3, tipo_operacao: "EXP", valor_usd: 1_000_000 },
  { ano: 2021, mes: 9, tipo_operacao: "IMP", valor_usd: 700_000 },
  { ano: 2022, mes: 3, tipo_operacao: "export", valor_usd: 1_500_000 },
  { ano: 2022, mes: 9, tipo_operacao: "import", valor_usd: 900_000 },
  { ano: 2023, mes: 3, tipo_operacao: "exp", valor_usd: 2_000_000 },
  { ano: 2023, mes: 9, tipo_operacao: "imp", valor_usd: 500_000 },
];

describe("montarLeituraComex", () => {
  it("superávit comercial do último ano vira kind up, formatado com sufixo M", () => {
    const out = montarLeituraComex({ serie: SERIE });
    const balanca = out.find((l) => l.texto.includes("comercial de"));
    expect(balanca.kind).toBe("up");
    // saldo 2023 = 2.000.000 - 500.000 = 1.500.000
    expect(balanca.texto).toBe("Superávit comercial de US$ 1.5M em 2023.");
  });

  it("déficit comercial vira kind down, formatado com sufixo k", () => {
    const serie = SERIE.map((d) =>
      d.ano === 2023 && d.tipo_operacao === "imp" ? { ...d, valor_usd: 2_500_000 } : d
    );
    const out = montarLeituraComex({ serie });
    const balanca = out.find((l) => l.texto.includes("comercial de"));
    // saldo 2023 = 2.000.000 - 2.500.000 = -500.000
    expect(balanca.kind).toBe("down");
    expect(balanca.texto).toBe("Déficit comercial de US$ 500k em 2023.");
  });

  it("balança equilibrada (exp === imp, ambos > 0) vira kind info", () => {
    const serie = [
      { ano: 2023, mes: 1, tipo_operacao: "exp", valor_usd: 1_000_000 },
      { ano: 2023, mes: 2, tipo_operacao: "imp", valor_usd: 1_000_000 },
    ];
    const out = montarLeituraComex({ serie });
    const balanca = out.find((l) => l.texto.includes("Balança"));
    expect(balanca.kind).toBe("info");
    expect(balanca.texto).toBe("Balança comercial equilibrada em 2023.");
  });

  it("normaliza tipo_operacao com maiúsculas/minúsculas misturadas (EXP/export, IMP/import)", () => {
    const serie = [
      { ano: 2023, mes: 1, tipo_operacao: "EXP", valor_usd: 500_000 },
      { ano: 2023, mes: 2, tipo_operacao: "export", valor_usd: 500_000 },
      { ano: 2023, mes: 3, tipo_operacao: "IMP", valor_usd: 200_000 },
      { ano: 2023, mes: 4, tipo_operacao: "import", valor_usd: 200_000 },
    ];
    const out = montarLeituraComex({ serie });
    const balanca = out.find((l) => l.texto.includes("comercial de"));
    // exp = 500k+500k = 1.000.000; imp = 200k+200k = 400.000; saldo = 600.000
    expect(balanca.texto).toBe("Superávit comercial de US$ 600k em 2023.");
  });

  it("variação das exportações positiva vs ano anterior vira kind up", () => {
    const out = montarLeituraComex({ serie: SERIE });
    const variacao = out.find((l) => l.texto.startsWith("Exportações"));
    // exp 2023 = 2.000.000, exp 2022 = 1.500.000 -> +33,3%
    expect(variacao.kind).toBe("up");
    expect(variacao.texto).toBe("Exportações cresceram 33,3% vs 2022.");
  });

  it("variação das exportações negativa vs ano anterior vira kind down", () => {
    const serie = [
      { ano: 2022, mes: 1, tipo_operacao: "exp", valor_usd: 2_000_000 },
      { ano: 2023, mes: 1, tipo_operacao: "exp", valor_usd: 1_500_000 },
    ];
    const out = montarLeituraComex({ serie });
    const variacao = out.find((l) => l.texto.startsWith("Exportações"));
    // (1.500.000-2.000.000)/2.000.000 = -25%
    expect(variacao.kind).toBe("down");
    expect(variacao.texto).toBe("Exportações recuaram 25,0% vs 2022.");
  });

  it("omite a variação quando o ano anterior consecutivo não tem exportação (buraco de série)", () => {
    const serie = [
      { ano: 2020, mes: 1, tipo_operacao: "exp", valor_usd: 1_000_000 },
      { ano: 2023, mes: 1, tipo_operacao: "exp", valor_usd: 2_000_000 },
    ];
    const out = montarLeituraComex({ serie });
    expect(out.some((l) => l.texto.startsWith("Exportações"))).toBe(false);
    expect(out.some((l) => l.texto.includes("Tendência"))).toBe(false);
    // a leitura de balança do último ano com dado continua presente
    expect(out.some((l) => l.texto.includes("comercial de"))).toBe(true);
  });

  it("tendência das exportações em alta (3 últimos anos com exp > 0) vira kind up", () => {
    const out = montarLeituraComex({ serie: SERIE });
    const trend = out.find((l) => l.texto.includes("Tendência"));
    expect(trend.kind).toBe("up");
    expect(trend.texto).toBe("Tendência das exportações 2021–2023: em alta.");
  });

  it("tendência não monotônica das exportações vira kind info (estável)", () => {
    const serie = [
      { ano: 2021, mes: 1, tipo_operacao: "exp", valor_usd: 1_000_000 },
      { ano: 2022, mes: 1, tipo_operacao: "exp", valor_usd: 800_000 },
      { ano: 2023, mes: 1, tipo_operacao: "exp", valor_usd: 1_000_000 },
    ];
    const out = montarLeituraComex({ serie });
    const trend = out.find((l) => l.texto.includes("Tendência"));
    expect(trend.kind).toBe("info");
    expect(trend.texto).toContain("estável");
  });

  it("ignora linhas com valor_usd null", () => {
    const serie = [
      { ano: 2023, mes: 1, tipo_operacao: "exp", valor_usd: 1_000_000 },
      { ano: 2023, mes: 2, tipo_operacao: "exp", valor_usd: null },
      { ano: 2023, mes: 3, tipo_operacao: "imp", valor_usd: null },
    ];
    const out = montarLeituraComex({ serie });
    const balanca = out.find((l) => l.texto.includes("comercial de"));
    expect(balanca.texto).toBe("Superávit comercial de US$ 1.0M em 2023.");
  });

  it("série vazia ou indefinida devolve lista vazia", () => {
    expect(montarLeituraComex({ serie: [] })).toEqual([]);
    expect(montarLeituraComex({})).toEqual([]);
  });
});
