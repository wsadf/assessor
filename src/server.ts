import Fastify from "fastify";
import { runAgent, type UserInput } from "./agent.js";
import { registerApi } from "./api.js";
import { config } from "./config.js";
import { resolverContexto } from "./conta.js";
import type { Repo } from "./db.js";
import { transcribe, transcriptionEnabled } from "./transcribe.js";
import {
  downloadMedia,
  markReadWithTyping,
  parseWebhook,
  sendText,
  verifySignature,
  type Incoming,
} from "./whatsapp.js";

const SUPPORTED_IMAGES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

/** Fila por usuario: mensagens da mesma pessoa sao tratadas em ordem, pessoas diferentes em paralelo. */
function createUserQueue() {
  const tails = new Map<string, Promise<void>>();
  return (phone: string, job: () => Promise<void>) => {
    const next = (tails.get(phone) ?? Promise.resolve()).then(job, job);
    tails.set(phone, next.catch(() => undefined));
  };
}

async function toUserInput(msg: Incoming): Promise<UserInput | string> {
  switch (msg.type) {
    case "text":
      return { text: msg.text };
    case "audio": {
      const canHearAudio = config.aiProvider === "gemini";
      if (!transcriptionEnabled() && !canHearAudio) return "Ainda nao entendo audio por aqui. Pode mandar por texto?";
      const media = await downloadMedia(msg.mediaId);
      if (!transcriptionEnabled()) return { text: "", audio: media };
      const text = await transcribe(media.data, media.mimeType);
      return text ? { text: `(audio) ${text}` } : "Nao consegui entender o audio. Pode repetir?";
    }
    case "image": {
      const media = await downloadMedia(msg.mediaId);
      if (!SUPPORTED_IMAGES.includes(media.mimeType)) return "Nao consegui abrir essa imagem. Pode mandar em JPG ou PNG?";
      return { text: msg.caption ?? "", image: media };
    }
    default:
      return "Por enquanto eu entendo texto, audio e foto.";
  }
}

export function buildServer(repo: Repo) {
  const app = Fastify({ logger: { level: "info" } });
  const enqueue = createUserQueue();

  // Corpo bruto e necessario para conferir a assinatura HMAC da Meta.
  app.addContentTypeParser("application/json", { parseAs: "buffer" }, (_req, body, done) => {
    try {
      done(null, { raw: body, json: body.length ? JSON.parse(body.toString("utf8")) : undefined });
    } catch (err) {
      done(err as Error, undefined);
    }
  });

  app.get("/health", async () => ({ ok: true }));
  registerApi(app, repo);

  app.get("/webhook", async (req, reply) => {
    const q = req.query as Record<string, string>;
    if (q["hub.mode"] === "subscribe" && q["hub.verify_token"] === config.whatsapp.verifyToken) {
      return reply.type("text/plain").send(q["hub.challenge"]);
    }
    return reply.code(403).send("forbidden");
  });

  app.post("/webhook", async (req, reply) => {
    const { raw, json } = req.body as { raw: Buffer; json: unknown };
    if (!verifySignature(raw, req.headers["x-hub-signature-256"] as string | undefined)) {
      req.log.warn("assinatura invalida no webhook");
      return reply.code(401).send();
    }

    for (const msg of parseWebhook(json)) {
      // Membro ativo entra pela autorizacao do titular, sem precisar estar na lista.
      const autorizado = (phone: string) => config.allowedNumbers.includes(phone);
      if (config.allowedNumbers.length && !autorizado(msg.from) && !autorizado(resolverContexto(repo.db, msg.from).conta)) {
        req.log.info({ from: msg.from }, "numero fora de ALLOWED_NUMBERS, ignorado");
        continue;
      }
      if (!repo.markProcessed(msg.id)) continue;

      enqueue(msg.from, async () => {
        const started = Date.now();
        try {
          repo.ensureUser(msg.from, msg.name);
          void markReadWithTyping(msg.id);
          const input = await toUserInput(msg);
          const answer = typeof input === "string" ? input : await runAgent(repo, msg.from, input);
          await sendText(msg.from, answer);
          app.log.info({ from: msg.from, type: msg.type, ms: Date.now() - started }, "mensagem respondida");
        } catch (err) {
          app.log.error({ err, from: msg.from }, "falha ao processar mensagem");
          await sendText(msg.from, "Tive um problema agora. Pode mandar de novo daqui a pouco?").catch(() => undefined);
        }
      });
    }

    // Responde na hora; a Meta reenvia o webhook se demorar.
    return reply.code(200).send();
  });

  return app;
}
