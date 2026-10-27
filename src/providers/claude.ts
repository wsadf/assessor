import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config.js";
import { MAX_TOOL_ROUNDS, REFUSAL_REPLY, SYSTEM_PROMPT, type Provider } from "../prompt.js";
import { toolDefinitions } from "../tools.js";

// Criado no primeiro uso, para os testes e o chat carregarem o modulo sem chave.
let client: Anthropic | undefined;
const getClient = () => (client ??= new Anthropic());

export const claudeProvider: Provider = async (history, input, userText, execute) => {
  // O historico entre turnos guarda so o texto final; blocos de ferramenta e de
  // raciocinio ficam restritos ao turno atual, o que mantem o historico so de acrescimos.
  const content: Anthropic.Beta.BetaContentBlockParam[] = [];
  if (input.image) {
    content.push({
      type: "image",
      source: {
        type: "base64",
        media_type: input.image.mimeType as "image/jpeg" | "image/png" | "image/webp" | "image/gif",
        data: input.image.data.toString("base64"),
      },
    });
  }
  if (input.document?.mimeType === "application/pdf") {
    content.push({
      type: "document",
      source: { type: "base64", media_type: "application/pdf", data: input.document.data.toString("base64") },
    });
  } else if (input.document) {
    content.push({
      type: "image",
      source: {
        type: "base64",
        media_type: input.document.mimeType as "image/jpeg" | "image/png" | "image/webp" | "image/gif",
        data: input.document.data.toString("base64"),
      },
    });
  }
  content.push({ type: "text", text: userText });

  const messages: Anthropic.Beta.BetaMessageParam[] = [
    ...history.map((h) => ({ role: h.role, content: h.text })),
    { role: "user", content },
  ];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const response = await getClient().beta.messages.create({
      model: config.claudeModel,
      max_tokens: 16000,
      system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
      tools: toolDefinitions as Anthropic.Beta.BetaTool[],
      messages,
      output_config: { effort: config.claudeEffort },
      // Em caso de recusa por classificador, a API refaz o pedido em outro modelo.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
    } as Anthropic.Beta.MessageCreateParamsNonStreaming);

    if (response.stop_reason === "refusal") return REFUSAL_REPLY;

    const toolUses = response.content.filter(
      (b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use",
    );
    if (response.stop_reason !== "tool_use" || toolUses.length === 0) {
      return response.content
        .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();
    }

    messages.push({ role: "assistant", content: response.content });
    const results: Anthropic.Beta.BetaToolResultBlockParam[] = toolUses.map((use) => {
      try {
        return { type: "tool_result", tool_use_id: use.id, content: execute(use.name, use.input) };
      } catch (err) {
        return { type: "tool_result", tool_use_id: use.id, content: (err as Error).message, is_error: true };
      }
    });
    messages.push({ role: "user", content: results });
  }
  return "";
};
