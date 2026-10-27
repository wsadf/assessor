import { AuthError } from "./auth.js";
import { config } from "./config.js";
import { repoDoContexto } from "./conta.js";
import type { Db, Kind, Repo, Transaction } from "./db.js";
import { exigir, pode, type Capacidade, type Contexto } from "./permissoes.js";
import { brl, fromLocal, localDate } from "./time.js";

export const TIPOS_AVISO = {
  vencimentos: { nome: "Vencimentos", descricao: "Na véspera do vencimento de cada conta a pagar", exige: ["despesas"], hora: 9 },
  categoria: { nome: "Categoria acima do normal", descricao: "Quando uma categoria gasta 15% a mais que no mesmo ponto do mês passado", exige: ["despesas"], hora: 9 },
  recorrentes: { nome: "Lançamentos recorrentes", descricao: "Quando um gasto ou receita recorrente é lançado sozinho", exige: ["despesas", "receitas"], hora: 9 },
  resumo_manha: { nome: "Resumo da manhã", descricao: "Gastos de ontem, total do mês, lembretes e vencimentos do dia", exige: null, hora: config.dailySummaryHour },
  resumo_noite: { nome: "Resumo da noite", descricao: "O que a equipe registrou no dia", exige: null, hora: 21 },
} satisfies Record<string, { nome: string; descricao: string; exige: Capacidade[] | null; hora: number }>;

export type TipoAviso = keyof typeof TIPOS_AVISO;
export const TIPO_IDS = Object.keys(TIPOS_AVISO) as [TipoAviso, ...TipoAviso[]];

export interface ContaPagar {
  id: number;
  phone: string;
  created_by: string;
  description: string;
  amount_cents: number | null;
  category: string;
  due_on: string;
  due_day: number | null;
  status: "aberta" | "paga" | "cancelada";
  paid_transaction_id: number | null;
  created_at: string;
}

export type Frequencia = "diaria" | "semanal" | "mensal";

export interface Recorrencia {
  id: number;
  phone: string;
  created_by: string;
  kind: Kind;
  amount_cents: number;
  category: string;
  description: string;
  counterpart: string | null;
  payment_method: string | null;
  frequency: Frequencia;
  anchor_day: number | null;
  next_on: string;
  status: "ativa" | "pausada" | "cancelada";
  created_at: string;
}

export function prepararTabelasAvisos(db: Db) {
  const tipos = TIPO_IDS.map((t) => `'${t}'`).join(", ");
  db.exec(`
    CREATE TABLE IF NOT EXISTS bills (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      phone TEXT NOT NULL,
      created_by TEXT NOT NULL,
      description TEXT NOT NULL CHECK (length(description) BETWEEN 1 AND 80),
      amount_cents INTEGER CHECK (amount_cents IS NULL OR amount_cents > 0),
      category TEXT NOT NULL DEFAULT 'Contas',
      due_on TEXT NOT NULL,
      due_day INTEGER CHECK (due_day IS NULL OR due_day BETWEEN 1 AND 31),
      status TEXT NOT NULL DEFAULT 'aberta' CHECK (status IN ('aberta', 'paga', 'cancelada')),
      paid_transaction_id INTEGER,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_bills_vencimento ON bills (phone, status, due_on);
    CREATE TABLE IF NOT EXISTS recurring (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      phone TEXT NOT NULL,
      created_by TEXT NOT NULL,
      kind TEXT NOT NULL CHECK (kind IN ('despesa', 'receita')),
      amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
      category TEXT NOT NULL,
      description TEXT NOT NULL CHECK (length(description) BETWEEN 1 AND 80),
      counterpart TEXT,
      payment_method TEXT,
      frequency TEXT NOT NULL CHECK (frequency IN ('diaria', 'semanal', 'mensal')),
      anchor_day INTEGER CHECK (anchor_day IS NULL OR anchor_day BETWEEN 0 AND 31),
      next_on TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'ativa' CHECK (status IN ('ativa', 'pausada', 'cancelada')),
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_recurring_proxima ON recurring (status, next_on);
    CREATE TABLE IF NOT EXISTS notice_prefs (
      phone TEXT NOT NULL,
      kind TEXT NOT NULL CHECK (kind IN (${tipos})),
      enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
      hour INTEGER NOT NULL CHECK (hour BETWEEN 0 AND 23),
      PRIMARY KEY (phone, kind)
    );
    CREATE TABLE IF NOT EXISTS notice_log (
      phone TEXT NOT NULL,
      kind TEXT NOT NULL,
      key TEXT NOT NULL,
      sent_at TEXT NOT NULL,
      PRIMARY KEY (phone, kind, key)
    );
    CREATE TABLE IF NOT EXISTS pending_notices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      phone TEXT NOT NULL,
      text TEXT NOT NULL,
      created_at TEXT NOT NULL,
      delivered_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_pending_phone ON pending_notices (phone, delivered_at);
  `);
}

