import { defineConfig, loadEnv } from "vite";
import vue from "@vitejs/plugin-vue";
import { fileURLToPath } from "node:url";

export default defineConfig(({ mode }) => {
  // A porta da API vem do .env da raiz; o painel entra com login, como em producao.
  const env = loadEnv(mode, fileURLToPath(new URL("..", import.meta.url)), "");
  const port = env.PAINEL_PORT || "3001";
  return {
    plugins: [vue()],
    server: {
      port: 5173,
      proxy: { "/api": { target: `http://127.0.0.1:${port}` } },
    },
  };
});
