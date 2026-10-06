// Exportacao de graficos (CSV / PNG no navegador; XLSX via POST /export/xlsx).
// Helpers puros, testaveis sem DOM real: funcoes que tocam o DOM recebem
// `doc`/`win` injetaveis com default nos globais.
// Spec: docs/superpowers/specs/2026-10-06-exportacao-graficos-design.md

// Fonte institucional por dataset (rodape do PNG e linha "Fonte" do XLSX).
export const FONTES_DATASET = {
  pib: "IBGE",
  arrecadacao: "SEF / Receita",
  caged: "MTE / Novo CAGED",
  rais: "MTE / RAIS",
  bolsa_familia: "MDS",
  pe_de_meia: "MEC",
  inss: "INSS",
  estban: "BCB / ESTBAN",
  comex: "MDIC / Comex Stat",
  empresas: "RFB / CNPJ",
  pix: "BCB",
  ips: "IPS Brasil",
  vaf: "SEF-MG / VAF",
  fpm: "STN / FPM",
};

export function slugify(texto, maxLen = 60) {
  if (texto == null || texto === "") return "";
  const semAcento = String(texto).normalize("NFD").replace(/[̀-ͯ]/g, "");
  const slug = semAcento.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase();
  return slug.slice(0, maxLen).replace(/-+$/g, "");
}

export function datasetDe(datasetProp, pathname) {
  if (datasetProp) return String(datasetProp);
  const m = /^\/app\/([a-z0-9-]+)/.exec(pathname || "");
  return m ? m[1] : "";
}

function dataLocalIso(data) {
  const p = (n) => String(n).padStart(2, "0");
  return `${data.getFullYear()}-${p(data.getMonth() + 1)}-${p(data.getDate())}`;
}

function dataLocalBr(data) {
  const p = (n) => String(n).padStart(2, "0");
  return `${p(data.getDate())}/${p(data.getMonth() + 1)}/${data.getFullYear()}`;
}

export function nomeArquivo({ dataset, painel, municipio, ext, data = new Date() }) {
  const partes = ["nid", slugify(dataset), slugify(painel), slugify(municipio), dataLocalIso(data)];
  return `${partes.filter(Boolean).join("_")}.${ext}`;
}

export function rodapePng(dataset, data = new Date()) {
  const fonte = FONTES_DATASET[dataset];
  const base = `UAIZI NID · ${dataLocalBr(data)}`;
  return fonte ? `Fonte: ${fonte} · ${base}` : base;
}

