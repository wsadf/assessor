import crypto from "node:crypto";
import { z } from "zod";
import { AuthError } from "./auth.js";
import { addDias, entregar, preferencias, type Envio } from "./avisos.js";
import { config } from "./config.js";
import { resolverContexto } from "./conta.js";
import type { Db, Repo } from "./db.js";
import {
  apagarEvento,
  conflitos,
  criarEvento,
  estado as estadoGoogle,
  eventosDoDia,
  GoogleExpirado,
  GoogleIndisponivel,
  GoogleNaoConectado,
  GoogleNaoConfigurado,
  listarEventos,
  moverEvento,
  type Evento,
} from "./google.js";
import { exigir, type Contexto } from "./permissoes.js";
import { fromLocal, localDate } from "./time.js";

export const DURACOES = [15, 30, 45, 60, 90, 120] as const;
const ATIVOS = `('reservando', 'agendado', 'confirmado', 'remarcando')`;
const ANTES_DO_LEMBRETE_MIN = 60;
const DIAS_PARA_REMARCAR = 14;

export type SituacaoAgendamento = "reservando" | "agendado" | "confirmado" | "remarcando" | "cancelado";

export interface Pagina {
  id: number;
  phone: string;
  conta: string;
  slug: string;
  display_name: string;
  durations: string;
  weekdays: string;
  window_start: string;
  window_end: string;
  min_notice_hours: number;
  horizon_days: number;
  status: "ativa" | "pausada";
  created_at: string;
}

export interface Agendamento {
  id: number;
  page_id: number;
  owner_phone: string;
  client_name: string;
  client_email: string;
  client_phone: string;
  client_tz: string | null;
  starts_at: string;
  ends_at: string;
  status: SituacaoAgendamento;
  google_event_id: string | null;
  reschedule_options: string | null;
  confirmation_sent_at: string | null;
  confirmation_failed: number;
  client_ip_hash: string | null;
  created_at: string;
}

export interface Horario {
  inicio: string;
  fim: string;
}

