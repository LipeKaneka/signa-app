import { useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { loadAppPlugin } from "../../utils/native-app.js";

/**
 * Versão do APK instalado: {name: "1.1", code: 2} (versionName e versionCode de android/app/build.gradle).
 * No navegador (não é APK) devolve null: lá não existe "atualizar o app". Exceção: no `npm run dev` usa a versão do
 * build.gradle (__DEV_APP_VERSION__), para testar o pop-up de atualização no localhost com o painel local.
 * @returns {{name: string, code: number}|null}
 * Usado por: UpdateGate e Configurações.
 */
export function useAppVersion() {
  /* global __DEV_APP_VERSION__ */
  const devVersion = typeof __DEV_APP_VERSION__ === "undefined" ? null : __DEV_APP_VERSION__;
  const [version, setVersion] = useState(Capacitor.isNativePlatform() ? null : devVersion);
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return undefined;
    let active = true;
    loadAppPlugin()
      .then((App) => App.getInfo())
      .then((info) => active && setVersion({ name: info.version, code: Number(info.build) || 0 }))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  return version;
}
