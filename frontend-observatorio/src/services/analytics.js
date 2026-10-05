// Loader do Umami (analytics de uso). Gemeo de frontend/src/lib/analytics.js
// no repo do LEGIS (github.com/Uaiizi/camara) — mudou aqui, mude lá. A única
// diferença legítima entre os dois é montarDadosSessao, que lê os campos do
// /auth/me de cada app.
// Spec: docs/superpowers/specs/2026-10-05-umami-analytics-compartilhado-design.md
//
// Regras: sem as duas variáveis VITE_UMAMI_* nada é injetado (dev local nunca
// rastreia); o módulo não guarda estado (dedupe e fila usam o DOM); nenhuma
// função lança — analytics é best-effort e nunca pode quebrar o app.

export const CHAVES_SESSAO = ["municipio_id", "municipio", "papel"];

const SELETOR_SCRIPT = "script[data-website-id]";

export function lerConfigAnalytics(env) {
  const src = String(env?.VITE_UMAMI_SRC ?? "")
    .trim()
    .replace(/\/+$/, "");
  const websiteId = String(env?.VITE_UMAMI_WEBSITE_ID ?? "").trim();
  if (!src || !websiteId) return null;
  return { src, websiteId };
}

export function iniciarAnalytics(config, doc = document) {
  if (!config) return false;
  try {
    if (doc.querySelector(SELETOR_SCRIPT)) return true;
    const tag = doc.createElement("script");
    tag.defer = true;
    tag.src = `${config.src}/script.js`;
    tag.setAttribute("data-website-id", config.websiteId);
    doc.head.appendChild(tag);
    return true;
  } catch {
    return false; // analytics nunca quebra o app
  }
}

// /auth/me do NID: { id, nome, email, municipio_id, role, ativo }.
// Só município e papel saem; id/nome/email nunca.
export function montarDadosSessao(user) {
  if (!user) return null;
  const dados = {};
  if (user.municipio_id != null) dados.municipio_id = user.municipio_id;
  if (user.role) dados.papel = user.role;
  return Object.keys(dados).length ? dados : null;
}

function chamarIdentify(win, dados) {
  if (win.umami && typeof win.umami.identify === "function") {
    win.umami.identify(dados);
    return true;
  }
  return false;
}

export function identificarSessao(dados, doc = document, win = window) {
  if (!dados) return;
  try {
    if (chamarIdentify(win, dados)) return;
    const tag = doc.querySelector(SELETOR_SCRIPT);
    if (!tag) return;
    tag.addEventListener(
      "load",
      () => {
        try {
          chamarIdentify(win, dados);
        } catch {
          // best-effort
        }
      },
      { once: true }
    );
  } catch {
    // best-effort: analytics nunca quebra o app
  }
}
