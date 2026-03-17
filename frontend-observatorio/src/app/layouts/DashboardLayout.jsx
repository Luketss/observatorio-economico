import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";

export default function DashboardLayout() {
  const { logout, user } = useAuth();

  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar */}
      <aside className="w-72 bg-gradient-to-b from-primary to-secondary text-white flex flex-col justify-between shadow-xl">
        <div>
          <div className="p-8 border-b border-slate-700">
            <h1 className="text-2xl font-extrabold tracking-tight">
              Observatório
            </h1>
            <p className="text-xs text-slate-400 mt-2 uppercase tracking-wider">
              Painel Econômico
            </p>
          </div>

          <nav className="p-6 space-y-2 text-sm">
            <NavLink
              to="/"
              className={({ isActive }) =>
                `block px-4 py-2 rounded-xl transition-all duration-200 hover:translate-x-1 ${
                  isActive
                    ? "bg-white/20 shadow-md"
                    : "hover:bg-white/10"
                }`
              }
            >
              Dashboard
            </NavLink>
            {[
              { to: "/pib", label: "PIB" },
              { to: "/arrecadacao", label: "Arrecadação" },
              { to: "/caged", label: "CAGED" },
              { to: "/rais", label: "RAIS" },
              { to: "/comparativo", label: "Comparativo" },
            ].map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `block px-4 py-2 rounded-xl transition-all duration-200 hover:translate-x-1 ${
                    isActive
                      ? "bg-white/20 shadow-md"
                      : "hover:bg-white/10"
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}

            {user?.is_admin && (
              <NavLink
                to="/admin/usuarios"
                className={({ isActive }) =>
                  `block px-4 py-2 rounded-xl transition-all duration-200 hover:translate-x-1 ${
                    isActive
                      ? "bg-white/20 shadow-md"
                      : "hover:bg-white/10"
                  }`
                }
              >
                Usuários
              </NavLink>
            )}
          </nav>
        </div>

        <div className="p-4 border-t border-slate-700">
          <button
            onClick={logout}
            className="w-full bg-red-600 hover:bg-red-700 transition px-4 py-2 rounded-lg text-sm"
          >
            Sair
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto bg-background">
        <header className="bg-white/80 backdrop-blur-md px-10 py-6 border-b border-slate-200 flex justify-between items-center">
          <div>
            <h2 className="text-xl font-bold text-slate-800">
              Bem-vindo, {user?.nome || "Usuário"}
            </h2>
            <p className="text-sm text-muted mt-1">
              Acompanhe os indicadores do município
            </p>
          </div>
        </header>

        <div className="p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
