import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
// Estilos globais antes das telas: assim o CSS de cada tela (importado pelo App) vence em caso de empate.
// Fonte Inter dentro do app (sem buscar no Google a cada abertura: abre mais rápido e funciona offline).
import "@fontsource/inter/latin-400.css";
import "@fontsource/inter/latin-500.css";
import "@fontsource/inter/latin-600.css";
import "@fontsource/inter/latin-700.css";
import "@fontsource/inter/latin-800.css";
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
