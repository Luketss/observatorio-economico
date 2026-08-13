import { afterEach, describe, expect, it, vi } from "vitest";
import { MODO_DEFAULT, lerModo, persistirModo } from "./painelModo";

// node env: localStorage não existe por padrão — simulamos com um stub global.
function stubStorage(inicial = {}) {
  const mapa = new Map(Object.entries(inicial));
  globalThis.localStorage = {
    getItem: (k) => (mapa.has(k) ? mapa.get(k) : null),
    setItem: (k, v) => mapa.set(k, String(v)),
  };
  return mapa;
}

afterEach(() => {
  delete globalThis.localStorage;
  vi.restoreAllMocks();
});

describe("painelModo", () => {
  it("default é gerencial (sem storage e sem valor salvo)", () => {
    expect(MODO_DEFAULT).toBe("gerencial");
    expect(lerModo()).toBe("gerencial"); // sem localStorage no ambiente
    stubStorage();
    expect(lerModo()).toBe("gerencial");
  });

  it("lê valor salvo válido e ignora inválido", () => {
    stubStorage({ "nid-painel-modo": "detalhado" });
    expect(lerModo()).toBe("detalhado");
    stubStorage({ "nid-painel-modo": "banana" });
    expect(lerModo()).toBe("gerencial");
  });

  it("persistirModo grava na chave nid-painel-modo", () => {
    const mapa = stubStorage();
    persistirModo("detalhado");
    expect(mapa.get("nid-painel-modo")).toBe("detalhado");
  });

  it("storage que lança não quebra leitura nem escrita", () => {
    globalThis.localStorage = {
      getItem: () => { throw new Error("bloqueado"); },
      setItem: () => { throw new Error("bloqueado"); },
    };
    expect(lerModo()).toBe("gerencial");
    expect(() => persistirModo("detalhado")).not.toThrow();
  });
});
