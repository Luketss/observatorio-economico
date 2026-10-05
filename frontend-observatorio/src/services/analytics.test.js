// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CHAVES_SESSAO,
  identificarSessao,
  iniciarAnalytics,
  lerConfigAnalytics,
  montarDadosSessao,
} from "./analytics";

const CONFIG = { src: "https://umami.test", websiteId: "abc-123" };
const tags = () => document.querySelectorAll("script[data-website-id]");

afterEach(() => {
  tags().forEach((t) => t.remove());
  delete window.umami;
});

describe("lerConfigAnalytics", () => {
  it("sem nenhuma var → null", () => {
    expect(lerConfigAnalytics({})).toBeNull();
  });

  it("env ausente → null", () => {
    expect(lerConfigAnalytics(undefined)).toBeNull();
  });

  it("só uma das vars → null", () => {
    expect(lerConfigAnalytics({ VITE_UMAMI_SRC: "https://u.test" })).toBeNull();
    expect(lerConfigAnalytics({ VITE_UMAMI_WEBSITE_ID: "abc" })).toBeNull();
  });

  it("var vazia ou só espaços conta como ausente", () => {
    expect(
      lerConfigAnalytics({ VITE_UMAMI_SRC: "   ", VITE_UMAMI_WEBSITE_ID: "abc" })
    ).toBeNull();
    expect(
      lerConfigAnalytics({ VITE_UMAMI_SRC: "https://u.test", VITE_UMAMI_WEBSITE_ID: "" })
    ).toBeNull();
  });

  it("com as duas → { src, websiteId }", () => {
    expect(
      lerConfigAnalytics({ VITE_UMAMI_SRC: "https://u.test", VITE_UMAMI_WEBSITE_ID: "abc" })
    ).toEqual({ src: "https://u.test", websiteId: "abc" });
  });

  it("src com barra final sai sem a barra", () => {
    expect(
      lerConfigAnalytics({ VITE_UMAMI_SRC: "https://u.test/", VITE_UMAMI_WEBSITE_ID: "abc" }).src
    ).toBe("https://u.test");
  });
});

describe("iniciarAnalytics", () => {
  it("config null → false e nenhuma tag", () => {
    expect(iniciarAnalytics(null)).toBe(false);
    expect(tags().length).toBe(0);
  });

  it("injeta uma tag defer com src e data-website-id no head", () => {
    expect(iniciarAnalytics(CONFIG)).toBe(true);
    expect(tags().length).toBe(1);
    const tag = tags()[0];
    expect(tag.defer).toBe(true);
    expect(tag.src).toBe("https://umami.test/script.js");
    expect(tag.getAttribute("data-website-id")).toBe("abc-123");
    expect(tag.parentElement).toBe(document.head);
  });

  it("segunda chamada não duplica e devolve true", () => {
    iniciarAnalytics(CONFIG);
    expect(iniciarAnalytics(CONFIG)).toBe(true);
    expect(tags().length).toBe(1);
  });

  it("doc que lança → false, sem propagar", () => {
    const doc = {
      querySelector: () => null,
      createElement: () => {
        throw new Error("boom");
      },
    };
    expect(iniciarAnalytics(CONFIG, doc)).toBe(false);
  });
});

describe("montarDadosSessao", () => {
  it("user null → null", () => {
    expect(montarDadosSessao(null)).toBeNull();
  });

  it("usuário de município → municipio_id e papel", () => {
    expect(
      montarDadosSessao({
        id: 9,
        nome: "Ana",
        email: "ana@x.gov.br",
        municipio_id: 7,
        role: "VISUALIZADOR",
        ativo: true,
      })
    ).toEqual({ municipio_id: 7, papel: "VISUALIZADOR" });
  });

  it("ADMIN_GLOBAL (sem município) → só papel", () => {
    expect(
      montarDadosSessao({
        id: 1,
        nome: "Admin",
        email: "a@x",
        municipio_id: null,
        role: "ADMIN_GLOBAL",
        ativo: true,
      })
    ).toEqual({ papel: "ADMIN_GLOBAL" });
  });

  it("nunca sai chave fora de CHAVES_SESSAO (id, nome, email somem)", () => {
    const dados = montarDadosSessao({
      id: 9,
      nome: "Ana",
      email: "ana@x",
      municipio_id: 7,
      role: "VISUALIZADOR",
      ativo: true,
      extra: "x",
    });
    for (const k of Object.keys(dados)) {
      expect(CHAVES_SESSAO).toContain(k);
    }
  });

  it("usuário sem nada aproveitável → null", () => {
    expect(montarDadosSessao({ id: 2, nome: "X", email: "x@x" })).toBeNull();
  });
});

describe("identificarSessao", () => {
  const DADOS = { municipio_id: 7, papel: "VISUALIZADOR" };

  it("com window.umami presente → identify com os dados", () => {
    window.umami = { identify: vi.fn() };
    identificarSessao(DADOS);
    expect(window.umami.identify).toHaveBeenCalledTimes(1);
    expect(window.umami.identify).toHaveBeenCalledWith(DADOS);
  });

  it("antes do load → pendente; após load com umami → chama uma vez", () => {
    iniciarAnalytics(CONFIG);
    identificarSessao(DADOS);
    window.umami = { identify: vi.fn() };
    expect(window.umami.identify).not.toHaveBeenCalled();
    tags()[0].dispatchEvent(new Event("load"));
    expect(window.umami.identify).toHaveBeenCalledTimes(1);
    expect(window.umami.identify).toHaveBeenCalledWith(DADOS);
  });

  it("script falhou (error) e load sem umami → nada acontece, sem lançar", () => {
    iniciarAnalytics(CONFIG);
    identificarSessao(DADOS);
    expect(() => {
      tags()[0].dispatchEvent(new Event("error"));
      tags()[0].dispatchEvent(new Event("load"));
    }).not.toThrow();
    expect(window.umami).toBeUndefined();
  });

  it("sem tag e sem umami → no-op", () => {
    expect(() => identificarSessao(DADOS)).not.toThrow();
  });

  it("umami sem identify (tracker antigo) → não lança", () => {
    window.umami = {};
    expect(() => identificarSessao(DADOS)).not.toThrow();
  });

  it("identify que lança → não propaga", () => {
    window.umami = {
      identify: () => {
        throw new Error("boom");
      },
    };
    expect(() => identificarSessao(DADOS)).not.toThrow();
  });

  it("dados null → no-op", () => {
    window.umami = { identify: vi.fn() };
    identificarSessao(null);
    expect(window.umami.identify).not.toHaveBeenCalled();
  });
});