export function prepararTabelasAgendamento(db: Db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS booking_pages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      phone TEXT NOT NULL UNIQUE,
      conta TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL CHECK (length(display_name) BETWEEN 2 AND 60),
      durations TEXT NOT NULL,
      weekdays TEXT NOT NULL,
      window_start TEXT NOT NULL,
      window_end TEXT NOT NULL CHECK (window_end > window_start),
      min_notice_hours INTEGER NOT NULL DEFAULT 12 CHECK (min_notice_hours BETWEEN 0 AND 168),
      horizon_days INTEGER NOT NULL DEFAULT 30 CHECK (horizon_days BETWEEN 1 AND 90),
      status TEXT NOT NULL CHECK (status IN ('ativa', 'pausada')),
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS bookings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      page_id INTEGER NOT NULL,
      owner_phone TEXT NOT NULL,
      client_name TEXT NOT NULL CHECK (client_name = '' OR length(client_name) BETWEEN 2 AND 80),
      client_email TEXT NOT NULL,
      client_phone TEXT NOT NULL,
      client_tz TEXT,
      starts_at TEXT NOT NULL,
      ends_at TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('reservando', 'agendado', 'confirmado', 'remarcando', 'cancelado')),
      google_event_id TEXT,
      reschedule_options TEXT,
      confirmation_sent_at TEXT,
      confirmation_failed INTEGER NOT NULL DEFAULT 0 CHECK (confirmation_failed IN (0, 1)),
      client_ip_hash TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_bookings_pagina ON bookings (page_id, status, starts_at);
    CREATE INDEX IF NOT EXISTS idx_bookings_cliente ON bookings (client_phone, status, starts_at);
    CREATE TABLE IF NOT EXISTS client_optouts (
      client_phone TEXT PRIMARY KEY,
      created_at TEXT NOT NULL
    );
  `);
}

// ---------- pagina ----------

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "use HH:mm");

export const paginaSchema = z
  .object({
    nome: z.string().trim().min(2, "o nome precisa ter de 2 a 60 letras").max(60, "o nome precisa ter de 2 a 60 letras"),
    duracoes: z
      .array(z.number().int().refine((d) => (DURACOES as readonly number[]).includes(d), "duração fora de 15, 30, 45, 60, 90 e 120"))
      .min(1, "escolha pelo menos uma duração")
      .max(6),
    dias: z.array(z.number().int().min(0).max(6)).min(1, "escolha pelo menos um dia").max(7),
    inicio: hhmm,
    fim: hhmm,
    antecedenciaHoras: z.number().int().min(0).max(168).default(12),
    horizonteDias: z.number().int().min(1).max(90).default(30),
    ativa: z.boolean(),
  })
  .refine((p) => p.fim > p.inicio, { message: "o fim do atendimento precisa ser depois do início", path: ["fim"] });

export type DadosPagina = z.input<typeof paginaSchema>;

const ALFABETO = "abcdefghijklmnopqrstuvwxyz0123456789";
const gerarSlug = () => Array.from({ length: 10 }, () => ALFABETO[crypto.randomInt(ALFABETO.length)]).join("");

export const duracoesDa = (p: Pagina) => JSON.parse(p.durations) as number[];
export const diasDa = (p: Pagina) => JSON.parse(p.weekdays) as number[];

export const paginaDe = (db: Db, phone: string) => db.prepare(`SELECT * FROM booking_pages WHERE phone = ?`).get(phone) as Pagina | undefined;
export const paginaPorSlug = (db: Db, slug: string) => db.prepare(`SELECT * FROM booking_pages WHERE slug = ?`).get(slug) as Pagina | undefined;
const paginaPorId = (db: Db, id: number) => db.prepare(`SELECT * FROM booking_pages WHERE id = ?`).get(id) as Pagina;

/** O que o cliente pode abrir: pagina ativa de alguem com o Google conectado. */
export function paginaPublica(db: Db, slug: string) {
  const p = paginaPorSlug(db, slug);
  return p && p.status === "ativa" && estadoGoogle(db, p.phone).conectada ? p : null;
}

export const linkDaPagina = (p: Pagina) => `${config.google.painelUrl}/agendar/${p.slug}`;

export function salvarPagina(db: Db, ctx: Contexto, dados: DadosPagina) {
  exigir(ctx, "agenda");
  if (!estadoGoogle(db, ctx.membro).conectada) throw new AuthError(409, "Conecte o Google Agenda antes de ativar a página.");
  const r = paginaSchema.safeParse(dados);
  if (!r.success) throw new AuthError(400, r.error.issues.map((i) => i.message).join("; "));
  const d = r.data;
  db.prepare(
    `INSERT INTO booking_pages (phone, conta, slug, display_name, durations, weekdays, window_start, window_end,
       min_notice_hours, horizon_days, status, created_at)
     VALUES (@phone, @conta, @slug, @nome, @duracoes, @dias, @inicio, @fim, @antecedencia, @horizonte, @status, @agora)
     ON CONFLICT(phone) DO UPDATE SET conta = excluded.conta, display_name = excluded.display_name, durations = excluded.durations,
       weekdays = excluded.weekdays, window_start = excluded.window_start, window_end = excluded.window_end,
       min_notice_hours = excluded.min_notice_hours, horizon_days = excluded.horizon_days, status = excluded.status`,
  ).run({
    phone: ctx.membro,
    conta: ctx.conta,
    slug: gerarSlug(),
    nome: d.nome,
    duracoes: JSON.stringify([...new Set(d.duracoes)].sort((a, b) => a - b)),
    dias: JSON.stringify([...new Set(d.dias)].sort()),
    inicio: d.inicio,
    fim: d.fim,
    antecedencia: d.antecedenciaHoras,
    horizonte: d.horizonteDias,
    status: d.ativa ? "ativa" : "pausada",
    agora: new Date().toISOString(),
  });
  return paginaDe(db, ctx.membro)!;
}

/** O link antigo para de funcionar na hora: serve para quando ele vazou. */
export function novoSlug(db: Db, ctx: Contexto) {
  exigir(ctx, "agenda");
  if (!paginaDe(db, ctx.membro)) throw new AuthError(404, "Você ainda não tem página de agendamento.");
  db.prepare(`UPDATE booking_pages SET slug = ? WHERE phone = ?`).run(gerarSlug(), ctx.membro);
  return paginaDe(db, ctx.membro)!;
}

// ---------- horarios ----------

const diaDaSemana = (dia: string) => new Date(`${dia}T12:00:00Z`).getUTCDay();
const minutos = (n: number) => n * 60_000;
const limiteDe = (p: Pagina, agora: Date) => new Date(agora.getTime() + p.min_notice_hours * 3_600_000);
const passoDe = (duracao: number) => (duracao === 15 ? 15 : 30);

/** Datas do horizonte que caem nos dias de atendimento e ainda tem janela depois da antecedencia. */
export function diasDisponiveis(p: Pagina, agora: Date) {
  const limite = limiteDe(p, agora);
  const ultimo = localDate(new Date(agora.getTime() + p.horizon_days * 86_400_000));
  const semana = diasDa(p);
  const dias: string[] = [];
  for (let dia = localDate(limite); dia <= ultimo; dia = addDias(dia, 1)) {
    if (semana.includes(diaDaSemana(dia)) && fromLocal(`${dia}T${p.window_end}`) > limite) dias.push(dia);
  }
  return dias;
}

const sobrepoe = (a: { inicio: Date; fim: Date }, inicio: string | Date, fim: string | Date) =>
  a.inicio < new Date(fim) && a.fim > new Date(inicio);

function reservasNoIntervalo(db: Db, pageId: number, de: Date, ate: Date, exceto?: number) {
  return db
    .prepare(`SELECT starts_at, ends_at FROM bookings WHERE page_id = ? AND status IN ${ATIVOS} AND starts_at < ? AND ends_at > ? AND id != ?`)
    .all(pageId, ate.toISOString(), de.toISOString(), exceto ?? -1) as { starts_at: string; ends_at: string }[];
}

/** Inicios do dia no passo da duracao; sem consultar nada, so a configuracao da pagina. */
function iniciosDoDia(p: Pagina, dia: string, duracao: number, agora: Date) {
  const limite = limiteDe(p, agora);
  const fimJanela = fromLocal(`${dia}T${p.window_end}`);
  const inicios: Date[] = [];
  for (let t = fromLocal(`${dia}T${p.window_start}`); t.getTime() + minutos(duracao) <= fimJanela.getTime(); t = new Date(t.getTime() + minutos(passoDe(duracao)))) {
    if (t >= limite) inicios.push(t);
  }
  return inicios;
}

function livres(db: Db, p: Pagina, dia: string, duracao: number, agora: Date, eventos: Evento[], exceto?: number): Horario[] {
  const ocupados = [
    ...eventos.filter((e) => !e.diaInteiro).map((e) => ({ inicio: new Date(e.inicio), fim: new Date(e.fim) })),
    ...reservasNoIntervalo(db, p.id, fromLocal(`${dia}T00:00`), fromLocal(`${addDias(dia, 1)}T00:00`), exceto).map((r) => ({
      inicio: new Date(r.starts_at),
      fim: new Date(r.ends_at),
    })),
  ];
  return iniciosDoDia(p, dia, duracao, agora)
    .map((t) => ({ inicio: t, fim: new Date(t.getTime() + minutos(duracao)) }))
    .filter((h) => !ocupados.some((o) => sobrepoe(o, h.inicio, h.fim)))
    .map((h) => ({ inicio: h.inicio.toISOString(), fim: h.fim.toISOString() }));
}

/** Confere a consulta antes de gastar uma chamada ao Google. */
export function validarConsulta(p: Pagina, dia: string, duracao: number, agora: Date) {
  if (!duracoesDa(p).includes(duracao)) throw new AuthError(400, "Duração fora das oferecidas.");
  if (!diasDisponiveis(p, agora).includes(dia)) throw new AuthError(400, "Dia fora dos disponíveis.");
}

/** Nunca devolve nada dos outros compromissos alem de que o horario esta ocupado. */
export async function horariosLivres(db: Db, p: Pagina, dia: string, duracao: number, agora: Date): Promise<Horario[]> {
  return livres(db, p, dia, duracao, agora, await eventosDoDia(db, p.phone, dia));
}

// ---------- textos ----------

const fmt = (opcoes: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("pt-BR", { timeZone: config.timezone, ...opcoes });
const semFeira = (s: string) => s.replace("-feira", "");
export const diaTexto = (iso: string) =>
  `${semFeira(fmt({ weekday: "long" }).format(new Date(iso)))}, ${fmt({ day: "2-digit", month: "2-digit" }).format(new Date(iso))}`;
export const horaTexto = (iso: string) => fmt({ hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
const curto = (iso: string) =>
  `${semFeira(fmt({ weekday: "short" }).format(new Date(iso))).replace(".", "")} ${fmt({ day: "2-digit", month: "2-digit" }).format(new Date(iso))} ${horaTexto(iso)}`;
const primeiroNome = (nome: string) => nome.trim().split(/\s+/)[0];

/** Hora ao cliente no fuso de quem atende, com o nome do fuso se ele reservou de outro. */
const horaCliente = (b: Agendamento, iso = b.starts_at) => `${horaTexto(iso)}${b.client_tz ? ` (horario de ${config.timezone})` : ""}`;

export const textosCliente = {
  vespera: (b: Agendamento, nome: string) =>
    `Oi, ${primeiroNome(b.client_name)}! Confirmando seu horario com ${nome}: ${diaTexto(b.starts_at)}, as ${horaCliente(b)}. Responda 1 para confirmar, 2 se precisar remarcar ou PARAR para nao receber mais mensagens.`,
  confirmado: (b: Agendamento, nome: string) => `Confirmado! ${nome} te espera ${diaTexto(b.starts_at)}, as ${horaCliente(b)}.`,
  pediuRemarcar: (nome: string) => `Certo, avisei ${nome}. Logo voce recebe novas opcoes.`,
  opcoes: (b: Agendamento, nome: string, opcoes: Horario[]) =>
    `${nome} precisou remarcar o horario de ${diaTexto(b.starts_at)} as ${horaCliente(b)}. Opcoes: ${opcoes.map((o, i) => `${i + 1}) ${curto(o.inicio)}`).join(" ")}. Responda com o numero, ou 0 se nenhuma servir.`,
  escolheu: (b: Agendamento) => `Prontinho! ${diaTexto(b.starts_at)}, as ${horaCliente(b)}. Te lembro na vespera.`,
  ocupado: (nome: string) => `Esse horario acabou de ser ocupado. Avisei ${nome}, que vai te mandar novas opcoes.`,
  cancelado: (b: Agendamento, nome: string, link: string) =>
    `${nome} cancelou o horario de ${diaTexto(b.starts_at)} as ${horaCliente(b)}. Se quiser marcar outro: ${link}`,
  parar: () => "Combinado, nao mando mais mensagens.",
  outro: (nome: string) => `Responda 1 para confirmar, 2 para remarcar ou PARAR. Para outros assuntos, fale direto com ${nome}.`,
};

export const textosDono = {
  novo: (b: Agendamento) => `📆 ${b.client_name} marcou ${diaTexto(b.starts_at)} as ${horaTexto(b.starts_at)} (${duracaoDe(b)} min).`,
  confirmou: (b: Agendamento) => `✅ ${primeiroNome(b.client_name)} confirmou ${diaTexto(b.starts_at)} as ${horaTexto(b.starts_at)}.`,
  pediuRemarcar: (b: Agendamento) => `🔁 ${primeiroNome(b.client_name)} pediu para remarcar ${diaTexto(b.starts_at)} as ${horaTexto(b.starts_at)}.`,
  escolheu: (b: Agendamento) => `🔁 ${primeiroNome(b.client_name)} escolheu ${diaTexto(b.starts_at)} as ${horaTexto(b.starts_at)}.`,
  nenhumaOpcao: (b: Agendamento) =>
    `🔁 Nenhuma das opcoes serviu para ${primeiroNome(b.client_name)}. O horario de ${diaTexto(b.starts_at)} as ${horaTexto(b.starts_at)} continua marcado; combine outro com ela.`,
  semModelo: (b: Agendamento) => `⚠️ Nao consegui mandar a confirmacao para ${primeiroNome(b.client_name)}; o WhatsApp precisa do modelo aprovado.`,
  envioRecusado: (b: Agendamento) => `⚠️ Nao consegui mandar a confirmacao para ${primeiroNome(b.client_name)}; o WhatsApp recusou o envio.`,
};

const duracaoDe = (b: Agendamento) => Math.round((new Date(b.ends_at).getTime() - new Date(b.starts_at).getTime()) / 60_000);

// ---------- envio ----------

const emOptout = (db: Db, phone: string) => !!db.prepare(`SELECT 1 FROM client_optouts WHERE client_phone = ?`).get(phone);

/** Quem respondeu PARAR nao recebe mais nada; devolve se a mensagem saiu. */
export async function enviarAoCliente(db: Db, send: Envio, b: Agendamento, texto: string) {
  if (!b.client_phone || emOptout(db, b.client_phone)) return false;
  try {
    await send(b.client_phone, texto);
    return true;
  } catch (err) {
    console.error(`[agendamento #${b.id}] mensagem ao cliente nao saiu`, err);
    return false;
  }
}

