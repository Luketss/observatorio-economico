import type { ReactNode } from "react";
import {
  LogOut,
  Menu,
  Moon,
  Sun,
  LayoutDashboard,
  Building2,
  BarChart3,
  Landmark,
  Globe,
  Briefcase,
  PiggyBank,
  GraduationCap,
  Users,
  MessageCircle,
} from "lucide-react";
import { useAuthStore } from "../../app/store/authStore";
import { NavLink, useNavigate } from "react-router-dom";
import { useThemeStore } from "../../app/store/themeStore";
import { useEffect } from "react";

interface Props {
  children: ReactNode;
}

export default function DashboardLayout({ children }: Props) {
  const { logout, role } = useAuthStore();
  const navigate = useNavigate();
  const { dark, toggleTheme, initTheme } = useThemeStore();

  useEffect(() => {
    initTheme();
  }, [initTheme]);

  function handleLogout() {
    logout();
    navigate("/login");
  }

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 px-3 py-2 rounded-lg transition ${
      isActive
        ? "bg-blue-50 text-blue-600 dark:bg-slate-800"
        : "hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300"
    }`;

  return (
    <div className="flex min-h-screen bg-slate-50 dark:bg-slate-950">
      {/* Sidebar */}
      <aside className="hidden md:flex w-64 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 p-6 flex-col">
        <h2 className="text-xl font-extrabold text-blue-600 mb-8 tracking-tight">
          Observatório
        </h2>

        <nav className="flex flex-col gap-1 text-sm overflow-y-auto">
          {/* Home */}
          <NavLink to="/" className={linkClass}>
            <LayoutDashboard size={18} />
            Painel Executivo
          </NavLink>

          {/* Econômico */}
          <div className="mt-4 mb-2 text-xs uppercase text-slate-400">
            Econômico
          </div>

          <NavLink to="/empresas" className={linkClass}>
            <Building2 size={18} />
            Empresas
          </NavLink>

          <NavLink to="/rais" className={linkClass}>
            <Briefcase size={18} />
            RAIS
          </NavLink>

          <NavLink to="/caged" className={linkClass}>
            <BarChart3 size={18} />
            CAGED
          </NavLink>

          <NavLink to="/comercio" className={linkClass}>
            <Globe size={18} />
            Comércio Exterior
          </NavLink>

          <NavLink to="/pib" className={linkClass}>
            <Landmark size={18} />
            PIB
          </NavLink>

          {/* Fiscal */}
          <div className="mt-4 mb-2 text-xs uppercase text-slate-400">
            Fiscal
          </div>

          <NavLink to="/arrecadacao" className={linkClass}>
            <PiggyBank size={18} />
            Arrecadação
          </NavLink>

          {/* Social */}
          <div className="mt-4 mb-2 text-xs uppercase text-slate-400">
            Social
          </div>

          <NavLink to="/pe-de-meia" className={linkClass}>
            <GraduationCap size={18} />
            Pé de Meia
          </NavLink>

          <NavLink to="/bolsa-familia" className={linkClass}>
            <Users size={18} />
            Bolsa Família
          </NavLink>

          <NavLink to="/bancos" className={linkClass}>
            <Landmark size={18} />
            Bancos
          </NavLink>

          {/* Atendimento */}
          <div className="mt-4 mb-2 text-xs uppercase text-slate-400">
            Atendimento
          </div>

          <NavLink to="/chat" className={linkClass}>
            <MessageCircle size={18} />
            Assistente Econômico
          </NavLink>

          {/* Administração */}
          {role === "ADMIN_GLOBAL" && (
            <>
              <div className="mt-4 mb-2 text-xs uppercase text-slate-400">
                Administração
              </div>

              <NavLink to="/admin/usuarios" className={linkClass}>
                <Users size={18} />
                Gestão de Usuários
              </NavLink>

              <NavLink to="/admin/comparativo" className={linkClass}>
                <BarChart3 size={18} />
                Comparativo Municípios
              </NavLink>
            </>
          )}
        </nav>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col">
        {/* Topbar */}
        <header className="h-16 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <Menu className="md:hidden w-5 h-5" />
            <span className="font-medium text-slate-700 dark:text-slate-200">
              Observatório Econômico Municipal
            </span>
          </div>

          <div className="flex items-center gap-4">
            <button
              onClick={toggleTheme}
              className="text-slate-600 dark:text-slate-300 hover:text-blue-600 transition"
            >
              {dark ? (
                <Sun className="w-5 h-5" />
              ) : (
                <Moon className="w-5 h-5" />
              )}
            </button>

            <button
              onClick={handleLogout}
              className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300 hover:text-red-500 transition"
            >
              <LogOut className="w-4 h-4" />
              Sair
            </button>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
