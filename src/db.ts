import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { config } from "./config.js";
import { prepararTabelasConta } from "./conta.js";
import { prepararTabelasDocumentos } from "./documentos.js";

export type Kind = "despesa" | "receita";
export type Recurrence = "diario" | "semanal" | "mensal" | null;

export interface Transaction {
  id: number;
  phone: string;
  kind: Kind;
  amount_cents: number;
  category: string;
  description: string;
  payment_method: string | null;
  occurred_on: string;
  created_at: string;
  /** Pessoa ou estabelecimento do outro lado: quem recebeu o Pix, a loja da compra. */
  counterpart: string | null;
  installment_group: string | null;
  installment_number: number | null;
  installment_total: number | null;
  /** Telefone de quem lancou; nulo nos registros anteriores a conta compartilhada, que sao do titular. */
  created_by: string | null;
}

type Opcionais = "counterpart" | "installment_group" | "installment_number" | "installment_total" | "created_by";
export type NewTransaction = Omit<Transaction, "id" | "created_at" | Opcionais> & Partial<Pick<Transaction, Opcionais>>;

export interface Reminder {
  id: number;
  phone: string;
  text: string;
  next_run_at: string;
  recurrence: Recurrence;
  status: "ativo" | "concluido" | "cancelado";
  created_by: string | null;
  /** Quem recebe o aviso; nulo = o telefone da conta. */
  notify_phone: string | null;
}

export type TaskStatus = "pendente" | "andamento" | "concluida";
export type TaskPriority = "normal" | "alta" | "urgente";

export interface Task {
  id: number;
  phone: string;
  title: string;
  notes: string | null;
  project: string | null;
  due_on: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  created_at: string;
  done_at: string | null;
  created_by: string | null;
}

export interface Research {
  id: number;
  phone: string;
  question: string;
  summary: string | null;
  sources: string;
  status: "andamento" | "entregue" | "falhou";
  created_at: string;
}

