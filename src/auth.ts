import crypto from "node:crypto";
import type { Db } from "./db.js";

export type Plano = "mensal" | "anual";
export type Finalidade = "ativacao" | "senha";

export interface Conta {
  phone: string;
  name: string | null;
  email: string | null;
  plan: Plano | null;
  trial_ends_on: string | null;
  verified_at: string | null;
}

const CODIGO_VALIDADE_MIN = 10;
const CODIGO_TENTATIVAS = 5;
const CODIGOS_POR_JANELA = 5;
const JANELA_MIN = 15;
const SESSAO_DIAS = 30;
const TESTE_GRATIS_DIAS = 7;

export class AuthError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

const sha256 = (s: string) => crypto.createHash("sha256").update(s).digest("hex");

function hashSenha(senha: string): string {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(senha, salt, 64);
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}

function senhaConfere(senha: string, guardado: string | null): boolean {
  if (!guardado?.startsWith("scrypt$")) return false;
  const [, saltHex, hashHex] = guardado.split("$");
  const esperado = Buffer.from(hashHex, "hex");
  const calculado = crypto.scryptSync(senha, Buffer.from(saltHex, "hex"), esperado.length);
  return crypto.timingSafeEqual(esperado, calculado);
}

export const normalizarEmail = (e: string) => e.trim().toLowerCase();

export function prepararTabelas(db: Db) {
  const cols = new Set((db.prepare(`PRAGMA table_info(users)`).all() as { name: string }[]).map((c) => c.name));
  for (const [nome, tipo] of [
    ["email", "TEXT"],
    ["password_hash", "TEXT"],
    ["plan", "TEXT"],
    ["trial_ends_on", "TEXT"],
    ["verified_at", "TEXT"],
  ]) {
    if (!cols.has(nome)) db.exec(`ALTER TABLE users ADD COLUMN ${nome} ${tipo}`);
  }
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users (email) WHERE email IS NOT NULL;
    CREATE TABLE IF NOT EXISTS auth_codes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      phone TEXT NOT NULL,
      purpose TEXT NOT NULL,
      code_hash TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      used_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_auth_codes_phone ON auth_codes (phone, purpose, created_at);
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      phone TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}

