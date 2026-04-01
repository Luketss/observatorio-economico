import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import DashboardLayout from "../layouts/DashboardLayout";
import LoginPage from "../../pages/login/LoginPage";
import DashboardGeralPage from "../../pages/DashboardGeralPage";
import ArrecadacaoPage from "../../pages/arrecadacao/ArrecadacaoPage";
import PibPage from "../../pages/pib/PibPage";
import CagedPage from "../../pages/caged/CagedPage";
import RaisPage from "../../pages/rais/RaisPage";
import ComparativoPage from "../../pages/comparativo/ComparativoPage";
import UsuariosAdminPage from "../../pages/admin/UsuariosAdminPage";
import MandatoAdminPage from "../../pages/admin/MandatoAdminPage";
import InsightsAdminPage from "../../pages/admin/InsightsAdminPage";
import BolsaFamiliaPage from "../../pages/beneficios/BolsaFamiliaPage";
import PeDeMeiaPage from "../../pages/beneficios/PeDeMeiaPage";
import InssPage from "../../pages/inss/InssPage";
import EstbanPage from "../../pages/estban/EstbanPage";
import ComexPage from "../../pages/comex/ComexPage";
import EmpresasPage from "../../pages/empresas/EmpresasPage";

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();

  if (loading) return null;

  if (!user) {
    return <Navigate to="/login" />;
  }

  return children;
}

function AdminRoute({ children }) {
  const { user, loading } = useAuth();

  if (loading) return null;

  if (!user) return <Navigate to="/login" />;

  if (user.role !== "ADMIN_GLOBAL") return <Navigate to="/" />;

  return children;
}

function AdminMunicipioRoute({ children }) {
  const { user, loading } = useAuth();

  if (loading) return null;

  if (!user) return <Navigate to="/login" />;

  if (user.role === "VISUALIZADOR") return <Navigate to="/" />;

  return children;
}

export default function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />

        <Route
          path="/"
          element={
            <ProtectedRoute>
              <DashboardLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<DashboardGeralPage />} />
          <Route path="arrecadacao" element={<ArrecadacaoPage />} />
          <Route path="pib" element={<PibPage />} />
          <Route path="caged" element={<CagedPage />} />
          <Route path="rais" element={<RaisPage />} />
          <Route path="comparativo" element={<ComparativoPage />} />
          <Route path="bolsa-familia" element={<BolsaFamiliaPage />} />
          <Route path="pe-de-meia" element={<PeDeMeiaPage />} />
          <Route path="inss" element={<InssPage />} />
          <Route path="estban" element={<EstbanPage />} />
          <Route path="comex" element={<ComexPage />} />
          <Route path="empresas" element={<EmpresasPage />} />
          <Route
            path="admin/usuarios"
            element={
              <AdminRoute>
                <UsuariosAdminPage />
              </AdminRoute>
            }
          />
          <Route
            path="admin/insights"
            element={
              <AdminRoute>
                <InsightsAdminPage />
              </AdminRoute>
            }
          />
          <Route
            path="admin/mandato"
            element={
              <AdminMunicipioRoute>
                <MandatoAdminPage />
              </AdminMunicipioRoute>
            }
          />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
