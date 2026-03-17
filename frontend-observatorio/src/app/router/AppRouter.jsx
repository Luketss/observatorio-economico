import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import DashboardLayout from "../layouts/DashboardLayout";
import LoginPage from "../../pages/login/LoginPage";
import CagedPage from "../../pages/caged/CagedPage";
import RaisPage from "../../pages/rais/RaisPage";

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();

  if (loading) return null;

  if (!user) {
    return <Navigate to="/login" />;
  }

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
          <Route index element={<CagedPage />} />
          <Route path="rais" element={<RaisPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
