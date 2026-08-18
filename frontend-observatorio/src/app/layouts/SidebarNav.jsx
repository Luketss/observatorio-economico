import { useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import {
  ChevronDownIcon,
  Cog6ToothIcon,
  LockClosedIcon,
} from "@heroicons/react/24/outline";
import { temPermissaoAdmin } from "../../hooks/usePermissao";
import { NAV_STRUCTURE, isChildActive, isModuloLocked } from "./navStructure";

const LOCK_TITLE = "Recurso bloqueado — disponível em um plano superior";

function gruposAtivos(pathname) {
  const open = new Set();
  NAV_STRUCTURE.forEach((section) => {
    section.items.forEach((item) => {
      if (item.type === "group" && isChildActive(item.children, pathname)) {
        open.add(item.label);
      }
    });
  });
  return open;
}

export default function SidebarNav({ user, modulos }) {
  const location = useLocation();
  const isGlobal = user?.role === "ADMIN_GLOBAL";
  const [openGroups, setOpenGroups] = useState(() => gruposAtivos(location.pathname));

  useEffect(() => {
    const ativos = gruposAtivos(location.pathname);
    setOpenGroups((prev) => {
      const faltantes = [...ativos].filter((label) => !prev.has(label));
      if (faltantes.length === 0) return prev;
      const next = new Set(prev);
      faltantes.forEach((label) => next.add(label));
      return next;
    });
  }, [location.pathname]);

  // Itens fora do plano não somem — ficam visíveis com cadeado (teaser de
  // upgrade). Só hideForAdmin remove um item (Releases para ADMIN_GLOBAL).
  const isVisible = (item) => !(item.hideForAdmin && isGlobal);
  const locked = (modulo) => isModuloLocked({ isGlobal, modulos, modulo });

  const toggleGroup = (label) => {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  };

  const renderLink = (item, extraClass = "") => {
    const Icon = item.icon;
    const itemLocked = locked(item.modulo);
    return (
      <NavLink
        key={item.to}
        to={item.to}
        end={item.end}
        className={({ isActive }) => `nid-nav-item ${extraClass} ${isActive ? "active" : ""}`}
        style={itemLocked ? { opacity: 0.7 } : undefined}
        title={itemLocked ? LOCK_TITLE : undefined}
      >
        <Icon className="w-4 h-4 flex-shrink-0" />
        <span style={{ flex: 1, minWidth: 0 }}>{item.label}</span>
        {itemLocked && (
          <LockClosedIcon
            className="w-3.5 h-3.5 flex-shrink-0"
            style={{ color: "var(--text-mute)" }}
          />
        )}
      </NavLink>
    );
  };

  return (
    <nav className="px-3 py-3 space-y-0.5">
      {NAV_STRUCTURE.map((section) => {
        const visiveis = section.items.filter(isVisible);
        if (visiveis.length === 0) return null;
        return (
          <div key={section.label}>
            <p className="nid-nav-section">{section.label}</p>
            {visiveis.map((item) => {
              if (item.type === "link") return renderLink(item);

              const visibleChildren = item.children.filter(isVisible);
              if (visibleChildren.length === 0) return null;
              const Icon = item.icon;
              const isOpen = openGroups.has(item.label);
              const hasActive = isChildActive(visibleChildren, location.pathname);

              return (
                <div key={item.label}>
                  <button
                    onClick={() => toggleGroup(item.label)}
                    className="nid-nav-item"
                    style={hasActive ? { color: "var(--text)" } : undefined}
                  >
                    <Icon className="w-4 h-4 flex-shrink-0" />
                    <span style={{ flex: 1, textAlign: "left" }}>{item.label}</span>
                    <ChevronDownIcon
                      className={`w-3.5 h-3.5 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
                    />
                  </button>
                  {isOpen && (
                    <div className="nid-nav-children space-y-0.5">
                      {visibleChildren.map((child) => renderLink(child, "nid-nav-child"))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}

      {temPermissaoAdmin(user) && (
        <div className="pt-3 mt-3" style={{ borderTop: "1px solid var(--border)" }}>
          <p className="nid-nav-section">Admin</p>
          <NavLink
            to="/admin"
            className={({ isActive }) => `nid-nav-item ${isActive ? "active" : ""}`}
          >
            <Cog6ToothIcon className="w-4 h-4 flex-shrink-0" />
            Painel Admin
          </NavLink>
        </div>
      )}
    </nav>
  );
}
