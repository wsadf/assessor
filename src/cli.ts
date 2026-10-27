import readline from "node:readline/promises";
import { runAgent } from "./agent.js";
import { aiKeyName, config } from "./config.js";
import { openDb, repo as makeRepo } from "./db.js";
import { runRemindersOnce } from "./scheduler.js";

const keyName = aiKeyName();
if (!process.env[keyName]) {
  const where = keyName === "GEMINI_API_KEY" ? "https://aistudio.google.com/apikey" : "https://console.anthropic.com";
  console.error(`Falta ${keyName} no .env. Crie a chave em ${where} e cole no arquivo .env.`);
  process.exit(1);
}

// Conversa pelo terminal, sem WhatsApp: mesmo agente e mesmo banco, com um telefone ficticio.
const phone = process.env.CLI_PHONE ?? "5500000000000";
const repo = makeRepo(openDb());
// So nomeia numero novo: um CLI_PHONE de membro de conta compartilhada ja tem nome proprio.
if (!repo.getUser(phone)) repo.ensureUser(phone, "Terminal");

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
console.log(`Assessor no terminal (IA: ${config.aiProvider}). Escreva como no WhatsApp; 'sair' encerra.\n`);

setInterval(() => {
  void runRemindersOnce(repo, async (_to, text) => console.log(`\n${text}\n> `));
}, 15_000);

// for await termina sozinho quando a entrada acaba (Ctrl+C ou texto colado pelo pipe).
rl.setPrompt("> ");
rl.prompt();
for await (const line of rl) {
  const text = line.trim();
  if (text.toLowerCase() === "sair") break;
  if (text) {
    const started = Date.now();
    process.stdout.write("pensando...");
    const ticker = setInterval(() => process.stdout.write("."), 2000);
    try {
      const reply = await runAgent(repo, phone, { text });
      clearInterval(ticker);
      console.log(` (${Math.round((Date.now() - started) / 1000)}s)\n\n${reply}\n`);
    } catch (err) {
      clearInterval(ticker);
      console.error("\nErro:", (err as Error).message);
    }
  }
  rl.prompt();
}
rl.close();
process.exit(0);
