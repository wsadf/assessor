import crypto from "node:crypto";
import { AuthError } from "./auth.js";
import type { Db, Transaction } from "./db.js";
import { documentos, extensao, type Documento } from "./documentos.js";
import { exigir, type Contexto } from "./permissoes.js";
import { criarZip } from "./zip.js";

const ALFABETO = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const CONVITE_DIAS = 7;
const MAX_PENDENTES = 3;
const TENTATIVAS = 5;
const JANELA_MIN = 15;
// Mesma mensagem dos convites de membro: nao revela se o codigo existe, venceu ou ja foi usado.
const CONVITE_INVALIDO = "Convite inválido ou vencido. Peça um novo a quem convidou.";
export const ACESSO_ENCERRADO = "Seu acesso a este cliente foi encerrado.";
export const PASTAS_FISCAIS = ["notas_fiscais", "comprovantes", "boletos"] as const;
export const LIMITE_PACOTE = 200 * 1024 * 1024;

type EstadoConvite = "pendente" | "aceito" | "cancelado" | "expirado";

interface ConviteLinha {
  id: number;
  account_phone: string;
  code_hint: string;
  label: string | null;
  expires_at: string;
  accepted_by: string | null;
  accepted_at: string | null;
  canceled_at: string | null;
  created_at: string;
}

interface AcessoLinha {
  id: number;
  account_phone: string;
  accountant_phone: string;
  invite_id: number | null;
  label: string | null;
  joined_at: string;
  last_seen_at: string | null;
  revoked_at: string | null;
}

