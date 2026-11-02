import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { readPreference, storePreference } from "../utils/session-storage.js";

const DEFAULT_SETTINGS = Object.freeze({
  theme: "light",
  fontScale: 1,
  highContrast: false,
  soundsAndVibration: true,
  tipsDuringLessons: false,
  notifications: true,
});

const SettingsContext = createContext(null);

/**
 * Preferências salvas no aparelho; o tema padrão segue o sistema (claro/escuro).
 * @returns {{theme, fontScale, highContrast, soundsAndVibration, tipsDuringLessons, notifications}}
 */
function readInitialSettings() {
  const stored = readPreference("settings", {});
  const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches;
  return { ...DEFAULT_SETTINGS, theme: prefersDark ? "dark" : "light", ...stored };
}

/**
 * Aplica as preferências no <html>: data-theme, data-contrast, --font-scale e data-font-size (o CSS reage a eles).
 */
function applySettingsToDocument(settings) {
  const root = document.documentElement;
  root.dataset.theme = settings.theme;
  root.dataset.contrast = settings.highContrast ? "high" : "normal";
  root.style.setProperty("--font-scale", String(settings.fontScale));
  // Fonte grande: telas apertadas usam :root[data-font-size="large"] para reorganizar o layout.
  root.dataset.fontSize = settings.fontScale > 1.1 ? "large" : "normal";
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", "#4f31bb");
}

/**
 * Guarda as preferências do aparelho (tema, fonte, contraste, sons, dicas, notificações) e as salva no
 * localStorage. São preferências locais: não dependem do servidor.
 */
export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(readInitialSettings);

  useEffect(() => {
    applySettingsToDocument(settings);
    storePreference("settings", settings);
  }, [settings]);

  const updateSetting = useCallback((key, value) => {
    setSettings((current) => ({ ...current, [key]: value }));
  }, []);

  const value = useMemo(() => ({ settings, updateSetting }), [settings, updateSetting]);
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

/**
 * @returns {{settings: object, updateSetting: (key: string, value: unknown) => void}}
 * Usado por: SettingsPage, ActivityPage (sons e dicas), CameraPage (vibração).
 */
export function useSettings() {
  const context = useContext(SettingsContext);
  if (!context) throw new Error("useSettings precisa estar dentro de <SettingsProvider>");
  return context;
}
