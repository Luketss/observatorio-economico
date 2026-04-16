import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { PlanContext } from "../../context/PlanContext";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../context/ThemeContext";
import api from "../../services/api";
import NotificationBell from "../../components/NotificationBell";
import {
  HomeIcon,
  ChartBarIcon,
  BanknotesIcon,
  BriefcaseIcon,
  ArrowsRightLeftIcon,
  BuildingLibraryIcon,
  PowerIcon,
  HeartIcon,
  AcademicCapIcon,
  ShieldCheckIcon,
  BuildingOfficeIcon,
  GlobeAltIcon,
  BuildingStorefrontIcon,
  SunIcon,
  MoonIcon,
  Cog6ToothIcon,
  NewspaperIcon,
  ChevronDownIcon,
  Bars3Icon,
  XMarkIcon,
  ChartBarSquareIcon,
} from "@heroicons/react/24/outline";

const NAV_STRUCTURE = [
  {
    type: "link",
    to: "/app",
    label: "Dashboard",
    icon: HomeIcon,
    end: true,
    modulo: "geral",
  },
  {
    type: "link",
    to: "/app/benchmark",
    label: "Benchmark",
    icon: ChartBarSquareIcon,
    modulo: null,
  },
  {
    type: "group",
    label: "Economia",
    icon: ChartBarIcon,
    children: [
      { to: "/app/pib", label: "PIB", icon: ChartBarIcon, modulo: "pib" },
      { to: "/app/arrecadacao", label: "Arrecadação", icon: BanknotesIcon, modulo: "arrecadacao" },
    ],
  },
  {
    type: "group",
    label: "Emprego",
    icon: BriefcaseIcon,
    children: [
      { to: "/app/caged", label: "CAGED", icon: BriefcaseIcon, modulo: "caged" },
      { to: "/app/rais", label: "RAIS", icon: BuildingLibraryIcon, modulo: "rais" },
    ],
  },
  {
    type: "group",
    label: "Social",
    icon: HeartIcon,
    children: [
      { to: "/app/bolsa-familia", label: "Bolsa Família", icon: HeartIcon, modulo: "bolsa_familia" },
      { to: "/app/pe-de-meia", label: "Pé-de-Meia", icon: AcademicCapIcon, modulo: "pe_de_meia" },
      { to: "/app/inss", label: "INSS", icon: ShieldCheckIcon, modulo: "inss" },
    ],
  },
  {
    type: "group",
    label: "Comércio",
    icon: BuildingStorefrontIcon,
    children: [
      { to: "/app/estban", label: "Bancos", icon: BuildingOfficeIcon, modulo: "estban" },
      { to: "/app/comex", label: "Comércio Ext.", icon: GlobeAltIcon, modulo: "comex" },
      { to: "/app/empresas", label: "Empresas", icon: BuildingStorefrontIcon, modulo: "empresas" },
      { to: "/app/pix", label: "PIX", icon: BanknotesIcon, modulo: "pix" },
    ],
  },
  {
    type: "link",
    to: "/app/releases",
    label: "Releases",
    icon: NewspaperIcon,
    modulo: null,
    hideForAdmin: true,
  },
];

function isChildActive(children, pathname) {
  return children.some(
    (c) => pathname === c.to || (c.to !== "/" && pathname.startsWith(c.to))
  );
}

