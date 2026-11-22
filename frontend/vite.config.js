import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import basicSsl from "@vitejs/plugin-basic-ssl";
import { existsSync, readFileSync } from "node:fs";

/**
 * Em produção o front chama a API direto (VITE_API_URL = endereço do outro servidor).
 * Só no desenvolvimento pelo celular (https) dá para usar VITE_API_URL=/api e
 * VITE_PROXY_TARGET=http://localhost:8080/api/v1, evitando bloqueio de conteúdo misto.
 */
function buildDevProxy(env) {
  if (!env.VITE_PROXY_TARGET) return undefined;
  return {
    "/api": {
      target: env.VITE_PROXY_TARGET,
      changeOrigin: true,
      rewrite: (path) => path.replace(/^\/api/, ""),
    },
  };
}

/**
 * Só no `npm run dev`: versão do APK atual (android/app/build.gradle), para o pop-up de atualização aparecer também no
 * navegador e dar para testar com o painel local. No build (site e APK) fica null: o APK lê a própria versão.
 */
function readDevAppVersion(command) {
  if (command !== "serve" || !existsSync("android/app/build.gradle")) return null;
  const gradle = readFileSync("android/app/build.gradle", "utf8");
  const code = Number(/versionCode (\d+)/.exec(gradle)?.[1]);
  const name = /versionName "([^"]+)"/.exec(gradle)?.[1];
  return code && name ? { name, code } : null;
}

// npm run dev:https: certificado local (o navegador só libera a câmera em https ou localhost).
export default defineConfig(({ mode, command }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
    plugins: [react(), ...(mode === "https" ? [basicSsl()] : [])],
    base: "./",
    server: { proxy: buildDevProxy(env) },
    // Notificação no celular só liga no APK gerado com o android/app/google-services.json do Firebase
    // (sem ele, pedir o token derruba o app).
    define: {
      __PUSH_ENABLED__: JSON.stringify(existsSync("android/app/google-services.json")),
      __DEV_APP_VERSION__: JSON.stringify(readDevAppVersion(command)),
    },
  };
});
