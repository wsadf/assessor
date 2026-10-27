import { config } from "./config.js";
import { resolverContexto } from "./conta.js";
import type { Repo } from "./db.js";
import { CAPACIDADES, NOME_PERFIL, type Contexto } from "./permissoes.js";
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

/** Linha de contexto so em conta compartilhada; conta de uma pessoa so mantem o custo de antes. */
function quemFala(ctx: Contexto): string {
  if (!ctx.compartilhada) return "";
  const caps = CAPACIDADES[ctx.perfil].join(", ");
  return `[Quem fala: ${ctx.nome ?? "sem nome"}, perfil ${NOME_PERFIL[ctx.perfil]} na conta de ${ctx.titular ?? "titular sem nome"}. Pode: ${caps}.]\n`;
}

export async function runAgent(repo: Repo, phone: string, input: UserInput): Promise<string> {
  const ctx = resolverContexto(repo.db, phone);
  // Cada pessoa tem a propria conversa, mesmo quando os dados sao da conta.
  const history: HistoryItem[] = repo.recentHistory(ctx.membro);
  while (history.length && history[0].role !== "user") history.shift();

  const fallbackText = input.image ? "(foto sem legenda)" : input.audio ? "(mensagem de voz)" : "";
  const userText = `[Agora: ${nowContext()}]\n${quemFala(ctx)}${input.text || fallbackText}`;

  const reply =
    (await providers[config.aiProvider](history, input, userText, (name, args) =>
      executeTool(repo, ctx, name, args),
    )) || "Tive um problema para concluir esse pedido. Pode tentar de novo?";

  const saved = input.image ? `[foto] ${input.text}` : input.audio ? `[audio] ${input.text}` : input.text;
  repo.addHistory(ctx.membro, "user", saved.trim());
  repo.addHistory(ctx.membro, "assistant", reply);
  return reply;
}
