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

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem("access_token");
      window.location.href = "/login";
    }
    return Promise.reject(error);
  }
);

export default api;