/** Aviso do tipo agendamentos para quem atende, se ele estiver ligado. */
export async function avisarDono(db: Db, send: Envio, b: Agendamento, chave: string, texto: string, agora: Date) {
  const p = preferencias(db, resolverContexto(db, b.owner_phone)).find((x) => x.tipo === "agendamentos");
  if (!p?.ligado || !p.disponivel) return false;
  return entregar(db, send, b.owner_phone, "agendamentos", chave, texto, agora);
}

// ---------- reserva ----------

const digitos = (s: string) => s.replace(/\D/g, "");

const reservaSchema = z.object({
  inicio: z.iso.datetime({ offset: true }),
  duracao: z.number().int(),
  nome: z.string().trim().min(2, "informe seu nome").max(80),
  email: z.string().trim().email("e-mail inválido"),
  whatsapp: z
    .string()
    .transform(digitos)
    .pipe(z.string().min(10, "WhatsApp incompleto").max(15))
    .transform((n) => (n.length <= 11 ? `55${n}` : n)),
  aceite: z.literal(true, { error: "é preciso aceitar receber a confirmação pelo WhatsApp" }),
  fuso: z.string().refine((f) => f === "UTC" || Intl.supportedValuesOf("timeZone").includes(f), "fuso inválido"),
  site: z.string().optional(),
});

