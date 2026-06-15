import { useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import logo from "../../assets/logo_uaizi.png";
import { PlanContext } from "../../context/PlanContext";
import { ToastProvider } from "../../context/ToastContext";
import { useAuth } from "../../context/AuthContext";
import { useTheme, THEMES } from "../../context/ThemeContext";
import api from "../../services/api";
import NotificationBell from "../../components/NotificationBell";
import ViewAsBanner from "../../components/ViewAsBanner";
import {
  HomeIcon,
  ChartBarIcon,
  BanknotesIcon,
  BriefcaseIcon,
  BuildingLibraryIcon,
  PowerIcon,
  HeartIcon,
  AcademicCapIcon,
  ShieldCheckIcon,
  BuildingOfficeIcon,
  GlobeAltIcon,
  BuildingStorefrontIcon,
  Cog6ToothIcon,
  NewspaperIcon,
  ChevronDownIcon,
  Bars3Icon,
  XMarkIcon,
  ChartBarSquareIcon,
  FolderOpenIcon,
  CalendarDaysIcon,
  CircleStackIcon,
  ChartPieIcon,
  ClipboardDocumentListIcon,
  CalendarIcon,
  TrophyIcon,
  PresentationChartBarIcon,
  SwatchIcon,
  FunnelIcon,
  BuildingOffice2Icon,
  PencilSquareIcon,
} from "@heroicons/react/24/outline";

const NAV_STRUCTURE = [
  { type: "link", to: "/app", label: "Dashboard", icon: HomeIcon, end: true, modulo: "geral" },
  { type: "link", to: "/app/benchmark", label: "Benchmark", icon: ChartBarSquareIcon, modulo: null },
  { type: "link", to: "/app/ips", label: "IPS", icon: PresentationChartBarIcon, modulo: null },
  {
    type: "group", label: "Economia", icon: ChartBarIcon,
    children: [
      { to: "/app/pib", label: "PIB", icon: ChartBarIcon, modulo: "pib" },
      { to: "/app/vaf", label: "VAF", icon: ChartPieIcon, modulo: "vaf" },
      { to: "/app/arrecadacao", label: "Arrecadação", icon: BanknotesIcon, modulo: "arrecadacao" },
    ],
  },
  {
    type: "group", label: "Emprego", icon: BriefcaseIcon,
    children: [
      { to: "/app/caged", label: "CAGED", icon: BriefcaseIcon, modulo: "caged" },
      { to: "/app/rais", label: "RAIS", icon: BuildingLibraryIcon, modulo: "rais" },
    ],
  },
  {
    type: "group", label: "Social", icon: HeartIcon,
    children: [
      { to: "/app/bolsa-familia", label: "Bolsa Família", icon: HeartIcon, modulo: "bolsa_familia" },
      { to: "/app/pe-de-meia", label: "Pé-de-Meia", icon: AcademicCapIcon, modulo: "pe_de_meia" },
      { to: "/app/inss", label: "INSS", icon: ShieldCheckIcon, modulo: "inss" },
    ],
  },
  {
    type: "group", label: "Comércio", icon: BuildingStorefrontIcon,
    children: [
      { to: "/app/estban", label: "Bancos", icon: BuildingOfficeIcon, modulo: "estban" },
      { to: "/app/comex", label: "Comércio Ext.", icon: GlobeAltIcon, modulo: "comex" },
      { to: "/app/empresas", label: "Empresas", icon: BuildingStorefrontIcon, modulo: "empresas" },
      { to: "/app/pix", label: "PIX", icon: BanknotesIcon, modulo: "pix" },
    ],
  },
  { type: "link", to: "/app/projetos", label: "Projetos", icon: FolderOpenIcon, modulo: null },
  {
    type: "group", label: "Desenv. Econômico", icon: ChartBarIcon,
    children: [
      { to: "/app/desenvolvimento-economico/funil",      label: "Funil de Investimentos", icon: FunnelIcon,          modulo: null },
      { to: "/app/desenvolvimento-economico/retencao",   label: "Retenção & Expansão",    icon: BuildingOffice2Icon, modulo: null },
      { to: "/app/desenvolvimento-economico/captacao",   label: "Captação de Recursos",   icon: BanknotesIcon,       modulo: null },
      { to: "/app/desenvolvimento-economico/escrita",    label: "Escrita de Projetos",    icon: PencilSquareIcon,    modulo: null },
      { to: "/app/desenvolvimento-economico/premiacoes", label: "Premiações",             icon: TrophyIcon,          modulo: null },
    ],
  },
  { type: "link", to: "/app/timeline", label: "Timeline", icon: CalendarDaysIcon, modulo: "timeline_mandato" },
  {
    type: "group", label: "Dados Internos", icon: CircleStackIcon,
    children: [
      { to: "/app/dados-internos/indicadores", label: "Indicadores", icon: ChartPieIcon, modulo: null },
      { to: "/app/dados-internos/plano-gov", label: "Plano de Governo", icon: ClipboardDocumentListIcon, modulo: null },
      { to: "/app/dados-internos/calendario", label: "Calendário", icon: CalendarIcon, modulo: null },
    ],
  },
  { type: "link", to: "/app/releases", label: "Releases", icon: NewspaperIcon, modulo: null, hideForAdmin: true },
];

function isChildActive(children, pathname) {
  return children.some(
    (c) => pathname === c.to || (c.to !== "/" && pathname.startsWith(c.to))
  );
}

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

  const isGlobal = user?.role === "ADMIN_GLOBAL";
  const isLight = themeId === "light";

  const [openGroups, setOpenGroups] = useState(() => {
    const open = new Set();
    NAV_STRUCTURE.forEach((item, idx) => {
      if (item.type === "group" && isChildActive(item.children, location.pathname)) {
        open.add(idx);
      }
    });
    return open;
  });

  useEffect(() => {
    setSidebarOpen(false);
    NAV_STRUCTURE.forEach((item, idx) => {
      if (item.type === "group" && isChildActive(item.children, location.pathname)) {
        setOpenGroups((prev) => {
          if (prev.has(idx)) return prev;
          const next = new Set(prev);
          next.add(idx);
          return next;
        });
      }
    });
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

  const isVisible = (modulo, hideForAdmin) => {
    if (hideForAdmin && isGlobal) return false;
    if (isGlobal || modulos === null) return true;
    if (modulo === null) return true;
    return modulos.includes(modulo);
  };

  const toggleGroup = (idx) => {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

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
      <nav className="px-3 py-3 space-y-0.5">
        {NAV_STRUCTURE.map((item, idx) => {
          if (item.type === "link") {
            if (!isVisible(item.modulo, item.hideForAdmin)) return null;
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) => `nid-nav-item ${isActive ? "active" : ""}`}
              >
                <Icon className="w-4 h-4 flex-shrink-0" />
                <span>{item.label}</span>
              </NavLink>
            );
          }

          if (item.type === "group") {
            const visibleChildren = item.children.filter((c) =>
              isVisible(c.modulo, c.hideForAdmin)
            );
            if (visibleChildren.length === 0) return null;

            const Icon = item.icon;
            const isOpen = openGroups.has(idx);
            const hasActive = isChildActive(visibleChildren, location.pathname);

            return (
              <div key={idx}>
                <button
                  onClick={() => toggleGroup(idx)}
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
                    {visibleChildren.map((child) => {
                      const ChildIcon = child.icon;
                      return (
                        <NavLink
                          key={child.to}
                          to={child.to}
                          end={child.end}
                          className={({ isActive }) => `nid-nav-item nid-nav-child ${isActive ? "active" : ""}`}
                        >
                          <ChildIcon className="w-4 h-4 flex-shrink-0" />
                          {child.label}
                        </NavLink>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          }
          return null;
        })}

        {(user?.role === "ADMIN_GLOBAL" || user?.role === "ADMIN_MUNICIPIO") && (
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
              <Outlet />
            </PlanContext.Provider>
          </div>
        </main>
      </div>
    </ToastProvider>
  );
}
