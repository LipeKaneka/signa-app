import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
// Estilos globais antes das telas: assim o CSS de cada tela (importado pelo App) vence em caso de empate.
import "./styles/theme.css";
import "./styles/global.css";
import { App } from "./App.jsx";
import { AuthProvider } from "./context/AuthContext.jsx";
import { SettingsProvider } from "./context/SettingsContext.jsx";
import { AppConfigProvider } from "./context/AppConfigContext.jsx";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <SettingsProvider>
      <AppConfigProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </AppConfigProvider>
    </SettingsProvider>
  </StrictMode>,
);
