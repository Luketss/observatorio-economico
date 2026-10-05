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

// Papéis do sistema (seed do backend, Role.builtin=True). Papéis personalizados
// criados pelo ADMIN_GLOBAL têm nome livre e poderiam identificar uma pessoa;
// por isso colapsam em "PERSONALIZADO" — papel segue atributo funcional fechado.
export const PAPEIS_SISTEMA = ["ADMIN_GLOBAL", "ADMIN_MUNICIPIO", "ANALISTA", "VISUALIZADOR"];
export const PAPEL_PERSONALIZADO = "PERSONALIZADO";

const SELETOR_SCRIPT = "script[data-website-id]";

const docPadrao = () => (typeof document === "undefined" ? null : document);
const winPadrao = () => (typeof window === "undefined" ? null : window);

export function lerConfigAnalytics(env) {
  const src = String(env?.VITE_UMAMI_SRC ?? "")
    .trim()
    .replace(/\/+$/, "");
  const websiteId = String(env?.VITE_UMAMI_WEBSITE_ID ?? "").trim();
  if (!src || !websiteId) return null;
  return { src, websiteId };
}

export function iniciarAnalytics(config, doc = docPadrao()) {
  if (!config || !doc) return false;
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
// Só município e papel saem; id/nome/email nunca. O papel só passa se estiver
// em PAPEIS_SISTEMA; qualquer outro nome (papel personalizado) vira PERSONALIZADO.
export function montarDadosSessao(user) {
  if (!user) return null;
  const dados = {};
  if (user.municipio_id != null) dados.municipio_id = user.municipio_id;
  if (user.role) {
    dados.papel = PAPEIS_SISTEMA.includes(user.role) ? user.role : PAPEL_PERSONALIZADO;
  }
  return Object.keys(dados).length ? dados : null;
}

function chamarIdentify(win, dados) {
  if (win.umami && typeof win.umami.identify === "function") {
    win.umami.identify(dados);
    return true;
  }
  return false;
}

export function identificarSessao(dados, doc = docPadrao(), win = winPadrao()) {
  if (!dados || !win) return;
  try {
    if (chamarIdentify(win, dados)) return;
    const tag = doc ? doc.querySelector(SELETOR_SCRIPT) : null;
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
