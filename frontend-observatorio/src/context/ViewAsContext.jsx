import { createContext, useContext, useEffect, useState } from "react";
import { setViewAsOverride } from "../services/api";

/**
 * ADMIN_GLOBAL "View as" impersonation context.
 *
 * Holds the currently-impersonated município id + nome. Persists to
 * sessionStorage so refreshes don't drop the view; using sessionStorage
 * (not localStorage) means the impersonation is scoped to the current tab —
 * opening a new tab shows the admin's normal global view.
 *
 * Syncs to the axios layer via `setViewAsOverride`, which appends
 * `?municipio_id=<id>` to GETs that don't already carry one. Writes (POST/
 * PUT/DELETE) are never modified.
 */

const ViewAsContext = createContext(null);
const STORAGE_KEY = "nid_view_as";

function readInitial() {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function ViewAsProvider({ children }) {
  const [state, setState] = useState(readInitial);

  useEffect(() => {
    if (state && state.id != null) {
      try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* ignore */ }
    } else {
      try { sessionStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
    }
    setViewAsOverride(state?.id ?? null);
  }, [state]);

  const value = {
    viewAsId: state?.id ?? null,
    viewAsNome: state?.nome ?? null,
    setViewAs: (id, nome) => setState({ id, nome }),
    clearViewAs: () => setState(null),
  };

  return <ViewAsContext.Provider value={value}>{children}</ViewAsContext.Provider>;
}

export function useViewAs() {
  const ctx = useContext(ViewAsContext);
  if (!ctx) {
    throw new Error("useViewAs must be used inside <ViewAsProvider>");
  }
  return ctx;
}
