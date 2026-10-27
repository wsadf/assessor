import crypto from "node:crypto";
import { config, googleConfigurado } from "./config.js";
import type { Db } from "./db.js";
import { fromLocal } from "./time.js";

const ESCOPO_AGENDA = "https://www.googleapis.com/auth/calendar.events";
const URL_AUTORIZACAO = "https://accounts.google.com/o/oauth2/v2/auth";
const URL_TOKEN = "https://oauth2.googleapis.com/token";
const URL_REVOGAR = "https://oauth2.googleapis.com/revoke";
const URL_EVENTOS = "https://www.googleapis.com/calendar/v3/calendars/primary/events";
const STATE_MIN = 10;
const LINK_MIN = 15;
const LIMITE_MS = 10_000;

export class GoogleNaoConfigurado extends Error {
  constructor() {
    super("A agenda do Google nao esta disponivel neste servidor.");
  }
}
export class GoogleNaoConectado extends Error {}
export class GoogleExpirado extends Error {}
export class GoogleIndisponivel extends Error {
  constructor(detalhe?: string) {
    super(`Nao consegui falar com o Google Agenda agora.${detalhe ? ` (${detalhe})` : ""}`);
  }
}

export interface Evento {
  id: string;
  titulo: string;
  inicio: string;
  fim: string;
  diaInteiro: boolean;
  convidados: string[];
  linkVideo: string | null;
  linkGoogle: string | null;
}

interface Conta {
  phone: string;
  email: string | null;
  refresh_token_enc: string;
  scope: string;
  status: "conectada" | "expirada";
  connected_at: string;
  last_error: string | null;
}

