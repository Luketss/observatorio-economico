import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import DashboardLayout from "../layouts/DashboardLayout";
import AdminLayout from "../layouts/AdminLayout";
import LandingPage from "../../pages/landing/LandingPage";
import LoginPage from "../../pages/login/LoginPage";
import DashboardGeralPage from "../../pages/DashboardGeralPage";
import ArrecadacaoPage from "../../pages/arrecadacao/ArrecadacaoPage";
import PibPage from "../../pages/pib/PibPage";
import CagedPage from "../../pages/caged/CagedPage";
import RaisPage from "../../pages/rais/RaisPage";
import BenchmarkPage from "../../pages/comparativo/ComparativoPage";
import NotificacoesAdminPage from "../../pages/admin/NotificacoesAdminPage";
import UsuariosAdminPage from "../../pages/admin/UsuariosAdminPage";
import MandatoAdminPage from "../../pages/admin/MandatoAdminPage";
import InsightsAdminPage from "../../pages/admin/InsightsAdminPage";
import ReleasesAdminPage from "../../pages/admin/ReleasesAdminPage";
import MunicipiosAdminPage from "../../pages/admin/MunicipiosAdminPage";
import CustomCardsAdminPage from "../../pages/admin/CustomCardsAdminPage";
import PlanoConfigAdminPage from "../../pages/admin/PlanoConfigAdminPage";
import ExplorerPage from "../../pages/admin/ExplorerPage";
import DatasetsAdminPage from "../../pages/admin/DatasetsAdminPage";
import BolsaFamiliaPage from "../../pages/beneficios/BolsaFamiliaPage";
import PeDeMeiaPage from "../../pages/beneficios/PeDeMeiaPage";
import InssPage from "../../pages/inss/InssPage";
import EstbanPage from "../../pages/estban/EstbanPage";
import ComexPage from "../../pages/comex/ComexPage";
import EmpresasPage from "../../pages/empresas/EmpresasPage";
import PixPage from "../../pages/pix/PixPage";
import ReleasesPage from "../../pages/releases/ReleasesPage";
import TimelinePage from "../../pages/timeline/TimelinePage";
import ProjetosPage from "../../pages/projetos/ProjetosPage";
import FunilTab from "../../pages/desenvolvimento-economico/FunilTab";
import RetencaoTab from "../../pages/desenvolvimento-economico/RetencaoTab";
import CaptacaoTab from "../../pages/desenvolvimento-economico/CaptacaoTab";
import EscritaTab from "../../pages/desenvolvimento-economico/EscritaTab";
import PremiacoesTab from "../../pages/desenvolvimento-economico/PremiacoesTab";
import IpsPage from "../../pages/ips/IpsPage";
import ProjetosEixosAdminPage from "../../pages/admin/ProjetosEixosAdminPage";
import IndicadoresInternosPage from "../../pages/dados-internos/IndicadoresInternosPage";
import PlanoGovPage from "../../pages/dados-internos/PlanoGovPage";
import CalendarioPage from "../../pages/dados-internos/CalendarioPage";

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" />;
  return children;
}

function AdminRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" />;
  if (user.role !== "ADMIN_GLOBAL") return <Navigate to="/app" />;
  return children;
}

function AdminMunicipioRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" />;
  if (user.role === "VISUALIZADOR") return <Navigate to="/app" />;
  return children;
}

export default function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        {/* ── Public routes ──────────────────────────────── */}
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<LoginPage />} />

        {/* ── Main dashboard ─────────────────────────────── */}
        <Route
          path="/app"
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
          <Route path="benchmark" element={<BenchmarkPage />} />
          <Route path="ips" element={<IpsPage />} />
          <Route path="comparativo" element={<Navigate to="/app/benchmark" replace />} />
          <Route path="bolsa-familia" element={<BolsaFamiliaPage />} />
          <Route path="pe-de-meia" element={<PeDeMeiaPage />} />
          <Route path="inss" element={<InssPage />} />
          <Route path="estban" element={<EstbanPage />} />
          <Route path="comex" element={<ComexPage />} />
          <Route path="empresas" element={<EmpresasPage />} />
          <Route path="pix" element={<PixPage />} />
          <Route path="releases" element={<ReleasesPage />} />
          <Route path="timeline" element={<TimelinePage />} />
          <Route path="projetos" element={<ProjetosPage />} />
          <Route path="desenvolvimento-economico" element={<Navigate to="/app/desenvolvimento-economico/funil" replace />} />
          <Route path="desenvolvimento-economico/funil" element={<FunilTab />} />
          <Route path="desenvolvimento-economico/retencao" element={<RetencaoTab />} />
          <Route path="desenvolvimento-economico/captacao" element={<CaptacaoTab />} />
          <Route path="desenvolvimento-economico/escrita" element={<EscritaTab />} />
          <Route path="desenvolvimento-economico/premiacoes" element={<PremiacoesTab />} />
          <Route path="dados-internos/indicadores" element={<IndicadoresInternosPage />} />
          <Route path="dados-internos/plano-gov" element={<PlanoGovPage />} />
          <Route path="dados-internos/calendario" element={<CalendarioPage />} />
        </Route>

        {/* ── Admin area ─────────────────────────────────── */}
        <Route
          path="/admin"
          element={
            <AdminMunicipioRoute>
              <AdminLayout />
            </AdminMunicipioRoute>
          }
        >
          <Route index element={<Navigate to="/admin/municipios" replace />} />
          <Route
            path="municipios"
            element={<AdminRoute><MunicipiosAdminPage /></AdminRoute>}
          />
          <Route
            path="insights"
            element={<AdminRoute><InsightsAdminPage /></AdminRoute>}
          />
          <Route
            path="releases"
            element={<AdminRoute><ReleasesAdminPage /></AdminRoute>}
          />
          <Route
            path="cards"
            element={<AdminRoute><CustomCardsAdminPage /></AdminRoute>}
          />
          <Route
            path="planos"
            element={<AdminRoute><PlanoConfigAdminPage /></AdminRoute>}
          />
          <Route path="mandato" element={<MandatoAdminPage />} />
          <Route
            path="usuarios"
            element={<AdminRoute><UsuariosAdminPage /></AdminRoute>}
          />
          <Route
            path="explorer"
            element={<AdminRoute><ExplorerPage /></AdminRoute>}
          />
          <Route
            path="datasets"
            element={<AdminRoute><DatasetsAdminPage /></AdminRoute>}
          />
          <Route
            path="notificacoes"
            element={<AdminRoute><NotificacoesAdminPage /></AdminRoute>}
          />
          <Route
            path="projetos-eixos"
            element={<AdminRoute><ProjetosEixosAdminPage /></AdminRoute>}
          />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
