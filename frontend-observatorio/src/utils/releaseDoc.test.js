// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { DATASET_LABELS, getLabel, fmtDateRelease, abrirImpressao } from "./releaseDoc";

describe("getLabel", () => {
  it("resolve a chave conhecida removendo o prefixo release_", () => {
    expect(getLabel("release_caged")).toBe("CAGED");
    expect(getLabel("caged")).toBe("CAGED");
  });

  it("cai pra chave crua (sem prefixo) quando o dataset é desconhecido", () => {
    expect(getLabel("release_novidade")).toBe("novidade");
    expect(getLabel("novidade")).toBe("novidade");
  });
});

describe("fmtDateRelease", () => {
  it("formata dia + mês por extenso + ano", () => {
    expect(fmtDateRelease("2026-08-19T12:00:00Z")).toMatch(/agosto de 2026/);
  });

  it("retorna travessão pra data ausente", () => {
    expect(fmtDateRelease(null)).toBe("—");
    expect(fmtDateRelease(undefined)).toBe("—");
  });
});

describe("abrirImpressao", () => {
  const release = { dataset: "release_caged", gerado_em: "2026-08-19T12:00:00Z", bullets: ["Parágrafo 1", "Parágrafo 2"] };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("abre a janela, escreve o HTML com label/município/data e retorna true", () => {
    const write = vi.fn();
    const close = vi.fn();
    const fakeWin = { document: { write, close } };
    vi.spyOn(window, "open").mockReturnValue(fakeWin);

    const ok = abrirImpressao(release, "Cidade Teste");

    expect(ok).toBe(true);
    expect(window.open).toHaveBeenCalledWith("", "_blank");
    expect(write).toHaveBeenCalledTimes(1);
    const html = write.mock.calls[0][0];
    expect(html).toContain("CAGED");
    expect(html).toContain("Cidade Teste");
    expect(html).toContain("Parágrafo 1");
    expect(html).toContain("Parágrafo 2");
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("usa 'Município' como default quando municipioNome não é passado", () => {
    const write = vi.fn();
    const fakeWin = { document: { write, close: vi.fn() } };
    vi.spyOn(window, "open").mockReturnValue(fakeWin);

    abrirImpressao(release);

    expect(write.mock.calls[0][0]).toContain("Prefeitura de Município");
  });

  it("pop-up bloqueado (window.open retorna null) retorna false sem estourar TypeError", () => {
    vi.spyOn(window, "open").mockReturnValue(null);

    expect(() => abrirImpressao(release, "Cidade Teste")).not.toThrow();
    expect(abrirImpressao(release, "Cidade Teste")).toBe(false);
  });
});

describe("DATASET_LABELS", () => {
  it("cobre as 12 chaves esperadas dos 3 arquivos originais", () => {
    expect(Object.keys(DATASET_LABELS).sort()).toEqual(
      [
        "arrecadacao", "bolsa_familia", "caged", "comex", "empresas", "estban",
        "geral", "inss", "pe_de_meia", "pib", "pix", "rais",
      ].sort()
    );
  });
});
