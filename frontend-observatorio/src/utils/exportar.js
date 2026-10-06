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
