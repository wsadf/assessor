import { aiKeyName, config } from "./config.js";
import { openDb, repo as makeRepo } from "./db.js";
import { startScheduler } from "./scheduler.js";
import { buildServer } from "./server.js";
import { sendNotice } from "./whatsapp.js";

// Falha cedo se faltar credencial, em vez de quebrar na primeira mensagem.
const missing = [aiKeyName(), "WHATSAPP_TOKEN", "WHATSAPP_PHONE_NUMBER_ID", "WHATSAPP_VERIFY_TOKEN"].filter(
  (name) => !process.env[name],
);
if (missing.length) {
  console.error(`Faltam variaveis no .env: ${missing.join(", ")}. Veja .env.example e o README.`);
  process.exit(1);
}
if (!config.whatsapp.appSecret) console.warn("WHATSAPP_APP_SECRET vazio: a assinatura do webhook nao sera conferida.");

const repo = makeRepo(openDb());
const app = buildServer(repo);
startScheduler(repo, sendNotice);

await app.listen({ port: config.port, host: "0.0.0.0" });
app.log.info(`Webhook em http://localhost:${config.port}/webhook (IA: ${config.aiProvider})`);