export function auth(db: Db) {
  prepararTabelas(db);
  const agora = () => new Date();
  const iso = (d: Date) => d.toISOString();

  const conta = (where: string, valor: string) =>
    db.prepare(`SELECT phone, name, email, plan, trial_ends_on, verified_at FROM users WHERE ${where} = ?`).get(valor) as
      | Conta
      | undefined;

  return {
    porTelefone: (phone: string) => conta("phone", phone),
    porEmail: (email: string) => conta("email", normalizarEmail(email)),

    /** Cria a conta ainda nao ativada. Telefone ja usado pelo WhatsApp ganha e-mail e senha sem perder os dados. */
    cadastrar(d: { nome: string; telefone: string; email: string; senha: string; plano: Plano }) {
      const email = normalizarEmail(d.email);
      const dono = this.porEmail(email);
      if (dono && dono.phone !== d.telefone) throw new AuthError(409, "Esse e-mail já tem conta. Entre ou recupere a senha.");
      const existente = this.porTelefone(d.telefone);
      if (existente?.verified_at && existente.email) throw new AuthError(409, "Esse WhatsApp já tem conta. Entre ou recupere a senha.");
      const fimTeste = new Date(agora().getTime() + TESTE_GRATIS_DIAS * 86_400_000).toISOString().slice(0, 10);
      db.prepare(
        `INSERT INTO users (phone, name, email, password_hash, plan, trial_ends_on)
         VALUES (@phone, @name, @email, @hash, @plan, @trial)
         ON CONFLICT(phone) DO UPDATE SET name = excluded.name, email = excluded.email,
           password_hash = excluded.password_hash, plan = excluded.plan,
           trial_ends_on = COALESCE(users.trial_ends_on, excluded.trial_ends_on)`,
      ).run({ phone: d.telefone, name: d.nome, email, hash: hashSenha(d.senha), plan: d.plano, trial: fimTeste });
      return this.porTelefone(d.telefone)!;
    },

    /** Gera um codigo de 6 digitos; devolve o codigo em claro so para quem vai envia-lo. */
    gerarCodigo(phone: string, finalidade: Finalidade): string {
      const desde = iso(new Date(agora().getTime() - JANELA_MIN * 60_000));
      const recentes = (
        db.prepare(`SELECT COUNT(*) AS n FROM auth_codes WHERE phone = ? AND created_at >= datetime(?)`).get(phone, desde) as { n: number }
      ).n;
      if (recentes >= CODIGOS_POR_JANELA) throw new AuthError(429, `Muitos códigos pedidos. Tente de novo em ${JANELA_MIN} minutos.`);
      const codigo = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
      db.prepare(`UPDATE auth_codes SET used_at = datetime('now') WHERE phone = ? AND purpose = ? AND used_at IS NULL`).run(phone, finalidade);
      db.prepare(`INSERT INTO auth_codes (phone, purpose, code_hash, expires_at) VALUES (?, ?, ?, ?)`).run(
        phone,
        finalidade,
        sha256(codigo),
        iso(new Date(agora().getTime() + CODIGO_VALIDADE_MIN * 60_000)),
      );
      return codigo;
    },

    conferirCodigo(phone: string, finalidade: Finalidade, codigo: string) {
      const linha = db
        .prepare(
          `SELECT id, code_hash, expires_at, attempts FROM auth_codes
           WHERE phone = ? AND purpose = ? AND used_at IS NULL ORDER BY id DESC LIMIT 1`,
        )
        .get(phone, finalidade) as { id: number; code_hash: string; expires_at: string; attempts: number } | undefined;
      if (!linha || new Date(linha.expires_at) < agora()) throw new AuthError(400, "Código expirado. Peça um novo.");
      if (linha.attempts >= CODIGO_TENTATIVAS) throw new AuthError(429, "Tentativas esgotadas. Peça um novo código.");
      const ok = crypto.timingSafeEqual(Buffer.from(sha256(codigo.trim())), Buffer.from(linha.code_hash));
      if (!ok) {
        db.prepare(`UPDATE auth_codes SET attempts = attempts + 1 WHERE id = ?`).run(linha.id);
        throw new AuthError(400, "Código incorreto.");
      }
      db.prepare(`UPDATE auth_codes SET used_at = datetime('now') WHERE id = ?`).run(linha.id);
    },

    ativar(phone: string) {
      db.prepare(`UPDATE users SET verified_at = COALESCE(verified_at, datetime('now')) WHERE phone = ?`).run(phone);
    },

    entrar(email: string, senha: string): Conta {
      const linha = db
        .prepare(`SELECT phone, password_hash, verified_at FROM users WHERE email = ?`)
        .get(normalizarEmail(email)) as { phone: string; password_hash: string | null; verified_at: string | null } | undefined;
      // Mesma mensagem para e-mail inexistente e senha errada, para nao revelar quem tem conta.
      if (!linha || !senhaConfere(senha, linha.password_hash)) throw new AuthError(401, "E-mail ou senha incorretos.");
      if (!linha.verified_at) throw new AuthError(403, "Falta ativar a conta pelo código do WhatsApp.");
      return this.porTelefone(linha.phone)!;
    },

    trocarSenha(phone: string, senha: string) {
      db.prepare(`UPDATE users SET password_hash = ? WHERE phone = ?`).run(hashSenha(senha), phone);
      db.prepare(`DELETE FROM sessions WHERE phone = ?`).run(phone);
    },

    abrirSessao(phone: string): string {
      const token = crypto.randomBytes(32).toString("base64url");
      db.prepare(`INSERT INTO sessions (token_hash, phone, expires_at) VALUES (?, ?, ?)`).run(
        sha256(token),
        phone,
        iso(new Date(agora().getTime() + SESSAO_DIAS * 86_400_000)),
      );
      return token;
    },

    sessao(token: string): string | null {
      const linha = db.prepare(`SELECT phone, expires_at FROM sessions WHERE token_hash = ?`).get(sha256(token)) as
        | { phone: string; expires_at: string }
        | undefined;
      if (!linha || new Date(linha.expires_at) < agora()) return null;
      return linha.phone;
    },

    fecharSessao(token: string) {
      db.prepare(`DELETE FROM sessions WHERE token_hash = ?`).run(sha256(token));
    },
  };
}

export type Auth = ReturnType<typeof auth>;
export { hashSenha };
