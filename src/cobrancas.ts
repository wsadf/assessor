import crypto from "node:crypto";
import { AuthError } from "./auth.js";
import { config } from "./config.js";
import type { Db, Repo } from "./db.js";
import { exigir, type Contexto } from "./permissoes.js";
import { normalizarChave, payloadPix, textoPix, type TipoChave } from "./pix.js";
import { brl, localDate } from "./time.js";

export interface ChaveLinha {
  conta: string;
  key_type: TipoChave;
  key: string;
  merchant_name: string;
  merchant_city: string;
  updated_by: string;
  updated_at: string;
}

export interface CobrancaLinha {
  id: number;
  conta: string;
  created_by: string;
  payer_name: string;
  payer_phone: string | null;
  description: string;
  amount_cents: number;
  due_on: string | null;
  txid: string;
  slug: string;
  pix_payload: string;
  status: "aberta" | "paga" | "cancelada";
  paid_at: string | null;
  paid_via: "usuario" | "extrato" | null;
  transaction_id: number | null;
  created_at: string;
}

export function prepararTabelasCobrancas(db: Db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS pix_keys (
      conta TEXT PRIMARY KEY,
      key_type TEXT NOT NULL CHECK (key_type IN ('cpf', 'cnpj', 'email', 'telefone', 'aleatoria')),
      key TEXT NOT NULL,
      merchant_name TEXT NOT NULL CHECK (length(merchant_name) BETWEEN 1 AND 25),
      merchant_city TEXT NOT NULL CHECK (length(merchant_city) BETWEEN 1 AND 15),
      updated_by TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS charges (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conta TEXT NOT NULL,
      created_by TEXT NOT NULL,
      payer_name TEXT NOT NULL CHECK (length(payer_name) BETWEEN 1 AND 60),
      payer_phone TEXT,
      description TEXT NOT NULL CHECK (length(description) BETWEEN 1 AND 72),
      amount_cents INTEGER NOT NULL CHECK (amount_cents BETWEEN 1 AND 100000000),
      due_on TEXT,
      txid TEXT NOT NULL UNIQUE CHECK (length(txid) = 25),
      slug TEXT NOT NULL UNIQUE CHECK (length(slug) = 10),
      pix_payload TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('aberta', 'paga', 'cancelada')),
      paid_at TEXT,
      paid_via TEXT CHECK (paid_via IS NULL OR paid_via IN ('usuario', 'extrato')),
      transaction_id INTEGER,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_charges_conta ON charges (conta, status, created_at);
  `);
}

// ---------- chave ----------

export const chaveDe = (db: Db, conta: string) => db.prepare(`SELECT * FROM pix_keys WHERE conta = ?`).get(conta) as ChaveLinha | undefined;

export function salvarChave(db: Db, ctx: Contexto, d: { tipo: TipoChave; chave: string; nome: string; cidade: string }) {
  exigir(ctx, "receitas");
  let chave: string;
  try {
    chave = normalizarChave(d.tipo, d.chave);
  } catch (err) {
    throw new AuthError(400, (err as Error).message);
  }
  const nome = textoPix(d.nome, 25);
  const cidade = textoPix(d.cidade, 15);
  if (!nome || !cidade) throw new AuthError(400, "Informe o nome e a cidade como aparecem no banco.");
  db.prepare(
    `INSERT INTO pix_keys (conta, key_type, key, merchant_name, merchant_city, updated_by, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (conta) DO UPDATE SET key_type = excluded.key_type, key = excluded.key, merchant_name = excluded.merchant_name,
       merchant_city = excluded.merchant_city, updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
  ).run(ctx.conta, d.tipo, chave, nome, cidade, ctx.membro, new Date().toISOString());
  return chaveDe(db, ctx.conta)!;
}

// ---------- cobranca ----------

const ALFANUM = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const MINUSC = "abcdefghijklmnopqrstuvwxyz0123456789";
const aleatorio = (alfabeto: string, n: number) => Array.from({ length: n }, () => alfabeto[crypto.randomInt(alfabeto.length)]).join("");

export const linkDaCobranca = (slug: string) => `${config.google.painelUrl}/pagar/${slug}`;
const cobrancaPorId = (db: Db, id: number) => db.prepare(`SELECT * FROM charges WHERE id = ?`).get(id) as CobrancaLinha | undefined;

export const vencida = (c: CobrancaLinha, hoje = localDate()) => c.status === "aberta" && !!c.due_on && c.due_on < hoje;

export function criarCobranca(
  db: Db,
  ctx: Contexto,
  d: { pagador: string; whatsapp?: string | null; descricao: string; valor: number; vencimento?: string | null },
  agora = new Date(),
) {
  exigir(ctx, "receitas");
  const chave = chaveDe(db, ctx.conta);
  if (!chave) throw new AuthError(409, "Cadastre a chave Pix em Finanças > Cobranças antes de cobrar.");
  const centavos = Math.round(d.valor * 100);
  if (!(centavos >= 1 && centavos <= 100_000_000)) throw new AuthError(400, "Valor fora do permitido (até R$ 1.000.000,00).");
  const pagador = d.pagador.trim().slice(0, 60);
  const descricao = d.descricao.trim().slice(0, 72);
  if (!pagador || !descricao) throw new AuthError(400, "Informe quem paga e o que está sendo cobrado.");
  const whatsapp = d.whatsapp?.replace(/\D/g, "") || null;
  const txid = aleatorio(ALFANUM, 25);
  const payload = payloadPix({ chave: chave.key, nome: chave.merchant_name, cidade: chave.merchant_city, valorCentavos: centavos, descricao, txid });
  const id = Number(
    db
      .prepare(
        `INSERT INTO charges (conta, created_by, payer_name, payer_phone, description, amount_cents, due_on, txid, slug, pix_payload, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'aberta', ?)`,
      )
      .run(
        ctx.conta,
        ctx.membro,
        pagador,
        whatsapp && whatsapp.length <= 11 ? `55${whatsapp}` : whatsapp,
        descricao,
        centavos,
        d.vencimento ?? null,
        txid,
        aleatorio(MINUSC, 10),
        payload,
        agora.toISOString(),
      ).lastInsertRowid,
  );
  return cobrancaPorId(db, id)!;
}

export function listarCobrancas(db: Db, ctx: Contexto, f: { situacao?: string | null; pagador?: string | null } = {}) {
  exigir(ctx, "receitas");
  const alvo = f.pagador ? semAcento(f.pagador) : null;
  return (
    db
      .prepare(`SELECT * FROM charges WHERE conta = ? AND (? IS NULL OR status = ?) ORDER BY status = 'aberta' DESC, created_at DESC, id DESC`)
      .all(ctx.conta, f.situacao ?? null, f.situacao ?? null) as CobrancaLinha[]
  ).filter((c) => !alvo || semAcento(c.payer_name).includes(alvo));
}

export function cobrancaDaConta(db: Db, ctx: Contexto, id: number) {
  exigir(ctx, "receitas");
  const c = cobrancaPorId(db, id);
  if (!c || c.conta !== ctx.conta) throw new AuthError(404, `Cobrança #${id} não encontrada.`);
  return c;
}

const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** Mesma categoria que a conta ja usa para o pagador; senao Servicos, do jeito que a conta escreve. */
function categoriaDaReceita(db: Db, conta: string, pagador: string) {
  const usada = db
    .prepare(
      `SELECT category, COUNT(*) AS n FROM transactions WHERE phone = ? AND kind = 'receita' AND deleted_at IS NULL AND reversed_at IS NULL
       AND lower(counterpart) = lower(?) GROUP BY category ORDER BY n DESC LIMIT 1`,
    )
    .get(conta, pagador) as { category: string } | undefined;
  if (usada) return usada.category;
  const existentes = db.prepare(`SELECT DISTINCT category FROM transactions WHERE phone = ? AND deleted_at IS NULL`).all(conta) as { category: string }[];
  return existentes.find((c) => semAcento(c.category) === "servicos")?.category ?? "Serviços";
}

/**
 * Pagamento nunca presumido: so com o usuario dizendo ou o extrato mostrando. Pelo usuario, lanca a
 * receita; pelo extrato, liga a receita que a importacao acabou de criar.
 */
export function marcarPaga(repo: Repo, ctx: Contexto, id: number, o: { data?: string | null; via?: "usuario" | "extrato"; transacaoId?: number } = {}) {
  const db = repo.db;
  const c = cobrancaDaConta(db, ctx, id);
  if (c.status === "paga") throw new AuthError(409, `A cobrança #${id} já está paga.`);
  if (c.status === "cancelada") throw new AuthError(409, `A cobrança #${id} foi cancelada.`);
  const data = o.data ?? localDate();
  return db.transaction(() => {
    const transacaoId =
      o.transacaoId ??
      repo.addTransaction({
        phone: ctx.conta,
        created_by: ctx.membro,
        kind: "receita",
        amount_cents: c.amount_cents,
        category: categoriaDaReceita(db, ctx.conta, c.payer_name),
        description: c.description,
        payment_method: "pix",
        occurred_on: data,
        counterpart: c.payer_name,
      }).id;
    db.prepare(`UPDATE charges SET status = 'paga', paid_at = ?, paid_via = ?, transaction_id = ? WHERE id = ?`).run(data, o.via ?? "usuario", transacaoId, id);
    return cobrancaPorId(db, id)!;
  })();
}

export function cancelarCobranca(db: Db, ctx: Contexto, id: number) {
  const c = cobrancaDaConta(db, ctx, id);
  if (c.status === "paga") throw new AuthError(409, `A cobrança #${id} já foi paga.`);
  db.prepare(`UPDATE charges SET status = 'cancelada' WHERE id = ?`).run(id);
  return cobrancaPorId(db, id)!;
}

/** O Pix estatico nao expira: cancelar muda a pagina, nao o codigo que ja saiu. */
export const AVISO_CANCELAMENTO = "O código Pix já enviado continua pagável: se o pagamento cair, avise o cliente ou devolva pelo banco.";

export function cobrancaPublica(db: Db, slug: string) {
  const c = db.prepare(`SELECT * FROM charges WHERE slug = ?`).get(slug) as CobrancaLinha | undefined;
  if (!c) return null;
  const chave = chaveDe(db, c.conta);
  const base = { recebedor: chave?.merchant_name ?? "", descricao: c.description, situacao: c.status };
  if (c.status !== "aberta") return base;
  return { ...base, valor: c.amount_cents / 100, vencimento: c.due_on, copiaECola: c.pix_payload };
}

// ---------- extrato ----------

const palavras = (s: string) => semAcento(s).split(/\s+/).filter((p) => p.length > 1);

/**
 * Credito do extrato que paga uma cobranca: mesmo valor, depois de criada e com o txid no texto ou o
 * nome do pagador batendo (primeira palavra e mais uma). Mais de uma candidata: nao arrisca.
 */
export function cobrancaDoCredito(db: Db, conta: string, centavos: number, data: string, texto: string, contraparte: string | null) {
  const abertas = db
    .prepare(`SELECT * FROM charges WHERE conta = ? AND status = 'aberta' AND amount_cents = ? AND substr(created_at, 1, 10) <= ?`)
    .all(conta, centavos, data) as CobrancaLinha[];
  const doCredito = new Set(palavras(`${contraparte ?? ""} ${texto}`));
  const batem = abertas.filter((c) => {
    if (texto.includes(c.txid)) return true;
    const p = palavras(c.payer_name);
    return p.length > 0 && doCredito.has(p[0]) && (p.length === 1 || p.slice(1).some((x) => doCredito.has(x)));
  });
  return batem.length === 1 ? batem[0] : null;
}

export const textoPago = (c: CobrancaLinha) => `💰 ${c.payer_name} pagou ${brl(c.amount_cents)} (cobrança #${c.id}).`;

export const paraCobranca = (c: CobrancaLinha) => ({
  id: c.id,
  pagador: c.payer_name,
  whatsapp: c.payer_phone,
  descricao: c.description,
  valor: c.amount_cents / 100,
  vencimento: c.due_on,
  situacao: c.status,
  vencida: vencida(c),
  link: linkDaCobranca(c.slug),
  copiaECola: c.pix_payload,
  pagaEm: c.paid_at,
  pagaPor: c.paid_via,
  transacaoId: c.transaction_id,
});
