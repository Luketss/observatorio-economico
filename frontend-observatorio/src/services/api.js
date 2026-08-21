import axios from "axios";

const baseURL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:8000/api/v1";

const api = axios.create({
  baseURL,
});

// ── View-as override ─────────────────────────────────────────────────────────
// When ADMIN_GLOBAL impersonates a município (via ViewAsContext), every GET
// request that doesn't already specify municipio_id gets the override appended.
// POST / PUT / DELETE pass through unmodified — writes never get re-routed.
let _viewAsId = null;
export function setViewAsOverride(id) {
  _viewAsId = id == null ? null : Number(id);
}

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("access_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  if (_viewAsId != null && config.method?.toLowerCase() === "get") {
    config.params = config.params || {};
    if (config.params.municipio_id == null) {
      config.params.municipio_id = _viewAsId;
    }
  }

  return config;
});

// ── Delogar automático (DESABILITADO por enquanto, em revisão) ──────────────
// O redirect global de 401 derrubava a sessão no meio do uso: o access token
// expira em 30min e o front nunca chama /auth/refresh (o refresh_token que o
// login devolve é ignorado). Também engolia o erro de credencial inválida do
// /auth/login — o reload disparava antes da mensagem aparecer. Ao reativar,
// implementar o fluxo de refresh e manter /auth/login fora do redirect.
const DELOGAR_AUTOMATICO_ATIVO = false;

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (
      DELOGAR_AUTOMATICO_ATIVO &&
      error.response?.status === 401 &&
      !error.config?.url?.includes("/auth/login")
    ) {
      localStorage.removeItem("access_token");
      window.location.href = "/login";
    }

    // Normalize error shapes so callers can always read `data.detail`.
    // Domain errors (AppException) come as { success:false, error:{ code, message } };
    // FastAPI-native errors come as { detail }. Surface the domain message under
    // `detail` when it's the only thing present.
    const data = error.response?.data;
    if (data && data.detail == null && data.error?.message) {
      data.detail = data.error.message;
    }

    return Promise.reject(error);
  }
);

export default api;
