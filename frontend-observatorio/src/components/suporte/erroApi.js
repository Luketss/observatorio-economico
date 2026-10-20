// Converte um erro do Axios em mensagem amigavel para o usuario.
const FALLBACK_PADRAO = "Não foi possível concluir. Tente novamente.";
const MSG_429 = "Você enviou muitas solicitações. Aguarde um pouco e tente de novo.";

export function mensagemErroApi(error, fallback = FALLBACK_PADRAO) {
  const resposta = error?.response;
  if (resposta?.status === 429) return MSG_429;
  const detail = resposta?.data?.detail;
  if (Array.isArray(detail)) {
    const msgs = detail
      .map((d) => (typeof d?.msg === "string" ? d.msg.replace(/^Value error, /, "") : ""))
      .filter(Boolean);
    if (msgs.length) return msgs.join(" ");
  }
  if (typeof detail === "string" && detail) return detail;
  return fallback;
}
