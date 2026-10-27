import { z } from "zod";
import { AuthError } from "./auth.js";
import { entregar, type Envio } from "./avisos.js";
import { config } from "./config.js";
import type { Db, Repo } from "./db.js";
import { exigir, type Contexto } from "./permissoes.js";
import { formatLocal, fromLocal, localDate, nextOccurrence } from "./time.js";
import type { Situacao } from "./whatsapp.js";

const LIMITE_CONTA_DIA = 20;
const LIMITE_CONTATO_DIA = 3;
const DIAS_PARA_RESPONDER = 7;
const MAX_TEXTO = 500;

export type Recorrencia = "diario" | "semanal" | "mensal";
export type SituacaoMensagem = "enviada" | "entregue" | "lida" | "falhou" | "pulada";

export interface Contato {
  id: number;
  conta: string;
  name: string;
  phone: string;
  created_by: string;
  created_at: string;
}

export interface PedidoEnvio {
  id: number;
  conta: string;
  created_by: string;
  contact_id: number;
  text: string;
  next_run_at: string | null;
  recurrence: Recorrencia | null;
  status: "ativo" | "concluido" | "cancelado";
  created_at: string;
}

export interface MensagemContato {
  id: number;
  send_id: number;
  conta: string;
  phone: string;
  wamid: string | null;
  status: SituacaoMensagem;
  error: string | null;
  sent_at: string;
  reply_text: string | null;
  replied_at: string | null;
  ack_sent_on: string | null;
}

