import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.jsx";
import { AuthProvider } from "./context/AuthContext.jsx";
import { ThemeProvider } from "./context/ThemeContext.jsx";
import { ViewAsProvider } from "./context/ViewAsContext.jsx";
import { iniciarAnalytics, lerConfigAnalytics } from "./services/analytics.js";

// Umami: só injeta o tracker quando VITE_UMAMI_SRC e VITE_UMAMI_WEBSITE_ID
// existem no build (Railway). Em dev as vars não existem → nada é enviado.
iniciarAnalytics(lerConfigAnalytics(import.meta.env));

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <ThemeProvider>
      <AuthProvider>
        <ViewAsProvider>
          <App />
        </ViewAsProvider>
      </AuthProvider>
    </ThemeProvider>
  </StrictMode>
);
