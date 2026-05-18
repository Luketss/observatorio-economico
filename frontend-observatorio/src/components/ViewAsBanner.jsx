import { useNavigate } from "react-router-dom";
import { EyeIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { useViewAs } from "../context/ViewAsContext";

/**
 * Sticky banner shown at the top of every dashboard page while ADMIN_GLOBAL
 * is impersonating a município. Clicking "Sair" clears the override and
 * reloads the current page so any in-flight caches refetch without the
 * override.
 */
export default function ViewAsBanner() {
  const { viewAsId, viewAsNome, clearViewAs } = useViewAs();
  const navigate = useNavigate();

  if (viewAsId == null) return null;

  const handleExit = () => {
    clearViewAs();
    // Reload so any cached page data is refetched without the override.
    // Using navigate(0) keeps us on the same route.
    navigate(0);
  };

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: "sticky",
        top: 0,
        zIndex: 30,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 14,
        padding: "10px 16px",
        background: "var(--admin-accent-soft)",
        borderBottom: "1px solid color-mix(in oklab, var(--admin-accent) 35%, transparent)",
        backdropFilter: "blur(8px)",
        fontFamily: "var(--font-display)",
        fontSize: 13,
        color: "var(--text)",
      }}
    >
      <EyeIcon style={{ width: 16, height: 16, color: "var(--admin-accent)", flexShrink: 0 }} />
      <span>
        Modo demo:{" "}
        <strong style={{ color: "var(--admin-accent)", fontWeight: 700 }}>
          visualizando como {viewAsNome ?? `município #${viewAsId}`}
        </strong>
      </span>
      <button
        type="button"
        onClick={handleExit}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          padding: "4px 10px",
          background: "var(--panel-2)",
          border: "1px solid var(--border)",
          color: "var(--text-dim)",
          borderRadius: 8,
          fontSize: 12,
          fontWeight: 600,
          cursor: "pointer",
        }}
        onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text)"; e.currentTarget.style.borderColor = "var(--border-strong)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-dim)"; e.currentTarget.style.borderColor = "var(--border)"; }}
      >
        <XMarkIcon style={{ width: 12, height: 12 }} />
        Sair do modo demo
      </button>
    </div>
  );
}
