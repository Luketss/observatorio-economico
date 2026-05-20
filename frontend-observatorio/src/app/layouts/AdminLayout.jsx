import { useState, useEffect, useRef } from "react";
import { ToastProvider } from "../../context/ToastContext";
import { NavLink, Outlet, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useTheme, THEMES } from "../../context/ThemeContext";
import {
  SparklesIcon,
  FlagIcon,
  FolderOpenIcon,
  UsersIcon,
  PowerIcon,
  ArrowLeftIcon,
  Cog6ToothIcon,
  BuildingOfficeIcon,
  Squares2X2Icon,
  ShieldCheckIcon,
  NewspaperIcon,
  Bars3Icon,
  XMarkIcon,
  CircleStackIcon,
  BellIcon,
  SwatchIcon,
  TrashIcon,
  FingerPrintIcon,
} from "@heroicons/react/24/outline";

// ── Route → display name map ──────────────────────────────────────────────────
const ROUTE_LABELS = {
  "/admin/municipios":    "Municípios",
  "/admin/insights":      "Insights IA",
  "/admin/releases":      "Releases",
  "/admin/cards":         "Cards Customizados",
  "/admin/planos":        "Planos & Acesso",
  "/admin/usuarios":      "Usuários",
  "/admin/login-audit":   "Logins / Auditoria",
  "/admin/explorer":      "Explorador de Dados",
  "/admin/datasets":      "Datasets",
  "/admin/notificacoes":  "Notificações",
  "/admin/projetos-eixos":"Eixos de Projetos",
  "/admin/mandato":       "Timeline do Mandato",
};

// ── ThemePicker (identical pattern to DashboardLayout) ────────────────────────
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

// ── Nav section groups ────────────────────────────────────────────────────────
const GESTAO_ITEMS = [
  { to: "/admin/municipios",     label: "Municípios",        icon: BuildingOfficeIcon },
  { to: "/admin/insights",       label: "Insights IA",       icon: SparklesIcon },
  { to: "/admin/releases",       label: "Releases",          icon: NewspaperIcon },
  { to: "/admin/cards",          label: "Cards Customizados",icon: Squares2X2Icon },
  { to: "/admin/planos",         label: "Planos & Acesso",   icon: ShieldCheckIcon },
  { to: "/admin/usuarios",       label: "Usuários",          icon: UsersIcon },
  { to: "/admin/login-audit",    label: "Logins / Auditoria",icon: FingerPrintIcon },
];

const DADOS_ITEMS = [
  { to: "/admin/explorer",       label: "Explorador de Dados", icon: CircleStackIcon },
  { to: "/admin/datasets",       label: "Datasets",            icon: TrashIcon },
  { to: "/admin/notificacoes",   label: "Notificações",        icon: BellIcon },
];

const EXTRA_ITEMS = [
  { to: "/admin/projetos-eixos", label: "Eixos de Projetos",   icon: FolderOpenIcon },
  { to: "/admin/mandato",        label: "Timeline do Mandato", icon: FlagIcon },
];

