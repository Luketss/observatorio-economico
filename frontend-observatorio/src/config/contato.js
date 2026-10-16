export const WHATSAPP_NUMERO = "5537998720903";

// Deep-link do WhatsApp; `texto` vira o campo `text` ja codificado.
export function linkWhatsApp(texto) {
  const base = `https://wa.me/${WHATSAPP_NUMERO}`;
  return texto ? `${base}?text=${encodeURIComponent(texto)}` : base;
}
