import crypto from "node:crypto";
import { AuthError } from "./auth.js";
import type { Db, Kind, Repo } from "./db.js";
import { pode, type Contexto, type PerfilMembro } from "./permissoes.js";

const ALFABETO = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const CONVITE_DIAS = 7;
const TENTATIVAS = 5;
const JANELA_MIN = 15;
const MAX_PENDENTES = 10;
// Mesma resposta para codigo inexistente, usado, cancelado ou vencido: nao ajuda quem tenta adivinhar.
const CONVITE_INVALIDO = "Convite inválido ou vencido. Peça um novo a quem convidou.";

export type EstadoConvite = "pendente" | "aceito" | "cancelado" | "expirado";

interface ConviteLinha {
  id: number;
  account_phone: string;
  code_hint: string;
  role: PerfilMembro;
  label: string | null;
  expires_at: string;
  accepted_by: string | null;
  accepted_at: string | null;
  canceled_at: string | null;
  created_at: string;
}

export interface Membro {
  telefone: string;
  nome: string | null;
  perfil: PerfilMembro;
  desde: string;
}

export function prepararTabelasConta(db: Db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS account_members (
      member_phone TEXT PRIMARY KEY,
      account_phone TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('completo', 'so_gastos', 'agenda_tarefas')),
      invite_id INTEGER,
      joined_at TEXT NOT NULL,
      removed_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_members_account ON account_members (account_phone, removed_at);
    CREATE TABLE IF NOT EXISTS account_invites (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_phone TEXT NOT NULL,
      code_hash TEXT NOT NULL UNIQUE,
      code_hint TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('completo', 'so_gastos', 'agenda_tarefas')),
      label TEXT,
      expires_at TEXT NOT NULL,
      accepted_by TEXT,
      accepted_at TEXT,
      canceled_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS invite_attempts (
      phone TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  const cols = (db.prepare(`PRAGMA table_info(users)`).all() as { name: string }[]).map((c) => c.name);
  // Convite informado no cadastro; vira vinculo so depois que o numero e confirmado na ativacao.
  if (!cols.includes("pending_invite_id")) db.exec(`ALTER TABLE users ADD COLUMN pending_invite_id INTEGER`);
}

const sha256 = (s: string) => crypto.createHash("sha256").update(s).digest("hex");

/** Aceita "conv-7qf3zd", "CONV 7QF3ZD" ou so "7QF3ZD"; devolve null se nao for um codigo possivel. */
export function normalizarConvite(texto: string): string | null {
  const s = texto.toUpperCase().replace(/[^0-9A-Z]/g, "").replace(/^CONV/, "");
  return s.length === 6 && [...s].every((c) => ALFABETO.includes(c)) ? `CONV-${s}` : null;
}

const nomeDe = (db: Db, phone: string) =>
  (db.prepare(`SELECT name FROM users WHERE phone = ?`).get(phone) as { name: string | null } | undefined)?.name ?? null;

const temMembrosAtivos = (db: Db, conta: string) =>
  !!db.prepare(`SELECT 1 FROM account_members WHERE account_phone = ? AND removed_at IS NULL LIMIT 1`).get(conta);

export function resolverContexto(db: Db, phone: string): Contexto {
  const m = db
    .prepare(`SELECT account_phone, role FROM account_members WHERE member_phone = ? AND removed_at IS NULL`)
    .get(phone) as { account_phone: string; role: PerfilMembro } | undefined;
  const conta = m?.account_phone ?? phone;
  const nome = nomeDe(db, phone);
  return {
    membro: phone,
    conta,
    perfil: m?.role ?? "titular",
    nome,
    titular: m ? nomeDe(db, conta) : nome,
    compartilhada: !!m || temMembrosAtivos(db, conta),
  };
}

export function conta(db: Db) {
  const agora = () => new Date();
  const estado = (c: ConviteLinha): EstadoConvite =>
    c.accepted_at ? "aceito" : c.canceled_at ? "cancelado" : new Date(c.expires_at) < agora() ? "expirado" : "pendente";
  const convitePorId = (id: number) => db.prepare(`SELECT * FROM account_invites WHERE id = ?`).get(id) as ConviteLinha | undefined;

  const aceitar = db.transaction((c: ConviteLinha, phone: string) => {
    const quando = agora().toISOString();
    db.prepare(
      `INSERT INTO account_members (member_phone, account_phone, role, invite_id, joined_at)
       VALUES (@phone, @conta, @role, @id, @quando)
       ON CONFLICT(member_phone) DO UPDATE SET account_phone = excluded.account_phone, role = excluded.role,
         invite_id = excluded.invite_id, joined_at = excluded.joined_at, removed_at = NULL`,
    ).run({ phone, conta: c.account_phone, role: c.role, id: c.id, quando });
    db.prepare(`UPDATE account_invites SET accepted_by = ?, accepted_at = ? WHERE id = ?`).run(phone, quando, c.id);
  });

  return {
    gerarConvite(contaPhone: string, role: PerfilMembro, label?: string | null) {
      const pendentes = (
        db
          .prepare(
            `SELECT COUNT(*) AS n FROM account_invites
             WHERE account_phone = ? AND accepted_at IS NULL AND canceled_at IS NULL AND expires_at > ?`,
          )
          .get(contaPhone, agora().toISOString()) as { n: number }
      ).n;
      if (pendentes >= MAX_PENDENTES) throw new AuthError(409, `Já há ${MAX_PENDENTES} convites pendentes. Cancele algum antes de criar outro.`);
      const codigo = `CONV-${Array.from({ length: 6 }, () => ALFABETO[crypto.randomInt(ALFABETO.length)]).join("")}`;
      const validoAte = new Date(agora().getTime() + CONVITE_DIAS * 86_400_000).toISOString();
      const info = db
        .prepare(`INSERT INTO account_invites (account_phone, code_hash, code_hint, role, label, expires_at) VALUES (?, ?, ?, ?, ?, ?)`)
        .run(contaPhone, sha256(codigo), codigo.slice(-2), role, label ?? null, validoAte);
      return { id: Number(info.lastInsertRowid), codigo, perfil: role, validoAte };
    },

    /** Confere o codigo sem usa-lo. Cada codigo errado conta no limite de tentativas do telefone. */
    validarConvite(codigo: string, phone: string) {
      const desde = new Date(agora().getTime() - JANELA_MIN * 60_000).toISOString();
      const erradas = (
        db.prepare(`SELECT COUNT(*) AS n FROM invite_attempts WHERE phone = ? AND created_at >= datetime(?)`).get(phone, desde) as { n: number }
      ).n;
      if (erradas >= TENTATIVAS) throw new AuthError(429, `Muitas tentativas. Tente de novo em ${JANELA_MIN} minutos.`);
      const norm = normalizarConvite(codigo);
      const c = norm ? (db.prepare(`SELECT * FROM account_invites WHERE code_hash = ?`).get(sha256(norm)) as ConviteLinha | undefined) : undefined;
      if (!c || estado(c) !== "pendente" || c.account_phone === phone) {
        db.prepare(`INSERT INTO invite_attempts (phone) VALUES (?)`).run(phone);
        throw new AuthError(400, CONVITE_INVALIDO);
      }
      if (temMembrosAtivos(db, phone)) {
        throw new AuthError(409, "Esse WhatsApp é titular de uma conta com outras pessoas. Remova-as antes de entrar em outra conta.");
      }
      const proprios = db
        .prepare(`SELECT 1 FROM transactions WHERE phone = ? AND deleted_at IS NULL UNION SELECT 1 FROM tasks WHERE phone = ? AND deleted_at IS NULL LIMIT 1`)
        .get(phone, phone);
      return { convite: c, titular: nomeDe(db, c.account_phone), perfil: c.role, temDadosProprios: !!proprios };
    },

    aceitarConvite(codigo: string, phone: string) {
      const v = this.validarConvite(codigo, phone);
      aceitar(v.convite, phone);
      return resolverContexto(db, phone);
    },

    guardarConvitePendente(phone: string, conviteId: number) {
      db.prepare(`UPDATE users SET pending_invite_id = ? WHERE phone = ?`).run(conviteId, phone);
    },

    /** Na ativacao: usa o convite do cadastro se ele ainda vale. Sem convite, devolve null. */
    aceitarPendente(phone: string): { contexto: Contexto } | { expirou: true } | null {
      const id = (db.prepare(`SELECT pending_invite_id AS id FROM users WHERE phone = ?`).get(phone) as { id: number | null } | undefined)?.id;
      if (!id) return null;
      db.prepare(`UPDATE users SET pending_invite_id = NULL WHERE phone = ?`).run(phone);
      const c = convitePorId(id);
      if (!c || estado(c) !== "pendente" || temMembrosAtivos(db, phone)) return { expirou: true };
      aceitar(c, phone);
      return { contexto: resolverContexto(db, phone) };
    },

    cancelarConvite(contaPhone: string, id: number): boolean {
      const c = convitePorId(id);
      if (!c || c.account_phone !== contaPhone || estado(c) !== "pendente") return false;
      db.prepare(`UPDATE account_invites SET canceled_at = ? WHERE id = ?`).run(agora().toISOString(), id);
      return true;
    },

    listarConvites(contaPhone: string) {
      const desde = new Date(agora().getTime() - 30 * 86_400_000).toISOString();
      return (
        db
          .prepare(`SELECT * FROM account_invites WHERE account_phone = ? AND created_at >= datetime(?) ORDER BY id DESC`)
          .all(contaPhone, desde) as ConviteLinha[]
      ).map((c) => ({
        id: c.id,
        final: c.code_hint,
        perfil: c.role,
        rotulo: c.label,
        estado: estado(c),
        validoAte: c.expires_at,
        aceitoPor: c.accepted_by ? nomeDe(db, c.accepted_by) : null,
      }));
    },

    listarMembros(contaPhone: string): Membro[] {
      return (
        db
          .prepare(
            `SELECT m.member_phone, m.role, m.joined_at, u.name FROM account_members m
             LEFT JOIN users u ON u.phone = m.member_phone
             WHERE m.account_phone = ? AND m.removed_at IS NULL ORDER BY m.joined_at`,
          )
          .all(contaPhone) as { member_phone: string; role: PerfilMembro; joined_at: string; name: string | null }[]
      ).map((r) => ({ telefone: r.member_phone, nome: r.name, perfil: r.role, desde: r.joined_at }));
    },

    /** Telefone para nome de todos que lancam na conta, inclusive o titular. */
    nomes(contaPhone: string): Map<string, string> {
      const mapa = new Map<string, string>();
      for (const m of this.listarMembros(contaPhone)) if (m.nome) mapa.set(m.telefone, m.nome);
      const titular = nomeDe(db, contaPhone);
      if (titular) mapa.set(contaPhone, titular);
      return mapa;
    },

    alterarPerfil(contaPhone: string, membro: string, role: PerfilMembro): boolean {
      return (
        db
          .prepare(`UPDATE account_members SET role = ? WHERE account_phone = ? AND member_phone = ? AND removed_at IS NULL`)
          .run(role, contaPhone, membro).changes === 1
      );
    },

    removerMembro(contaPhone: string, membro: string): boolean {
      if (membro === contaPhone) throw new AuthError(400, "O titular não pode ser removido da própria conta.");
      const removido =
        db
          .prepare(`UPDATE account_members SET removed_at = ? WHERE account_phone = ? AND member_phone = ? AND removed_at IS NULL`)
          .run(agora().toISOString(), contaPhone, membro).changes === 1;
      // A tabela de sessoes so existe depois que o modulo de autenticacao abriu o banco.
      if (removido && db.prepare(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'sessions'`).get()) {
        db.prepare(`DELETE FROM sessions WHERE phone = ?`).run(membro);
      }
      return removido;
    },
  };
}

export type ContaService = ReturnType<typeof conta>;

/**
 * Repo que so enxerga os tipos de lancamento que o perfil permite. Assim nenhuma consulta,
 * da ferramenta ou da API, devolve receita para quem so ve gastos, mesmo que esqueca de conferir.
 */
export function repoDoContexto(repo: Repo, ctx: Contexto): Repo {
  if (pode(ctx, "despesas") && pode(ctx, "receitas")) return repo;
  const permitido = (k: Kind) => pode(ctx, k === "receita" ? "receitas" : "despesas");
  const tudo = (phone: string) => repo.listTransactions(phone, "0000-01-01", "9999-12-31").filter((t) => permitido(t.kind));
  const unicos = (xs: (string | null)[]) => [...new Set(xs.filter((x): x is string => !!x))].sort();
  return {
    ...repo,
    listTransactions: (phone, from, to, opts = {}) =>
      opts.kind && !permitido(opts.kind) ? [] : repo.listTransactions(phone, from, to, opts).filter((t) => permitido(t.kind)),
    getTransaction(phone, id) {
      const t = repo.getTransaction(phone, id);
      return t && permitido(t.kind) ? t : undefined;
    },
    updateTransaction(phone, id, fields) {
      if (!this.getTransaction(phone, id) || (fields.kind && !permitido(fields.kind))) return undefined;
      return repo.updateTransaction(phone, id, fields);
    },
    deleteTransaction(phone, id) {
      return !!this.getTransaction(phone, id) && repo.deleteTransaction(phone, id);
    },
    counterparts: (phone) => unicos(tudo(phone).map((t) => t.counterpart)),
    categories: (phone) => unicos(tudo(phone).map((t) => t.category)),
    categoryKinds: (phone) => repo.categoryKinds(phone).filter((c) => permitido(c.kind)),
    monthsWithData: (phone) => unicos(tudo(phone).map((t) => t.occurred_on.slice(0, 7))).reverse(),
    // Saldo mistura receitas e despesas; quem nao ve as duas nao ve saldo.
    balanceBefore: () => 0,
  };
}
