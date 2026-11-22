import { Capacitor } from "@capacitor/core";

let appModule = null;

/**
 * Módulo "@capacitor/app", carregado só uma vez e só quando preciso (no navegador ele nem é baixado).
 * Devolve o MÓDULO ({App}), nunca o plugin direto: o plugin do Capacitor é um Proxy que responde a qualquer
 * propriedade, inclusive "then". Uma Promise que resolve com ele acha que é "thenable", chama App.then() no Android
 * ("not implemented") e falha — foi o que sumiu com o pop-up de atualização, o botão voltar e o fechar app na 1.8.x.
 * @returns {Promise<{App: object}>}
 */
export function loadAppPlugin() {
  appModule ??= import("@capacitor/app");
  return appModule;
}

/**
 * Fecha o app (só no APK). No navegador não dá para fechar a aba por código: devolve false.
 * @returns {Promise<boolean>}
 * Usado por: pop-up de manutenção.
 */
export async function exitApp() {
  if (!Capacitor.isNativePlatform()) return false;
  const { App } = await loadAppPlugin();
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
    .then(({ App }) => App.addListener(eventName, (data) => handler(data, App)))
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
