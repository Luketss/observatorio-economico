import api from "./api";

export async function fetchNotificacoes() {
  const res = await api.get("/notificacoes");
  return res.data || [];
}

export async function marcarLida(id) {
  await api.post(`/notificacoes/${id}/marcar_lida`);
}

export async function marcarTodasLidas(notifs) {
  const naoLidas = notifs.filter((n) => !n.lida);
  await Promise.all(
    naoLidas.map((n) => api.post(`/notificacoes/${n.id}/marcar_lida`).catch(() => {}))
  );
}
