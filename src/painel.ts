import { config, DEMO_DB_PATH } from "./config.js";
import { openDb, repo as makeRepo } from "./db.js";
import { buildServer } from "./server.js";
import { servirPainelWeb } from "./web.js";

// Sobe so a API e o painel web, sem WhatsApp nem agendador: nao exige as chaves da Meta.
const demo = process.argv.includes("--demo");
const app = buildServer(makeRepo(openDb(demo ? DEMO_DB_PATH : config.dbPath)));
await servirPainelWeb(app);

try {
  await app.listen({ port: config.panel.port, host: "127.0.0.1" });
} catch (err) {
  if ((err as NodeJS.ErrnoException).code !== "EADDRINUSE") throw err;
  console.error(
    `A porta ${config.panel.port} ja esta em uso, provavelmente por outro painel aberto. Feche o outro terminal ou troque PAINEL_PORT no .env.`,
  );
  process.exit(1);
}
console.log(
  `API do painel em http://localhost:${config.panel.port} (telefone ${config.panel.phone}${demo ? ", dados de demonstracao" : ""})`,
);
