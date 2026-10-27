import crypto from "node:crypto";
import { config } from "./config.js";

const graph = (p: string) => `https://graph.facebook.com/${config.whatsapp.apiVersion}/${p}`;

export type Incoming =
  | { id: string; from: string; name?: string; type: "text"; text: string }
  | { id: string; from: string; name?: string; type: "audio"; mediaId: string }
  | { id: string; from: string; name?: string; type: "image"; mediaId: string; caption?: string }
  | { id: string; from: string; name?: string; type: "document"; mediaId: string; filename?: string; mimeType?: string; caption?: string }
  | { id: string; from: string; name?: string; type: "unsupported"; original: string };

/** Extrai as mensagens de um payload de webhook; ignora status de entrega e leitura. */
export function parseWebhook(body: any): Incoming[] {
  const out: Incoming[] = [];
  for (const entry of body?.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value ?? {};
      const names = new Map<string, string>(
        (value.contacts ?? []).map((c: any) => [c.wa_id, c.profile?.name]),
      );
      for (const m of value.messages ?? []) {
        const base = { id: m.id, from: m.from, name: names.get(m.from) };
        if (m.type === "text") out.push({ ...base, type: "text", text: m.text.body });
        else if (m.type === "audio") out.push({ ...base, type: "audio", mediaId: m.audio.id });
        else if (m.type === "image") out.push({ ...base, type: "image", mediaId: m.image.id, caption: m.image.caption });
        else if (m.type === "document") {
          const d = m.document;
          out.push({ ...base, type: "document", mediaId: d.id, filename: d.filename, mimeType: d.mime_type, caption: d.caption });
        }
        else out.push({ ...base, type: "unsupported", original: m.type });
      }
    }
  }
  return out;
}

export function verifySignature(rawBody: Buffer, header: string | undefined): boolean {
  if (!config.whatsapp.appSecret) return true;
  if (!header?.startsWith("sha256=")) return false;
  const expected = crypto.createHmac("sha256", config.whatsapp.appSecret).update(rawBody).digest("hex");
  const given = header.slice("sha256=".length);
  return given.length === expected.length && crypto.timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}

async function graphFetch(url: string, init: RequestInit = {}) {
  const res = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${config.whatsapp.token}`, ...(init.headers ?? {}) },
  });
  if (!res.ok) throw new Error(`WhatsApp API ${res.status}: ${await res.text()}`);
  return res;
}

export async function sendText(to: string, text: string) {
  // Limite de 4096 caracteres por mensagem de texto na Cloud API.
  for (let i = 0; i < text.length; i += 4000) {
    await graphFetch(graph(`${config.whatsapp.phoneNumberId}/messages`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { body: text.slice(i, i + 4000) },
      }),
    });
  }
}

/** Sobe o arquivo para a Meta e devolve o media id usado na mensagem. */
export async function uploadMedia(data: Buffer, mimeType: string, filename: string): Promise<string> {
  const form = new FormData();
  form.append("messaging_product", "whatsapp");
  form.append("type", mimeType);
  form.append("file", new Blob([new Uint8Array(data)], { type: mimeType }), filename);
  const res = await graphFetch(graph(`${config.whatsapp.phoneNumberId}/media`), { method: "POST", body: form });
  return ((await res.json()) as { id: string }).id;
}

/** Imagem vai como foto; o resto como documento, com o nome do arquivo visivel na conversa. */
export async function sendDocument(to: string, arquivo: { data: Buffer; mimeType: string; filename: string; caption?: string }) {
  const id = await uploadMedia(arquivo.data, arquivo.mimeType, arquivo.filename);
  const imagem = /^image\/(jpeg|png)$/.test(arquivo.mimeType);
  await graphFetch(graph(`${config.whatsapp.phoneNumberId}/messages`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: imagem ? "image" : "document",
      [imagem ? "image" : "document"]: imagem
        ? { id, caption: arquivo.caption }
        : { id, filename: arquivo.filename, caption: arquivo.caption },
    }),
  });
}

/** Mensagem de modelo aprovado; unica forma de escrever fora da janela de 24h desde a ultima mensagem do usuario. */
export async function sendTemplate(to: string, name: string, language: string, params: string[]) {
  await graphFetch(graph(`${config.whatsapp.phoneNumberId}/messages`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "template",
      template: {
        name,
        language: { code: language },
        components: [{ type: "body", parameters: params.map((text) => ({ type: "text", text })) }],
      },
    }),
  });
}

/** Avisos do agendador: usa o modelo configurado, se houver, senao texto livre. */
export async function sendNotice(to: string, text: string) {
  const { noticeTemplate, noticeTemplateLanguage } = config.whatsapp;
  // Parametro de template nao aceita quebra de linha nem varios espacos seguidos.
  if (noticeTemplate) return sendTemplate(to, noticeTemplate, noticeTemplateLanguage, [text.replace(/\s*\n\s*/g, " | ")]);
  return sendText(to, text);
}

/** Marca como lida e mostra "digitando..." enquanto o agente trabalha. */
export async function markReadWithTyping(messageId: string) {
  await graphFetch(graph(`${config.whatsapp.phoneNumberId}/messages`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      status: "read",
      message_id: messageId,
      typing_indicator: { type: "text" },
    }),
  }).catch(() => undefined);
}

let numeroCache: string | null = null;

/**
 * Numero do assessor para o link wa.me: WHATSAPP_NUMERO no .env ou, sem ele, o numero
 * exibido do Phone number ID na Meta. Sem nenhum dos dois, o painel explica como configurar.
 */
export async function assistantNumber(): Promise<string | null> {
  if (config.whatsapp.displayNumber) return config.whatsapp.displayNumber;
  if (numeroCache) return numeroCache;
  if (!process.env.WHATSAPP_TOKEN || !process.env.WHATSAPP_PHONE_NUMBER_ID) return null;
  try {
    const res = await graphFetch(graph(`${config.whatsapp.phoneNumberId}?fields=display_phone_number`), {
      signal: AbortSignal.timeout(5000),
    });
    const json = (await res.json()) as { display_phone_number?: string };
    numeroCache = json.display_phone_number?.replace(/\D/g, "") || null;
  } catch {
    numeroCache = null;
  }
  return numeroCache;
}

export async function downloadMedia(mediaId: string): Promise<{ data: Buffer; mimeType: string }> {
  const meta = (await (await graphFetch(graph(mediaId))).json()) as { url: string; mime_type: string };
  const file = await graphFetch(meta.url);
  return { data: Buffer.from(await file.arrayBuffer()), mimeType: meta.mime_type };
}
