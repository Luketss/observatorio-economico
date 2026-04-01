import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import {
  HomeIcon,
  ChartBarIcon,
  BanknotesIcon,
  BriefcaseIcon,
  UsersIcon,
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
  SparklesIcon,
} from "@heroicons/react/24/outline";

const navItems = [
  { to: "/", label: "Dashboard", icon: HomeIcon, end: true },
  { to: "/pib", label: "PIB", icon: ChartBarIcon },
  { to: "/arrecadacao", label: "Arrecadação", icon: BanknotesIcon },
  { to: "/caged", label: "CAGED", icon: BriefcaseIcon },
  { to: "/rais", label: "RAIS", icon: BuildingLibraryIcon },
  { to: "/comparativo", label: "Comparativo", icon: ArrowsRightLeftIcon },
  { to: "/bolsa-familia", label: "Bolsa Família", icon: HeartIcon },
  { to: "/pe-de-meia", label: "Pé-de-Meia", icon: AcademicCapIcon },
  { to: "/inss", label: "INSS", icon: ShieldCheckIcon },
  { to: "/estban", label: "Bancos", icon: BuildingOfficeIcon },
  { to: "/comex", label: "Comércio Ext.", icon: GlobeAltIcon },
  { to: "/empresas", label: "Empresas", icon: BuildingStorefrontIcon },
];

export default function DashboardLayout() {
  const { logout, user } = useAuth();

  return (
    <div className="flex h-screen bg-slate-50">
      {/* Sidebar */}
      <aside className="w-64 bg-gradient-to-b from-slate-900 to-slate-800 text-white flex flex-col justify-between shadow-xl flex-shrink-0">
        <div>
          {/* Logo */}
          <div className="px-6 py-7 border-b border-slate-700">
            <h1 className="text-lg font-extrabold tracking-tight leading-tight">
              Observatório
            </h1>
            <p className="text-xs text-slate-400 mt-1 uppercase tracking-widest">
              Econômico
            </p>
          </div>

          {/* Nav */}
          <nav className="p-4 space-y-1">
            {navItems.map(({ to, label, icon: Icon, end }) => (
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
                  to="/admin/mandato"
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 ${
                      isActive
                        ? "bg-blue-600 text-white shadow"
                        : "text-slate-300 hover:bg-slate-700 hover:text-white"
                    }`
                  }
                >
                  <FlagIcon className="w-4 h-4 flex-shrink-0" />
                  Timeline
                </NavLink>
                {user?.role === "ADMIN_GLOBAL" && (
                  <NavLink
                    to="/admin/insights"
                    className={({ isActive }) =>
                      `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 ${
                        isActive
                          ? "bg-blue-600 text-white shadow"
                          : "text-slate-300 hover:bg-slate-700 hover:text-white"
                      }`
                    }
                  >
                    <SparklesIcon className="w-4 h-4 flex-shrink-0" />
                    Insights IA
                  </NavLink>
                )}
                {user?.role === "ADMIN_GLOBAL" && (
                  <NavLink
                    to="/admin/usuarios"
                    className={({ isActive }) =>
                      `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 ${
                        isActive
                          ? "bg-blue-600 text-white shadow"
                          : "text-slate-300 hover:bg-slate-700 hover:text-white"
                      }`
                    }
                  >
                    <UsersIcon className="w-4 h-4 flex-shrink-0" />
                    Usuários
                  </NavLink>
                )}
              </div>
            )}
          </nav>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-700 space-y-3">
          <div className="px-3 py-2 rounded-lg bg-slate-700/50">
            <p className="text-xs text-slate-400">Logado como</p>
            <p className="text-sm font-semibold text-white truncate">
              {user?.nome || "Usuário"}
            </p>
            <p className="text-xs text-blue-400">{user?.role}</p>
          </div>
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
        <header className="bg-white border-b border-slate-200 px-8 py-4 flex items-center justify-between flex-shrink-0">
          <div>
            <h2 className="text-base font-semibold text-slate-800">
              Bem-vindo, {user?.nome || "Usuário"}
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Painel de Indicadores Econômicos
            </p>
          </div>
        </header>

        <div className="flex-1 p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
