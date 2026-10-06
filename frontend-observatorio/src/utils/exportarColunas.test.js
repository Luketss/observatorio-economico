import { describe, expect, it } from "vitest";
import {
  COLUNA_PERIODO,
  exportacaoArea,
  exportacaoDonut,
  exportacaoEmpilhado,
  exportacaoMultiLinha,
  exportacaoRanking,
  exportacaoTwin,
} from "./exportarColunas";

const chaves = (r) => r.colunas.map((c) => c.chave);

describe("exportacaoArea", () => {
  it("período + valor com o rótulo do gráfico", () => {
    const r = exportacaoArea([{ label: "2021", value: 10 }, { label: "2022", value: 12.5 }], "PIB Total");
    expect(r.colunas).toEqual([COLUNA_PERIODO, { chave: "valor", rotulo: "PIB Total", tipo: "numero" }]);
    expect(r.linhas).toEqual([{ periodo: "2021", valor: 10 }, { periodo: "2022", valor: 12.5 }]);
  });
  it("data vazio ou nulo → sem linhas, colunas presentes", () => {
    expect(exportacaoArea([], "x").linhas).toEqual([]);
    expect(exportacaoArea(null, "x").linhas).toEqual([]);
    expect(chaves(exportacaoArea(undefined))).toEqual(["periodo", "valor"]);
  });
});

describe("exportacaoEmpilhado", () => {
  const data = [{ label: "2021", agro: 1, ind: 2 }, { label: "2022", agro: 3 }];
  it("uma coluna por key, valores ausentes viram null", () => {
    const r = exportacaoEmpilhado(data, ["agro", "ind"]);
    expect(chaves(r)).toEqual(["periodo", "agro", "ind"]);
    expect(r.linhas[1]).toEqual({ periodo: "2022", agro: 3, ind: null });
  });
  it("comTotal soma as keys ignorando null", () => {
    const r = exportacaoEmpilhado(data, ["agro", "ind"], true);
    expect(chaves(r)).toEqual(["periodo", "agro", "ind", "total"]);
    expect(r.linhas.map((l) => l.total)).toEqual([3, 3]);
  });
});

describe("exportacaoMultiLinha", () => {
  it("uma coluna por série e preserva buracos (null)", () => {
    const r = exportacaoMultiLinha([{ label: "2021", A: 1, B: null }, { label: "2022", A: 2 }], ["A", "B"]);
    expect(chaves(r)).toEqual(["periodo", "A", "B"]);
    expect(r.linhas).toEqual([{ periodo: "2021", A: 1, B: null }, { periodo: "2022", A: 2, B: null }]);
  });
});

describe("exportacaoTwin", () => {
  const data = [
    { label: "jan/26", admissoes: 100, desligamentos: 80 },
    { label: "fev/26", admissoes: 50, desligamentos: 90 },
  ];
  it("admissões, desligamentos e saldo calculado", () => {
    const r = exportacaoTwin(data);
    expect(chaves(r)).toEqual(["periodo", "admissoes", "desligamentos", "saldo"]);
    expect(r.linhas.map((l) => l.saldo)).toEqual([20, -40]);
  });
  it("acumulado soma os saldos", () => {
    const r = exportacaoTwin(data, { acumulado: true });
    expect(chaves(r)).toEqual(["periodo", "admissoes", "desligamentos", "saldo", "acumulado"]);
    expect(r.linhas.map((l) => l.acumulado)).toEqual([20, -20]);
  });
});

describe("exportacaoDonut", () => {
  it("categoria, valor e participação em % somando 100", () => {
    const r = exportacaoDonut([{ label: "Serviços", value: 60 }, { name: "Indústria", value: 40 }]);
    expect(chaves(r)).toEqual(["categoria", "valor", "participacao"]);
    expect(r.linhas).toEqual([
      { categoria: "Serviços", valor: 60, participacao: 60 },
      { categoria: "Indústria", valor: 40, participacao: 40 },
    ]);
  });
  it("total zero → participação null", () => {
    expect(exportacaoDonut([{ label: "a", value: 0 }]).linhas[0].participacao).toBeNull();
  });
  it("participação com 2 casas", () => {
    const r = exportacaoDonut([{ label: "a", value: 1 }, { label: "b", value: 2 }]);
    expect(r.linhas.map((l) => l.participacao)).toEqual([33.33, 66.67]);
  });
});

describe("exportacaoRanking", () => {
  const data = [{ label: "Divinópolis", value: 300 }, { label: "Formiga", value: 120 }];
  it("nome + valor", () => {
    const r = exportacaoRanking(data);
    expect(chaves(r)).toEqual(["nome", "valor"]);
    expect(r.linhas[0]).toEqual({ nome: "Divinópolis", valor: 300 });
  });
  it("comPosicao e offset", () => {
    const r = exportacaoRanking(data, { comPosicao: true, offset: 10 });
    expect(chaves(r)).toEqual(["posicao", "nome", "valor"]);
    expect(r.linhas.map((l) => l.posicao)).toEqual([11, 12]);
  });
});

describe("rótulos visíveis mantêm acentos", () => {
  it("Período, Admissões, Participação, Posição", () => {
    expect(COLUNA_PERIODO.rotulo).toBe("Período");
    expect(exportacaoTwin([], { acumulado: true }).colunas.map((c) => c.rotulo)).toEqual(["Período", "Admissões", "Desligamentos", "Saldo", "Saldo acumulado"]);
    expect(exportacaoDonut([]).colunas.map((c) => c.rotulo)).toEqual(["Categoria", "Valor", "Participação (%)"]);
    expect(exportacaoRanking([], { comPosicao: true }).colunas.map((c) => c.rotulo)).toEqual(["Posição", "Nome", "Valor"]);
  });
  it("linha sem label não gera undefined", () => {
    expect(exportacaoArea([{ value: 1 }], "x").linhas[0]).toEqual({ periodo: null, valor: 1 });
    expect(exportacaoDonut([{ value: 1 }]).linhas[0].categoria).toBeNull();
    expect(exportacaoRanking([{ value: 1 }]).linhas[0].nome).toBeNull();
  });
});
