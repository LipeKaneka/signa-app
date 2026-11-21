import { Capacitor } from "@capacitor/core";

let appPlugin = null;

/**
 * Plugin App do Capacitor, carregado só uma vez e só quando preciso (no navegador ele nem é baixado).
 * @returns {Promise<object>} App de "@capacitor/app".
 */
export function loadAppPlugin() {
  appPlugin ??= import("@capacitor/app").then(({ App }) => App);
  return appPlugin;
}

/**
 * Fecha o app (só no APK). No navegador não dá para fechar a aba por código: devolve false.
 * @returns {Promise<boolean>}
 * Usado por: pop-up de manutenção.
 */
export async function exitApp() {
  if (!Capacitor.isNativePlatform()) return false;
  const App = await loadAppPlugin();
  await App.exitApp();
  return true;
}

/**
 * Ouve um evento do app Android ("resume", "backButton"...). Fora do APK não faz nada.
 * @param {string} eventName
 * @param {(data: unknown, App: object) => void} handler - recebe também o plugin (ex.: App.minimizeApp()).
 * @returns {() => void} para de ouvir (pode ser chamada antes de o ouvinte terminar de ser criado).
 * Usado por: main.jsx (resume), App.jsx (voltar) e UpdateGate (resume).
 */
export function listenToApp(eventName, handler) {
  if (!Capacitor.isNativePlatform()) return () => {};
  let handle = null;
  let removed = false;
  loadAppPlugin()
    .then((App) => App.addListener(eventName, (data) => handler(data, App)))
    .then((created) => {
      if (removed) created.remove();
      else handle = created;
    })
    .catch(() => {});
  return () => {
    removed = true;
    handle?.remove();
  };
}