const sha256 = (s: string) => crypto.createHash("sha256").update(s).digest("hex");
const OCUPADO = "Esse horário acabou de ser ocupado. Escolha outro.";
const SEM_AGENDA = "Não consegui ver a agenda agora. Tente em alguns minutos.";

export const agendamentoPorId = (db: Db, id: number) => db.prepare(`SELECT * FROM bookings WHERE id = ?`).get(id) as Agendamento | undefined;

/** Falha do Google na parte publica vira 503 sem detalhe; as demais seguem. */
function erroPublico(err: unknown): never {
  if (err instanceof GoogleIndisponivel || err instanceof GoogleExpirado || err instanceof GoogleNaoConectado || err instanceof GoogleNaoConfigurado) {
    throw new AuthError(503, SEM_AGENDA);
  }
  throw err;
}

export async function consultarHorarios(db: Db, p: Pagina, dia: string, duracao: number, agora: Date) {
  validarConsulta(p, dia, duracao, agora);
  try {
    return await horariosLivres(db, p, dia, duracao, agora);
  } catch (err) {
    erroPublico(err);
  }
}

/**
 * Tudo ate gravar `reservando` e sincrono: o segundo pedido para o mesmo horario ja encontra a
 * linha do primeiro, sem trava extra. So depois o Google e consultado e o evento criado.
 */
