import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { useState, useEffect } from "react";
import { useAuth } from "../../context/AuthContext";
import "../../styles/global.css";

export default function DashboardLayout() {
  const { logout, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [openMenu, setOpenMenu] = useState(null);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  const menuConfig = [
    {
      key: "dashboard",
      label: "Dashboard",
      path: "/",
      roles: ["ADMIN_GLOBAL", "MUNICIPIO"],
    },
    {
      key: "emprego",
      label: "Emprego",
      roles: ["ADMIN_GLOBAL", "MUNICIPIO"],
      children: [
        { label: "CAGED", path: "/" },
        { label: "RAIS", path: "/rais" },
      ],
    },
    {
      key: "economia",
      label: "Economia",
      roles: ["ADMIN_GLOBAL"],
      children: [
        { label: "PIB", path: "/pib" },
        { label: "Arrecadação", path: "/arrecadacao" },
      ],
    },
  ];

  const toggleMenu = (menu) => {
    setOpenMenu(openMenu === menu ? null : menu);
  };

  useEffect(() => {
    // Mantém submenu aberto se rota filha estiver ativa
    menuConfig.forEach((item) => {
      if (item.children) {
        const isActiveChild = item.children.some(
          (child) => child.path === location.pathname
        );
        if (isActiveChild) {
          setOpenMenu(item.key);
        }
      }
    });
  }, [location.pathname]);

  return (
    <div className="layout-container">
      <aside className={isSidebarCollapsed ? "sidebar collapsed" : "sidebar"}>
        <div className="sidebar-header">
          {!isSidebarCollapsed && <h2>Observatório</h2>}
          <button
            className="collapse-btn"
            onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
          >
            {isSidebarCollapsed ? "➤" : "◀"}
          </button>
        </div>

        <nav>
          {menuConfig
            .filter((item) =>
              !item.roles || item.roles.includes(user?.role)
            )
            .map((item) => {
              if (!item.children) {
                const isActive = location.pathname === item.path;
                return (
                  <span
                    key={item.key}
                    onClick={() => navigate(item.path)}
                    style={{
                      fontWeight: isActive ? "600" : "400",
                      opacity: isActive ? 1 : 0.8,
                      textAlign: isSidebarCollapsed ? "center" : "left"
                    }}
                  >
                    {isSidebarCollapsed ? item.label[0] : item.label}
                  </span>
                );
              }

              return (
                <div key={item.key} style={{ marginTop: 16 }}>
                  <span
                    onClick={() => toggleMenu(item.key)}
                    style={{ display: "block" }}
                  >
                    {item.label}{" "}
                    {openMenu === item.key ? "▾" : "▸"}
                  </span>

                  {openMenu === item.key && (
                    <div style={{ marginLeft: 16, marginTop: 8 }}>
                      {item.children.map((child) => {
                        const isActive =
                          location.pathname === child.path;

                        return (
                          <div
                            key={child.path}
                            style={{
                              marginBottom: 8,
                              cursor: "pointer",
                              fontWeight: isActive ? "600" : "400",
                              opacity: isActive ? 1 : 0.8,
                            }}
                            onClick={() => navigate(child.path)}
                          >
                            {child.label}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
        </nav>

        <div style={{ marginTop: 40, fontSize: 13, opacity: 0.7 }}>
          <p>{user?.email}</p>
          <p>{user?.role}</p>
        </div>

        <button
          onClick={() => {
            logout();
            navigate("/login");
          }}
          style={{
            marginTop: 20,
            padding: "10px 12px",
            borderRadius: 6,
            border: "none",
            background: "#ef4444",
            color: "#fff",
            cursor: "pointer",
          }}
        >
          Sair
        </button>
      </aside>

      <main className="main-content">
        <div className="top-header">
          <div className="breadcrumb">
            {location.pathname === "/" && "Dashboard"}
            {location.pathname === "/rais" && "Emprego / RAIS"}
          </div>

          <div className="user-dropdown">
            <div
              className="user-info"
              onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
            >
              <span className="user-name">{user?.email}</span>
              <span className="user-role">{user?.role}</span>
            </div>

            {isUserMenuOpen && (
              <div className="user-menu">
                <div
                  className="user-menu-item"
                  onClick={() => {
                    logout();
                    navigate("/login");
                  }}
                >
                  Sair
                </div>
              </div>
            )}
          </div>
        </div>

        <Outlet />
      </main>
    </div>
  );
}
