import { config } from "../config.js";
import { MAX_TOOL_ROUNDS, REFUSAL_REPLY, SYSTEM_PROMPT, type Media, type Provider } from "../prompt.js";
import { toolDefinitions } from "../tools.js";

// REST direto em vez do SDK @google/genai, que exige Node 20 ou mais novo.
const endpoint = (model: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

// 429 e 5xx costumam ser picos de demanda passageiros; os demais erros nao melhoram repetindo.
const RETRYABLE = new Set([429, 500, 503, 504]);
const RETRY_DELAYS_MS = [1000, 3000];
const REQUEST_TIMEOUT_MS = 30_000;
// Depois que o principal esgota as tentativas, o reserva vai na frente por um tempo,
// para cada passo do laco de ferramentas nao pagar de novo as esperas.
const PREFER_FALLBACK_MS = 5 * 60_000;
let preferFallbackUntil = 0;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Exposto para os testes voltarem ao estado inicial. */
export const resetGeminiFallback = () => {
  preferFallbackUntil = 0;
};

type Part = {
  text?: string;
  thought?: boolean;
  inlineData?: { mimeType: string; data: string };
  functionCall?: { id?: string; name: string; args?: unknown };
  functionResponse?: { id?: string; name: string; response: Record<string, unknown> };
  [key: string]: unknown;
};
type Content = { role: "user" | "model"; parts: Part[] };

/** Converte o JSON Schema das ferramentas para o subconjunto OpenAPI aceito pelo Gemini. */
export function toGeminiSchema(schema: any): any {
  if (schema.anyOf) {
    const value = schema.anyOf.find((s: any) => s.type !== "null");
    return { ...toGeminiSchema(value), nullable: true };
  }
  const { additionalProperties: _unused, ...rest } = schema;
  if (rest.properties) {
    rest.properties = Object.fromEntries(
      Object.entries(rest.properties).map(([k, v]) => [k, toGeminiSchema(v)]),
    );
  }
  if (rest.items) rest.items = toGeminiSchema(rest.items);
  return rest;
}

export const functionDeclarations = toolDefinitions.map((t) => {
  const schema = t.input_schema as { properties?: Record<string, unknown> };
  const hasParams = schema.properties && Object.keys(schema.properties).length > 0;
  return {
    name: t.name,
    description: t.description,
    ...(hasParams ? { parameters: toGeminiSchema(t.input_schema) } : {}),
  };
});

// "audio/ogg; codecs=opus" do WhatsApp vira "audio/ogg".
const inline = (m: Media): Part => ({
  inlineData: { mimeType: m.mimeType.split(";")[0].trim(), data: m.data.toString("base64") },
});

async function generate(contents: Content[]) {
  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents,
    tools: [{ functionDeclarations }],
  });
  const { model: primary, fallbackModel } = config.gemini;
  const ordered = Date.now() < preferFallbackUntil ? [fallbackModel, primary] : [primary, fallbackModel];
  const models = ordered.filter((m, i, all) => m && all.indexOf(m) === i);

  let lastError = "";
  for (const model of models) {
    for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
      let res: Response;
      try {
        res = await fetch(endpoint(model), {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": config.gemini.apiKey },
          body,
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
      } catch (err) {
        if ((err as Error).name !== "TimeoutError") throw err;
        // Modelo travado nao costuma voltar na tentativa seguinte; vai direto para o proximo.
        lastError = `Gemini (${model}): sem resposta em ${REQUEST_TIMEOUT_MS / 1000}s`;
        break;
      }
      if (res.ok) return (await res.json()) as GenerateResponse;
      lastError = `Gemini ${res.status} (${model}): ${(await res.text()).slice(0, 500)}`;
      if (!RETRYABLE.has(res.status)) throw new Error(lastError);
      if (attempt < RETRY_DELAYS_MS.length) await sleep(RETRY_DELAYS_MS[attempt]);
    }
    if (model === primary && fallbackModel) preferFallbackUntil = Date.now() + PREFER_FALLBACK_MS;
  }
  throw new Error(lastError);
}

type GenerateResponse = {
  candidates?: { content?: Content; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
};

export const geminiProvider: Provider = async (history, input, userText, execute) => {
  const userParts: Part[] = [];
  if (input.image) userParts.push(inline(input.image));
  if (input.audio) userParts.push(inline(input.audio));
  if (input.document) userParts.push(inline(input.document));
  userParts.push({ text: userText });

  const contents: Content[] = [
    ...history.map((h): Content => ({ role: h.role === "assistant" ? "model" : "user", parts: [{ text: h.text }] })),
    { role: "user", parts: userParts },
  ];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const data = await generate(contents);
    if (data.promptFeedback?.blockReason) return REFUSAL_REPLY;

    const candidate = data.candidates?.[0];
    const parts = candidate?.content?.parts ?? [];
    if (parts.length === 0) {
      return candidate?.finishReason && candidate.finishReason !== "STOP" ? REFUSAL_REPLY : "";
    }

    const calls = parts.filter((p) => p.functionCall);
    if (calls.length === 0) {
      return parts
        .filter((p) => p.text && !p.thought)
        .map((p) => p.text)
        .join("\n")
        .trim();
    }

    // O turno do modelo volta inteiro, sem mexer nas partes: as assinaturas de
    // raciocinio (thoughtSignature) precisam acompanhar as chamadas de funcao.
    contents.push({ role: "model", parts });
    contents.push({
      role: "user",
      parts: calls.map(({ functionCall: call }) => {
        let response: Record<string, unknown>;
        try {
          response = { result: execute(call!.name, call!.args ?? {}) };
        } catch (err) {
          response = { error: (err as Error).message };
        }
        return { functionResponse: { ...(call!.id ? { id: call!.id } : {}), name: call!.name, response } };
      }),
    });
  }
  return "";
};