export default function AdminLayout() {
  const { logout, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const isGlobal = user?.role === "ADMIN_GLOBAL";

  // Derive page title + breadcrumb from current pathname
  const pageTitle = ROUTE_LABELS[location.pathname] || "Admin";

  // Close sidebar on navigation
  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  // Avatar initial
  const avatarInitial = (user?.nome || "A").charAt(0).toUpperCase();

  // Role display
  const roleLabel = user?.role === "ADMIN_GLOBAL"
    ? "Admin Global"
    : user?.role === "ADMIN_MUNICIPIO"
    ? "Admin Município"
    : user?.role || "Admin";

  // Nav section renderer
  const renderNavItems = (items) =>
    items.map(({ to, label, icon: Icon }) => (
      <NavLink
        key={to}
        to={to}
        className={({ isActive }) =>
          `nid-nav-item admin-nav-item ${isActive ? "active admin-active" : ""}`
        }
      >
        <Icon className="w-4 h-4 flex-shrink-0" />
        <span>{label}</span>
      </NavLink>
    ));

  const sidebarContent = (
    <>
      {/* Logo / Header */}
      <div
        className="px-5 py-5 relative flex items-center gap-3"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        <div
          className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 text-white font-bold text-sm select-none"
          style={{ background: "var(--admin-accent)" }}
        >
          A
        </div>
        <div style={{ lineHeight: 1.1 }}>
          <b style={{ fontSize: 14, color: "var(--text)", letterSpacing: "-0.01em" }}>
            NID Admin
          </b>
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
            Painel Global
          </small>
        </div>
        {/* Mobile close */}
        <button
          onClick={() => setSidebarOpen(false)}
          className="absolute top-3 right-3 md:hidden p-1 rounded-lg cursor-pointer"
          style={{ color: "var(--text-dim)" }}
        >
          <XMarkIcon className="w-5 h-5" />
        </button>
      </div>

      {/* Back to dashboard */}
      <div className="px-3 pt-3 pb-1">
        <button
          onClick={() => navigate("/app")}
          className="nid-nav-item w-full"
          style={{ fontSize: 12 }}
        >
          <ArrowLeftIcon className="w-3.5 h-3.5 flex-shrink-0" />
          Voltar ao Dashboard
        </button>
      </div>

      {/* Nav */}
      <nav className="px-3 py-2 space-y-0.5">
        {isGlobal && (
          <>
            {/* Gestão section */}
            <p className="nid-nav-section">Gestão</p>
            <div className="space-y-0.5">
              {renderNavItems(GESTAO_ITEMS)}
            </div>

            {/* Dados section */}
            <p className="nid-nav-section" style={{ marginTop: 8 }}>Dados</p>
            <div className="space-y-0.5">
              {renderNavItems(DADOS_ITEMS)}
            </div>

            {/* Extra (if any global-only extras) */}
            {EXTRA_ITEMS.length > 0 && (
              <>
                <p className="nid-nav-section" style={{ marginTop: 8 }}>Outros</p>
                <div className="space-y-0.5">
                  {renderNavItems(EXTRA_ITEMS)}
                </div>
              </>
            )}
          </>
        )}

        {/* Non-global: just mandato */}
        {!isGlobal && (
          <div className="space-y-0.5">
            {renderNavItems([{ to: "/admin/mandato", label: "Timeline do Mandato", icon: FlagIcon }])}
          </div>
        )}
      </nav>
    </>
  );

  return (
    <ToastProvider>
      <div
        className="admin-shell flex h-screen"
        style={{ background: "var(--bg)", backgroundImage: "var(--bg-grad)" }}
      >
        {/* Mobile backdrop */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 bg-black/50 z-40 md:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Admin Sidebar */}
        <aside
          className={`nid-sidebar fixed inset-y-0 left-0 z-50 w-64 flex flex-col transform transition-transform duration-300
            md:relative md:translate-x-0 md:flex-shrink-0
            ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}`}
        >
          <div className="flex-1 min-h-0 overflow-y-auto [&::-webkit-scrollbar]:hidden [scrollbar-width:none]">
            {sidebarContent}
          </div>

          {/* Sidebar Footer */}
          <div
            className="flex-shrink-0 p-3 space-y-2"
            style={{ borderTop: "1px solid var(--border)" }}
          >
            {/* User card */}
            <div
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl"
              style={{ background: "var(--panel-2)", border: "1px solid var(--border)" }}
            >
              {/* Avatar */}
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-white text-xs font-bold select-none"
                style={{ background: "var(--admin-accent)" }}
              >
                {avatarInitial}
              </div>
              <div className="min-w-0 flex-1">
                <p
                  className="text-sm font-semibold truncate leading-tight"
                  style={{ color: "var(--text)" }}
                >
                  {user?.nome || "Usuário"}
                </p>
                {/* Role pill */}
                <span
                  className="inline-block text-[9px] font-semibold px-1.5 py-0.5 rounded mt-0.5"
                  style={{
                    background: "color-mix(in oklab, var(--admin-accent) 18%, transparent)",
                    color: "var(--admin-accent)",
                    fontFamily: "var(--font-mono)",
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                  }}
                >
                  {roleLabel}
                </span>
              </div>
            </div>

            {/* Theme picker + logout */}
            <div className="flex gap-2">
              <div className="flex-1 min-w-0">
                <ThemePicker />
              </div>
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

        {/* Main content */}
        <main className="flex-1 overflow-y-auto flex flex-col min-w-0">
          {/* Topbar */}
          <header
            className="px-4 md:px-8 py-4 flex items-center gap-3 flex-shrink-0"
            style={{
              background: "var(--panel)",
              borderBottom: "1px solid var(--border)",
              backdropFilter: "blur(10px)",
            }}
          >
            {/* Hamburger (mobile) */}
            <button
              onClick={() => setSidebarOpen(true)}
              className="md:hidden p-2 rounded-lg cursor-pointer"
              style={{ color: "var(--text-dim)" }}
            >
              <Bars3Icon className="w-6 h-6" />
            </button>

            <div className="min-w-0 flex-1">
              {/* Breadcrumb */}
              <p
                className="text-xs nid-mono"
                style={{ color: "var(--text-mute)", letterSpacing: "0.04em" }}
              >
                Admin{" "}
                <span style={{ color: "var(--text-dim)" }}>›</span>{" "}
                <b style={{ color: "var(--admin-accent)" }}>{pageTitle}</b>
              </p>
              {/* Page title */}
              <h2
                className="text-base font-semibold mt-0.5 truncate"
                style={{ color: "var(--text)", fontFamily: "var(--font-display)" }}
              >
                {pageTitle}
              </h2>
            </div>

            {/* Admin accent indicator pill */}
            <span
              className="hidden md:inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full"
              style={{
                background: "color-mix(in oklab, var(--admin-accent) 12%, transparent)",
                border: "1px solid color-mix(in oklab, var(--admin-accent) 30%, transparent)",
                color: "var(--admin-accent)",
                fontFamily: "var(--font-mono)",
                letterSpacing: "0.04em",
              }}
            >
              <Cog6ToothIcon className="w-3 h-3" />
              Área Admin
            </span>
          </header>

          {/* Page content */}
          <div
            className="flex-1 p-4 md:p-8"
            style={{ color: "var(--text)" }}
          >
            <Outlet />
          </div>
        </main>
      </div>
    </ToastProvider>
  );
}
