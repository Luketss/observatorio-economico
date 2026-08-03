import { describe, it, expect } from "vitest";
import { parseMarkdownLite, parseInline } from "./markdownLite";

describe("parseInline", () => {
  it("texto sem marcação vira 1 segmento não-negrito", () => {
    expect(parseInline("olá mundo")).toEqual([{ negrito: false, texto: "olá mundo" }]);
  });

  it("dois negritos na mesma linha", () => {
    expect(parseInline("a **b** c **d**")).toEqual([
      { negrito: false, texto: "a " },
      { negrito: true, texto: "b" },
      { negrito: false, texto: " c " },
      { negrito: true, texto: "d" },
    ]);
  });

  it("asteriscos sem par ficam literais", () => {
    expect(parseInline("2 ** 3 * 4")).toEqual([{ negrito: false, texto: "2 ** 3 * 4" }]);
  });
});

describe("parseMarkdownLite", () => {
  it("string vazia e null viram []", () => {
    expect(parseMarkdownLite("")).toEqual([]);
    expect(parseMarkdownLite(null)).toEqual([]);
  });

  it("h2 e h3", () => {
    const b = parseMarkdownLite("## Objetivos\n### Meta 1");
    expect(b).toEqual([
      { tipo: "h2", inline: [{ negrito: false, texto: "Objetivos" }] },
      { tipo: "h3", inline: [{ negrito: false, texto: "Meta 1" }] },
    ]);
  });

  it("linhas '- ' consecutivas agrupam numa lista; '- ' solta vira lista de 1 item", () => {
    const b = parseMarkdownLite("- a\n- b\n\n- c");
    expect(b.length).toBe(2);
    expect(b[0]).toEqual({
      tipo: "lista",
      itens: [[{ negrito: false, texto: "a" }], [{ negrito: false, texto: "b" }]],
    });
    expect(b[1].itens.length).toBe(1);
  });

  it("linha em branco separa parágrafos; quebra simples vira linha do mesmo parágrafo", () => {
    const b = parseMarkdownLite("linha 1\nlinha 2\n\noutro");
    expect(b.length).toBe(2);
    expect(b[0].tipo).toBe("paragrafo");
    expect(b[0].linhas.length).toBe(2);
    expect(b[1].linhas).toEqual([[{ negrito: false, texto: "outro" }]]);
  });

  it("texto sem marcação nenhuma vira só parágrafos (passthrough)", () => {
    const b = parseMarkdownLite("a\nb\n\nc");
    expect(b.every((x) => x.tipo === "paragrafo")).toBe(true);
  });

  it("negrito funciona dentro de título e item de lista", () => {
    const b = parseMarkdownLite("## Meta **1**\n- item **x**");
    expect(b[0].inline[1]).toEqual({ negrito: true, texto: "1" });
    expect(b[1].itens[0][1]).toEqual({ negrito: true, texto: "x" });
  });

  it("HTML não é interpretado — tag vira texto literal", () => {
    const b = parseMarkdownLite("<script>alert(1)</script>");
    expect(b).toEqual([
      { tipo: "paragrafo", linhas: [[{ negrito: false, texto: "<script>alert(1)</script>" }]] },
    ]);
  });

  it("lista interrompe parágrafo e vice-versa (sem linha em branco)", () => {
    const b = parseMarkdownLite("texto\n- item\ntexto2");
    expect(b.map((x) => x.tipo)).toEqual(["paragrafo", "lista", "paragrafo"]);
  });
});