export default function DashboardLayout() {
  const { logout, user } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();
  const [brasao, setBrasao] = useState(null);
  const [modulos, setModulos] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const isGlobal = user?.role === "ADMIN_GLOBAL";

  // Start with the group that contains the current route already open
  const [openGroups, setOpenGroups] = useState(() => {
    const open = new Set();
    NAV_STRUCTURE.forEach((item, idx) => {
      if (item.type === "group" && isChildActive(item.children, location.pathname)) {
        open.add(idx);
      }
    });
    return open;
  });

  // Close sidebar and auto-open parent group on navigation
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

  const linkClass = (isActive) =>
    `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150 ${
      isActive
        ? "bg-blue-600 text-white shadow"
        : "text-slate-300 hover:bg-slate-700 hover:text-white"
    }`;

  const sidebarContent = (
    <>
      {/* Logo */}
      <div className="px-6 py-7 border-b border-slate-700 relative">
        <h1 className="text-xl font-extrabold tracking-tight leading-tight">UAIZI</h1>
        <p className="text-xs text-slate-400 mt-1 uppercase tracking-widest">
          NID — Núcleo de Inteligência de Dados
        </p>
        <button
          onClick={() => setSidebarOpen(false)}
          className="absolute top-4 right-4 md:hidden p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
        >
          <XMarkIcon className="w-5 h-5" />
        </button>
      </div>

      {/* Nav */}
      <nav className="p-4 space-y-0.5">
        {NAV_STRUCTURE.map((item, idx) => {
          if (item.type === "link") {
            if (!isVisible(item.modulo, item.hideForAdmin)) return null;
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) => linkClass(isActive)}
              >
                <Icon className="w-4 h-4 flex-shrink-0" />
                {item.label}
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
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150 ${
                    hasActive
                      ? "text-white bg-slate-700/80"
                      : "text-slate-300 hover:bg-slate-700 hover:text-white"
                  }`}
                >
                  <Icon className="w-4 h-4 flex-shrink-0" />
                  <span className="flex-1 text-left">{item.label}</span>
                  <ChevronDownIcon
                    className={`w-3.5 h-3.5 transition-transform duration-200 ${
                      isOpen ? "rotate-180" : ""
                    }`}
                  />
                </button>

                {isOpen && (
                  <div className="mt-0.5 ml-3 pl-3 border-l border-slate-700 space-y-0.5">
                    {visibleChildren.map((child) => {
                      const ChildIcon = child.icon;
                      return (
                        <NavLink
                          key={child.to}
                          to={child.to}
                          end={child.end}
                          className={({ isActive }) => linkClass(isActive)}
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
          <div className="pt-3 mt-3 border-t border-slate-700">
            <p className="text-xs uppercase text-slate-500 px-3 mb-2 tracking-widest">
              Admin
            </p>
            <NavLink
              to="/admin"
              className={({ isActive }) => linkClass(isActive)}
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
    <div className="flex h-screen bg-slate-50 dark:bg-slate-950">
      {/* Mobile backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-gradient-to-b from-slate-900 to-slate-800 text-white flex flex-col shadow-xl transform transition-transform duration-300
          md:relative md:translate-x-0 md:flex-shrink-0
          ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}`}
      >
        <div className="flex-1 min-h-0 overflow-y-auto [&::-webkit-scrollbar]:hidden [scrollbar-width:none]">
          {sidebarContent}
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 p-4 border-t border-slate-700 space-y-3">
          <div className="px-3 py-2 rounded-lg bg-slate-700/50">
            <p className="text-xs text-slate-400">Logado como</p>
            <p className="text-sm font-semibold text-white truncate">
              {user?.nome || "Usuário"}
            </p>
            <p className="text-xs text-blue-400">{user?.role}</p>
          </div>
          <button
            onClick={toggleTheme}
            className="w-full flex items-center justify-center gap-2 bg-slate-700 hover:bg-slate-600 transition-colors px-4 py-2 rounded-lg text-sm text-slate-300 hover:text-white"
          >
            {theme === "dark" ? <SunIcon className="w-4 h-4" /> : <MoonIcon className="w-4 h-4" />}
            {theme === "dark" ? "Modo Claro" : "Modo Escuro"}
          </button>
          <button
            onClick={logout}
            className="w-full flex items-center justify-center gap-2 bg-slate-700 hover:bg-red-600 transition-colors duration-150 px-4 py-2 rounded-lg text-sm text-slate-300 hover:text-white"
          >
            <PowerIcon className="w-4 h-4" />
            Sair
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-y-auto flex flex-col min-w-0">
        <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 px-4 md:px-8 py-4 flex items-center gap-3 flex-shrink-0">
          {/* Hamburger */}
          <button
            onClick={() => setSidebarOpen(true)}
            className="md:hidden p-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <Bars3Icon className="w-6 h-6" />
          </button>

          <div className="flex items-center gap-3 flex-1">
            {brasao && (
              <img src={brasao} alt="Brasão" className="w-10 h-10 object-contain rounded" />
            )}
            <div>
              <h2 className="text-base font-semibold text-slate-800 dark:text-white">
                Bem-vindo, {user?.nome || "Usuário"}
              </h2>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                Painel de Indicadores Econômicos
              </p>
            </div>
          </div>
          <NotificationBell />
        </header>

        <div className="flex-1 p-4 md:p-8">
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
  );
}