// ---------- datas ----------

const asUtc = (iso: string) => new Date(`${iso}T12:00:00Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);
export const addDias = (data: string, n: number) => {
  const d = asUtc(data);
  d.setUTCDate(d.getUTCDate() + n);
  return iso(d);
};
const ultimoDia = (ano: number, mes: number) => new Date(Date.UTC(ano, mes, 0)).getUTCDate();
const diaDaSemana = (data: string) => asUtc(data).getUTCDay();

/** Mesmo dia no mes seguinte; dia 31 vira o ultimo dia dos meses curtos. */
function mesSeguinte(data: string, dia: number) {
  const [y, m] = data.split("-").map(Number);
  const alvo = new Date(Date.UTC(y, m, 1));
  const ay = alvo.getUTCFullYear();
  const am = alvo.getUTCMonth() + 1;
  return `${ay}-${String(am).padStart(2, "0")}-${String(Math.min(dia, ultimoDia(ay, am))).padStart(2, "0")}`;
}

/** Ano e semana ISO, para limitar um aviso a uma vez por semana. */
export function semanaIso(data: string) {
  const d = asUtc(data);
  const diaIso = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - diaIso);
  const inicioAno = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const semana = Math.ceil(((d.getTime() - inicioAno.getTime()) / 86_400_000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(semana).padStart(2, "0")}`;
}

const SEMANA = ["domingo", "segunda", "terca", "quarta", "quinta", "sexta", "sabado"];
const toCents = (v: number) => Math.round(v * 100);

// ---------- preferencias, registro e fila ----------

const disponivel = (ctx: Contexto, tipo: TipoAviso) => {
  const exige: readonly Capacidade[] | null = TIPOS_AVISO[tipo].exige;
  return !exige || exige.some((c) => pode(ctx, c));
};

/** Titular recebe o essencial como antes da conta compartilhada; membro so o que ligar. */
const padraoLigado = (ctx: Contexto, tipo: TipoAviso) => ctx.perfil === "titular" && tipo !== "resumo_noite";

export function preferencias(db: Db, ctx: Contexto) {
  const linhas = db.prepare(`SELECT kind, enabled, hour FROM notice_prefs WHERE phone = ?`).all(ctx.membro) as {
    kind: TipoAviso;
    enabled: number;
    hour: number;
  }[];
  return TIPO_IDS.map((tipo) => {
    const l = linhas.find((x) => x.kind === tipo);
    return {
      tipo,
      nome: TIPOS_AVISO[tipo].nome,
      descricao: TIPOS_AVISO[tipo].descricao,
      ligado: l ? l.enabled === 1 : padraoLigado(ctx, tipo),
      hora: l?.hour ?? TIPOS_AVISO[tipo].hora,
      disponivel: disponivel(ctx, tipo),
    };
  });
}

export function definirPreferencia(db: Db, phone: string, tipo: TipoAviso, p: { ligado: boolean; hora?: number | null }) {
  const atual = db.prepare(`SELECT hour FROM notice_prefs WHERE phone = ? AND kind = ?`).get(phone, tipo) as { hour: number } | undefined;
  db.prepare(
    `INSERT INTO notice_prefs (phone, kind, enabled, hour) VALUES (?, ?, ?, ?)
     ON CONFLICT(phone, kind) DO UPDATE SET enabled = excluded.enabled, hour = excluded.hour`,
  ).run(phone, tipo, p.ligado ? 1 : 0, p.hora ?? atual?.hour ?? TIPOS_AVISO[tipo].hora);
}