export function formatarCelulaCsv(valor) {
  if (valor == null) return "";
  if (typeof valor === "number") {
    return Number.isFinite(valor) ? String(valor).replace(".", ",") : "";
  }
  const s = String(valor);
  return /[;"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function gerarCsv(colunas, linhas) {
  const cabecalho = colunas.map((c) => formatarCelulaCsv(c.rotulo)).join(";");
  const corpo = (linhas || []).map((l) => colunas.map((c) => formatarCelulaCsv(l[c.chave])).join(";"));
  return "﻿" + [cabecalho, ...corpo].join("\r\n") + "\r\n";
}

export function baixarBlob(blob, nome, doc = document, win = window) {
  const url = win.URL.createObjectURL(blob);
  const a = doc.createElement("a");
  a.href = url;
  a.download = nome;
  a.rel = "noopener";
  doc.body.appendChild(a);
  a.click();
  a.remove();
  win.URL.revokeObjectURL(url);
}

// ────────── PNG ──────────
// O SVG dos gráficos usa variáveis CSS (var(--accent-1)) e classes do tema. Um
// SVG serializado para <img> não enxerga o CSS da página, então inlinamos o
// estilo computado de cada elemento como atributo antes de desenhar no canvas.

export const PROPRIEDADES_SVG = [
  "fill", "fill-opacity", "stroke", "stroke-width", "stroke-opacity", "stroke-dasharray",
  "stroke-linecap", "stroke-linejoin", "opacity", "font-family", "font-size", "font-weight",
  "text-anchor", "dominant-baseline", "letter-spacing",
];

function dimensoesDo(svgEl) {
  const rect = typeof svgEl.getBoundingClientRect === "function" ? svgEl.getBoundingClientRect() : { width: 0, height: 0 };
  let largura = Math.round(rect.width) || Number(svgEl.getAttribute("width")) || 0;
  let altura = Math.round(rect.height) || Number(svgEl.getAttribute("height")) || 0;
  if (!largura || !altura) {
    const vb = (svgEl.getAttribute("viewBox") || "").split(/[\s,]+/).map(Number);
    if (vb.length === 4 && vb[2] > 0 && vb[3] > 0) {
      largura = largura || vb[2];
      altura = altura || vb[3];
    }
  }
  return { largura: largura || 800, altura: altura || 300 };
}

// Troca cada var(--nome[, fallback]) pelo valor da variável na raiz (:root) ou
// pelo fallback. Se ainda sobrar var(), devolve "" (quem chama remove o atributo).
export function resolverVars(valor, estiloRaiz) {
  if (!valor || !valor.includes("var(")) return valor || "";
  let falhou = false;
  const resolvido = valor.replace(/var\(\s*(--[\w-]+)\s*(?:,\s*([^()]*))?\)/g, (_m, nome, fallback) => {
    const v = estiloRaiz ? String(estiloRaiz.getPropertyValue(nome) || "").trim() : "";
    const fb = fallback ? fallback.trim() : "";
    if (!v && !fb) falhou = true;
    return v || fb;
  });
  // Qualquer var() sem valor nem fallback invalida o valor inteiro ("fill: ;" não é CSS útil).
  return falhou || resolvido.includes("var(") ? "" : resolvido.trim();
}

export function inlinarEstilosSvg(svgEl, win = window) {
  const clone = svgEl.cloneNode(true);
  const { largura, altura } = dimensoesDo(svgEl);
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("width", String(largura));
  clone.setAttribute("height", String(altura));
  if (!clone.getAttribute("viewBox")) clone.setAttribute("viewBox", `0 0 ${largura} ${altura}`);
  const raiz = svgEl.ownerDocument ? svgEl.ownerDocument.documentElement : null;
  const estiloRaiz = raiz ? win.getComputedStyle(raiz) : null;
  const originais = [svgEl, ...svgEl.querySelectorAll("*")];
  const clonados = [clone, ...clone.querySelectorAll("*")];
  originais.forEach((el, i) => {
    const alvo = clonados[i];
    if (!alvo) return;
    const estilo = win.getComputedStyle(el);
    PROPRIEDADES_SVG.forEach((prop) => {
      // 1) estilo computado (já resolvido pelo navegador); 2) atributo original com var() resolvido pela raiz
      let valor = resolverVars(estilo.getPropertyValue(prop), estiloRaiz);
      if (!valor) valor = resolverVars(alvo.getAttribute(prop), estiloRaiz);
      if (valor) alvo.setAttribute(prop, valor);
      else if ((alvo.getAttribute(prop) || "").includes("var(")) alvo.removeAttribute(prop);
    });
    alvo.removeAttribute("class");
    const estiloInline = alvo.getAttribute("style");
    if (estiloInline && estiloInline.includes("var(")) {
      const resolvido = resolverVars(estiloInline, estiloRaiz);
      if (resolvido) alvo.setAttribute("style", resolvido);
      else alvo.removeAttribute("style");
    }
  });
  return { clone, largura, altura };
}

function svgParaDataUrl(clone, win) {
  const Serializer = win.XMLSerializer || XMLSerializer;
  const xml = new Serializer().serializeToString(clone);
  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(xml);
}

function carregarImagem(url, win) {
  return new Promise((resolve, reject) => {
    const img = new win.Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Falha ao renderizar o gráfico"));
    img.src = url;
  });
}

function corDoTema(doc, win, variavel, padrao) {
  try {
    const v = win.getComputedStyle(doc.documentElement).getPropertyValue(variavel).trim();
    return v || padrao;
  } catch {
    return padrao;
  }
}

export function svgParaPng(svgEl, { titulo = "", sub = "", rodape = "", escala = 2, doc = document, win = window } = {}) {
  return new Promise((resolve, reject) => {
    if (!svgEl) return reject(new Error("Gráfico indisponível para exportar"));
    const canvas = doc.createElement("canvas");
    const ctx = typeof canvas.getContext === "function" ? canvas.getContext("2d") : null;
    if (!ctx || typeof canvas.toBlob !== "function") {
      return reject(new Error("Não foi possível gerar a imagem neste navegador"));
    }
    const { clone, largura, altura } = inlinarEstilosSvg(svgEl, win);
    const padX = 24;
    const alturaTitulo = titulo ? 30 : 0;
    const alturaSub = sub ? 20 : 0;
    const topo = 16 + alturaTitulo + alturaSub + (titulo || sub ? 8 : 0);
    const base = rodape ? 36 : 16;
    const totalW = largura + padX * 2;
    const totalH = topo + altura + base;
    canvas.width = totalW * escala;
    canvas.height = totalH * escala;
    ctx.scale(escala, escala);
    const fundo = corDoTema(doc, win, "--panel", "#ffffff");
    const texto = corDoTema(doc, win, "--text", "#111111");
    const fonte = "Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
    ctx.fillStyle = fundo;
    ctx.fillRect(0, 0, totalW, totalH);
    ctx.fillStyle = texto;
    let y = 16;
    if (titulo) { ctx.font = `700 16px ${fonte}`; ctx.fillText(titulo, padX, y + 16); y += alturaTitulo; }
    if (sub) { ctx.font = `400 12px ${fonte}`; ctx.fillText(sub, padX, y + 12); y += alturaSub; }
    carregarImagem(svgParaDataUrl(clone, win), win)
      .then((img) => {
        ctx.drawImage(img, padX, topo, largura, altura);
        if (rodape) {
          ctx.font = `400 11px ${fonte}`;
          ctx.globalAlpha = 0.7;
          ctx.fillText(rodape, padX, topo + altura + 22);
          ctx.globalAlpha = 1;
        }
        canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Falha ao gerar PNG"))), "image/png");
      })
      .catch(reject);
  });
}
