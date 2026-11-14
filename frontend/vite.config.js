import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import basicSsl from "@vitejs/plugin-basic-ssl";

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

// npm run dev:https: certificado local (o navegador só libera a câmera em https ou localhost).
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
    plugins: [react(), ...(mode === "https" ? [basicSsl()] : [])],
    base: "./",
    server: { proxy: buildDevProxy(env) },
  };
});