export function prepararTabelasContador(db: Db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS accountant_invites (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_phone TEXT NOT NULL,
      code_hash TEXT NOT NULL UNIQUE,
      code_hint TEXT NOT NULL,
      label TEXT CHECK (label IS NULL OR length(label) <= 40),
      expires_at TEXT NOT NULL,
      accepted_by TEXT,
      accepted_at TEXT,
      canceled_at TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS accountant_access (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_phone TEXT NOT NULL,
      accountant_phone TEXT NOT NULL,
      invite_id INTEGER,
      label TEXT,
      joined_at TEXT NOT NULL,
      last_seen_at TEXT,
      revoked_at TEXT
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_accountant_ativo ON accountant_access (account_phone, accountant_phone) WHERE revoked_at IS NULL;
  `);
  const cols = (db.prepare(`PRAGMA table_info(users)`).all() as { name: string }[]).map((c) => c.name);
  if (!cols.includes("pending_accountant_invite_id")) db.exec(`ALTER TABLE users ADD COLUMN pending_accountant_invite_id INTEGER`);
}

const sha256 = (s: string) => crypto.createHash("sha256").update(s).digest("hex");
const nomeDe = (db: Db, phone: string) =>
  (db.prepare(`SELECT name FROM users WHERE phone = ?`).get(phone) as { name: string | null } | undefined)?.name ?? null;

// ---------- convite ----------

/** Aceita "cont-7qf3zd", "CONT 7QF3ZD" ou so "7QF3ZD"; devolve null se nao for um codigo possivel. */
export function normalizarConviteContador(texto: string): string | null {
  const s = texto.toUpperCase().replace(/[^0-9A-Z]/g, "").replace(/^CONT/, "");
  return s.length === 6 && [...s].every((c) => ALFABETO.includes(c)) ? `CONT-${s}` : null;
}

const estado = (c: ConviteLinha, agora: Date): EstadoConvite =>
  c.accepted_at ? "aceito" : c.canceled_at ? "cancelado" : new Date(c.expires_at) < agora ? "expirado" : "pendente";

export function gerarConviteContador(db: Db, ctx: Contexto, rotulo?: string | null, agora = new Date()) {
  exigir(ctx, "acessos");
  const pendentes = (
    db
      .prepare(`SELECT COUNT(*) AS n FROM accountant_invites WHERE account_phone = ? AND accepted_at IS NULL AND canceled_at IS NULL AND expires_at > ?`)
      .get(ctx.conta, agora.toISOString()) as { n: number }
  ).n;
  if (pendentes >= MAX_PENDENTES) throw new AuthError(409, `Já há ${MAX_PENDENTES} convites de contador pendentes. Cancele algum antes de criar outro.`);
  const codigo = `CONT-${Array.from({ length: 6 }, () => ALFABETO[crypto.randomInt(ALFABETO.length)]).join("")}`;
  const validoAte = new Date(agora.getTime() + CONVITE_DIAS * 86_400_000).toISOString();
  const id = Number(
    db
      .prepare(`INSERT INTO accountant_invites (account_phone, code_hash, code_hint, label, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?)`)
      .run(ctx.conta, sha256(codigo), codigo.slice(-2), rotulo?.trim().slice(0, 40) || null, validoAte, agora.toISOString()).lastInsertRowid,
  );
  const ate = new Date(validoAte).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
  return {
    id,
    codigo,
    validoAte,
    mensagemWhatsapp: `Oi! Use o código ${codigo} em Criar conta (ou em Clientes, se já tiver conta) no painel do Assessor para ver o dossiê mensal de ${ctx.titular ?? "quem te convidou"}. Vale até ${ate}.`,
  };
}

/** Confere sem usar. Cada codigo errado conta no mesmo limite de tentativas dos convites de membro. */
export function validarConviteContador(db: Db, codigo: string, phone: string, agora = new Date()) {
  const desde = new Date(agora.getTime() - JANELA_MIN * 60_000).toISOString();
  const erradas = (db.prepare(`SELECT COUNT(*) AS n FROM invite_attempts WHERE phone = ? AND created_at >= datetime(?)`).get(phone, desde) as { n: number }).n;
  if (erradas >= TENTATIVAS) throw new AuthError(429, `Muitas tentativas. Tente de novo em ${JANELA_MIN} minutos.`);
  const norm = normalizarConviteContador(codigo);
  const c = norm ? (db.prepare(`SELECT * FROM accountant_invites WHERE code_hash = ?`).get(sha256(norm)) as ConviteLinha | undefined) : undefined;
  if (!c || estado(c, agora) !== "pendente") {
    db.prepare(`INSERT INTO invite_attempts (phone) VALUES (?)`).run(phone);
    throw new AuthError(400, CONVITE_INVALIDO);
  }
  if (c.account_phone === phone) throw new AuthError(409, "Esse convite é da sua própria conta.");
  if (db.prepare(`SELECT 1 FROM account_members WHERE member_phone = ? AND account_phone = ? AND removed_at IS NULL`).get(phone, c.account_phone)) {
    throw new AuthError(409, "Você já faz parte dessa conta.");
  }
  if (vinculoAtivo(db, phone, c.account_phone)) throw new AuthError(409, "Você já é contador dessa conta.");
  return { convite: c, titular: nomeDe(db, c.account_phone) };
}

const aceitar = (db: Db, c: ConviteLinha, phone: string, agora: Date) =>
  db.transaction(() => {
    db.prepare(`INSERT INTO accountant_access (account_phone, accountant_phone, invite_id, label, joined_at) VALUES (?, ?, ?, ?, ?)`).run(
      c.account_phone,
      phone,
      c.id,
      c.label,
      agora.toISOString(),
    );
    db.prepare(`UPDATE accountant_invites SET accepted_by = ?, accepted_at = ? WHERE id = ?`).run(phone, agora.toISOString(), c.id);
  })();

export function aceitarConviteContador(db: Db, codigo: string, phone: string, agora = new Date()) {
  const v = validarConviteContador(db, codigo, phone, agora);
  aceitar(db, v.convite, phone, agora);
  return { conta: v.convite.account_phone, nome: v.titular };
}

export function guardarConviteContadorPendente(db: Db, phone: string, conviteId: number) {
  db.prepare(`UPDATE users SET pending_accountant_invite_id = ? WHERE phone = ?`).run(conviteId, phone);
}

/** Na ativacao: usa o convite do cadastro se ele ainda vale. */
export function aceitarConviteContadorPendente(db: Db, phone: string, agora = new Date()): { conta: string } | { expirou: true } | null {
  const id = (db.prepare(`SELECT pending_accountant_invite_id AS id FROM users WHERE phone = ?`).get(phone) as { id: number | null } | undefined)?.id;
  if (!id) return null;
  db.prepare(`UPDATE users SET pending_accountant_invite_id = NULL WHERE phone = ?`).run(phone);
  const c = db.prepare(`SELECT * FROM accountant_invites WHERE id = ?`).get(id) as ConviteLinha | undefined;
  if (!c || estado(c, agora) !== "pendente" || c.account_phone === phone || vinculoAtivo(db, phone, c.account_phone)) return { expirou: true };
  aceitar(db, c, phone, agora);
  return { conta: c.account_phone };
}

export function listarConvitesContador(db: Db, conta: string, agora = new Date()) {
  const desde = new Date(agora.getTime() - 30 * 86_400_000).toISOString();
  return (db.prepare(`SELECT * FROM accountant_invites WHERE account_phone = ? AND created_at >= ? ORDER BY id DESC`).all(conta, desde) as ConviteLinha[]).map(
    (c) => ({ id: c.id, final: c.code_hint, rotulo: c.label, estado: estado(c, agora), validoAte: c.expires_at }),
  );
}

export function cancelarConviteContador(db: Db, ctx: Contexto, id: number, agora = new Date()) {
  exigir(ctx, "acessos");
  const c = db.prepare(`SELECT * FROM accountant_invites WHERE id = ?`).get(id) as ConviteLinha | undefined;
  if (!c || c.account_phone !== ctx.conta || estado(c, agora) !== "pendente") return false;
  db.prepare(`UPDATE accountant_invites SET canceled_at = ? WHERE id = ?`).run(agora.toISOString(), id);
  return true;
}

// ---------- vinculo ----------

const vinculoAtivo = (db: Db, contador: string, conta: string) =>
  db.prepare(`SELECT * FROM accountant_access WHERE accountant_phone = ? AND account_phone = ? AND revoked_at IS NULL`).get(contador, conta) as
    | AcessoLinha
    | undefined;

export interface ContadorDaConta {
  id: number;
  telefone: string;
  nome: string | null;
  rotulo: string | null;
  desde: string;
  ultimoAcesso: string | null;
}

export function contadoresDe(db: Db, conta: string): ContadorDaConta[] {
  return (
    db
      .prepare(
        `SELECT a.*, u.name FROM accountant_access a LEFT JOIN users u ON u.phone = a.accountant_phone
         WHERE a.account_phone = ? AND a.revoked_at IS NULL ORDER BY a.joined_at`,
      )
      .all(conta) as (AcessoLinha & { name: string | null })[]
  ).map((a) => ({ id: a.id, telefone: a.accountant_phone, nome: a.name, rotulo: a.label, desde: a.joined_at, ultimoAcesso: a.last_seen_at }));
}

/** Vale na hora: o pedido seguinte do contador ja nao passa por `exigirVinculo`. */
export function revogarContador(db: Db, ctx: Contexto, id: number, agora = new Date()) {
  exigir(ctx, "acessos");
  return (
    db.prepare(`UPDATE accountant_access SET revoked_at = ? WHERE id = ? AND account_phone = ? AND revoked_at IS NULL`).run(agora.toISOString(), id, ctx.conta)
      .changes === 1
  );
}

export function clientesDe(db: Db, phone: string) {
  return (
    db
      .prepare(
        `SELECT a.account_phone AS conta, u.name AS nome, a.joined_at AS desde FROM accountant_access a
         LEFT JOIN users u ON u.phone = a.account_phone WHERE a.accountant_phone = ? AND a.revoked_at IS NULL ORDER BY u.name, a.joined_at`,
      )
      .all(phone) as { conta: string; nome: string | null; desde: string }[]
  );
}

/** Toda leitura do contador passa aqui antes: sem vinculo ativo, nada sai. */
export function exigirVinculo(db: Db, contador: string, conta: string) {
  if (!vinculoAtivo(db, contador, conta)) throw new AuthError(403, ACESSO_ENCERRADO);
}

export function marcarAcesso(db: Db, contador: string, conta: string, agora = new Date()) {
  db.prepare(`UPDATE accountant_access SET last_seen_at = ? WHERE accountant_phone = ? AND account_phone = ? AND revoked_at IS NULL`).run(
    agora.toISOString(),
    contador,
    conta,
  );
}

// ---------- dossie ----------

export interface Lancamento {
  id: number;
  data: string;
  tipo: "despesa" | "receita";
  valor: number;
  categoria: string;
  descricao: string;
  contraparte: string | null;
  pagamento: string | null;
  parcela: string | null;
  lancadoPor: string | null;
}

export interface DocContador {
  id: number;
  titulo: string;
  pasta: string;
  data: string;
  tipo: string;
  tamanho: number;
  lancamentoId: number | null;
}

const FISCAIS = PASTAS_FISCAIS.map((p) => `'${p}'`).join(", ");
const dataDoDoc = (d: Documento) => d.document_date ?? (d.saved_at ?? d.created_at).slice(0, 10);
const ultimoDia = (mes: string) => {
  const [y, m] = mes.split("-").map(Number);
  return `${mes}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0")}`;
};

export function mesesDe(db: Db, conta: string): string[] {
  return (
    db
      .prepare(
        `SELECT substr(occurred_on, 1, 7) AS mes FROM transactions WHERE phone = ? AND deleted_at IS NULL AND reversed_at IS NULL
         UNION
         SELECT substr(COALESCE(document_date, saved_at), 1, 7) FROM documents
         WHERE phone = ? AND status = 'guardado' AND folder IN (${FISCAIS})
         ORDER BY mes DESC`,
      )
      .all(conta, conta) as { mes: string | null }[]
  )
    .map((r) => r.mes)
    .filter((m): m is string => !!m && /^\d{4}-\d{2}$/.test(m));
}

function lancamentosDoMes(db: Db, conta: string, mes: string) {
  return db
    .prepare(`SELECT * FROM transactions WHERE phone = ? AND deleted_at IS NULL AND reversed_at IS NULL AND occurred_on BETWEEN ? AND ? ORDER BY occurred_on, id`)
    .all(conta, `${mes}-01`, ultimoDia(mes)) as Transaction[];
}

/** Fiscais do mes e qualquer comprovante de um lancamento do mes; o resto nao e assunto do contador. */
function documentosDoMes(db: Db, conta: string, mes: string, idsLancamentos: number[]) {
  const ids = new Set(idsLancamentos);
  return (db.prepare(`SELECT * FROM documents WHERE phone = ? AND status = 'guardado' ORDER BY id`).all(conta) as Documento[]).filter(
    (d) =>
      (d.transaction_id !== null && ids.has(d.transaction_id)) ||
      ((PASTAS_FISCAIS as readonly string[]).includes(d.folder ?? "") && dataDoDoc(d).slice(0, 7) === mes),
  );
}

export function dossieDoMes(db: Db, conta: string, mes: string) {
  const txs = lancamentosDoMes(db, conta, mes);
  const nomes = new Map<string, string | null>();
  const nome = (phone: string | null) => {
    const p = phone ?? conta;
    if (!nomes.has(p)) nomes.set(p, nomeDe(db, p));
    return nomes.get(p) ?? null;
  };
  const lancamentos: Lancamento[] = txs.map((t) => ({
    id: t.id,
    data: t.occurred_on,
    tipo: t.kind,
    valor: t.amount_cents / 100,
    categoria: t.category,
    descricao: t.description,
    contraparte: t.counterpart,
    pagamento: t.payment_method,
    parcela: t.installment_total ? `${t.installment_number}/${t.installment_total}` : null,
    lancadoPor: nome(t.created_by),
  }));
  const docs = documentosDoMes(db, conta, mes, txs.map((t) => t.id));
  const soma = (k: "despesa" | "receita") => txs.filter((t) => t.kind === k).reduce((s, t) => s + t.amount_cents, 0) / 100;
  return {
    mes,
    receitas: soma("receita"),
    despesas: soma("despesa"),
    lancamentos,
    documentos: docs.map(
      (d): DocContador => ({
        id: d.id,
        titulo: d.title ?? d.original_name,
        pasta: d.folder ?? "outros",
        data: dataDoDoc(d),
        tipo: d.mime_type,
        tamanho: d.size_bytes,
        lancamentoId: d.transaction_id,
      }),
    ),
    docs,
  };
}

/** Documento da conta que entra no dossie de algum mes; qualquer outro nao existe para o contador. */
export function documentoDoDossie(db: Db, conta: string, id: number) {
  const d = documentos(db).porId(id);
  if (!d || d.phone !== conta || d.status !== "guardado") return null;
  if ((PASTAS_FISCAIS as readonly string[]).includes(d.folder ?? "")) return d;
  if (d.transaction_id && db.prepare(`SELECT 1 FROM transactions WHERE id = ? AND phone = ? AND deleted_at IS NULL AND reversed_at IS NULL`).get(d.transaction_id, conta)) return d;
  return null;
}

// ---------- pacote ----------

const celula = (v: string | number | null) => {
  const s = v === null ? "" : typeof v === "number" ? v.toFixed(2).replace(".", ",") : v;
  return /[;"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function planilha(lancamentos: Lancamento[]) {
  const linhas = [
    "data;tipo;valor;categoria;descricao;contraparte;pagamento;parcela;lancado_por",
    ...lancamentos.map((l) =>
      [l.data, l.tipo, l.valor, l.categoria, l.descricao, l.contraparte, l.pagamento, l.parcela, l.lancadoPor].map(celula).join(";"),
    ),
  ];
  // BOM: sem ele o Excel em portugues abre o CSV com os acentos quebrados.
  return Buffer.from(`﻿${linhas.join("\r\n")}\r\n`, "utf8");
}

const nomeSeguro = (s: string) => s.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 100) || "documento";

export function pacoteDoMes(db: Db, conta: string, mes: string, limiteBytes = LIMITE_PACOTE) {
  const d = dossieDoMes(db, conta, mes);
  const arquivos: { nome: string; dados: Buffer }[] = [{ nome: `lancamentos-${mes}.csv`, dados: planilha(d.lancamentos) }];
  const usados = new Set<string>();
  const fora: string[] = [];
  let total = arquivos[0].dados.length;
  const leitor = documentos(db);
  for (const doc of d.docs) {
    const pasta = (PASTAS_FISCAIS as readonly string[]).includes(doc.folder ?? "") ? doc.folder! : "outros-comprovantes";
    const base = `${pasta}/${dataDoDoc(doc)} ${nomeSeguro(doc.title ?? doc.original_name.replace(/\.[^.]+$/, ""))}`;
    const ext = extensao(doc.mime_type, doc.original_name);
    let nome = `${base}.${ext}`;
    for (let n = 2; usados.has(nome.toLowerCase()); n++) nome = `${base} (${n}).${ext}`;
    let dados: Buffer;
    try {
      dados = leitor.ler(doc);
    } catch {
      fora.push(`${nome}: arquivo nao encontrado no servidor`);
      continue;
    }
    if (total + dados.length > limiteBytes) {
      fora.push(`${nome}: nao coube no pacote; baixe pelo painel`);
      continue;
    }
    usados.add(nome.toLowerCase());
    arquivos.push({ nome, dados });
    total += dados.length;
  }
  if (fora.length) {
    const texto = ["Arquivos que ficaram fora deste pacote:", "", ...fora.map((f) => `- ${f}`), ""].join("\r\n");
    arquivos.push({ nome: "LEIA-ME.txt", dados: Buffer.from(texto, "utf8") });
  }
  return criarZip(arquivos);
}
