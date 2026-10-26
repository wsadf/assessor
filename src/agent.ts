import { config } from "./config.js";
import type { Repo } from "./db.js";
import type { HistoryItem, Provider, UserInput } from "./prompt.js";
import { claudeProvider } from "./providers/claude.js";
import { geminiProvider } from "./providers/gemini.js";
import { nowContext } from "./time.js";
import { executeTool } from "./tools.js";

export type { UserInput } from "./prompt.js";

const providers: Record<typeof config.aiProvider, Provider> = {
  claude: claudeProvider,
  gemini: geminiProvider,
};

export async function runAgent(repo: Repo, phone: string, input: UserInput): Promise<string> {
  const history: HistoryItem[] = repo.recentHistory(phone);
  while (history.length && history[0].role !== "user") history.shift();

  const fallbackText = input.image ? "(foto sem legenda)" : input.audio ? "(mensagem de voz)" : "";
  const userText = `[Agora: ${nowContext()}]\n${input.text || fallbackText}`;

  const reply =
    (await providers[config.aiProvider](history, input, userText, (name, args) =>
      executeTool(repo, phone, name, args),
    )) || "Tive um problema para concluir esse pedido. Pode tentar de novo?";

  const saved = input.image ? `[foto] ${input.text}` : input.audio ? `[audio] ${input.text}` : input.text;
  repo.addHistory(phone, "user", saved.trim());
  repo.addHistory(phone, "assistant", reply);
  return reply;
}
