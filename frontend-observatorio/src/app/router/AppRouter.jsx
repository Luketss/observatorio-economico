import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { hasPermissao, temPermissaoAdmin } from "../../hooks/usePermissao";
import DashboardLayout from "../layouts/DashboardLayout";
import AdminLayout from "../layouts/AdminLayout";
import LandingPage from "../../pages/landing/LandingPage";
import LoginPage from "../../pages/login/LoginPage";
import DashboardGeralPage from "../../pages/DashboardGeralPage";
import ArrecadacaoPage from "../../pages/arrecadacao/ArrecadacaoPage";
import PibPage from "../../pages/pib/PibPage";
import VafPage from "../../pages/vaf/VafPage";
import FpmPage from "../../pages/fpm/FpmPage";
import DinheiroNaMesaPage from "../../pages/dinheiro-na-mesa/DinheiroNaMesaPage";
import EmendasPage from "../../pages/emendas/EmendasPage";
import CagedPage from "../../pages/caged/CagedPage";
import RaisPage from "../../pages/rais/RaisPage";
import BenchmarkPage from "../../pages/comparativo/ComparativoPage";
import NotificacoesAdminPage from "../../pages/admin/NotificacoesAdminPage";
import LoginAuditAdminPage from "../../pages/admin/LoginAuditAdminPage";
import UsuariosAdminPage from "../../pages/admin/UsuariosAdminPage";
import MandatoAdminPage from "../../pages/admin/MandatoAdminPage";
import InsightsAdminPage from "../../pages/admin/InsightsAdminPage";
import ReleasesAdminPage from "../../pages/admin/ReleasesAdminPage";
import MunicipiosAdminPage from "../../pages/admin/MunicipiosAdminPage";
import RolesAdminPage from "../../pages/admin/RolesAdminPage";
import CustomCardsAdminPage from "../../pages/admin/CustomCardsAdminPage";
import PlanoConfigAdminPage from "../../pages/admin/PlanoConfigAdminPage";
import ExplorerPage from "../../pages/admin/ExplorerPage";
import DatasetsAdminPage from "../../pages/admin/DatasetsAdminPage";
import DatasetFontesAdminPage from "../../pages/admin/DatasetFontesAdminPage";
import BolsaFamiliaPage from "../../pages/beneficios/BolsaFamiliaPage";
import PeDeMeiaPage from "../../pages/beneficios/PeDeMeiaPage";
import InssPage from "../../pages/inss/InssPage";
import EstbanPage from "../../pages/estban/EstbanPage";
import ComexPage from "../../pages/comex/ComexPage";
import EmpresasPage from "../../pages/empresas/EmpresasPage";
import PixPage from "../../pages/pix/PixPage";
import AnaliseEconomicaPage from "../../pages/analise-economica/AnaliseEconomicaPage";
import ReleasesPage from "../../pages/releases/ReleasesPage";
import TimelinePage from "../../pages/timeline/TimelinePage";
import ProjetosPage from "../../pages/projetos/ProjetosPage";
import FunilTab from "../../pages/desenvolvimento-economico/FunilTab";
import GestaoEmpresarialTab from "../../pages/desenvolvimento-economico/GestaoEmpresarialTab";
import CaptacaoTab from "../../pages/desenvolvimento-economico/CaptacaoTab";
import EscritaTab from "../../pages/desenvolvimento-economico/EscritaTab";
import PremiacoesTab from "../../pages/desenvolvimento-economico/PremiacoesTab";
import IpsPage from "../../pages/ips/IpsPage";
import ProjetosEixosAdminPage from "../../pages/admin/ProjetosEixosAdminPage";
import IndicadoresAdminPage from "../../pages/admin/IndicadoresAdminPage";
import IndicadoresInternosPage from "../../pages/dados-internos/IndicadoresInternosPage";
import PlanoGovPage from "../../pages/dados-internos/PlanoGovPage";
import CalendarioPage from "../../pages/dados-internos/CalendarioPage";
import ImpactoPage from "../../pages/impacto/ImpactoPage";
import PainelPrefeitoPage from "../../pages/painel-prefeito/PainelPrefeitoPage";
import NotificacoesPage from "../../pages/notificacoes/NotificacoesPage";

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

function AdminAreaRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" />;
  if (!temPermissaoAdmin(user)) return <Navigate to="/app" />;
  return children;
}

function PermissaoRoute({ area, children }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" />;
  const ok =
    user.role === "ADMIN_GLOBAL" ||
    ["criar", "editar", "excluir"].some((v) => hasPermissao(user, area, v));
  if (!ok) return <Navigate to="/app" />;
  return children;
}

function AdminIndexRedirect() {
  const { user } = useAuth();
  if (user?.role === "ADMIN_GLOBAL") return <Navigate to="/admin/municipios" replace />;
  if (["criar", "editar", "excluir"].some((v) => hasPermissao(user, "mandato", v)))
    return <Navigate to="/admin/mandato" replace />;
  return <Navigate to="/admin/usuarios" replace />;
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
          <Route path="painel-prefeito" element={<PainelPrefeitoPage />} />
          <Route path="arrecadacao" element={<ArrecadacaoPage />} />
          <Route path="pib" element={<PibPage />} />
          <Route path="vaf" element={<VafPage />} />
          <Route path="fpm" element={<FpmPage />} />
          <Route path="dinheiro-na-mesa" element={<DinheiroNaMesaPage />} />
          <Route path="emendas" element={<EmendasPage />} />
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
          <Route path="analise-economica" element={<AnaliseEconomicaPage />} />
          <Route path="releases" element={<ReleasesPage />} />
          <Route path="notificacoes" element={<NotificacoesPage />} />
          <Route path="timeline" element={<TimelinePage />} />
          <Route path="projetos" element={<ProjetosPage />} />
          <Route path="desenvolvimento-economico" element={<Navigate to="/app/desenvolvimento-economico/funil" replace />} />
          <Route path="desenvolvimento-economico/funil" element={<FunilTab />} />
          <Route path="desenvolvimento-economico/retencao" element={<GestaoEmpresarialTab />} />
          <Route path="desenvolvimento-economico/captacao" element={<CaptacaoTab />} />
          <Route path="desenvolvimento-economico/escrita" element={<EscritaTab />} />
          <Route path="desenvolvimento-economico/premiacoes" element={<PremiacoesTab />} />
          <Route path="dados-internos/indicadores" element={<IndicadoresInternosPage />} />
          <Route path="dados-internos/plano-gov" element={<PlanoGovPage />} />
          <Route path="dados-internos/calendario" element={<CalendarioPage />} />
          <Route path="impacto" element={<ImpactoPage />} />
        </Route>

        {/* ── Admin area ─────────────────────────────────── */}
        <Route
          path="/admin"
          element={
            <AdminAreaRoute>
              <AdminLayout />
            </AdminAreaRoute>
          }
        >
          <Route index element={<AdminIndexRedirect />} />
          <Route
            path="municipios"
            element={<AdminRoute><MunicipiosAdminPage /></AdminRoute>}
          />
          <Route
            path="roles"
            element={<AdminRoute><RolesAdminPage /></AdminRoute>}
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
          <Route
            path="mandato"
            element={<PermissaoRoute area="mandato"><MandatoAdminPage /></PermissaoRoute>}
          />
          <Route
            path="usuarios"
            element={<PermissaoRoute area="usuarios"><UsuariosAdminPage /></PermissaoRoute>}
          />
          <Route
            path="login-audit"
            element={<AdminRoute><LoginAuditAdminPage /></AdminRoute>}
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
            path="fontes"
            element={<AdminRoute><DatasetFontesAdminPage /></AdminRoute>}
          />
          <Route
            path="indicadores"
            element={<AdminRoute><IndicadoresAdminPage /></AdminRoute>}
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
