import { useEffect, useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../context/ThemeContext";
import api from "../../services/api";
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
  FlagIcon,
  SunIcon,
  MoonIcon,
  Cog6ToothIcon,
  NewspaperIcon,
} from "@heroicons/react/24/outline";

// Module key maps to which plan feature enables it (null = always visible)
const NAV_ITEMS = [
  { to: "/", label: "Dashboard", icon: HomeIcon, end: true, modulo: "geral" },
  { to: "/pib", label: "PIB", icon: ChartBarIcon, modulo: "pib" },
  { to: "/arrecadacao", label: "Arrecadação", icon: BanknotesIcon, modulo: "arrecadacao" },
  { to: "/caged", label: "CAGED", icon: BriefcaseIcon, modulo: "caged" },
  { to: "/rais", label: "RAIS", icon: BuildingLibraryIcon, modulo: "rais" },
  { to: "/comparativo", label: "Comparativo", icon: ArrowsRightLeftIcon, modulo: null },
  { to: "/bolsa-familia", label: "Bolsa Família", icon: HeartIcon, modulo: "bolsa_familia" },
  { to: "/pe-de-meia", label: "Pé-de-Meia", icon: AcademicCapIcon, modulo: "pe_de_meia" },
  { to: "/inss", label: "INSS", icon: ShieldCheckIcon, modulo: "inss" },
  { to: "/estban", label: "Bancos", icon: BuildingOfficeIcon, modulo: "estban" },
  { to: "/comex", label: "Comércio Ext.", icon: GlobeAltIcon, modulo: "comex" },
  { to: "/empresas", label: "Empresas", icon: BuildingStorefrontIcon, modulo: "empresas" },
  { to: "/pix", label: "PIX", icon: BanknotesIcon, modulo: "pix" },
  { to: "/releases", label: "Releases", icon: NewspaperIcon, modulo: null, hideForAdmin: true },
];

export default function DashboardLayout() {
  const { logout, user } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [brasao, setBrasao] = useState(null);
  const [modulos, setModulos] = useState(null); // null = no restrictions (ADMIN_GLOBAL or loading)

  const isGlobal = user?.role === "ADMIN_GLOBAL";

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

  const visibleNav = NAV_ITEMS.filter((item) => {
    if (item.hideForAdmin && isGlobal) return false;
    if (isGlobal || modulos === null) return true;
    if (item.modulo === null) return true; // always visible
    return modulos.includes(item.modulo);
  });

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-slate-950">
      {/* Sidebar */}
      <aside className="w-64 bg-gradient-to-b from-slate-900 to-slate-800 text-white flex flex-col shadow-xl flex-shrink-0">
        <div className="flex-1 min-h-0 overflow-y-auto [&::-webkit-scrollbar]:hidden [scrollbar-width:none]">
          {/* Logo */}
          <div className="px-6 py-7 border-b border-slate-700">
            <h1 className="text-xl font-extrabold tracking-tight leading-tight">
              UAIZI
            </h1>
            <p className="text-xs text-slate-400 mt-1 uppercase tracking-widest">
              NID — Núcleo de Inteligência de Dados
            </p>
          </div>

          {/* Nav */}
          <nav className="p-4 space-y-1">
            {visibleNav.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 ${
                    isActive
                      ? "bg-blue-600 text-white shadow"
                      : "text-slate-300 hover:bg-slate-700 hover:text-white"
                  }`
                }
              >
                <Icon className="w-4 h-4 flex-shrink-0" />
                {label}
              </NavLink>
            ))}

            {(user?.role === "ADMIN_GLOBAL" || user?.role === "ADMIN_MUNICIPIO") && (
              <div className="pt-3 mt-3 border-t border-slate-700">
                <p className="text-xs uppercase text-slate-500 px-3 mb-2 tracking-widest">
                  Admin
                </p>
                <NavLink
                  to="/admin"
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 ${
                      isActive
                        ? "bg-blue-600 text-white shadow"
                        : "text-slate-300 hover:bg-slate-700 hover:text-white"
                    }`
                  }
                >
                  <Cog6ToothIcon className="w-4 h-4 flex-shrink-0" />
                  Painel Admin
                </NavLink>
              </div>
            )}
          </nav>
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
            {theme === "dark" ? (
              <SunIcon className="w-4 h-4" />
            ) : (
              <MoonIcon className="w-4 h-4" />
            )}
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
        <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 px-8 py-4 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            {brasao && (
              <img
                src={brasao}
                alt="Brasão"
                className="w-10 h-10 object-contain rounded"
              />
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
        </header>

        <div className="flex-1 p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
