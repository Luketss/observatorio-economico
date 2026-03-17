import { lazy, Suspense } from "react";
import { createBrowserRouter, RouterProvider } from "react-router-dom";

const LoginPage = lazy(() => import("../../pages/login/LoginPage"));
const HomePage = lazy(() => import("../../pages/home/HomePage"));
const ChatBotPage = lazy(() => import("../../pages/chat/ChatBotPage"));
const EmpresasPage = lazy(
  () => import("../../pages/empresas/EmpresasPage")
);
const PibPage = lazy(
  () => import("../../pages/pib/PibPage")
);
const RaisPage = lazy(
  () => import("../../pages/rais/RaisPage")
);
const BancosPage = lazy(
  () => import("../../pages/bancos/BancosPage")
);
const ComercioPage = lazy(
  () => import("../../pages/comercio/ComercioPage")
);
const CagedPage = lazy(
  () => import("../../pages/caged/CagedPage")
);
const ArrecadacaoPage = lazy(
  () => import("../../pages/arrecadacao/ArrecadacaoPage")
);
const PeDeMeiaPage = lazy(
  () => import("../../pages/beneficios/PeDeMeiaPage")
);
const BolsaFamiliaPage = lazy(
  () => import("../../pages/beneficios/BolsaFamiliaPage")
);
const DashboardLayout = lazy(
  () => import("../../layouts/dashboard-layout/DashboardLayout")
);
const ComparativoMunicipiosPage = lazy(
  () => import("../../pages/admin/ComparativoMunicipiosPage")
);

import { ProtectedRoute } from "./ProtectedRoute";

const router = createBrowserRouter([
  {
    path: "/login",
    element: <LoginPage />,
  },
  {
    path: "/",
    element: (
      <ProtectedRoute>
        <DashboardLayout>
          <HomePage />
        </DashboardLayout>
      </ProtectedRoute>
    ),
  },
  {
    path: "/empresas",
    element: (
      <ProtectedRoute>
        <DashboardLayout>
          <EmpresasPage />
        </DashboardLayout>
      </ProtectedRoute>
    ),
  },
  {
    path: "/chat",
    element: (
      <ProtectedRoute>
        <DashboardLayout>
          <ChatBotPage />
        </DashboardLayout>
      </ProtectedRoute>
    ),
  },
  {
    path: "/pib",
    element: (
      <ProtectedRoute>
        <DashboardLayout>
          <PibPage />
        </DashboardLayout>
      </ProtectedRoute>
    ),
  },
  {
    path: "/rais",
    element: (
      <ProtectedRoute>
        <DashboardLayout>
          <RaisPage />
        </DashboardLayout>
      </ProtectedRoute>
    ),
  },
  {
    path: "/bancos",
    element: (
      <ProtectedRoute>
        <DashboardLayout>
          <BancosPage />
        </DashboardLayout>
      </ProtectedRoute>
    ),
  },
  {
    path: "/comercio",
    element: (
      <ProtectedRoute>
        <DashboardLayout>
          <ComercioPage />
        </DashboardLayout>
      </ProtectedRoute>
    ),
  },
  {
    path: "/caged",
    element: (
      <ProtectedRoute>
        <DashboardLayout>
          <CagedPage />
        </DashboardLayout>
      </ProtectedRoute>
    ),
  },
  {
    path: "/arrecadacao",
    element: (
      <ProtectedRoute>
        <DashboardLayout>
          <ArrecadacaoPage />
        </DashboardLayout>
      </ProtectedRoute>
    ),
  },
  {
    path: "/pe-de-meia",
    element: (
      <ProtectedRoute>
        <DashboardLayout>
          <PeDeMeiaPage />
        </DashboardLayout>
      </ProtectedRoute>
    ),
  },
  {
    path: "/bolsa-familia",
    element: (
      <ProtectedRoute>
        <DashboardLayout>
          <BolsaFamiliaPage />
        </DashboardLayout>
      </ProtectedRoute>
    ),
  },
  {
    path: "/admin/comparativo",
    element: (
      <ProtectedRoute allowedRoles={["ADMIN_GLOBAL"]}>
        <DashboardLayout>
          <ComparativoMunicipiosPage />
        </DashboardLayout>
      </ProtectedRoute>
    ),
  },
]);

export function AppRouter() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center h-screen">
          <span className="text-slate-500 text-sm">Carregando...</span>
        </div>
      }
    >
      <RouterProvider router={router} />
    </Suspense>
  );
}
