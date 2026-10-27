import Fastify from "fastify";
import { runAgent, type UserInput } from "./agent.js";
import { agendamentoAtivoDe, responderCliente } from "./agendamento.js";
import { atualizarSituacoes, contatoAtivoDe, responderContato } from "./contatos.js";
import { registerApi } from "./api.js";
import { AuthError } from "./auth.js";
import { retirarPendentes } from "./avisos.js";
import { config } from "./config.js";
import { resolverContexto } from "./conta.js";
import type { Repo } from "./db.js";
import { documentos, extensao, legivelPelaIA, nomeParaDownload } from "./documentos.js";
import { transcribe, transcriptionEnabled } from "./transcribe.js";
import {
  downloadMedia,
  markReadWithTyping,
  parseStatuses,
  parseWebhook,
  sendDocument,
  sendNotice,
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

type Entrada = { input: UserInput; anexoId?: number };

const mb = (bytes: number) => `${(bytes / 1048576).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} MB`;

async function toUserInput(repo: Repo, msg: Incoming): Promise<Entrada | string> {
  switch (msg.type) {
    case "text":
      return { input: { text: msg.text } };
    case "audio": {
      const canHearAudio = config.aiProvider === "gemini";
      if (!transcriptionEnabled() && !canHearAudio) return "Ainda nao entendo audio por aqui. Pode mandar por texto?";
      const media = await downloadMedia(msg.mediaId);
      if (!transcriptionEnabled()) return { input: { text: "", audio: media } };
      const text = await transcribe(media.data, media.mimeType);
      return text ? { input: { text: `(audio) ${text}` } } : "Nao consegui entender o audio. Pode repetir?";
    }
    case "image":
    case "document": {
      const media = await downloadMedia(msg.mediaId);
      const mimeType = (msg.type === "document" && msg.mimeType) || media.mimeType;
      if (msg.type === "image" && !SUPPORTED_IMAGES.includes(mimeType)) return "Nao consegui abrir essa imagem. Pode mandar em JPG ou PNG?";
      // Todo arquivo fica pendente ja na chegada: o "guarda esse" pode vir so na mensagem seguinte.
      const ctx = resolverContexto(repo.db, msg.from);
      let anexoId: number;
      try {
        anexoId = documentos(repo.db).salvarPendente(ctx.conta, ctx.membro, {
          data: media.data,
          mimeType,
          nomeOriginal: msg.type === "document" ? msg.filename : null,
        }).id;
      } catch (err) {
        if (err instanceof AuthError) return err.message;
        throw err;
      }
      const caption = msg.caption ?? "";
      if (msg.type === "image") return { input: { text: caption, image: { data: media.data, mimeType } }, anexoId };
      const filename = msg.filename ?? `arquivo.${extensao(mimeType)}`;
      if (legivelPelaIA(mimeType) && media.data.length <= config.arquivos.modeloBytes) {
        return { input: { text: caption, document: { data: media.data, mimeType, filename } }, anexoId };
      }
      return { input: { text: `[arquivo ${filename}, ${mb(media.data.length)}, nao lido] ${caption}`.trim() }, anexoId };
    }
    case "contact":
      if (!msg.contatos.length) return "Nao achei o numero nesse contato. Pode mandar o WhatsApp com DDD?";
      return { input: { text: msg.contatos.map((c) => `[contato compartilhado: ${c.nome || "sem nome"}, ${c.telefone}]`).join(" ") } };
    default:
      return "Por enquanto eu entendo texto, audio, foto e arquivo PDF.";
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

    const situacoes = parseStatuses(json);
    if (situacoes.length) {
      await atualizarSituacoes(repo, sendNotice, situacoes).catch((err) => req.log.error({ err }, "falha ao atualizar a situacao das mensagens"));
    }

    for (const msg of parseWebhook(json)) {
      // Membro ativo entra pela autorizacao do titular, sem precisar estar na lista.
      const autorizado = (phone: string) => config.allowedNumbers.includes(phone);
      const contaDoRemetente = resolverContexto(repo.db, msg.from).conta;
      const daCasa = config.allowedNumbers.length
        ? autorizado(msg.from) || autorizado(contaDoRemetente)
        : !!repo.getUser(msg.from) || contaDoRemetente !== msg.from;
      // Cliente de uma pagina de agendamento ou contato que recebeu mensagem nunca chega ao assessor
      // de IA nem aos dados da conta.
      const cliente = !daCasa && agendamentoAtivoDe(repo.db, msg.from, new Date());
      if (cliente || (!daCasa && contatoAtivoDe(repo.db, msg.from, new Date()))) {
        if (!repo.markProcessed(msg.id)) continue;
        const texto = msg.type === "text" ? msg.text : "";
        enqueue(msg.from, async () => {
          try {
            if (cliente) await responderCliente(repo, sendText, msg.from, texto, new Date());
            else await responderContato(repo, sendText, msg.from, texto, new Date());
          } catch (err) {
            app.log.error({ err, from: msg.from }, "falha ao responder quem nao e usuario");
          }
        });
        continue;
      }
      if (config.allowedNumbers.length && !daCasa) {
        req.log.info({ from: msg.from }, "numero fora de ALLOWED_NUMBERS, ignorado");
        continue;
      }
      if (!repo.markProcessed(msg.id)) continue;

      enqueue(msg.from, async () => {
        const started = Date.now();
        try {
          repo.ensureUser(msg.from, msg.name);
          void markReadWithTyping(msg.id);
          const entrada = await toUserInput(repo, msg);
          // Os arquivos pedidos saem depois do texto, como numa conversa.
          const arquivos: Parameters<typeof sendDocument>[1][] = [];
          const answer =
            typeof entrada === "string"
              ? entrada
              : await runAgent(repo, msg.from, entrada.input, {
                  anexoId: entrada.anexoId,
                  enviarArquivo: async (doc, data) =>
                    void arquivos.push({ data, mimeType: doc.mime_type, filename: nomeParaDownload(doc) }),
                });
          // Agora a janela de 24 h esta aberta: e a hora de entregar o que a Meta recusou antes.
          const pendentes = retirarPendentes(repo.db, msg.from, new Date());
          if (pendentes.length) await sendText(msg.from, `Avisos que ficaram para depois:\n${pendentes.map((p) => `- ${p}`).join("\n")}`);
          await sendText(msg.from, answer);
          for (const arquivo of arquivos) await sendDocument(msg.from, arquivo);
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
