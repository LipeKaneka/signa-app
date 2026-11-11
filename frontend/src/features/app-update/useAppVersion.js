import { useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";

/**
 * Versão do APK instalado: {name: "1.1", code: 2} (versionName e versionCode de android/app/build.gradle).
 * No navegador (não é APK) devolve null: lá não existe "atualizar o app".
 * @returns {{name: string, code: number}|null}
 * Usado por: UpdateGate e Configurações.
 */
export function useAppVersion() {
  const [version, setVersion] = useState(null);
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return undefined;
    let active = true;
    import("@capacitor/app")
      .then(({ App }) => App.getInfo())
      .then((info) => active && setVersion({ name: info.version, code: Number(info.build) || 0 }))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  return version;
}
