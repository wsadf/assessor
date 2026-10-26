import crypto from "node:crypto";
import { config } from "./config.js";

const graph = (p: string) => `https://graph.facebook.com/${config.whatsapp.apiVersion}/${p}`;

export type Incoming =
  | { id: string; from: string; name?: string; type: "text"; text: string }
  | { id: string; from: string; name?: string; type: "audio"; mediaId: string }
  | { id: string; from: string; name?: string; type: "image"; mediaId: string; caption?: string }
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

export async function downloadMedia(mediaId: string): Promise<{ data: Buffer; mimeType: string }> {
  const meta = (await (await graphFetch(graph(mediaId))).json()) as { url: string; mime_type: string };
  const file = await graphFetch(meta.url);
  return { data: Buffer.from(await file.arrayBuffer()), mimeType: meta.mime_type };
}
