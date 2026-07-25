import { describe, it, expect } from "vitest";
import { aplicarMovimento } from "./kanbanMove";

const base = [
  { id: 1, estagio: "lead", empresa_nome: "A" },
  { id: 2, estagio: "contato", empresa_nome: "B" },
];

describe("aplicarMovimento", () => {
  it("move item para outro estágio", () => {
    const out = aplicarMovimento(base, 1, "estagio", "negociacao");
    expect(out.find((i) => i.id === 1).estagio).toBe("negociacao");
    expect(out.find((i) => i.id === 2).estagio).toBe("contato");
  });

  it("funciona com campo status (Projetos)", () => {
    const projetos = [{ id: 7, status: "nao_iniciado" }];
    const out = aplicarMovimento(projetos, 7, "status", "concluido");
    expect(out[0].status).toBe("concluido");
  });

  it("retorna o MESMO array quando o valor não muda (no-op)", () => {
    expect(aplicarMovimento(base, 1, "estagio", "lead")).toBe(base);
  });

  it("retorna o MESMO array quando o id não existe", () => {
    expect(aplicarMovimento(base, 999, "estagio", "contato")).toBe(base);
  });

  it("não muta o array nem os objetos originais; preserva referência dos não afetados", () => {
    const antes = JSON.parse(JSON.stringify(base));
    const out = aplicarMovimento(base, 1, "estagio", "implantacao");
    expect(base).toEqual(antes);
    expect(out).not.toBe(base);
    expect(out.find((i) => i.id === 2)).toBe(base.find((i) => i.id === 2));
  });
});
