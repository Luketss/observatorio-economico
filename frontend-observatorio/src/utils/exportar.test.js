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
    const win = { URL: { createObjectURL: vi.fn(() => "blob:abc"), revokeObjectURL: vi.fn() }, setTimeout: vi.fn((fn) => fn()) };
    baixarBlob(blob, "arquivo.csv", doc, win);
    expect(doc.createElement).toHaveBeenCalledWith("a");
    expect(a.href).toBe("blob:abc");
    expect(a.download).toBe("arquivo.csv");
    expect(doc.body.appendChild).toHaveBeenCalledWith(a);
    expect(click).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledTimes(1);
    expect(win.setTimeout).toHaveBeenCalledWith(expect.any(Function), 1000);
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
  // elemento do svg, `raiz` é o que devolve para document.documentElement,
  // `svg` é para o elemento SVG.
  function winFake(computados = {}, raiz = {}, svg = {}, porTag = {}) {
    return {
      getComputedStyle: (el) => ({
        getPropertyValue: (p) => {
          if (el === document.documentElement) return raiz[p] ?? "";
          const tag = el.tagName.toLowerCase();
          if (porTag[tag]) return porTag[tag][p] ?? "";
          if (el.tagName === "svg") return svg[p] ?? computados[p] ?? "";
          return computados[p] ?? "";
        },
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
  it("stop-color com var() é resolvido", () => {
    document.body.innerHTML = `
      <svg viewBox="0 0 100 50">
        <defs>
          <linearGradient id="grad">
            <stop stop-color="var(--accent-1)" stop-opacity="0.45"/>
          </linearGradient>
        </defs>
      </svg>`;
    const { clone } = inlinarEstilosSvg(document.querySelector("svg"), winFake({}, { "--accent-1": "#ff0000" }));
    const stop = clone.querySelector("stop");
    expect(stop.getAttribute("stop-color")).toBe("#ff0000");
    expect(stop.getAttribute("stop-opacity")).toBe("0.45");
    expect(clone.outerHTML).not.toMatch(/var\(/);
  });
  it("atributo fora da lista com var() não sobrevive", () => {
    document.body.innerHTML = `<svg viewBox="0 0 100 50"><rect data-x="var(--nada)"/></svg>`;
    const { clone } = inlinarEstilosSvg(document.querySelector("svg"), winFake({}, {}));
    const rect = clone.querySelector("rect");
    expect(rect.getAttribute("data-x")).toBeNull();
    expect(clone.outerHTML).not.toMatch(/var\(/);
  });
  it("nó HTML dentro de foreignObject recebe o estilo computado inline", () => {
    document.body.innerHTML = `<svg viewBox="0 0 100 50" width="100" height="50"><foreignObject x="0" y="0" width="50" height="20"><div class="nid-pin" xmlns="http://www.w3.org/1999/xhtml">COVID</div></foreignObject></svg>`;
    const win = winFake({}, {}, {}, { div: { "background-color": "rgb(0, 0, 0)", color: "rgb(255, 255, 255)", padding: "2px 6px", "border-radius": "4px" } });
    const { clone } = inlinarEstilosSvg(document.querySelector("svg"), win);
    const div = clone.querySelector("div");
    expect(div.getAttribute("style")).toContain("background-color: rgb(0, 0, 0)");
    expect(div.getAttribute("style")).toContain("padding: 2px 6px");
    expect(div.getAttribute("class")).toBeNull();
    expect(clone.outerHTML).not.toMatch(/var\(/);
  });
  it("variável definida no próprio svg/body vence a raiz", () => {
    document.body.innerHTML = `<svg viewBox="0 0 100 50"><rect fill="var(--accent-1)"/></svg>`;
    const { clone } = inlinarEstilosSvg(document.querySelector("svg"), winFake({}, { "--accent-1": "#ff0000" }, { "--accent-1": "#00ff00" }));
    const rect = clone.querySelector("rect");
    expect(rect.getAttribute("fill")).toBe("#00ff00");
  });
});

describe("svgParaPng", () => {
  function fakes({ comCanvas = true, falhaImagem = false, blobNull = false } = {}) {
    const fillRectCalls = [];
    const ctx = {
      scale: vi.fn(),
      fillRect: vi.fn(function() { fillRectCalls.push(this.fillStyle); }),
      fillText: vi.fn(),
      drawImage: vi.fn(),
      measureText: vi.fn((t) => ({ width: t.length * 7 })),
      fillStyle: "",
      font: "",
      globalAlpha: 1,
    };
    const canvas = {
      width: 0, height: 0,
      getContext: vi.fn(() => (comCanvas ? ctx : null)),
      toBlob: comCanvas ? vi.fn((cb) => cb(blobNull ? null : new Blob(["png"], { type: "image/png" }))) : undefined,
    };
    class Image {
      set src(v) { this._src = v; setTimeout(() => (falhaImagem ? this.onerror?.(new Error("x")) : this.onload?.()), 0); }
    }
    document.body.innerHTML = `<style>:root{--panel:#fafafa;--text:#111111}</style>`;
    const doc = {
      createElement: vi.fn(() => canvas),
      documentElement: document.documentElement,
      body: document.body,
    };
    const win = {
      Image,
      URL: window.URL,
      getComputedStyle: (el) => {
        if (el === doc.body) {
          return {
            getPropertyValue: (p) => ({ "--bg": "#0a0a0a", "--panel": "rgba(13,17,35,0.72)", "--text": "#eef0ff" }[p] || ""),
          };
        }
        return window.getComputedStyle(el);
      },
      XMLSerializer: window.XMLSerializer,
    };
    return { ctx, canvas, doc, win, fillRectCalls };
  }
  function svg() {
    document.body.innerHTML = `<style>:root{--panel:#fafafa;--text:#111111}</style><svg viewBox="0 0 100 50"><rect width="1" height="1" fill="red"/></svg>`;
    return document.querySelector("svg");
  }
  it("desenha fundo, título, sub, gráfico e rodapé em escala 2x e devolve um Blob PNG", async () => {
    const { ctx, canvas, doc, win, fillRectCalls } = fakes();
    const blob = await svgParaPng(svg(), { titulo: "Evolução", sub: "PIB total", rodape: "Fonte: IBGE · UAIZI NID · 06/10/2026", doc, win });
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe("image/png");
    expect(ctx.scale).toHaveBeenCalledWith(2, 2);
    expect(canvas.width).toBeGreaterThan(100 * 2);
    expect(ctx.fillRect).toHaveBeenCalledTimes(2);
    expect(fillRectCalls).toEqual(["#0a0a0a", "rgba(13,17,35,0.72)"]);
    const textos = ctx.fillText.mock.calls.map((c) => c[0]);
    expect(textos).toEqual(["Evolução", "PIB total", "Fonte: IBGE · UAIZI NID · 06/10/2026"]);
    expect(ctx.drawImage).toHaveBeenCalledTimes(1);
    expect(canvas.toBlob.mock.calls[0][1]).toBe("image/png");
  });
  it("rodapé mais largo que o gráfico alarga o canvas e centraliza o svg", async () => {
    const { ctx, canvas, doc, win } = fakes();
    await svgParaPng(svg(), { rodape: "x".repeat(60), doc, win });
    expect(canvas.width).toBe((420 + 48) * 2);
    expect(ctx.drawImage.mock.calls[0][1]).toBe(24 + (420 - 100) / 2);
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
  it("fundo pinta --bg e depois --panel lidos do body", async () => {
    const { doc, win, fillRectCalls } = fakes();
    await svgParaPng(svg(), { doc, win });
    expect(fillRectCalls.length).toBe(2);
    expect(fillRectCalls[0]).toBe("#0a0a0a");
    expect(fillRectCalls[1]).toBe("rgba(13,17,35,0.72)");
  });
  it("toBlob devolve null → rejeita 'Falha ao gerar PNG'", async () => {
    const { doc, win } = fakes({ blobNull: true });
    await expect(svgParaPng(svg(), { doc, win })).rejects.toThrow("Falha ao gerar PNG");
  });
});
