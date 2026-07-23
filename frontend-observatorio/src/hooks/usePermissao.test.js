import { describe, expect, it } from "vitest";
import { hasPermissao, temPermissaoAdmin } from "./usePermissao";

describe("hasPermissao", () => {
  it("nega sem usuário", () => {
    expect(hasPermissao(null, "projetos", "criar")).toBe(false);
  });
  it("ADMIN_GLOBAL sempre pode", () => {
    expect(hasPermissao({ role: "ADMIN_GLOBAL" }, "projetos", "excluir")).toBe(true);
  });
  it("verbo presente na área", () => {
    const user = { role: "CUSTOM", permissoes: { captacao: ["criar"] } };
    expect(hasPermissao(user, "captacao", "criar")).toBe(true);
    expect(hasPermissao(user, "captacao", "editar")).toBe(false);
  });
  it("área ausente nega", () => {
    const user = { role: "CUSTOM", permissoes: {} };
    expect(hasPermissao(user, "projetos", "criar")).toBe(false);
  });
  it("sem mapa de permissoes nega", () => {
    expect(hasPermissao({ role: "CUSTOM" }, "projetos", "criar")).toBe(false);
  });
});

describe("temPermissaoAdmin", () => {
  it("global tem", () => {
    expect(temPermissaoAdmin({ role: "ADMIN_GLOBAL" })).toBe(true);
  });
  it("mandato ou usuarios contam", () => {
    expect(temPermissaoAdmin({ role: "C", permissoes: { mandato: ["editar"] } })).toBe(true);
    expect(temPermissaoAdmin({ role: "C", permissoes: { usuarios: ["criar"] } })).toBe(true);
  });
  it("área de conteúdo não conta", () => {
    expect(temPermissaoAdmin({ role: "C", permissoes: { captacao: ["criar"] } })).toBe(false);
  });
  it("sem usuário nega", () => {
    expect(temPermissaoAdmin(null)).toBe(false);
  });
});
