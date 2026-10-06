// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import {
  FONTES_DATASET,
  baixarBlob,
  datasetDe,
  formatarCelulaCsv,
  gerarCsv,
  nomeArquivo,
  rodapePng,
  slugify,
} from "./exportar";

describe("slugify", () => {
  it("remove acentos, pontuação e espaços", () => {
    expect(slugify("Evolução Anual do PIB")).toBe("evolucao-anual-do-pib");
    expect(slugify("São João d'El Rei; MG")).toBe("sao-joao-d-el-rei-mg");
  });
  it("vazio/null/só símbolos → vazio", () => {
    expect(slugify("")).toBe("");
    expect(slugify(null)).toBe("");
    expect(slugify("---")).toBe("");
  });
  it("corta no maxLen sem hífen final", () => {
    expect(slugify("a".repeat(70), 10)).toBe("a".repeat(10));
    expect(slugify("abc def", 4)).toBe("abc");
  });
});

describe("datasetDe", () => {
  it("prop vence o pathname", () => {
    expect(datasetDe("pib", "/app/caged")).toBe("pib");
  });
  it("sem prop usa o primeiro segmento após /app/", () => {
    expect(datasetDe(undefined, "/app/analise-economica")).toBe("analise-economica");
    expect(datasetDe(null, "/app/pib/")).toBe("pib");
  });
  it("rota fora de /app → vazio", () => {
    expect(datasetDe(undefined, "/admin/usuarios")).toBe("");
    expect(datasetDe(undefined, "")).toBe("");
  });
});

describe("nomeArquivo", () => {
  const data = new Date(2026, 9, 6, 15, 0, 0); // 06/10/2026 local
  it("monta nid_dataset_painel_municipio_data.ext em slug", () => {
    expect(
      nomeArquivo({ dataset: "pib", painel: "Evolução Anual do PIB", municipio: "Divinópolis", ext: "csv", data })
    ).toBe("nid_pib_evolucao-anual-do-pib_divinopolis_2026-10-06.csv");
  });
  it("omite partes vazias", () => {
    expect(nomeArquivo({ painel: "Saldo", ext: "png", data })).toBe("nid_saldo_2026-10-06.png");
  });
  it("usa a data local, não UTC", () => {
    const tarde = new Date(2026, 9, 6, 23, 30, 0);
    expect(nomeArquivo({ painel: "x", ext: "csv", data: tarde })).toContain("_2026-10-06.csv");
  });
});

describe("formatarCelulaCsv", () => {
  it("número com vírgula decimal e sem milhar", () => {
    expect(formatarCelulaCsv(1234.5)).toBe("1234,5");
    expect(formatarCelulaCsv(-30)).toBe("-30");
    expect(formatarCelulaCsv(0)).toBe("0");
  });
  it("nulos e não finitos viram vazio", () => {
    expect(formatarCelulaCsv(null)).toBe("");
    expect(formatarCelulaCsv(undefined)).toBe("");
    expect(formatarCelulaCsv(NaN)).toBe("");
    expect(formatarCelulaCsv(Infinity)).toBe("");
  });
  it("texto com ; aspas ou quebra vai entre aspas com aspas duplicadas", () => {
    expect(formatarCelulaCsv("a; b")).toBe('"a; b"');
    expect(formatarCelulaCsv('Rio "Grande"')).toBe('"Rio ""Grande"""');
    expect(formatarCelulaCsv("linha1\nlinha2")).toBe('"linha1\nlinha2"');
    expect(formatarCelulaCsv("simples")).toBe("simples");
  });
});

describe("gerarCsv", () => {
  const colunas = [
    { chave: "periodo", rotulo: "Período", tipo: "texto" },
    { chave: "valor", rotulo: "PIB; Total", tipo: "numero" },
  ];
  const linhas = [
    { periodo: "2021", valor: 1234.5 },
    { periodo: "2022", valor: null },
    { periodo: "2023", valor: NaN },
  ];
  it("BOM, cabeçalho, ; e CRLF, com quebra final", () => {
    const csv = gerarCsv(colunas, linhas);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv.slice(1)).toBe('Período;"PIB; Total"\r\n2021;1234,5\r\n2022;\r\n2023;\r\n');
  });
  it("sem linhas → só cabeçalho", () => {
    expect(gerarCsv(colunas, []).slice(1)).toBe('Período;"PIB; Total"\r\n');
  });
  it("chave ausente na linha → célula vazia", () => {
    expect(gerarCsv(colunas, [{ periodo: "2021" }]).slice(1)).toBe('Período;"PIB; Total"\r\n2021;\r\n');
  });
});

describe("baixarBlob", () => {
  it("cria <a download>, clica, remove e revoga a URL", () => {
    const blob = new Blob(["x"], { type: "text/plain" });
    const click = vi.fn();
    const remove = vi.fn();
    const a = { click, remove, set href(v) { this._href = v; }, get href() { return this._href; } };
    const doc = { createElement: vi.fn(() => a), body: { appendChild: vi.fn() } };
    const win = { URL: { createObjectURL: vi.fn(() => "blob:abc"), revokeObjectURL: vi.fn() } };
    baixarBlob(blob, "arquivo.csv", doc, win);
    expect(doc.createElement).toHaveBeenCalledWith("a");
    expect(a.href).toBe("blob:abc");
    expect(a.download).toBe("arquivo.csv");
    expect(doc.body.appendChild).toHaveBeenCalledWith(a);
    expect(click).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledTimes(1);
    expect(win.URL.revokeObjectURL).toHaveBeenCalledWith("blob:abc");
  });
});

describe("FONTES_DATASET e rodapePng", () => {
  const data = new Date(2026, 9, 6);
  it("tem fonte para os datasets principais", () => {
    for (const k of ["pib", "caged", "rais", "arrecadacao", "estban", "comex", "empresas", "pix", "ips", "vaf", "fpm", "bolsa_familia", "pe_de_meia", "inss"]) {
      expect(typeof FONTES_DATASET[k]).toBe("string");
    }
  });
  it("rodapé com fonte conhecida e sem fonte", () => {
    expect(rodapePng("pib", data)).toBe("Fonte: IBGE · UAIZI NID · 06/10/2026");
    expect(rodapePng("desconhecido", data)).toBe("UAIZI NID · 06/10/2026");
    expect(rodapePng("", data)).toBe("UAIZI NID · 06/10/2026");
  });
});
