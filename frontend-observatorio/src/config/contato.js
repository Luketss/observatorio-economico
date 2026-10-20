export const WHATSAPP_NUMERO = "5537998720903";

// Deep-link do WhatsApp para um numero arbitrario; `texto` vira o campo `text` ja codificado.
export function linkWhatsAppPara(numero, texto) {
  const base = `https://wa.me/${numero}`;
  return texto ? `${base}?text=${encodeURIComponent(texto)}` : base;
}

// Deep-link do WhatsApp de suporte da plataforma.
export function linkWhatsApp(texto) {
  return linkWhatsAppPara(WHATSAPP_NUMERO, texto);
}
