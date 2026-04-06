import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../context/ThemeContext";
import {
  SparklesIcon,
  FlagIcon,
  UsersIcon,
  PowerIcon,
  ArrowLeftIcon,
  Cog6ToothIcon,
  SunIcon,
  MoonIcon,
  BuildingOfficeIcon,
  Squares2X2Icon,
  ShieldCheckIcon,
  NewspaperIcon,
} from "@heroicons/react/24/outline";

export default function AdminLayout() {
  const { logout, user } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();

  const isGlobal = user?.role === "ADMIN_GLOBAL";

  const navItems = [
    ...(isGlobal
      ? [
          { to: "/admin/municipios", label: "Municípios", icon: BuildingOfficeIcon },
          { to: "/admin/insights", label: "Insights IA", icon: SparklesIcon },
          { to: "/admin/releases", label: "Releases", icon: NewspaperIcon },
          { to: "/admin/cards", label: "Cards Customizados", icon: Squares2X2Icon },
          { to: "/admin/planos", label: "Planos & Acesso", icon: ShieldCheckIcon },
          { to: "/admin/usuarios", label: "Usuários", icon: UsersIcon },
        ]
      : []),
    { to: "/admin/mandato", label: "Timeline do Mandato", icon: FlagIcon },
  ];

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-slate-950">
      {/* Admin Sidebar */}
      <aside className="w-64 bg-gradient-to-b from-slate-900 to-slate-800 text-white flex flex-col justify-between shadow-xl flex-shrink-0">
        <div>
          {/* Logo */}
          <div className="px-6 py-7 border-b border-slate-700">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-violet-600 flex items-center justify-center">
                <Cog6ToothIcon className="w-4 h-4 text-white" />
              </div>
              <div>
                <h1 className="text-sm font-extrabold tracking-tight leading-tight">
                  Painel Admin
                </h1>
                <p className="text-xs text-slate-400 mt-0.5 uppercase tracking-widest">
                  {user?.role?.replace("_", " ")}
                </p>
              </div>
            </div>
          </div>

          {/* Back to dashboard */}
          <div className="px-4 pt-4 pb-2">
            <button
              onClick={() => navigate("/")}
              className="flex items-center gap-2 text-slate-400 hover:text-white text-xs font-medium transition-colors px-3 py-2 rounded-lg hover:bg-slate-700 w-full"
            >
              <ArrowLeftIcon className="w-3.5 h-3.5" />
              Voltar ao Dashboard
            </button>
          </div>

          {/* Nav */}
          <nav className="p-4 space-y-1">
            <p className="text-xs uppercase text-slate-500 px-3 mb-2 tracking-widest">
              Administração
            </p>
            {navItems.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 ${
                    isActive
                      ? "bg-violet-600 text-white shadow"
                      : "text-slate-300 hover:bg-slate-700 hover:text-white"
                  }`
                }
              >
                <Icon className="w-4 h-4 flex-shrink-0" />
                {label}
              </NavLink>
            ))}
          </nav>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-700 space-y-3">
          <div className="px-3 py-2 rounded-lg bg-slate-700/50">
            <p className="text-xs text-slate-400">Logado como</p>
            <p className="text-sm font-semibold text-white truncate">
              {user?.nome || "Usuário"}
            </p>
            <p className="text-xs text-violet-400">{user?.role}</p>
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

      {/* Main content */}
      <main className="flex-1 overflow-y-auto flex flex-col min-w-0">
        <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 px-8 py-4 flex-shrink-0">
          <h2 className="text-base font-semibold text-slate-800 dark:text-white">
            Painel de Administração
          </h2>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
            Gerencie configurações e dados do sistema
          </p>
        </header>

        <div className="flex-1 p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
