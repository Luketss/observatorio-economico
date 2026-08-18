import { useEffect, useRef, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import logo from "../../assets/logo_uaizi.png";
import { PlanContext } from "../../context/PlanContext";
import { ToastProvider } from "../../context/ToastContext";
import { useAuth } from "../../context/AuthContext";
import { useTheme, THEMES } from "../../context/ThemeContext";
import api from "../../services/api";
import NotificationBell from "../../components/NotificationBell";
import ViewAsBanner from "../../components/ViewAsBanner";
import PlanLockedView from "../../components/PlanLockedView";
import AlterarSenhaModal from "../../components/AlterarSenhaModal";
import {
  PowerIcon,
  KeyIcon,
  XMarkIcon,
  Bars3Icon,
  SwatchIcon,
} from "@heroicons/react/24/outline";
import SidebarNav from "./SidebarNav";
import { NAV_FLAT, isModuloLocked } from "./navStructure";

function ThemePicker() {
  const { themeId, setThemeId } = useTheme();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handle = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  const current = THEMES.find((t) => t.id === themeId) || THEMES[0];

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs cursor-pointer"
        style={{
          background: "var(--panel-2)",
          border: "1px solid var(--border)",
          color: "var(--text-dim)",
        }}
        title="Trocar tema"
      >
        <SwatchIcon className="w-4 h-4" />
        <span className="truncate">{current.label}</span>
      </button>
      {open && (
        <div
          className="absolute bottom-full mb-2 left-0 right-0 rounded-xl overflow-hidden z-50"
          style={{
            background: "var(--panel)",
            border: "1px solid var(--border-strong)",
            boxShadow: "var(--shadow-card)",
            backdropFilter: "blur(12px)",
          }}
        >
          {THEMES.map((t) => (
            <button
              key={t.id}
              onClick={() => { setThemeId(t.id); setOpen(false); }}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs text-left cursor-pointer"
              style={{
                background: t.id === themeId ? "var(--panel-2)" : "transparent",
                color: t.id === themeId ? "var(--text)" : "var(--text-dim)",
                fontFamily: "var(--font-mono)",
                letterSpacing: "0.04em",
              }}
            >
              <span
                className="inline-block w-3 h-3 rounded-full"
                style={{
                  background:
                    t.id === "neon"    ? "linear-gradient(135deg,#00e5ff,#ff3d92)" :
                    t.id === "aurora"  ? "linear-gradient(135deg,#7aa2ff,#f178b6)" :
                    t.id === "sunset"  ? "linear-gradient(135deg,#ff9b54,#ff5e7e)" :
                    t.id === "minimal" ? "linear-gradient(135deg,#14b8a6,#6366f1)" :
                                         "linear-gradient(135deg,#0ea5e9,#8b5cf6)",
                }}
              />
              {t.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function DashboardLayout() {
  const { logout, user } = useAuth();
  const { themeId } = useTheme();
  const location = useLocation();
  const [brasao, setBrasao] = useState(null);
  const [modulos, setModulos] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [senhaOpen, setSenhaOpen] = useState(false);

  const isGlobal = user?.role === "ADMIN_GLOBAL";
  const isLight = themeId === "light";

  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (isGlobal || !user) return;
    api.get("/municipios").then((res) => {
      const municipio = res.data?.[0];
      if (!municipio) return;
      if (municipio.brasao) setBrasao(municipio.brasao);
      api
        .get("/plano-config", { params: { plano: municipio.plano } })
        .then((r) => setModulos(r.data.modulos))
        .catch(() => setModulos(null));
    });
  }, [user, isGlobal]);

  // Módulo da rota atual → decide o teaser de bloqueio na área de conteúdo.
  const currentNav = NAV_FLAT
    .filter((n) => n.to && (location.pathname === n.to || location.pathname.startsWith(n.to + "/")))
    .sort((a, b) => b.to.length - a.to.length)[0];
  const currentLocked = currentNav
    ? isModuloLocked({ isGlobal, modulos, modulo: currentNav.modulo })
    : false;

  const sidebarContent = (
    <>
      {/* Logo */}
      <div
        className="px-5 py-5 relative flex items-center gap-3"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        <img src={logo} alt="UAIZI" className="nid-brand-logo" />
        <div style={{ lineHeight: 1.1 }}>
          <b style={{ fontSize: 14, color: "var(--text)", letterSpacing: "-0.01em" }}>NID</b>
          <small
            style={{
              display: "block",
              fontSize: 10,
              color: "var(--text-mute)",
              textTransform: "uppercase",
              letterSpacing: "0.12em",
              marginTop: 2,
            }}
          >
            Núcleo de Inteligência<br />de Dados
          </small>
        </div>
        <button
          onClick={() => setSidebarOpen(false)}
          className="absolute top-3 right-3 md:hidden p-1 rounded-lg cursor-pointer"
          style={{ color: "var(--text-dim)" }}
        >
          <XMarkIcon className="w-5 h-5" />
        </button>
      </div>

      {/* Nav */}
      <SidebarNav user={user} modulos={modulos} />
    </>
  );

  return (
    <ToastProvider>
      <div
        className="flex h-screen"
        style={{ background: "var(--bg)", backgroundImage: "var(--bg-grad)" }}
      >
        {/* Mobile backdrop */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 bg-black/50 z-40 md:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Sidebar */}
        <aside
          className={`nid-sidebar fixed inset-y-0 left-0 z-50 w-64 flex flex-col transform transition-transform duration-300
            md:relative md:translate-x-0 md:flex-shrink-0
            ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}`}
        >
          <div className="flex-1 min-h-0 overflow-y-auto [&::-webkit-scrollbar]:hidden [scrollbar-width:none]">
            {sidebarContent}
          </div>

          {/* Footer */}
          <div
            className="flex-shrink-0 p-3 space-y-2"
            style={{ borderTop: "1px solid var(--border)" }}
          >
            {/* User card */}
            <div
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl"
              style={{ background: "var(--panel-2)", border: "1px solid var(--border)" }}
            >
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-white text-xs font-bold select-none"
                style={{ background: "linear-gradient(135deg, var(--accent-1), var(--accent-3))" }}
              >
                {(user?.nome || "U").charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p
                  className="text-sm font-semibold truncate leading-tight"
                  style={{ color: "var(--text)" }}
                >
                  {user?.nome || "Usuário"}
                </p>
                <p
                  className="text-[10px] leading-tight mt-0.5 nid-mono"
                  style={{ color: "var(--text-mute)", letterSpacing: "0.06em", textTransform: "uppercase" }}
                >
                  {user?.role}
                </p>
              </div>
            </div>

            {/* Theme picker + logout */}
            <div className="flex gap-2">
              <div className="flex-1 min-w-0">
                <ThemePicker />
              </div>
              <button
                onClick={() => setSenhaOpen(true)}
                className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs cursor-pointer"
                style={{
                  background: "var(--panel-2)",
                  border: "1px solid var(--border)",
                  color: "var(--text-dim)",
                }}
                title="Alterar senha"
              >
                <KeyIcon className="w-4 h-4" />
              </button>
              <button
                onClick={logout}
                className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs cursor-pointer"
                style={{
                  background: "var(--panel-2)",
                  border: "1px solid var(--border)",
                  color: "var(--text-dim)",
                }}
                title="Sair"
              >
                <PowerIcon className="w-4 h-4" />
              </button>
            </div>
          </div>
        </aside>

        {/* Main */}
        <main className="flex-1 overflow-y-auto flex flex-col min-w-0">
          <ViewAsBanner />
          <header
            className="px-4 md:px-8 py-4 flex items-center gap-3 flex-shrink-0"
            style={{
              background: "var(--panel)",
              borderBottom: "1px solid var(--border)",
              backdropFilter: "blur(10px)",
              position: "relative",
              zIndex: 50,
            }}
          >
            {/* Hamburger */}
            <button
              onClick={() => setSidebarOpen(true)}
              className="md:hidden p-2 rounded-lg cursor-pointer"
              style={{ color: "var(--text-dim)" }}
            >
              <Bars3Icon className="w-6 h-6" />
            </button>

            <div className="flex items-center gap-3 flex-1 min-w-0">
              {brasao && (
                <img src={brasao} alt="Brasão" className="w-10 h-10 object-contain rounded" />
              )}
              <div className="min-w-0">
                <h2
                  className="text-base font-semibold truncate"
                  style={{ color: "var(--text)", fontFamily: "var(--font-display)" }}
                >
                  Bem-vindo, {user?.nome || "Usuário"}
                </h2>
                <p className="text-xs mt-0.5 nid-mono" style={{ color: "var(--text-mute)", letterSpacing: "0.04em" }}>
                  Painel de Indicadores Econômicos
                </p>
              </div>
            </div>
            <NotificationBell />
          </header>

          <div className="flex-1 p-4 md:p-8" style={{ color: "var(--text)" }}>
            <PlanContext.Provider
              value={{
                modulos,
                canAccess: (key) => isGlobal || modulos === null || (modulos && modulos.includes(key)),
              }}
            >
              {currentLocked ? (
                <PlanLockedView label={currentNav?.label} />
              ) : (
                <Outlet />
              )}
            </PlanContext.Provider>
          </div>
        </main>
      </div>
      <AlterarSenhaModal open={senhaOpen} onClose={() => setSenhaOpen(false)} />
    </ToastProvider>
  );
}