export async function reservar(repo: Repo, p: Pagina, dados: unknown, ip: string, agora: Date, send: Envio) {
  const db = repo.db;
  const bruto = (dados ?? {}) as { site?: unknown; inicio?: unknown; duracao?: unknown };
  if (typeof bruto.site === "string" && bruto.site.trim()) {
    const inicio = new Date(String(bruto.inicio));
    const ok = !Number.isNaN(inicio.getTime());
    return {
      inicio: ok ? inicio.toISOString() : agora.toISOString(),
      fim: ok ? new Date(inicio.getTime() + minutos(Number(bruto.duracao) || 30)).toISOString() : agora.toISOString(),
      nome: p.display_name,
    };
  }
  const r = reservaSchema.safeParse(dados);
  if (!r.success) throw new AuthError(400, r.error.issues.map((i) => i.message).join("; "));
  const d = r.data;
  const inicio = new Date(d.inicio);
  const fim = new Date(inicio.getTime() + minutos(d.duracao));
  const dia = localDate(inicio);
  validarConsulta(p, dia, d.duracao, agora);
  if (!iniciosDoDia(p, dia, d.duracao, agora).some((t) => t.getTime() === inicio.getTime())) throw new AuthError(400, "Horário fora dos oferecidos.");

  const ipHash = sha256(ip);
  const conta = (sql: string, ...args: unknown[]) => (db.prepare(sql).get(...args) as { n: number }).n;
  const umaHora = new Date(agora.getTime() - 3_600_000).toISOString();
  const umDia = new Date(agora.getTime() - 86_400_000).toISOString();
  if (
    conta(`SELECT COUNT(*) AS n FROM bookings WHERE client_ip_hash = ? AND created_at >= ?`, ipHash, umaHora) >= 5 ||
    conta(`SELECT COUNT(*) AS n FROM bookings WHERE client_phone = ? AND created_at >= ?`, d.whatsapp, umDia) >= 3
  ) {
    throw new AuthError(429, "Muitos agendamentos seguidos. Tente mais tarde.");
  }

  const gravar = db.transaction(() => {
    if (reservasNoIntervalo(db, p.id, inicio, fim).length) return null;
    return Number(
      db
        .prepare(
          `INSERT INTO bookings (page_id, owner_phone, client_name, client_email, client_phone, client_tz, starts_at, ends_at,
             status, client_ip_hash, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'reservando', ?, ?)`,
        )
        .run(p.id, p.phone, d.nome, d.email, d.whatsapp, d.fuso === config.timezone ? null : d.fuso, inicio.toISOString(), fim.toISOString(), ipHash, agora.toISOString())
        .lastInsertRowid,
    );
  });
  const id = gravar();
  if (id === null) throw new AuthError(409, OCUPADO);

  try {
    if ((await conflitos(db, p.phone, inicio, fim)).length) throw new AuthError(409, OCUPADO);
    const ev = await criarEvento(db, p.phone, { titulo: `${d.nome} (agendamento)`, inicio, duracaoMin: d.duracao, convidados: [d.email] });
    db.prepare(`UPDATE bookings SET status = 'agendado', google_event_id = ? WHERE id = ?`).run(ev.id, id);
    const lembrete = new Date(inicio.getTime() - minutos(ANTES_DO_LEMBRETE_MIN));
    if (lembrete > agora) {
      repo.addReminder(p.conta, `${d.nome} as ${horaTexto(inicio.toISOString())}`, lembrete, null, {
        created_by: p.phone,
        notify_phone: p.phone,
        google_event_id: ev.id,
      });
    }
  } catch (err) {
    db.prepare(`DELETE FROM bookings WHERE id = ?`).run(id);
    if (err instanceof AuthError) throw err;
    erroPublico(err);
  }
  const b = agendamentoPorId(db, id)!;
  await avisarDono(db, send, b, `novo:${b.id}`, textosDono.novo(b), agora);
  return { inicio: b.starts_at, fim: b.ends_at, nome: p.display_name };
}