/** true so na primeira vez que a chave aparece: o agendador roda a cada 30 s e nao pode repetir aviso. */
export function marcarEnvio(db: Db, phone: string, tipo: string, chave: string, agora: Date) {
  return (
    db.prepare(`INSERT OR IGNORE INTO notice_log (phone, kind, key, sent_at) VALUES (?, ?, ?, ?)`).run(phone, tipo, chave, agora.toISOString())
      .changes === 1
  );
}

export function enfileirar(db: Db, phone: string, texto: string, agora = new Date()) {
  db.prepare(`INSERT INTO pending_notices (phone, text, created_at) VALUES (?, ?, ?)`).run(phone, texto, agora.toISOString());
}

/** Avisos que a Meta recusou, para sair na proxima conversa; os de mais de 7 dias perderam o sentido. */
export function retirarPendentes(db: Db, phone: string, agora: Date): string[] {
  const limite = new Date(agora.getTime() - 7 * 86_400_000).toISOString();
  db.prepare(`DELETE FROM pending_notices WHERE phone = ? AND delivered_at IS NULL AND created_at < ?`).run(phone, limite);
  const linhas = db
    .prepare(`SELECT id, text FROM pending_notices WHERE phone = ? AND delivered_at IS NULL ORDER BY id`)
    .all(phone) as { id: number; text: string }[];
  const marcar = db.prepare(`UPDATE pending_notices SET delivered_at = ? WHERE id = ?`);
  for (const l of linhas) marcar.run(agora.toISOString(), l.id);
  return linhas.map((l) => l.text);
}

export function limparRegistros(db: Db, agora: Date) {
  db.prepare(`DELETE FROM notice_log WHERE sent_at < ?`).run(new Date(agora.getTime() - 90 * 86_400_000).toISOString());
  db.prepare(`DELETE FROM pending_notices WHERE created_at < ?`).run(new Date(agora.getTime() - 7 * 86_400_000).toISOString());
}

export type Envio = (para: string, texto: string) => Promise<void>;

/** Envia uma vez por chave; recusa da Meta (fora da janela de 24 h, por exemplo) vira pendente. */
export async function entregar(db: Db, send: Envio, phone: string, tipo: string, chave: string, texto: string, agora: Date) {
  if (!marcarEnvio(db, phone, tipo, chave, agora)) return false;
  try {
    await send(phone, texto);
  } catch (err) {
    console.error(`[aviso ${tipo} ${phone}] guardado para a proxima conversa`, err);
    enfileirar(db, phone, texto, agora);
  }
  return true;
}

// ---------- contas a pagar ----------

const contaPorId = (db: Db, id: number) => db.prepare(`SELECT * FROM bills WHERE id = ?`).get(id) as ContaPagar | undefined;

function contaDaConta(db: Db, ctx: Contexto, id: number) {
  const c = contaPorId(db, id);
  if (!c || c.phone !== ctx.conta || c.status === "cancelada") throw new AuthError(404, `Conta a pagar #${id} nao encontrada.`);
  return c;
}

