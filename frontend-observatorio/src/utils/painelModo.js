// Persistência por dispositivo do modo do Painel do Prefeito
// (padrão do ThemeContext: chave nid-*, leitura validada, default seguro).
const CHAVE = "nid-painel-modo";
const MODOS = ["gerencial", "detalhado"];

export const MODO_DEFAULT = "gerencial";

export function lerModo() {
  try {
    const salvo = globalThis.localStorage?.getItem(CHAVE);
    return MODOS.includes(salvo) ? salvo : MODO_DEFAULT;
  } catch {
    return MODO_DEFAULT;
  }
}

export function persistirModo(modo) {
  try {
    globalThis.localStorage?.setItem(CHAVE, modo);
  } catch {
    // storage indisponível (modo privado etc.) — preferência só não persiste
  }
}
