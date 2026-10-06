// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import {
  FONTES_DATASET,
  baixarBlob,
  datasetDe,
  formatarCelulaCsv,
  gerarCsv,
  inlinarEstilosSvg,
  nomeArquivo,
  resolverVars,
  rodapePng,
  slugify,
  svgParaPng,
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

describe("resolverVars", () => {
  const raiz = { getPropertyValue: (n) => ({ "--accent-1": "#ff0000" }[n] || "") };
  it("resolve pela raiz, usa fallback, ou devolve vazio", () => {
    expect(resolverVars("var(--accent-1)", raiz)).toBe("#ff0000");
    expect(resolverVars("var(--nada, #00ff00)", raiz)).toBe("#00ff00");
    expect(resolverVars("var(--nada)", raiz)).toBe("");
    expect(resolverVars("rgb(1, 2, 3)", raiz)).toBe("rgb(1, 2, 3)");
    expect(resolverVars("", raiz)).toBe("");
    expect(resolverVars(null, raiz)).toBe("");
    expect(resolverVars("var(--accent-1)", null)).toBe("");
  });
});

describe("inlinarEstilosSvg", () => {
  // O jsdom não resolve var() em getComputedStyle de forma confiável, então o
  // `win` é falso: `computados` é o que getComputedStyle devolve para qualquer
  // elemento do svg, `raiz` é o que devolve para document.documentElement.
  function winFake(computados = {}, raiz = {}) {
    return {
      getComputedStyle: (el) => ({
        getPropertyValue: (p) => (el === document.documentElement ? raiz[p] ?? "" : computados[p] ?? ""),
      }),
    };
  }
  function svgComVar() {
    document.body.innerHTML = `
      <svg viewBox="0 0 100 50" width="100" height="50">
        <path d="M0 0 L10 10" fill="var(--accent-1)" stroke="var(--accent-1, #00ff00)" class="nid-line"></path>
        <text x="1" y="1" style="fill: var(--text); font-family: var(--font-mono), monospace">a</text>
      </svg>`;
    return document.querySelector("svg");
  }
  it("usa o estilo computado quando ele já vem resolvido", () => {
    const { clone, largura, altura } = inlinarEstilosSvg(svgComVar(), winFake({ fill: "rgb(255, 0, 0)", stroke: "rgb(255, 0, 0)", "font-family": "Inter" }));
    expect(largura).toBe(100);
    expect(altura).toBe(50);
    expect(clone.getAttribute("xmlns")).toBe("http://www.w3.org/2000/svg");
    const path = clone.querySelector("path");
    expect(path.getAttribute("fill")).toBe("rgb(255, 0, 0)");
    expect(path.getAttribute("stroke")).toBe("rgb(255, 0, 0)");
    expect(path.getAttribute("class")).toBeNull();
    expect(clone.outerHTML).not.toMatch(/var\(/);
  });
  it("resolve var() pela raiz quando o computado vem cru", () => {
    const { clone } = inlinarEstilosSvg(svgComVar(), winFake({ fill: "var(--accent-1)", stroke: "var(--accent-1, #00ff00)" }, { "--accent-1": "#ff0000", "--text": "#111111" }));
    const path = clone.querySelector("path");
    expect(path.getAttribute("fill")).toBe("#ff0000");
    expect(path.getAttribute("stroke")).toBe("#ff0000");
    expect(clone.outerHTML).not.toMatch(/var\(/);
  });
  it("sem computado e sem variável na raiz usa o fallback do var() ou remove o atributo", () => {
    const { clone } = inlinarEstilosSvg(svgComVar(), winFake({}, {}));
    const path = clone.querySelector("path");
    expect(path.getAttribute("fill")).toBeNull();          // var(--accent-1) sem fallback → removido
    expect(path.getAttribute("stroke")).toBe("#00ff00");    // var(--accent-1, #00ff00) → fallback
    expect(clone.querySelector("text").getAttribute("style")).toBeNull(); // style com var() → removido
    expect(clone.outerHTML).not.toMatch(/var\(/);
  });
  it("sem width/height usa o viewBox", () => {
    document.body.innerHTML = `<svg viewBox="0 0 640 280"><rect width="1" height="1"/></svg>`;
    const { largura, altura, clone } = inlinarEstilosSvg(document.querySelector("svg"), winFake());
    expect(largura).toBe(640);
    expect(altura).toBe(280);
    expect(clone.getAttribute("width")).toBe("640");
  });
});

describe("svgParaPng", () => {
  function fakes({ comCanvas = true, falhaImagem = false } = {}) {
    const ctx = { scale: vi.fn(), fillRect: vi.fn(), fillText: vi.fn(), drawImage: vi.fn(), fillStyle: "", font: "", globalAlpha: 1 };
    const canvas = {
      width: 0, height: 0,
      getContext: vi.fn(() => (comCanvas ? ctx : null)),
      toBlob: comCanvas ? vi.fn((cb) => cb(new Blob(["png"], { type: "image/png" }))) : undefined,
    };
    class Image {
      set src(v) { this._src = v; setTimeout(() => (falhaImagem ? this.onerror?.(new Error("x")) : this.onload?.()), 0); }
    }
    const doc = { createElement: vi.fn(() => canvas), documentElement: document.documentElement };
    const win = {
      Image,
      URL: window.URL,
      getComputedStyle: (el) => window.getComputedStyle(el),
      XMLSerializer: window.XMLSerializer,
    };
    return { ctx, canvas, doc, win };
  }
  function svg() {
    document.body.innerHTML = `<style>:root{--panel:#fafafa;--text:#111111}</style><svg viewBox="0 0 100 50"><rect width="1" height="1" fill="red"/></svg>`;
    return document.querySelector("svg");
  }
  it("desenha fundo, título, sub, gráfico e rodapé em escala 2x e devolve um Blob PNG", async () => {
    const { ctx, canvas, doc, win } = fakes();
    const blob = await svgParaPng(svg(), { titulo: "Evolução", sub: "PIB total", rodape: "Fonte: IBGE · UAIZI NID · 06/10/2026", doc, win });
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe("image/png");
    expect(ctx.scale).toHaveBeenCalledWith(2, 2);
    expect(canvas.width).toBeGreaterThan(100 * 2);
    expect(ctx.fillRect).toHaveBeenCalledTimes(1);
    const textos = ctx.fillText.mock.calls.map((c) => c[0]);
    expect(textos).toEqual(["Evolução", "PIB total", "Fonte: IBGE · UAIZI NID · 06/10/2026"]);
    expect(ctx.drawImage).toHaveBeenCalledTimes(1);
    expect(canvas.toBlob.mock.calls[0][1]).toBe("image/png");
  });
  it("sem título/sub/rodapé não escreve texto", async () => {
    const { ctx, doc, win } = fakes();
    await svgParaPng(svg(), { doc, win });
    expect(ctx.fillText).not.toHaveBeenCalled();
  });
  it("sem canvas → rejeita com mensagem legível, sem lançar síncrono", async () => {
    const { doc, win } = fakes({ comCanvas: false });
    const p = svgParaPng(svg(), { doc, win });
    expect(p).toBeInstanceOf(Promise);
    await expect(p).rejects.toThrow("Não foi possível gerar a imagem neste navegador");
  });
  it("svg nulo → rejeita", async () => {
    const { doc, win } = fakes();
    await expect(svgParaPng(null, { doc, win })).rejects.toThrow("Gráfico indisponível para exportar");
  });
  it("imagem que falha ao carregar → rejeita", async () => {
    const { doc, win } = fakes({ falhaImagem: true });
    await expect(svgParaPng(svg(), { doc, win })).rejects.toThrow("Falha ao renderizar o gráfico");
  });
});