// ---------- quem atende ----------

/** Agendamento da pagina de quem fala; de outra pessoa, cancelado ou ainda reservando nao existe para ele. */
export function agendamentoDoDono(db: Db, ctx: Contexto, id: number) {
  exigir(ctx, "agenda");
  const b = agendamentoPorId(db, id);
  if (!b || b.owner_phone !== ctx.membro || b.status === "cancelado" || b.status === "reservando") {
    throw new AuthError(404, `Agendamento #${id} não encontrado.`);
  }
  return b;
}

export function listarAgendamentos(db: Db, ctx: Contexto, de: Date, ate: Date) {
  exigir(ctx, "agenda");
  return db
    .prepare(
      `SELECT * FROM bookings WHERE owner_phone = ? AND status NOT IN ('cancelado', 'reservando') AND starts_at >= ? AND starts_at < ?
       ORDER BY starts_at, id`,
    )
    .all(ctx.membro, de.toISOString(), ate.toISOString()) as Agendamento[];
}

/** Ate tres opcoes, uma por dia primeiro, nos proximos 14 dias a partir de amanha. */
async function opcoesParaRemarcar(db: Db, p: Pagina, b: Agendamento, agora: Date) {
  const amanha = addDias(localDate(agora), 1);
  const ultimo = addDias(amanha, DIAS_PARA_REMARCAR - 1);
  const eventos = await listarEventos(db, p.phone, fromLocal(`${amanha}T00:00`), fromLocal(`${addDias(ultimo, 1)}T00:00`));
  const porDia: Horario[][] = [];
  for (let dia = amanha; dia <= ultimo; dia = addDias(dia, 1)) {
    if (!diasDa(p).includes(diaDaSemana(dia))) continue;
    const lista = livres(db, p, dia, duracaoDe(b), agora, eventos, b.id);
    if (lista.length) porDia.push(lista);
  }
  const escolhidas = porDia.map((l) => l[0]).slice(0, 3);
  for (const l of porDia) for (const h of l.slice(1)) if (escolhidas.length < 3) escolhidas.push(h);
  return escolhidas.sort((a, c) => a.inicio.localeCompare(c.inicio));
}