export function openDb(file = config.dbPath) {
  if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      phone TEXT PRIMARY KEY,
      name TEXT,
      last_summary_on TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS processed_messages (
      id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      phone TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
      text TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      phone TEXT NOT NULL,
      kind TEXT NOT NULL CHECK (kind IN ('despesa', 'receita')),
      amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
      category TEXT NOT NULL,
      description TEXT NOT NULL,
      payment_method TEXT,
      occurred_on TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      deleted_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_tx_phone_date ON transactions (phone, occurred_on);
    CREATE TABLE IF NOT EXISTS reminders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      phone TEXT NOT NULL,
      text TEXT NOT NULL,
      next_run_at TEXT NOT NULL,
      recurrence TEXT CHECK (recurrence IN ('diario', 'semanal', 'mensal')),
      status TEXT NOT NULL DEFAULT 'ativo',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_rem_due ON reminders (status, next_run_at);
    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      phone TEXT NOT NULL,
      title TEXT NOT NULL,
      notes TEXT,
      project TEXT,
      due_on TEXT,
      priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('normal', 'alta', 'urgente')),
      status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'andamento', 'concluida')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      done_at TEXT,
      deleted_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_tasks_phone ON tasks (phone, status);
    CREATE TABLE IF NOT EXISTS research (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      phone TEXT NOT NULL,
      question TEXT NOT NULL,
      summary TEXT,
      sources TEXT NOT NULL DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'andamento' CHECK (status IN ('andamento', 'entregue', 'falhou')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  // Bancos criados antes desses campos recebem as colunas sem perder dados.
  for (const [table, name, type] of [
    ["transactions", "counterpart", "TEXT"],
    ["transactions", "installment_group", "TEXT"],
    ["transactions", "installment_number", "INTEGER"],
    ["transactions", "installment_total", "INTEGER"],
    ["transactions", "created_by", "TEXT"],
    ["reminders", "created_by", "TEXT"],
    ["reminders", "notify_phone", "TEXT"],
    ["tasks", "created_by", "TEXT"],
  ]) {
    const cols = (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name);
    if (!cols.includes(name)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${type}`);
  }
  db.exec(`CREATE INDEX IF NOT EXISTS idx_tx_counterpart ON transactions (phone, counterpart)`);
  prepararTabelasConta(db);
  prepararTabelasDocumentos(db);
  return db;
}

export type Db = ReturnType<typeof openDb>;

export function repo(db: Db) {
  return {
    /** Conexao crua, para modulos com tabelas proprias (como o de autenticacao). */
    db,

    ensureUser(phone: string, name?: string) {
      db.prepare(
        `INSERT INTO users (phone, name) VALUES (?, ?)
         ON CONFLICT(phone) DO UPDATE SET name = COALESCE(excluded.name, users.name)`,
      ).run(phone, name ?? null);
    },

    /** true se a mensagem ainda nao tinha sido processada; a Meta reenvia webhooks. */
    markProcessed(messageId: string): boolean {
      return db.prepare(`INSERT OR IGNORE INTO processed_messages (id) VALUES (?)`).run(messageId).changes === 1;
    },

    addHistory(phone: string, role: "user" | "assistant", text: string) {
      db.prepare(`INSERT INTO history (phone, role, text) VALUES (?, ?, ?)`).run(phone, role, text);
    },

    recentHistory(phone: string, limit = 20): { role: "user" | "assistant"; text: string }[] {
      const rows = db
        .prepare(`SELECT role, text FROM history WHERE phone = ? ORDER BY id DESC LIMIT ?`)
        .all(phone, limit) as { role: "user" | "assistant"; text: string }[];
      return rows.reverse();
    },

    addTransaction(t: NewTransaction): Transaction {
      const info = db
        .prepare(
          `INSERT INTO transactions (phone, kind, amount_cents, category, description, payment_method, occurred_on,
             counterpart, installment_group, installment_number, installment_total, created_by)
           VALUES (@phone, @kind, @amount_cents, @category, @description, @payment_method, @occurred_on,
             @counterpart, @installment_group, @installment_number, @installment_total, @created_by)`,
        )
        .run({
          counterpart: null,
          installment_group: null,
          installment_number: null,
          installment_total: null,
          created_by: null,
          ...t,
        });
      return this.getTransaction(t.phone, Number(info.lastInsertRowid))!;
    },

    /** Lanca as parcelas de uma compra de uma vez, uma por mes a partir da data da primeira. */
    addInstallments(t: Omit<NewTransaction, "installment_group" | "installment_number" | "installment_total">, parcelas: number): Transaction[] {
      const group = `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
      const [y, m, d] = t.occurred_on.split("-").map(Number);
      const criar = db.transaction(() =>
        Array.from({ length: parcelas }, (_, i) => {
          // Dia 31 vira o ultimo dia dos meses mais curtos.
          const ultimo = new Date(Date.UTC(y, m - 1 + i + 1, 0)).getUTCDate();
          const data = new Date(Date.UTC(y, m - 1 + i, Math.min(d, ultimo))).toISOString().slice(0, 10);
          return this.addTransaction({ ...t, occurred_on: data, installment_group: group, installment_number: i + 1, installment_total: parcelas });
        }),
      );
      return criar();
    },

    getTransaction(phone: string, id: number): Transaction | undefined {
      return db
        .prepare(`SELECT * FROM transactions WHERE phone = ? AND id = ? AND deleted_at IS NULL`)
        .get(phone, id) as Transaction | undefined;
    },

    updateTransaction(phone: string, id: number, fields: Partial<Omit<Transaction, "id" | "phone" | "created_at">>) {
      const allowed = ["kind", "amount_cents", "category", "description", "payment_method", "occurred_on", "counterpart"] as const;
      const sets = allowed.filter((k) => fields[k] !== undefined);
      if (sets.length === 0) return this.getTransaction(phone, id);
      db.prepare(
        `UPDATE transactions SET ${sets.map((k) => `${k} = @${k}`).join(", ")}
         WHERE phone = @phone AND id = @id AND deleted_at IS NULL`,
      ).run({ ...Object.fromEntries(sets.map((k) => [k, fields[k]])), phone, id });
      return this.getTransaction(phone, id);
    },

    deleteTransaction(phone: string, id: number): boolean {
      return (
        db
          .prepare(`UPDATE transactions SET deleted_at = datetime('now') WHERE phone = ? AND id = ? AND deleted_at IS NULL`)
          .run(phone, id).changes === 1
      );
    },

    listTransactions(
      phone: string,
      from: string,
      to: string,
      opts: { kind?: Kind; category?: string; counterpart?: string; search?: string } = {},
    ) {
      return db
        .prepare(
          `SELECT * FROM transactions
           WHERE phone = @phone AND deleted_at IS NULL AND occurred_on BETWEEN @from AND @to
             AND (@kind IS NULL OR kind = @kind)
             AND (@category IS NULL OR lower(category) = lower(@category))
             AND (@counterpart IS NULL OR lower(counterpart) LIKE '%' || lower(@counterpart) || '%')
             AND (@search IS NULL OR lower(description || ' ' || COALESCE(counterpart, '') || ' ' || category)
                  LIKE '%' || lower(@search) || '%')
           ORDER BY occurred_on DESC, id DESC`,
        )
        .all({
          phone,
          from,
          to,
          kind: opts.kind ?? null,
          category: opts.category ?? null,
          counterpart: opts.counterpart ?? null,
          search: opts.search ?? null,
        }) as Transaction[];
    },

    counterparts(phone: string): string[] {
      return (
        db
          .prepare(
            `SELECT DISTINCT counterpart FROM transactions
             WHERE phone = ? AND deleted_at IS NULL AND counterpart IS NOT NULL ORDER BY counterpart`,
          )
          .all(phone) as { counterpart: string }[]
      ).map((r) => r.counterpart);
    },

    /** Saldo (receitas menos despesas) de tudo lancado antes da data, exclusiva. */
    balanceBefore(phone: string, date: string): number {
      const row = db
        .prepare(
          `SELECT COALESCE(SUM(CASE WHEN kind = 'receita' THEN amount_cents ELSE -amount_cents END), 0) AS total
           FROM transactions WHERE phone = ? AND deleted_at IS NULL AND occurred_on < ?`,
        )
        .get(phone, date) as { total: number };
      return row.total;
    },

    monthsWithData(phone: string): string[] {
      return (
        db
          .prepare(
            `SELECT DISTINCT substr(occurred_on, 1, 7) AS month FROM transactions
             WHERE phone = ? AND deleted_at IS NULL ORDER BY month DESC`,
          )
          .all(phone) as { month: string }[]
      ).map((r) => r.month);
    },

    categoryKinds(phone: string): { category: string; kind: Kind }[] {
      return db
        .prepare(
          `SELECT category, kind FROM transactions WHERE phone = ? AND deleted_at IS NULL
           GROUP BY category, kind ORDER BY category`,
        )
        .all(phone) as { category: string; kind: Kind }[];
    },

    categories(phone: string): string[] {
      return (
        db
          .prepare(`SELECT DISTINCT category FROM transactions WHERE phone = ? AND deleted_at IS NULL ORDER BY category`)
          .all(phone) as { category: string }[]
      ).map((r) => r.category);
    },

    addReminder(
      phone: string,
      text: string,
      nextRunAt: Date,
      recurrence: Recurrence,
      quem: { created_by?: string | null; notify_phone?: string | null } = {},
    ): Reminder {
      const info = db
        .prepare(`INSERT INTO reminders (phone, text, next_run_at, recurrence, created_by, notify_phone) VALUES (?, ?, ?, ?, ?, ?)`)
        .run(phone, text, nextRunAt.toISOString(), recurrence, quem.created_by ?? null, quem.notify_phone ?? null);
      return db.prepare(`SELECT * FROM reminders WHERE id = ?`).get(info.lastInsertRowid) as Reminder;
    },

    listReminders(phone: string): Reminder[] {
      return db
        .prepare(`SELECT * FROM reminders WHERE phone = ? AND status = 'ativo' ORDER BY next_run_at`)
        .all(phone) as Reminder[];
    },

    cancelReminder(phone: string, id: number): boolean {
      return (
        db
          .prepare(`UPDATE reminders SET status = 'cancelado' WHERE phone = ? AND id = ? AND status = 'ativo'`)
          .run(phone, id).changes === 1
      );
    },

    dueReminders(now: Date): Reminder[] {
      return db
        .prepare(`SELECT * FROM reminders WHERE status = 'ativo' AND next_run_at <= ? ORDER BY next_run_at`)
        .all(now.toISOString()) as Reminder[];
    },

    advanceReminder(r: Reminder, next: Date | null) {
      if (next) db.prepare(`UPDATE reminders SET next_run_at = ? WHERE id = ?`).run(next.toISOString(), r.id);
      else db.prepare(`UPDATE reminders SET status = 'concluido' WHERE id = ?`).run(r.id);
    },

    getUser(phone: string): { phone: string; name: string | null } | undefined {
      return db.prepare(`SELECT phone, name FROM users WHERE phone = ?`).get(phone) as
        | { phone: string; name: string | null }
        | undefined;
    },

    allReminders(phone: string): (Reminder & { created_at: string })[] {
      return db
        .prepare(`SELECT * FROM reminders WHERE phone = ? ORDER BY next_run_at`)
        .all(phone) as (Reminder & { created_at: string })[];
    },

    addTask(
      phone: string,
      t: { title: string; notes?: string | null; project?: string | null; due_on?: string | null; priority?: TaskPriority; created_by?: string | null },
    ): Task {
      const info = db
        .prepare(`INSERT INTO tasks (phone, title, notes, project, due_on, priority, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)`)
        .run(phone, t.title, t.notes ?? null, t.project ?? null, t.due_on ?? null, t.priority ?? "normal", t.created_by ?? null);
      return this.getTask(phone, Number(info.lastInsertRowid))!;
    },

    getTask(phone: string, id: number): Task | undefined {
      return db.prepare(`SELECT * FROM tasks WHERE phone = ? AND id = ? AND deleted_at IS NULL`).get(phone, id) as
        | Task
        | undefined;
    },

    listTasks(phone: string, status?: TaskStatus): Task[] {
      return db
        .prepare(
          `SELECT * FROM tasks WHERE phone = @phone AND deleted_at IS NULL AND (@status IS NULL OR status = @status)
           ORDER BY status = 'concluida', due_on IS NULL, due_on,
             CASE priority WHEN 'urgente' THEN 0 WHEN 'alta' THEN 1 ELSE 2 END, id`,
        )
        .all({ phone, status: status ?? null }) as Task[];
    },

    updateTask(phone: string, id: number, fields: Partial<Pick<Task, "title" | "notes" | "project" | "due_on" | "priority" | "status">>) {
      const allowed = ["title", "notes", "project", "due_on", "priority", "status"] as const;
      const sets = allowed.filter((k) => fields[k] !== undefined);
      if (sets.length) {
        const doneAt =
          fields.status === undefined ? "" : `, done_at = CASE WHEN @status = 'concluida' THEN datetime('now') ELSE NULL END`;
        db.prepare(
          `UPDATE tasks SET ${sets.map((k) => `${k} = @${k}`).join(", ")}${doneAt}
           WHERE phone = @phone AND id = @id AND deleted_at IS NULL`,
        ).run({ ...Object.fromEntries(sets.map((k) => [k, fields[k]])), phone, id });
      }
      return this.getTask(phone, id);
    },

    deleteTask(phone: string, id: number): boolean {
      return (
        db.prepare(`UPDATE tasks SET deleted_at = datetime('now') WHERE phone = ? AND id = ? AND deleted_at IS NULL`).run(phone, id)
          .changes === 1
      );
    },

    listResearch(phone: string): Research[] {
      return db.prepare(`SELECT * FROM research WHERE phone = ? ORDER BY id DESC`).all(phone) as Research[];
    },

    /** Contagem de registros por mes (AAAA-MM) em cada tabela, para a mesa de Operacao. */
    activityByMonth(phone: string, since: string) {
      const q = (table: string, column: string) =>
        db
          .prepare(
            `SELECT substr(${column}, 1, 7) AS month, COUNT(*) AS total FROM ${table}
             WHERE phone = ? AND ${column} >= ? GROUP BY month`,
          )
          .all(phone, since) as { month: string; total: number }[];
      return {
        transactions: q("transactions", "occurred_on"),
        reminders: q("reminders", "created_at"),
        tasks: q("tasks", "created_at"),
        messages: q("history", "created_at"),
      };
    },

    usersForSummary(today: string): string[] {
      return (
        db
          // Membro de conta compartilhada nao recebe o resumo da conta: so o titular.
          .prepare(
            `SELECT phone FROM users WHERE (last_summary_on IS NULL OR last_summary_on < ?)
               AND phone NOT IN (SELECT member_phone FROM account_members WHERE removed_at IS NULL)`,
          )
          .all(today) as { phone: string }[]
      ).map((r) => r.phone);
    },

    markSummarySent(phone: string, today: string) {
      db.prepare(`UPDATE users SET last_summary_on = ? WHERE phone = ?`).run(today, phone);
    },
  };
}

export type Repo = ReturnType<typeof repo>;