export function prepararTabelasGoogle(db: Db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS google_accounts (
      phone TEXT PRIMARY KEY,
      email TEXT,
      refresh_token_enc TEXT NOT NULL,
      scope TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('conectada', 'expirada')),
      connected_at TEXT NOT NULL,
      last_error TEXT
    );
    CREATE TABLE IF NOT EXISTS google_auth (
      token_hash TEXT PRIMARY KEY,
      kind TEXT NOT NULL CHECK (kind IN ('state', 'link')),
      phone TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      used_at TEXT
    );
  `);
}

// ---------- cifra do refresh token ----------

/** AES-256-GCM: o arquivo do banco sozinho nao basta para acessar o calendario de ninguem. */
export function cifrar(texto: string, chave = config.google.tokenKey): string {
  if (!chave) throw new GoogleNaoConfigurado();
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", chave, iv);
  const cifrado = Buffer.concat([c.update(texto, "utf8"), c.final()]);
  return [iv, c.getAuthTag(), cifrado].map((b) => b.toString("base64url")).join(".");
}

export function decifrar(valor: string, chave = config.google.tokenKey): string {
  if (!chave) throw new GoogleNaoConfigurado();
  const [iv, tag, cifrado] = valor.split(".").map((p) => Buffer.from(p, "base64url"));
  const d = crypto.createDecipheriv("aes-256-gcm", chave, iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(cifrado), d.final()]).toString("utf8");
}

// ---------- autorizacao ----------

const sha256 = (s: string) => crypto.createHash("sha256").update(s).digest("hex");
const redirectUri = () => `${config.google.painelUrl}/api/google/retorno`;

function guardarSegredo(db: Db, kind: "state" | "link", phone: string, minutos: number, agora: Date) {
  const segredo = crypto.randomBytes(32).toString("base64url");
  db.prepare(`INSERT INTO google_auth (token_hash, kind, phone, expires_at) VALUES (?, ?, ?, ?)`).run(
    sha256(segredo),
    kind,
    phone,
    new Date(agora.getTime() + minutos * 60_000).toISOString(),
  );
  return segredo;
}

/** Uso unico: a mesma linha nao serve duas vezes, nem depois de vencer. */
function consumir(db: Db, kind: "state" | "link", segredo: string, agora: Date): string | null {
  const linha = db
    .prepare(
      `UPDATE google_auth SET used_at = ? WHERE token_hash = ? AND kind = ? AND used_at IS NULL AND expires_at > ? RETURNING phone`,
    )
    .get(agora.toISOString(), sha256(segredo), kind, agora.toISOString()) as { phone: string } | undefined;
  return linha?.phone ?? null;
}

/** Link mandado pelo WhatsApp: quem pede pela conversa quase nunca esta logado no painel. */
export function criarLink(db: Db, phone: string, agora = new Date()) {
  if (!googleConfigurado()) throw new GoogleNaoConfigurado();
  return `${config.google.painelUrl}/api/google/conectar/${guardarSegredo(db, "link", phone, LINK_MIN, agora)}`;
}

export const usarLink = (db: Db, token: string, agora = new Date()) => consumir(db, "link", token, agora);

export function urlDeAutorizacao(db: Db, phone: string, agora = new Date()) {
  if (!googleConfigurado()) throw new GoogleNaoConfigurado();
  const params = new URLSearchParams({
    client_id: config.google.clientId,
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: `openid email ${ESCOPO_AGENDA}`,
    access_type: "offline",
    // Sem consent o Google so manda o refresh token na primeira autorizacao da conta.
    prompt: "consent",
    include_granted_scopes: "true",
    state: guardarSegredo(db, "state", phone, STATE_MIN, agora),
  });
  return `${URL_AUTORIZACAO}?${params}`;
}

async function chamarGoogle(url: string, init: RequestInit = {}): Promise<Response> {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(LIMITE_MS) });
  } catch (err) {
    throw new GoogleIndisponivel((err as Error).name === "TimeoutError" ? "sem resposta em 10 s" : undefined);
  }
}

const postForm = (url: string, campos: Record<string, string>) =>
  chamarGoogle(url, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(campos) });

const emailDoIdToken = (idToken?: string) => {
  try {
    return idToken ? (JSON.parse(Buffer.from(idToken.split(".")[1], "base64url").toString("utf8")).email as string) : null;
  } catch {
    return null;
  }
};

const cache = new Map<string, { token: string; expira: number }>();

export async function concluirConexao(db: Db, code: string, state: string, agora = new Date()): Promise<string> {
  if (!googleConfigurado()) throw new GoogleNaoConfigurado();
  const phone = consumir(db, "state", state, agora);
  if (!phone) throw new Error("O pedido de conexão venceu ou já foi usado. Peça um novo link ao assessor.");
  const res = await postForm(URL_TOKEN, {
    code,
    client_id: config.google.clientId,
    client_secret: config.google.clientSecret,
    redirect_uri: redirectUri(),
    grant_type: "authorization_code",
  });
  if (!res.ok) throw new Error("O Google recusou a conexão. Tente de novo.");
  const t = (await res.json()) as { access_token: string; expires_in: number; refresh_token?: string; scope?: string; id_token?: string };
  if (!t.scope?.split(" ").includes(ESCOPO_AGENDA)) {
    throw new Error("A permissão para ver e editar eventos não foi concedida. Conecte de novo e marque a agenda.");
  }
  if (!t.refresh_token) throw new Error("O Google não devolveu o acesso permanente. Conecte de novo.");
  db.prepare(
    `INSERT INTO google_accounts (phone, email, refresh_token_enc, scope, status, connected_at)
     VALUES (?, ?, ?, ?, 'conectada', ?)
     ON CONFLICT(phone) DO UPDATE SET email = excluded.email, refresh_token_enc = excluded.refresh_token_enc,
       scope = excluded.scope, status = 'conectada', connected_at = excluded.connected_at, last_error = NULL`,
  ).run(phone, emailDoIdToken(t.id_token), cifrar(t.refresh_token), t.scope, agora.toISOString());
  cache.set(phone, { token: t.access_token, expira: agora.getTime() + t.expires_in * 1000 });
  return phone;
}

const contaGoogle = (db: Db, phone: string) => db.prepare(`SELECT * FROM google_accounts WHERE phone = ?`).get(phone) as Conta | undefined;

/** Access token so em memoria; renovado quando falta menos de 1 minuto. */
export async function accessToken(db: Db, phone: string, agora = Date.now()): Promise<string> {
  if (!googleConfigurado()) throw new GoogleNaoConfigurado();
  const conta = contaGoogle(db, phone);
  if (!conta) throw new GoogleNaoConectado();
  if (conta.status === "expirada") throw new GoogleExpirado();
  const emCache = cache.get(phone);
  if (emCache && emCache.expira - agora > 60_000) return emCache.token;
  const res = await postForm(URL_TOKEN, {
    client_id: config.google.clientId,
    client_secret: config.google.clientSecret,
    refresh_token: decifrar(conta.refresh_token_enc),
    grant_type: "refresh_token",
  });
  if (res.status === 400 || res.status === 401) {
    const erro = ((await res.json().catch(() => ({}))) as { error?: string }).error ?? `HTTP ${res.status}`;
    if (erro === "invalid_grant") {
      db.prepare(`UPDATE google_accounts SET status = 'expirada', last_error = ? WHERE phone = ?`).run("acesso revogado ou vencido", phone);
      cache.delete(phone);
      throw new GoogleExpirado();
    }
    throw new GoogleIndisponivel(erro);
  }
  if (!res.ok) throw new GoogleIndisponivel(`HTTP ${res.status}`);
  const t = (await res.json()) as { access_token: string; expires_in: number };
  cache.set(phone, { token: t.access_token, expira: agora + t.expires_in * 1000 });
  return t.access_token;
}

export function estado(db: Db, phone: string) {
  const conta = contaGoogle(db, phone);
  return {
    configurado: googleConfigurado(),
    conectada: conta?.status === "conectada",
    status: conta?.status ?? null,
    email: conta?.email ?? null,
    erro: conta?.last_error ?? null,
  };
}

/** Revoga no Google e apaga o acesso; revogar falhar nao impede apagar daqui. */
export async function desconectar(db: Db, phone: string) {
  const conta = contaGoogle(db, phone);
  if (conta && config.google.tokenKey) {
    try {
      await postForm(URL_REVOGAR, { token: decifrar(conta.refresh_token_enc) });
    } catch (err) {
      console.error(`[google ${phone}] revogar falhou; o acesso foi apagado daqui mesmo assim`, err);
    }
  }
  db.prepare(`DELETE FROM google_accounts WHERE phone = ?`).run(phone);
  cache.delete(phone);
  return !!conta;
}

export function limparAutorizacoes(db: Db, agora = new Date()) {
  db.prepare(`DELETE FROM google_auth WHERE expires_at < ?`).run(new Date(agora.getTime() - 86_400_000).toISOString());
}

// ---------- eventos ----------

async function agenda(db: Db, phone: string, metodo: string, caminho: string, corpo?: unknown): Promise<any> {
  for (let tentativa = 0; tentativa < 2; tentativa++) {
    const token = await accessToken(db, phone);
    const res = await chamarGoogle(`${URL_EVENTOS}${caminho}`, {
      method: metodo,
      headers: { authorization: `Bearer ${token}`, ...(corpo ? { "content-type": "application/json" } : {}) },
      body: corpo ? JSON.stringify(corpo) : undefined,
    });
    // Token revogado entre a renovacao e a chamada: renova uma vez e tenta de novo.
    if (res.status === 401 && tentativa === 0) {
      cache.delete(phone);
      continue;
    }
    if (res.status === 404 || res.status === 410) return null;
    if (!res.ok) throw new GoogleIndisponivel(`HTTP ${res.status}`);
    return res.status === 204 ? {} : res.json();
  }
  throw new GoogleIndisponivel("acesso recusado");
}

function paraEvento(g: any): Evento {
  const video = g.hangoutLink ?? g.conferenceData?.entryPoints?.find((e: { entryPointType: string }) => e.entryPointType === "video")?.uri;
  return {
    id: g.id,
    titulo: g.summary ?? "(sem título)",
    inicio: g.start?.dateTime ?? g.start?.date,
    fim: g.end?.dateTime ?? g.end?.date,
    diaInteiro: !g.start?.dateTime,
    convidados: (g.attendees ?? []).filter((a: { self?: boolean }) => !a.self).map((a: { email: string }) => a.email),
    linkVideo: video ?? null,
    linkGoogle: g.htmlLink ?? null,
  };
}

const quando = (d: Date) => ({ dateTime: d.toISOString(), timeZone: config.timezone });

export async function listarEventos(db: Db, phone: string, de: Date, ate: Date, busca?: string | null): Promise<Evento[]> {
  const q = new URLSearchParams({ timeMin: de.toISOString(), timeMax: ate.toISOString(), singleEvents: "true", orderBy: "startTime", maxResults: "50" });
  if (busca) q.set("q", busca);
  const r = await agenda(db, phone, "GET", `?${q}`);
  return ((r?.items ?? []) as unknown[]).filter((e: any) => e.status !== "cancelled").map(paraEvento);
}

export function eventosDoDia(db: Db, phone: string, dia: string) {
  const [y, m, d] = dia.split("-").map(Number);
  const amanha = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
  return listarEventos(db, phone, fromLocal(`${dia}T00:00`), fromLocal(`${amanha}T00:00`));
}

export async function conflitos(db: Db, phone: string, inicio: Date, fim: Date) {
  return (await listarEventos(db, phone, inicio, fim)).filter(
    (e) => !e.diaInteiro && new Date(e.inicio) < fim && new Date(e.fim) > inicio,
  );
}

export async function criarEvento(
  db: Db,
  phone: string,
  e: { titulo: string; inicio: Date; duracaoMin: number; convidados?: string[]; comVideo?: boolean },
): Promise<Evento> {
  const q = new URLSearchParams();
  if (e.convidados?.length) q.set("sendUpdates", "all");
  if (e.comVideo) q.set("conferenceDataVersion", "1");
  const corpo = {
    summary: e.titulo,
    start: quando(e.inicio),
    end: quando(new Date(e.inicio.getTime() + e.duracaoMin * 60_000)),
    attendees: e.convidados?.map((email) => ({ email })),
    conferenceData: e.comVideo
      ? { createRequest: { requestId: crypto.randomUUID(), conferenceSolutionKey: { type: "hangoutsMeet" } } }
      : undefined,
  };
  return paraEvento(await agenda(db, phone, "POST", q.size ? `?${q}` : "", corpo));
}

/** Move mantendo a duracao, se nenhuma for dada; o Google avisa os convidados. */
export async function moverEvento(db: Db, phone: string, id: string, inicio: Date, duracaoMin?: number | null) {
  const atual = await agenda(db, phone, "GET", `/${encodeURIComponent(id)}`);
  if (!atual) return null;
  const antes = paraEvento(atual);
  const duracao = duracaoMin ?? Math.round((new Date(antes.fim).getTime() - new Date(antes.inicio).getTime()) / 60_000);
  const depois = paraEvento(
    await agenda(db, phone, "PATCH", `/${encodeURIComponent(id)}?sendUpdates=all`, {
      start: quando(inicio),
      end: quando(new Date(inicio.getTime() + duracao * 60_000)),
    }),
  );
  return { antes, depois };
}

export async function apagarEvento(db: Db, phone: string, id: string) {
  return (await agenda(db, phone, "DELETE", `/${encodeURIComponent(id)}?sendUpdates=all`)) !== null;
}

export async function evento(db: Db, phone: string, id: string) {
  const g = await agenda(db, phone, "GET", `/${encodeURIComponent(id)}`);
  return g ? paraEvento(g) : null;
}