export async function remarcar(repo: Repo, ctx: Contexto, id: number, agora: Date, send: Envio) {
  const db = repo.db;
  const b = agendamentoDoDono(db, ctx, id);
  const p = paginaPorId(db, b.page_id);
  const opcoes = await opcoesParaRemarcar(db, p, b, agora);
  if (!opcoes.length) return { agendamento: b, opcoes, enviado: false };
  db.prepare(`UPDATE bookings SET status = 'remarcando', reschedule_options = ? WHERE id = ?`).run(JSON.stringify(opcoes), id);
  const enviado = await enviarAoCliente(db, send, b, textosCliente.opcoes(b, p.display_name, opcoes));
  return { agendamento: agendamentoPorId(db, id)!, opcoes, enviado };
}

export async function cancelar(repo: Repo, ctx: Contexto, id: number, send: Envio) {
  const db = repo.db;
  const b = agendamentoDoDono(db, ctx, id);
  const p = paginaPorId(db, b.page_id);
  if (b.google_event_id) {
    await apagarEvento(db, b.owner_phone, b.google_event_id);
    for (const l of repo.remindersDoEvento(p.conta, b.google_event_id)) repo.cancelReminder(p.conta, l.id);
  }
  db.prepare(`UPDATE bookings SET status = 'cancelado', reschedule_options = NULL WHERE id = ?`).run(id);
  const enviado = await enviarAoCliente(db, send, b, textosCliente.cancelado(b, p.display_name, linkDaPagina(p)));
  return { agendamento: agendamentoPorId(db, id)!, enviado };
}

// ---------- respostas do cliente ----------

/** O mais proximo ainda valido; uma remarcacao em aberto tem a vez, porque a resposta e a escolha. */
export function agendamentoAtivoDe(db: Db, clientPhone: string, agora: Date) {
  return db
    .prepare(
      `SELECT * FROM bookings WHERE client_phone = ? AND status IN ('agendado', 'confirmado', 'remarcando') AND starts_at >= ?
       ORDER BY status = 'remarcando' DESC, starts_at LIMIT 1`,
    )
    .get(clientPhone, new Date(agora.getTime() - 86_400_000).toISOString()) as Agendamento | undefined;
}

const normalizar = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").trim().replace(/\s+/g, " ");

/**
 * Sem IA e sem nada da conta de quem atende: o cliente so confirma, pede para remarcar, escolhe
 * uma opcao ou para de receber. Devolve false quando o numero nao tem agendamento ativo.
 */
export async function responderCliente(repo: Repo, send: Envio, clientPhone: string, texto: string, agora: Date) {
  const db = repo.db;
  const b = agendamentoAtivoDe(db, clientPhone, agora);
  if (!b) return false;
  const p = paginaPorId(db, b.page_id);
  const nome = p.display_name;
  const t = normalizar(texto);
  const responder = (msg: string) => enviarAoCliente(db, send, b, msg);

  if (["parar", "pare", "stop"].includes(t)) {
    db.prepare(`INSERT OR IGNORE INTO client_optouts (client_phone, created_at) VALUES (?, ?)`).run(clientPhone, agora.toISOString());
    try {
      await send(clientPhone, textosCliente.parar());
    } catch (err) {
      console.error(`[agendamento #${b.id}] resposta ao PARAR nao saiu`, err);
    }
    return true;
  }

  if (b.status === "remarcando" && /^\d$/.test(t)) {
    const opcoes = JSON.parse(b.reschedule_options ?? "[]") as Horario[];
    if (t === "0") {
      db.prepare(`UPDATE bookings SET status = 'agendado', reschedule_options = NULL WHERE id = ?`).run(b.id);
      await avisarDono(db, send, b, `nenhuma:${b.id}:${agora.toISOString()}`, textosDono.nenhumaOpcao(b), agora);
      await responder(textosCliente.pediuRemarcar(nome));
      return true;
    }
    const escolha = opcoes[Number(t) - 1];
    if (escolha) {
      await escolherOpcao(repo, send, p, b, escolha, agora);
      return true;
    }
  }

  if (["1", "sim", "confirmo", "confirmado", "confirmar"].includes(t) && b.status !== "remarcando") {
    db.prepare(`UPDATE bookings SET status = 'confirmado' WHERE id = ?`).run(b.id);
    await avisarDono(db, send, b, `confirmou:${b.id}:${b.starts_at}`, textosDono.confirmou(b), agora);
    await responder(textosCliente.confirmado(b, nome));
    return true;
  }

  if (["2", "remarcar"].includes(t) && b.status !== "remarcando") {
    await avisarDono(db, send, b, `pediu:${b.id}:${b.starts_at}`, textosDono.pediuRemarcar(b), agora);
    await responder(textosCliente.pediuRemarcar(nome));
    return true;
  }

  await responder(textosCliente.outro(nome));
  return true;
}