export function prepararTabelasContatos(db: Db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS contacts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conta TEXT NOT NULL,
      name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 60),
      phone TEXT NOT NULL CHECK (length(phone) BETWEEN 10 AND 15),
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE (conta, phone)
    );
    CREATE TABLE IF NOT EXISTS contact_sends (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conta TEXT NOT NULL,
      created_by TEXT NOT NULL,
      contact_id INTEGER NOT NULL,
      text TEXT NOT NULL CHECK (length(text) BETWEEN 1 AND 500),
      next_run_at TEXT,
      recurrence TEXT CHECK (recurrence IN ('diario', 'semanal', 'mensal')),
      status TEXT NOT NULL CHECK (status IN ('ativo', 'concluido', 'cancelado')),
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_contact_sends_proximo ON contact_sends (status, next_run_at);
    CREATE TABLE IF NOT EXISTS contact_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      send_id INTEGER NOT NULL,
      conta TEXT NOT NULL,
      phone TEXT NOT NULL,
      wamid TEXT,
      status TEXT NOT NULL CHECK (status IN ('enviada', 'entregue', 'lida', 'falhou', 'pulada')),
      error TEXT,
      sent_at TEXT NOT NULL,
      reply_text TEXT,
      replied_at TEXT,
      ack_sent_on TEXT
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_contact_messages_wamid ON contact_messages (wamid) WHERE wamid IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_contact_messages_conta ON contact_messages (conta, sent_at);
    CREATE INDEX IF NOT EXISTS idx_contact_messages_phone ON contact_messages (phone, sent_at);
  `);
}

// ---------- contato ----------

/** Brasileiro sem DDI ganha o 55; fora de 10 a 15 digitos nao e telefone. */
export function telefoneComDdi(texto: string): string | null {
  const d = texto.replace(/\D/g, "");
  if (d.length < 10 || d.length > 15) return null;
  return d.length <= 11 ? `55${d}` : d;
}

const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

export function acharContato(db: Db, conta: string, nome: string): { um: Contato } | { varios: Contato[] } | { nenhum: true } {
  const alvo = semAcento(nome);
  const todos = db.prepare(`SELECT * FROM contacts WHERE conta = ? ORDER BY name`).all(conta) as Contato[];
  const exatos = todos.filter((c) => semAcento(c.name) === alvo);
  const achados = exatos.length ? exatos : todos.filter((c) => semAcento(c.name).includes(alvo));
  if (achados.length === 1) return { um: achados[0] };
  if (achados.length > 1) return { varios: achados };
  return { nenhum: true };
}

export function salvarContato(db: Db, ctx: Contexto, nome: string, telefone: string) {
  db.prepare(
    `INSERT INTO contacts (conta, name, phone, created_by, created_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (conta, phone) DO UPDATE SET name = excluded.name`,
  ).run(ctx.conta, nome.trim().slice(0, 60), telefone, ctx.membro, new Date().toISOString());
  return db.prepare(`SELECT * FROM contacts WHERE conta = ? AND phone = ?`).get(ctx.conta, telefone) as Contato;
}

const nomeDe = (db: Db, phone: string) =>
  (db.prepare(`SELECT name FROM users WHERE phone = ?`).get(phone) as { name: string | null } | undefined)?.name ?? null;

/** Identificacao e PARAR sao de codigo: o modelo escreve so o miolo. */
export const textoFinal = (contato: string, usuario: string | null, texto: string) =>
  `Oi, ${contato.trim().split(/\s+/)[0]}! Aqui e o assessor de ${usuario ?? "um conhecido seu"}. ${texto.trim()} Para nao receber mais mensagens do assessor, responda PARAR.`;

const emOptout = (db: Db, phone: string) => !!db.prepare(`SELECT 1 FROM client_optouts WHERE client_phone = ?`).get(phone);

// ---------- pedido ----------

const pedidoSchema = z.object({
  contato: z.string().trim().min(1).max(60),
  telefone: z.string().nullish(),
  texto: z.string().trim().min(1).max(MAX_TEXTO),
  dataHora: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "use AAAA-MM-DDTHH:mm").nullish(),
  recorrencia: z.enum(["diario", "semanal", "mensal"]).nullish(),
  confirmado: z.boolean(),
});

export type DadosPedido = z.input<typeof pedidoSchema>;

const inicioDoDia = (agora: Date) => fromLocal(`${localDate(agora)}T00:00`).toISOString();

function enviadasHoje(db: Db, conta: string, agora: Date, phone?: string) {
  return (
    db
      .prepare(
        `SELECT COUNT(*) AS n FROM contact_messages WHERE conta = ? AND status != 'pulada' AND sent_at >= ? AND (? IS NULL OR phone = ?)`,
      )
      .get(conta, inicioDoDia(agora), phone ?? null, phone ?? null) as { n: number }
  ).n;
}

function motivoDoLimite(db: Db, conta: string, phone: string, agora: Date) {
  if (enviadasHoje(db, conta, agora) >= LIMITE_CONTA_DIA) return `o limite de ${LIMITE_CONTA_DIA} mensagens a contatos por dia ja foi atingido`;
  if (enviadasHoje(db, conta, agora, phone) >= LIMITE_CONTATO_DIA) return `ja foram ${LIMITE_CONTATO_DIA} mensagens para esse contato hoje`;
  return null;
}

const REPETE: Record<Recorrencia, string> = { diario: "todo dia", semanal: "toda semana", mensal: "todo mes" };
const final = (phone: string) => phone.slice(-4);

/** Sem `confirmado` so devolve a previa: nada e gravado nem enviado em nome de ninguem sem o sim. */
export function pedirEnvio(db: Db, ctx: Contexto, dados: DadosPedido, agora: Date): { ok: boolean; texto: string; envio?: PedidoEnvio } {
  exigir(ctx, "agenda");
  const r = pedidoSchema.safeParse(dados);
  if (!r.success) return { ok: false, texto: `Pedido invalido: ${r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}` };
  const d = r.data;

  let nome = d.contato;
  let phone: string;
  if (d.telefone) {
    const t = telefoneComDdi(d.telefone);
    if (!t) return { ok: false, texto: "Esse telefone nao parece valido. Pergunte o WhatsApp com DDD." };
    phone = t;
  } else {
    const achado = acharContato(db, ctx.conta, d.contato);
    if ("nenhum" in achado) return { ok: false, texto: `Nao tenho ${d.contato} nos contatos. Pergunte o WhatsApp com DDD e chame de novo com o telefone.` };
    if ("varios" in achado) {
      return { ok: false, texto: `Ha mais de um contato com esse nome: ${achado.varios.map((c) => `${c.name} (final ${final(c.phone)})`).join(", ")}. Pergunte qual.` };
    }
    nome = achado.um.name;
    phone = achado.um.phone;
  }

  if (emOptout(db, phone)) return { ok: false, texto: `${nome} pediu para nao receber mensagens do assessor. Nada foi enviado.` };
  const quando = d.dataHora ? fromLocal(d.dataHora) : agora;
  if (quando.getTime() < agora.getTime() - 60_000) return { ok: false, texto: `Esse horario (${formatLocal(quando)}) ja passou. Confirme a data com o usuario.` };
  const agoraMesmo = quando.getTime() <= agora.getTime() + 60_000;
  if (agoraMesmo) {
    const motivo = motivoDoLimite(db, ctx.conta, phone, agora);
    if (motivo) return { ok: false, texto: `Nao da para enviar agora: ${motivo}. Tente amanha ou agende para outro dia.` };
  }

  const mensagem = textoFinal(nome, ctx.nome, d.texto);
  const quandoTexto = `${agoraMesmo ? "agora" : formatLocal(quando)}${d.recorrencia ? `, repete ${REPETE[d.recorrencia]}` : ""}`;
  if (!d.confirmado) {
    const janela = config.whatsapp.noticeTemplate
      ? ""
      : `\nSem o modelo aprovado da Meta, so chega se ${nome} tiver escrito para este numero nas ultimas 24 horas.`;
    return {
      ok: true,
      texto: `Previa. Mostre ao usuario e so chame de novo com confirmado true depois do sim dele.\nPara: ${nome} (final ${final(phone)})\nQuando: ${quandoTexto}\nMensagem: "${mensagem}"${janela}`,
    };
  }

  const contato = salvarContato(db, ctx, nome, phone);
  const id = Number(
    db
      .prepare(
        `INSERT INTO contact_sends (conta, created_by, contact_id, text, next_run_at, recurrence, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 'ativo', ?)`,
      )
      .run(ctx.conta, ctx.membro, contato.id, d.texto.trim(), quando.toISOString(), d.recorrencia ?? null, agora.toISOString()).lastInsertRowid,
  );
  const envio = db.prepare(`SELECT * FROM contact_sends WHERE id = ?`).get(id) as PedidoEnvio;
  const como = agoraMesmo ? "Sai em ate 30 segundos" : `Sai ${formatLocal(quando)}`;
  return { ok: true, envio, texto: `Combinado (#${id}). ${como}${d.recorrencia ? ` e repete ${REPETE[d.recorrencia]}` : ""} para ${nome}. Aviso se nao chegar ou se responderem.` };
}

export interface EnvioVisto extends PedidoEnvio {
  contato: string;
}

export function listarEnvios(db: Db, ctx: Contexto, contato?: string | null) {
  exigir(ctx, "agenda");
  const alvo = contato ? semAcento(contato) : null;
  return (
    db
      .prepare(
        `SELECT s.*, c.name AS contato FROM contact_sends s JOIN contacts c ON c.id = s.contact_id
         WHERE s.conta = ? AND s.status = 'ativo' ORDER BY s.next_run_at, s.id`,
      )
      .all(ctx.conta) as EnvioVisto[]
  ).filter((e) => !alvo || semAcento(e.contato).includes(alvo));
}

export interface MensagemVista extends MensagemContato {
  contato: string;
}

export function ultimasMensagens(db: Db, ctx: Contexto, contato: string | null | undefined, limite: number) {
  exigir(ctx, "agenda");
  const alvo = contato ? semAcento(contato) : null;
  return (
    db
      .prepare(
        `SELECT m.*, c.name AS contato FROM contact_messages m JOIN contact_sends s ON s.id = m.send_id JOIN contacts c ON c.id = s.contact_id
         WHERE m.conta = ? ORDER BY m.sent_at DESC, m.id DESC`,
      )
      .all(ctx.conta) as MensagemVista[]
  )
    .filter((m) => !alvo || semAcento(m.contato).includes(alvo))
    .slice(0, limite);
}

export function envioDaConta(db: Db, ctx: Contexto, id: number) {
  exigir(ctx, "agenda");
  const e = db
    .prepare(`SELECT s.*, c.name AS contato FROM contact_sends s JOIN contacts c ON c.id = s.contact_id WHERE s.id = ?`)
    .get(id) as EnvioVisto | undefined;
  if (!e || e.conta !== ctx.conta || e.status !== "ativo") throw new AuthError(404, `Envio #${id} não encontrado.`);
  return e;
}

export function cancelarEnvio(db: Db, ctx: Contexto, id: number) {
  const e = envioDaConta(db, ctx, id);
  db.prepare(`UPDATE contact_sends SET status = 'cancelado', next_run_at = NULL WHERE id = ?`).run(id);
  return e;
}

// ---------- envio ----------

/** Aviso a quem pediu o envio; mesma fila e registro dos avisos da US3. */
const avisar = (db: Db, send: Envio, phone: string, chave: string, texto: string, agora: Date) =>
  entregar(db, send, phone, "contatos", chave, texto, agora);

function gravarMensagem(db: Db, e: EnvioVisto & { phone: string }, status: SituacaoMensagem, agora: Date, wamid: string | null, erro: string | null) {
  return Number(
    db
      .prepare(`INSERT INTO contact_messages (send_id, conta, phone, wamid, status, error, sent_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(e.id, e.conta, e.phone, wamid, status, erro, agora.toISOString()).lastInsertRowid,
  );
}

function avancar(db: Db, e: PedidoEnvio, agora: Date) {
  let proximo = e.next_run_at ? nextOccurrence(new Date(e.next_run_at), e.recurrence) : null;
  // Servidor parado nao gera enxurrada: pula as ocorrencias que ja passaram.
  while (proximo && proximo <= agora) proximo = nextOccurrence(proximo, e.recurrence);
  if (proximo) db.prepare(`UPDATE contact_sends SET next_run_at = ? WHERE id = ?`).run(proximo.toISOString(), e.id);
  else db.prepare(`UPDATE contact_sends SET status = 'concluido', next_run_at = NULL WHERE id = ?`).run(e.id);
}

export async function enviarVencidos(repo: Repo, send: Envio, now = new Date()) {
  const db = repo.db;
  const vencidos = db
    .prepare(
      `SELECT s.*, c.name AS contato, c.phone FROM contact_sends s JOIN contacts c ON c.id = s.contact_id
       WHERE s.status = 'ativo' AND s.next_run_at <= ? ORDER BY s.next_run_at, s.id`,
    )
    .all(now.toISOString()) as (EnvioVisto & { phone: string })[];
  const hoje = localDate(now);
  for (const e of vencidos) {
    if (emOptout(db, e.phone)) {
      db.prepare(`UPDATE contact_sends SET status = 'cancelado', next_run_at = NULL WHERE id = ?`).run(e.id);
      await avisar(db, send, e.created_by, `optout:${e.id}`, `🚫 ${e.contato} pediu para nao receber mais mensagens do assessor. Cancelei o envio #${e.id}.`, now);
      continue;
    }
    const motivo = motivoDoLimite(db, e.conta, e.phone, now);
    if (motivo) {
      gravarMensagem(db, e, "pulada", now, null, motivo);
      await avisar(db, send, e.created_by, `limite:${e.id}:${hoje}`, `⚠️ A mensagem para ${e.contato} nao saiu hoje: ${motivo}.`, now);
      avancar(db, e, now);
      continue;
    }
    try {
      const wamid = await send(e.phone, textoFinal(e.contato, nomeDe(db, e.created_by), e.text));
      gravarMensagem(db, e, "enviada", now, wamid || null, null);
    } catch (err) {
      const erro = (err as Error).message.slice(0, 200);
      const id = gravarMensagem(db, e, "falhou", now, null, erro);
      await avisar(db, send, e.created_by, `falha:${id}`, `⚠️ A mensagem para ${e.contato} nao foi entregue: o WhatsApp recusou o envio.`, now);
    }
    avancar(db, e, now);
  }
}

const ORDEM: Record<string, number> = { enviada: 0, entregue: 1, lida: 2 };
const DA_META: Record<string, SituacaoMensagem> = { sent: "enviada", delivered: "entregue", read: "lida", failed: "falhou" };

/** Os `statuses` chegam fora de ordem as vezes: lida nunca volta para entregue. */
export async function atualizarSituacoes(repo: Repo, send: Envio, statuses: Situacao[], agora = new Date()) {
  const db = repo.db;
  for (const s of statuses) {
    const nova = DA_META[s.status];
    if (!nova) continue;
    const m = db
      .prepare(
        `SELECT m.*, s.created_by, c.name AS contato FROM contact_messages m JOIN contact_sends s ON s.id = m.send_id
         JOIN contacts c ON c.id = s.contact_id WHERE m.wamid = ?`,
      )
      .get(s.id) as (MensagemVista & { created_by: string }) | undefined;
    if (!m || m.status === "falhou") continue;
    if (nova === "falhou") {
      db.prepare(`UPDATE contact_messages SET status = 'falhou', error = ? WHERE id = ?`).run(s.erro, m.id);
      await avisar(db, send, m.created_by, `falha:${m.id}`, `⚠️ A mensagem para ${m.contato} nao foi entregue: ${s.erro ?? "o WhatsApp recusou"}.`, agora);
    } else if (ORDEM[nova] > (ORDEM[m.status] ?? 0)) {
      db.prepare(`UPDATE contact_messages SET status = ? WHERE id = ?`).run(nova, m.id);
    }
  }
}

// ---------- respostas do contato ----------

/** Recebeu mensagem de alguma conta na ultima semana, ou tem envio recorrente ativo. */
export function contatoAtivoDe(db: Db, phone: string, agora: Date) {
  const desde = new Date(agora.getTime() - DIAS_PARA_RESPONDER * 86_400_000).toISOString();
  return !!(
    db.prepare(`SELECT 1 FROM contact_messages WHERE phone = ? AND status != 'pulada' AND sent_at >= ? LIMIT 1`).get(phone, desde) ||
    db
      .prepare(
        `SELECT 1 FROM contact_sends s JOIN contacts c ON c.id = s.contact_id
         WHERE c.phone = ? AND s.status = 'ativo' AND s.recurrence IS NOT NULL LIMIT 1`,
      )
      .get(phone)
  );
}

const normalizar = (s: string) => semAcento(s).replace(/[^a-z0-9 ]/g, " ").trim().replace(/\s+/g, " ");

/**
 * Sem IA: a fala de quem nao e usuario nao passa pelo modelo e nao ve nada da conta. PARAR entra na
 * lista unica de opt-out; o resto e repassado literal a quem pediu o envio.
 */
export async function responderContato(repo: Repo, send: Envio, phone: string, texto: string, agora: Date) {
  const db = repo.db;
  if (["parar", "pare", "stop"].includes(normalizar(texto))) {
    db.prepare(`INSERT OR IGNORE INTO client_optouts (client_phone, created_at) VALUES (?, ?)`).run(phone, agora.toISOString());
    const ativos = db
      .prepare(
        `SELECT s.id, s.created_by, c.name AS contato FROM contact_sends s JOIN contacts c ON c.id = s.contact_id
         WHERE c.phone = ? AND s.status = 'ativo'`,
      )
      .all(phone) as { id: number; created_by: string; contato: string }[];
    const pediram = db
      .prepare(
        `SELECT DISTINCT s.created_by, c.name AS contato FROM contact_messages m JOIN contact_sends s ON s.id = m.send_id
         JOIN contacts c ON c.id = s.contact_id WHERE m.phone = ?`,
      )
      .all(phone) as { created_by: string; contato: string }[];
    for (const a of ativos) db.prepare(`UPDATE contact_sends SET status = 'cancelado', next_run_at = NULL WHERE id = ?`).run(a.id);
    try {
      await send(phone, "Combinado, nao mando mais mensagens.");
    } catch (err) {
      console.error(`[contato ${phone}] resposta ao PARAR nao saiu`, err);
    }
    const avisados = new Map<string, string>();
    for (const p of [...pediram, ...ativos]) avisados.set(p.created_by, p.contato);
    for (const [quem, contato] of avisados) {
      await avisar(db, send, quem, `parar:${phone}:${localDate(agora)}`, `🚫 ${contato} pediu para nao receber mais mensagens. Cancelei os envios para ele.`, agora);
    }
    return true;
  }

  const m = db
    .prepare(
      `SELECT m.*, s.created_by, c.name AS contato FROM contact_messages m JOIN contact_sends s ON s.id = m.send_id
       JOIN contacts c ON c.id = s.contact_id WHERE m.phone = ? AND m.status != 'pulada' ORDER BY m.sent_at DESC, m.id DESC LIMIT 1`,
    )
    .get(phone) as (MensagemVista & { created_by: string }) | undefined;
  if (!m) return false;
  const resposta = texto.trim().slice(0, MAX_TEXTO);
  db.prepare(`UPDATE contact_messages SET reply_text = ?, replied_at = ? WHERE id = ?`).run(resposta || null, agora.toISOString(), m.id);
  await avisar(
    db,
    send,
    m.created_by,
    `resposta:${m.id}:${agora.toISOString()}`,
    resposta ? `💬 ${m.contato} respondeu: "${resposta}"` : `💬 ${m.contato} respondeu com algo que nao e texto. Veja direto com ele.`,
    agora,
  );
  const hoje = localDate(agora);
  const jaAvisado = db.prepare(`SELECT 1 FROM contact_messages WHERE phone = ? AND ack_sent_on = ? LIMIT 1`).get(phone, hoje);
  if (!jaAvisado && !emOptout(db, phone)) {
    db.prepare(`UPDATE contact_messages SET ack_sent_on = ? WHERE id = ?`).run(hoje, m.id);
    try {
      await send(phone, `Recebido! Vou repassar para ${nomeDe(db, m.created_by) ?? "quem te escreveu"}.`);
    } catch (err) {
      console.error(`[contato ${phone}] confirmacao de recebimento nao saiu`, err);
    }
  }
  return true;
}

export function limparContatos(db: Db, agora: Date) {
  db.prepare(`UPDATE contact_messages SET reply_text = NULL WHERE sent_at < ? AND reply_text IS NOT NULL`).run(
    new Date(agora.getTime() - 90 * 86_400_000).toISOString(),
  );
}
