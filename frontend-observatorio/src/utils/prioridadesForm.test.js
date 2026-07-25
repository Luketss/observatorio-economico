import { describe, it, expect } from "vitest";
import {
  TIPOS_PRIORIDADE,
  DATASET_LABEL,
  DATASET_ROUTE,
  parseTitulo,
  montarTitulo,
  validarItens,
} from "./prioridadesForm";

describe("parseTitulo", () => {
  it("extrai cada um dos 3 prefixos", () => {
    expect(parseTitulo("Atenção: ICMS caiu")).toEqual({ tipo: "Atenção", texto: "ICMS caiu" });
    expect(parseTitulo("Oportunidade: edital aberto")).toEqual({ tipo: "Oportunidade", texto: "edital aberto" });
    expect(parseTitulo("Risco: perda de faixa")).toEqual({ tipo: "Risco", texto: "perda de faixa" });
  });

  it("sem prefixo retorna tipo null e texto integral", () => {
    expect(parseTitulo("Só um título")).toEqual({ tipo: null, texto: "Só um título" });
  });

  it("tolera vazio/null", () => {
    expect(parseTitulo("")).toEqual({ tipo: null, texto: "" });
    expect(parseTitulo(null)).toEqual({ tipo: null, texto: "" });
  });
});

describe("montarTitulo", () => {
  it("com tipo prefixa", () => {
    expect(montarTitulo("Risco", "perda de faixa")).toBe("Risco: perda de faixa");
  });

  it("sem tipo retorna o texto puro (trim)", () => {
    expect(montarTitulo(null, "  título  ")).toBe("título");
  });

  it("roundtrip com parseTitulo", () => {
    for (const tipo of TIPOS_PRIORIDADE) {
      expect(parseTitulo(montarTitulo(tipo, "abc"))).toEqual({ tipo, texto: "abc" });
    }
  });
});

describe("validarItens", () => {
  const ok = { texto: "t", observacao: "o" };

  it("aceita 1 a 3 itens válidos", () => {
    expect(validarItens([ok])).toBeNull();
    expect(validarItens([ok, ok, ok])).toBeNull();
  });

  it("rejeita lista vazia e mais de 3", () => {
    expect(validarItens([])).toMatch(/ao menos uma/);
    expect(validarItens([ok, ok, ok, ok])).toMatch(/Máximo de 3/);
  });

  it("rejeita título/observação em branco", () => {
    expect(validarItens([{ texto: "  ", observacao: "o" }])).toMatch(/Título/);
    expect(validarItens([{ texto: "t", observacao: "" }])).toMatch(/Observação/);
  });
});

describe("mapas de dataset", () => {
  it("route e label cobrem as mesmas chaves", () => {
    expect(Object.keys(DATASET_ROUTE).sort()).toEqual(Object.keys(DATASET_LABEL).sort());
  });
});
