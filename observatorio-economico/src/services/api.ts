const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

export interface LoginResponse {
  access_token: string;
  token_type: string;
}

function getToken(): string | null {
  return localStorage.getItem("access_token");
}

function setToken(token: string) {
  localStorage.setItem("access_token", token);
}

function removeToken() {
  localStorage.removeItem("access_token");
}

async function request<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getToken();

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers,
  });

  if (response.status === 401) {
    removeToken();
    window.location.href = "/login";
    throw new Error("Unauthorized");
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText);
  }

  return response.json();
}

// ==============================
// AUTH
// ==============================

export async function login(
  email: string,
  password: string
): Promise<void> {
  const formData = new URLSearchParams();
  formData.append("username", email);
  formData.append("password", password);

  const response = await fetch(`${API_URL}/auth/login`, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    throw new Error("Email ou senha inválidos");
  }

  const data: LoginResponse = await response.json();
  setToken(data.access_token);
}

export function logout() {
  removeToken();
  window.location.href = "/login";
}

// ==============================
// ARRECADACAO
// ==============================

export function getArrecadacaoSerie() {
  return request("/arrecadacao/serie");
}

export function getArrecadacaoResumo() {
  return request("/arrecadacao/resumo");
}

// ==============================
// USUÁRIOS (ADMIN)
// ==============================

export function getUsuarios() {
  return request("/usuarios");
}

export function createUsuario(data: any) {
  return request("/usuarios", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function updateUsuario(id: number, data: any) {
  return request(`/usuarios/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export function getCagedSerie() {
  return request("/caged/serie");
}

export function getCagedResumo() {
  return request("/caged/resumo");
}

export function getRaisSerie() {
  return request("/rais/serie");
}

export function getRaisResumo() {
  return request("/rais/resumo");
}

// ==============================
// PIB
// ==============================

export function getPibSerie() {
  return request("/pib/serie");
}

export function getPibResumo() {
  return request("/pib/resumo");
}

export function getPibComparativo() {
  return request("/pib/comparativo");
}
