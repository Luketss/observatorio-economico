import { describe, it, expect } from "vitest";
import {
  isColumnSortable, sortKeyFor, isNumericColumn, nextSortState, applySort,
} from "./tableSort";

const numRows = [{ v: 30, n: "Caio" }, { v: null, n: "ávila" }, { v: 10, n: "Bruno" }];

describe("isColumnSortable", () => {
  it("spark nunca é ordenável; sortable:false desliga; default é ordenável", () => {
    expect(isColumnSortable({ key: "t", kind: "spark" })).toBe(false);
    expect(isColumnSortable({ key: "t", sortable: false })).toBe(false);
    expect(isColumnSortable({ key: "t" })).toBe(true);
    expect(isColumnSortable({ key: "t", kind: "delta" })).toBe(true);
  });
});

describe("sortKeyFor", () => {
  it("delta ordena pelo __delta computado; demais pela própria key", () => {
    expect(sortKeyFor({ key: "x", kind: "delta" })).toBe("__delta");
    expect(sortKeyFor({ key: "x" })).toBe("x");
  });
});

describe("isNumericColumn", () => {
  it("detecta pelo primeiro valor não-nulo (ignora nulls à frente)", () => {
    const rows = [{ v: null }, { v: 5 }];
    expect(isNumericColumn({ key: "v" }, rows)).toBe(true);
    expect(isNumericColumn({ key: "n" }, numRows)).toBe(false);
  });
  it("kind delta é sempre numérica; coluna sem valores não é", () => {
    expect(isNumericColumn({ key: "x", kind: "delta" }, [])).toBe(true);
    expect(isNumericColumn({ key: "z" }, numRows)).toBe(false);
  });
});

describe("nextSortState", () => {
  it("numérica cicla null → desc → asc → null", () => {
    const col = { key: "v" };
    const s1 = nextSortState(null, col, numRows);
    expect(s1).toEqual({ key: "v", dir: "desc" });
    const s2 = nextSortState(s1, col, numRows);
    expect(s2).toEqual({ key: "v", dir: "asc" });
    expect(nextSortState(s2, col, numRows)).toBeNull();
  });
  it("texto cicla null → asc → desc → null", () => {
    const col = { key: "n" };
    const s1 = nextSortState(null, col, numRows);
    expect(s1).toEqual({ key: "n", dir: "asc" });
    const s2 = nextSortState(s1, col, numRows);
    expect(s2).toEqual({ key: "n", dir: "desc" });
    expect(nextSortState(s2, col, numRows)).toBeNull();
  });
  it("trocar de coluna reinicia o ciclo na direção inicial da nova coluna", () => {
    const atual = { key: "v", dir: "desc" };
    expect(nextSortState(atual, { key: "n" }, numRows)).toEqual({ key: "n", dir: "asc" });
  });
});

describe("applySort", () => {
  it("desc numérico com nulos por último; não muta o array original", () => {
    const out = applySort(numRows, { key: "v", dir: "desc" });
    expect(out.map((r) => r.v)).toEqual([30, 10, null]);
    expect(numRows.map((r) => r.v)).toEqual([30, null, 10]);
  });
  it("asc numérico mantém nulos por último", () => {
    const out = applySort(numRows, { key: "v", dir: "asc" });
    expect(out.map((r) => r.v)).toEqual([10, 30, null]);
  });
  it("texto pt-BR: acentos não vão para o fim", () => {
    const out = applySort(numRows, { key: "n", dir: "asc" });
    expect(out.map((r) => r.n)).toEqual(["ávila", "Bruno", "Caio"]);
  });
  it("sortState null devolve o próprio array na ordem original", () => {
    expect(applySort(numRows, null)).toBe(numRows);
  });
});
