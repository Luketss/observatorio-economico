import { useAuth } from "../context/AuthContext";

// Puras (testáveis): o hook abaixo só injeta o user do contexto.
export function hasPermissao(user, area, verbo) {
  if (!user) return false;
  if (user.role === "ADMIN_GLOBAL") return true;
  return (user.permissoes?.[area] || []).includes(verbo);
}

const AREAS_ADMIN = ["mandato", "usuarios"];

export function temPermissaoAdmin(user) {
  if (!user) return false;
  if (user.role === "ADMIN_GLOBAL") return true;
  return AREAS_ADMIN.some((a) => (user.permissoes?.[a] || []).length > 0);
}

export function usePermissao(area, verbo) {
  const { user } = useAuth();
  return hasPermissao(user, area, verbo);
}
