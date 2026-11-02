import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/**
 * Painel web. Em produção o build (dist/) é servido pelo próprio servidor em /admin (mesma origem da API).
 * No desenvolvimento (npm run dev, porta 5174) as chamadas a /admin/api vão para o servidor (127.0.0.1:8090).
 * O cabeçalho Origin é removido no proxy: o servidor só aceita alterações vindas da própria origem.
 */
export default defineConfig({
  plugins: [react()],
  base: "/admin/",
  server: {
    port: 5174,
    proxy: {
      "/admin/api": {
        target: "http://127.0.0.1:8090",
        configure: (proxy) => proxy.on("proxyReq", (proxyRequest) => proxyRequest.removeHeader("origin")),
      },
    },
  },
});
