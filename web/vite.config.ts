import { defineConfig, loadEnv } from "vite";
import vue from "@vitejs/plugin-vue";
import { fileURLToPath } from "node:url";

export default defineConfig(({ mode }) => {
  // O token fica no .env da raiz; em desenvolvimento o proxy o injeta e a tela de token nao aparece.
  const env = loadEnv(mode, fileURLToPath(new URL("..", import.meta.url)), "");
  const port = env.PAINEL_PORT || "3001";
  return {
    plugins: [vue()],
    server: {
      port: 5173,
      proxy: {
        "/api": {
          target: `http://127.0.0.1:${port}`,
          headers: env.PAINEL_TOKEN ? { "x-painel-token": env.PAINEL_TOKEN } : {},
        },
      },
    },
  };
});