async function escolherOpcao(repo: Repo, send: Envio, p: Pagina, b: Agendamento, escolha: Horario, agora: Date) {
  const db = repo.db;
  const inicio = new Date(escolha.inicio);
  const fim = new Date(escolha.fim);
  const ocupadoAqui = reservasNoIntervalo(db, p.id, inicio, fim, b.id).length > 0;
  const ocupadoNoGoogle = (await conflitos(db, p.phone, inicio, fim)).some((e) => e.id !== b.google_event_id);
  if (ocupadoAqui || ocupadoNoGoogle || !b.google_event_id) {
    db.prepare(`UPDATE bookings SET status = 'agendado', reschedule_options = NULL WHERE id = ?`).run(b.id);
    await avisarDono(db, send, b, `nenhuma:${b.id}:${agora.toISOString()}`, textosDono.nenhumaOpcao(b), agora);
    await enviarAoCliente(db, send, b, textosCliente.ocupado(p.display_name));
    return;
  }
  const movido = await moverEvento(db, p.phone, b.google_event_id, inicio, duracaoDe(b));
  if (!movido) throw new Error(`evento ${b.google_event_id} do agendamento #${b.id} sumiu do Google`);
  repo.moverLembreteDoEvento(p.conta, b.google_event_id, new Date(inicio.getTime() - minutos(ANTES_DO_LEMBRETE_MIN)));
  db.prepare(
    `UPDATE bookings SET status = 'agendado', starts_at = ?, ends_at = ?, reschedule_options = NULL, confirmation_sent_at = NULL,
       confirmation_failed = 0 WHERE id = ?`,
  ).run(inicio.toISOString(), fim.toISOString(), b.id);
  const novo = agendamentoPorId(db, b.id)!;
  await enviarAoCliente(db, send, novo, textosCliente.escolheu(novo));
  await avisarDono(db, send, novo, `escolheu:${b.id}:${novo.starts_at}`, textosDono.escolheu(novo), agora);
}

// ---------- vespera e limpeza ----------

/** Agendamentos de amanha que ainda nao receberam a confirmacao nem falharam. */
export function paraConfirmar(db: Db, amanha: string) {
  return db
    .prepare(
      `SELECT * FROM bookings WHERE status = 'agendado' AND confirmation_sent_at IS NULL AND confirmation_failed = 0
       AND starts_at >= ? AND starts_at < ? ORDER BY starts_at`,
    )
    .all(fromLocal(`${amanha}T00:00`).toISOString(), fromLocal(`${addDias(amanha, 1)}T00:00`).toISOString()) as Agendamento[];
}

export const nomeDaPagina = (db: Db, b: Agendamento) => paginaPorId(db, b.page_id).display_name;
export const clienteEmOptout = emOptout;

export function marcarConfirmacao(db: Db, id: number, r: { enviada: true; agora: Date } | { enviada: false }) {
  if (r.enviada) db.prepare(`UPDATE bookings SET confirmation_sent_at = ? WHERE id = ?`).run(r.agora.toISOString(), id);
  else db.prepare(`UPDATE bookings SET confirmation_failed = 1 WHERE id = ?`).run(id);
}

/** Reserva presa (processo caiu no meio) e dados de cliente de atendimentos antigos. */
export function limparAgendamentos(db: Db, agora: Date) {
  db.prepare(`DELETE FROM bookings WHERE status = 'reservando' AND created_at < ?`).run(new Date(agora.getTime() - 120_000).toISOString());
  db.prepare(
    `UPDATE bookings SET client_name = '', client_email = '', client_phone = '', client_ip_hash = NULL WHERE ends_at < ? AND client_phone != ''`,
  ).run(new Date(agora.getTime() - 90 * 86_400_000).toISOString());
}
