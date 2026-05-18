import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.jsx";
import { AuthProvider } from "./context/AuthContext.jsx";
import { ThemeProvider } from "./context/ThemeContext.jsx";
import { ViewAsProvider } from "./context/ViewAsContext.jsx";

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