export function criarConta(db: Db, ctx: Contexto, d: { descricao: string; vencimento: string; valor?: number | null; categoria?: string | null; mensal: boolean }) {
  exigir(ctx, "despesas");
  const id = Number(
    db
      .prepare(
        `INSERT INTO bills (phone, created_by, description, amount_cents, category, due_on, due_day, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        ctx.conta,
        ctx.membro,
        d.descricao.trim().slice(0, 80),
        d.valor ? toCents(d.valor) : null,
        d.categoria?.trim() || "Contas",
        d.vencimento,
        d.mensal ? Number(d.vencimento.slice(8, 10)) : null,
        new Date().toISOString(),
      ).lastInsertRowid,
  );
  return contaPorId(db, id)!;
}

export function listarContas(db: Db, conta: string, f: { hoje: string; incluirPagas?: boolean }) {
  return (
    db
      .prepare(
        `SELECT * FROM bills WHERE phone = ? AND status != 'cancelada' AND (status = 'aberta' OR ?) ORDER BY status = 'paga', due_on, id`,
      )
      .all(conta, f.incluirPagas ? 1 : 0) as ContaPagar[]
  ).map((c) => ({ ...c, vencida: c.status === "aberta" && c.due_on < f.hoje }));
}

export function contasAVencer(db: Db, conta: string, de: string, ate: string) {
  return db
    .prepare(`SELECT * FROM bills WHERE phone = ? AND status = 'aberta' AND due_on BETWEEN ? AND ? ORDER BY due_on, id`)
    .all(conta, de, ate) as ContaPagar[];
}

/** Registra a despesa que a pessoa ja pagou; a mensal passa a vencer no mes seguinte. */
export function pagarConta(repo: Repo, ctx: Contexto, id: number, p: { valor?: number | null; data?: string | null; pagamento?: string | null }) {
  exigir(ctx, "despesas");
  const c = contaDaConta(repo.db, ctx, id);
  if (c.status !== "aberta") throw new AuthError(400, `${c.description} ja esta paga.`);
  const centavos = p.valor ? toCents(p.valor) : c.amount_cents;
  if (!centavos) throw new AuthError(400, `Informe o valor pago: ${c.description} nao tem valor fixo cadastrado.`);
  const transacao = repo.addTransaction({
    phone: ctx.conta,
    created_by: ctx.membro,
    kind: "despesa",
    amount_cents: centavos,
    category: c.category,
    description: c.description,
    payment_method: p.pagamento ?? null,
    occurred_on: p.data ?? localDate(),
    bill_id: c.id,
  });
  if (c.due_day) {
    repo.db
      .prepare(`UPDATE bills SET due_on = ?, paid_transaction_id = ? WHERE id = ?`)
      .run(mesSeguinte(c.due_on, c.due_day), transacao.id, c.id);
  } else {
    repo.db.prepare(`UPDATE bills SET status = 'paga', paid_transaction_id = ? WHERE id = ?`).run(transacao.id, c.id);
  }
  return { conta: contaPorId(repo.db, c.id)!, transacao };
}

export function atualizarConta(db: Db, ctx: Contexto, id: number, d: { descricao?: string; vencimento?: string; valor?: number | null; categoria?: string; mensal?: boolean }) {
  exigir(ctx, "despesas");
  const c = contaDaConta(db, ctx, id);
  const vencimento = d.vencimento ?? c.due_on;
  const mensal = d.mensal ?? c.due_day !== null;
  db.prepare(`UPDATE bills SET description = ?, due_on = ?, amount_cents = ?, category = ?, due_day = ? WHERE id = ?`).run(
    d.descricao?.trim().slice(0, 80) || c.description,
    vencimento,
    d.valor === undefined ? c.amount_cents : d.valor ? toCents(d.valor) : null,
    d.categoria?.trim() || c.category,
    mensal ? Number(vencimento.slice(8, 10)) : null,
    id,
  );
  return contaPorId(db, id)!;
}

export function cancelarConta(db: Db, ctx: Contexto, id: number) {
  exigir(ctx, "despesas");
  const c = contaDaConta(db, ctx, id);
  db.prepare(`UPDATE bills SET status = 'cancelada' WHERE id = ?`).run(id);
  return c;
}

// ---------- recorrencias ----------

const recorrenciaPorId = (db: Db, id: number) => db.prepare(`SELECT * FROM recurring WHERE id = ?`).get(id) as Recorrencia | undefined;
const capDoTipo = (k: Kind): Capacidade => (k === "receita" ? "receitas" : "despesas");

export function proximaData(r: Pick<Recorrencia, "frequency" | "anchor_day">, data: string) {
  if (r.frequency === "diaria") return addDias(data, 1);
  if (r.frequency === "semanal") return addDias(data, 7);
  return mesSeguinte(data, r.anchor_day ?? Number(data.slice(8, 10)));
}

/** Primeira data a partir de `desde` que cai no dia da recorrencia. */
function primeiraDesde(r: Pick<Recorrencia, "frequency" | "anchor_day">, desde: string) {
  if (r.frequency === "diaria") return desde;
  if (r.frequency === "semanal") return addDias(desde, ((r.anchor_day ?? 0) - diaDaSemana(desde) + 7) % 7);
  const [y, m] = desde.split("-").map(Number);
  const dia = Math.min(r.anchor_day ?? 1, ultimoDia(y, m));
  const nesteMes = `${desde.slice(0, 7)}-${String(dia).padStart(2, "0")}`;
  return nesteMes >= desde ? nesteMes : mesSeguinte(nesteMes, r.anchor_day ?? 1);
}

export function descreverFrequencia(r: Pick<Recorrencia, "frequency" | "anchor_day">) {
  if (r.frequency === "diaria") return "todo dia";
  if (r.frequency === "semanal") return `toda ${SEMANA[r.anchor_day ?? 0]}`;
  return `todo dia ${r.anchor_day} do mes`;
}

export function criarRecorrencia(
  db: Db,
  ctx: Contexto,
  d: { tipo: Kind; valor: number; categoria: string; descricao: string; frequencia: Frequencia; inicio: string; contraparte?: string | null; pagamento?: string | null },
) {
  exigir(ctx, capDoTipo(d.tipo));
  const anchor = d.frequencia === "semanal" ? diaDaSemana(d.inicio) : d.frequencia === "mensal" ? Number(d.inicio.slice(8, 10)) : null;
  const id = Number(
    db
      .prepare(
        `INSERT INTO recurring (phone, created_by, kind, amount_cents, category, description, counterpart, payment_method,
           frequency, anchor_day, next_on, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        ctx.conta,
        ctx.membro,
        d.tipo,
        toCents(d.valor),
        d.categoria.trim(),
        d.descricao.trim().slice(0, 80),
        d.contraparte ?? null,
        d.pagamento ?? null,
        d.frequencia,
        anchor,
        d.inicio,
        new Date().toISOString(),
      ).lastInsertRowid,
  );
  return recorrenciaPorId(db, id)!;
}

export function listarRecorrencias(db: Db, ctx: Contexto) {
  return (db.prepare(`SELECT * FROM recurring WHERE phone = ? AND status != 'cancelada' ORDER BY status, next_on, id`).all(ctx.conta) as Recorrencia[])
    .filter((r) => pode(ctx, capDoTipo(r.kind)));
}

export function alterarRecorrencia(db: Db, ctx: Contexto, id: number, acao: "pausar" | "retomar" | "cancelar" | null, hoje: string, valor?: number | null) {
  const r = recorrenciaPorId(db, id);
  if (!r || r.phone !== ctx.conta || r.status === "cancelada") throw new AuthError(404, `Recorrencia #${id} nao encontrada.`);
  exigir(ctx, capDoTipo(r.kind));
  if (valor) db.prepare(`UPDATE recurring SET amount_cents = ? WHERE id = ?`).run(toCents(valor), id);
  if (acao === "pausar") db.prepare(`UPDATE recurring SET status = 'pausada' WHERE id = ?`).run(id);
  if (acao === "cancelar") db.prepare(`UPDATE recurring SET status = 'cancelada' WHERE id = ?`).run(id);
  // Retomar nao lanca o periodo pausado: recomeca na proxima data a partir de hoje.
  if (acao === "retomar") db.prepare(`UPDATE recurring SET status = 'ativa', next_on = ? WHERE id = ?`).run(primeiraDesde(r, hoje), id);
  return recorrenciaPorId(db, id)!;
}

/** Lanca o que venceu ate hoje. Servidor parado nao gera enxurrada: so os ultimos 7 dias contam. */
export function lancarDevidas(repo: Repo, hoje: string): Transaction[] {
  const db = repo.db;
  const devidas = db.prepare(`SELECT * FROM recurring WHERE status = 'ativa' AND next_on <= ?`).all(hoje) as Recorrencia[];
  const desde = addDias(hoje, -6);
  const existe = db.prepare(`SELECT 1 FROM transactions WHERE recurring_id = ? AND occurred_on = ?`);
  const criadas: Transaction[] = [];
  const lancar = db.transaction((r: Recorrencia) => {
    let data = r.next_on;
    for (; data <= hoje; data = proximaData(r, data)) {
      if (data < desde || existe.get(r.id, data)) continue;
      criadas.push(
        repo.addTransaction({
          phone: r.phone,
          created_by: r.created_by,
          kind: r.kind,
          amount_cents: r.amount_cents,
          category: r.category,
          description: r.description,
          payment_method: r.payment_method,
          occurred_on: data,
          counterpart: r.counterpart,
          recurring_id: r.id,
        }),
      );
    }
    db.prepare(`UPDATE recurring SET next_on = ? WHERE id = ?`).run(data, r.id);
  });
  for (const r of devidas) lancar(r);
  return criadas;
}

// ---------- categoria e comparativo ----------

const somaPorCategoria = (txs: Transaction[]) => {
  const mapa = new Map<string, number>();
  for (const t of txs) mapa.set(t.category, (mapa.get(t.category) ?? 0) + t.amount_cents);
  return mapa;
};

/** Mesmo intervalo do mes anterior: do dia 1 ate o dia de hoje, com 31 virando o ultimo dia. */
function intervalos(hoje: string) {
  const [y, m, d] = hoje.split("-").map(Number);
  const ant = new Date(Date.UTC(y, m - 2, 1));
  const ay = ant.getUTCFullYear();
  const am = ant.getUTCMonth() + 1;
  const mesAnt = `${ay}-${String(am).padStart(2, "0")}`;
  return {
    atual: { de: `${hoje.slice(0, 7)}-01`, ate: hoje },
    anterior: { de: `${mesAnt}-01`, ate: `${mesAnt}-${String(Math.min(d, ultimoDia(ay, am))).padStart(2, "0")}` },
    dia: d,
    diasNoMes: ultimoDia(y, m),
    mesAnterior: mesAnt,
  };
}

export interface CategoriaAcima {
  categoria: string;
  atual: number;
  anterior: number;
  percentual: number;
  projecao: number;
}

export function categoriasAcima(repo: Repo, conta: string, hoje: string): CategoriaAcima[] {
  const i = intervalos(hoje);
  const atual = somaPorCategoria(repo.listTransactions(conta, i.atual.de, i.atual.ate, { kind: "despesa" }));
  const anterior = somaPorCategoria(repo.listTransactions(conta, i.anterior.de, i.anterior.ate, { kind: "despesa" }));
  return [...atual.entries()]
    .map(([categoria, valor]) => ({ categoria, atual: valor, anterior: anterior.get(categoria) ?? 0 }))
    // Pisos de R$ 100 e R$ 50: sem eles, "Padaria subiu 40%" por R$ 6 faz a pessoa desligar o aviso.
    .filter((c) => c.anterior >= 10_000 && c.atual >= c.anterior * 1.15 && c.atual - c.anterior > 5_000)
    .map((c) => ({ ...c, percentual: c.atual / c.anterior - 1, projecao: Math.round((c.atual / i.dia) * i.diasNoMes) }))
    .sort((a, b) => b.atual - b.anterior - (a.atual - a.anterior));
}

export function compararMeses(repo: Repo, conta: string, mes: string | null, hoje: string) {
  const atualMes = hoje.slice(0, 7);
  const referencia = !mes || mes === atualMes ? hoje : `${mes}-${String(ultimoDia(...(mes.split("-").map(Number) as [number, number]))).padStart(2, "0")}`;
  const i = intervalos(referencia);
  const atual = somaPorCategoria(repo.listTransactions(conta, i.atual.de, i.atual.ate, { kind: "despesa" }));
  const anterior = somaPorCategoria(repo.listTransactions(conta, i.anterior.de, i.anterior.ate, { kind: "despesa" }));
  const soma = (m: Map<string, number>) => [...m.values()].reduce((s, v) => s + v, 0);
  const categorias = new Set([...atual.keys(), ...anterior.keys()]);
  return {
    mes: referencia.slice(0, 7),
    mesAnterior: i.mesAnterior,
    ateODia: !mes || mes === atualMes ? i.dia : null,
    total: soma(atual),
    totalAnterior: soma(anterior),
    variacoes: [...categorias]
      .map((categoria) => ({ categoria, atual: atual.get(categoria) ?? 0, anterior: anterior.get(categoria) ?? 0 }))
      .map((v) => ({ ...v, diferenca: v.atual - v.anterior }))
      .sort((a, b) => Math.abs(b.diferenca) - Math.abs(a.diferenca))
      .slice(0, 3),
  };
}

// ---------- textos ----------

const pct = (v: number) => `${Math.round(v * 100)}%`;

export const textoVencimento = (c: ContaPagar) =>
  `📅 Amanha vence ${c.description}${c.amount_cents ? `: ${brl(c.amount_cents)}` : ""}. Quando pagar, me diga "paguei ${c.description.toLowerCase()}".`;

export const textoCategoria = (c: CategoriaAcima) =>
  `📈 ${c.categoria} esta ${pct(c.percentual)} acima do mesmo ponto do mes passado (${brl(c.atual)} contra ${brl(c.anterior)}). No ritmo de agora, o mes fecha perto de ${brl(c.projecao)}.`;

export const textoRecorrente = (t: Transaction) =>
  `🔁 Lancei ${t.description}: ${brl(t.amount_cents)} em ${t.category} (#${t.id}). Para parar: "cancela a recorrencia ${t.description.toLowerCase()}".`;

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;
const criadoHoje = (criado: string, hoje: string) => localDate(new Date(criado.includes("T") ? criado : `${criado.replace(" ", "T")}Z`)) === hoje;

export function resumoManha(repo: Repo, ctx: Contexto, now: Date): string | null {
  const r = repoDoContexto(repo, ctx);
  const hoje = localDate(now);
  const ontem = addDias(hoje, -1);
  const linhas: string[] = [];
  if (pode(ctx, "despesas")) {
    const soma = (de: string, ate: string) => r.listTransactions(ctx.conta, de, ate, { kind: "despesa" }).reduce((s, t) => s + t.amount_cents, 0);
    const mes = soma(`${hoje.slice(0, 7)}-01`, hoje);
    if (mes) linhas.push(`- Ontem: ${brl(soma(ontem, ontem))} em gastos`, `- No mes: ${brl(mes)}`);
    const vencem = contasAVencer(repo.db, ctx.conta, hoje, hoje);
    if (vencem.length) linhas.push(`- Vence hoje: ${vencem.map((c) => c.description).join("; ")}`);
  }
  if (pode(ctx, "agenda")) {
    const meus = r.listReminders(ctx.conta).filter((l) => (l.notify_phone ?? l.phone) === ctx.membro && localDate(new Date(l.next_run_at)) === hoje);
    if (meus.length) linhas.push(`- Lembretes de hoje: ${meus.map((l) => l.text).join("; ")}`);
  }
  return linhas.length ? ["Bom dia! Seu resumo:", ...linhas].join("\n") : null;
}

export function resumoNoite(repo: Repo, ctx: Contexto, now: Date): string | null {
  const r = repoDoContexto(repo, ctx);
  const hoje = localDate(now);
  const partes: string[] = [];
  if (pode(ctx, "despesas")) {
    const gastos = r.listTransactions(ctx.conta, hoje, hoje, { kind: "despesa" });
    if (gastos.length) partes.push(`${plural(gastos.length, "gasto", "gastos")} (${brl(gastos.reduce((s, t) => s + t.amount_cents, 0))})`);
  }
  if (pode(ctx, "agenda")) {
    const n = r.allReminders(ctx.conta).filter((l) => criadoHoje(l.created_at, hoje)).length;
    if (n) partes.push(plural(n, "lembrete", "lembretes"));
  }
  if (pode(ctx, "tarefas")) {
    const n = r.listTasks(ctx.conta).filter((t) => criadoHoje(t.created_at, hoje)).length;
    if (n) partes.push(plural(n, "tarefa", "tarefas"));
  }
  if (pode(ctx, "documentos")) {
    const n = (
      repo.db
        .prepare(`SELECT COUNT(*) AS n FROM documents WHERE phone = ? AND status = 'guardado' AND saved_at >= ?`)
        .get(ctx.conta, fromLocal(`${hoje}T00:00`).toISOString()) as { n: number }
    ).n;
    if (n) partes.push(plural(n, "documento", "documentos"));
  }
  if (!partes.length) return null;
  const lista = partes.length > 1 ? `${partes.slice(0, -1).join(", ")} e ${partes.at(-1)}` : partes[0];
  return `🌙 Hoje a equipe registrou: ${lista}.`;
}
