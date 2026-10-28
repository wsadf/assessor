import crypto from "node:crypto";
import { AuthError } from "./auth.js";
import type { Db, Kind, Repo, Transaction } from "./db.js";
import { cobrancaDoCredito, marcarPaga, textoPago } from "./cobrancas.js";
import { lerOfx, type MovimentoOfx } from "./ofx.js";
import { exigir, type Contexto } from "./permissoes.js";

export interface ContaBancariaLinha {
  id: number;
  conta: string;
  account_key: string;
  type: "corrente" | "cartao";
  name: string;
  bank_name: string | null;
  number_hint: string | null;
  balance_cents: number | null;
  balance_at: string | null;
  close_day: number | null;
  due_day: number | null;
  last_import_at: string | null;
  created_at: string;
}

interface ImportacaoLinha {
  id: number;
  bank_account_id: number;
  conta: string;
  created_by: string;
  file_name: string | null;
  period_start: string | null;
  period_end: string | null;
  created: number;
  linked: number;
  skipped: number;
  reversed: number;
  created_at: string;
}

export function prepararTabelasExtratos(db: Db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS bank_accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conta TEXT NOT NULL,
      account_key TEXT NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('corrente', 'cartao')),
      name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 60),
      bank_name TEXT,
      number_hint TEXT,
      balance_cents INTEGER,
      balance_at TEXT,
      close_day INTEGER CHECK (close_day IS NULL OR close_day BETWEEN 1 AND 31),
      due_day INTEGER CHECK (due_day IS NULL OR due_day BETWEEN 1 AND 31),
      last_import_at TEXT,
      created_at TEXT NOT NULL,
      UNIQUE (conta, account_key)
    );
    CREATE TABLE IF NOT EXISTS bank_imports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bank_account_id INTEGER NOT NULL,
      conta TEXT NOT NULL,
      created_by TEXT NOT NULL,
      file_name TEXT,
      period_start TEXT,
      period_end TEXT,
      created INTEGER NOT NULL,
      linked INTEGER NOT NULL,
      skipped INTEGER NOT NULL,
      reversed INTEGER NOT NULL,
      created_at TEXT NOT NULL
    );
  `);
}

// ---------- contraparte, categoria e forma de pagamento ----------

const PREFIXOS =
  /^(pix\s+(enviado|recebido|transf\w*|qr\s*code)|transf\w*\s+(pix|ted|doc)?|ted|doc|compra\s+(cartao|no\s+debito|no\s+credito|debito|credito)|compra|pag\*|pagamento|deb(ito)?\s+automatico|tarifa)\s*[-:]?\s*/i;

const titulo = (s: string) =>
  s
    .toLowerCase()
    .replace(/(^|\s|-)(\S)/g, (_m, sep: string, c: string) => sep + c.toUpperCase())
    .trim();

/** Tira o jeito de escrever do banco ("PIX ENVIADO JOAO 15/10 SP") e deixa so quem e. */
export function limparContraparte(nome: string, memo = "") {
  let s = (nome || memo).replace(/\s+/g, " ").trim();
  s = s.replace(PREFIXOS, "");
  s = s.replace(/\b\d{2}\/\d{2}(\/\d{2,4})?\b/g, " ");
  s = s.replace(/\*+/g, " ");
  s = s.replace(/\s+\b[A-Z]{2}\b$/, "");
  s = s.replace(/\s+\d[\d.\-/]*$/g, "");
  s = s.replace(/\s+/g, " ").trim();
  return s ? titulo(s).slice(0, 60) : null;
}

const REGRAS: [RegExp, string][] = [
  [/ifood|rappi|restaurante|lanchonete|padaria|pizzaria|burger/i, "Alimentação"],
  [/uber|\b99\b|99pop|cabify|metro|onibus|estacionamento/i, "Transporte"],
  [/posto|shell|ipiranga|petrobras|br mania|combust/i, "Combustível"],
  [/farmacia|drogaria|droga|raia|pacheco|pague menos/i, "Saúde"],
  [/mercado|supermerc|atacad|assai|carrefour|extra|pao de acucar/i, "Mercado"],
  [/netflix|spotify|disney|prime video|amazon prime|youtube|hbo|deezer|apple\.com/i, "Assinaturas"],
  [/tarifa|anuidade|cesta de servicos|pacote servicos/i, "Tarifas bancárias"],
  [/juros|iof|encargo|multa/i, "Juros e encargos"],
  [/salario|folha|pagto salario|proventos/i, "Salário"],
];

const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** "Saude" da regra vira a "Saúde" que a conta ja usa, para nao abrir categoria paralela. */
function comoAContaEscreve(db: Db, conta: string, nome: string) {
  const alvo = semAcento(nome);
  const existentes = db.prepare(`SELECT DISTINCT category FROM transactions WHERE phone = ? AND deleted_at IS NULL`).all(conta) as { category: string }[];
  return existentes.find((c) => semAcento(c.category) === alvo)?.category ?? nome;
}

/** A categoria que a propria pessoa ja deu para essa contraparte vale mais que qualquer regra. */
export function categoriaPara(db: Db, conta: string, contraparte: string | null, texto: string, tipo: Kind) {
  return comoAContaEscreve(db, conta, categoriaSugerida(db, conta, contraparte, texto, tipo));
}

function categoriaSugerida(db: Db, conta: string, contraparte: string | null, texto: string, tipo: Kind) {
  if (contraparte) {
    const usada = db
      .prepare(
        `SELECT category, COUNT(*) AS n FROM transactions WHERE phone = ? AND kind = ? AND deleted_at IS NULL AND reversed_at IS NULL
         AND lower(counterpart) = lower(?) GROUP BY category ORDER BY n DESC LIMIT 1`,
      )
      .get(conta, tipo, contraparte) as { category: string } | undefined;
    if (usada) return usada.category;
  }
  const regra = REGRAS.find(([re]) => re.test(texto));
  if (regra) return regra[1];
  return tipo === "receita" ? "Recebimentos" : "Outros";
}

export function formaDePagamento(tipoConta: "corrente" | "cartao", trnType: string, texto: string) {
  if (tipoConta === "cartao") return "credito";
  if (/\bpix\b/i.test(texto)) return "pix";
  if (/boleto|bloqueto|cobranca/i.test(texto)) return "boleto";
  if (/compra|debito|cartao/i.test(texto) || trnType === "POS") return "debito";
  if (/\b(ted|doc|transf)/i.test(texto)) return "transferencia";
  return null;
}

const PAGAMENTO_FATURA = /pagamento.*fatura|pagto.*fatura|pgto.*fatura|pgto.*cart|pagamento.*cart[aã]o/i;
const PAGAMENTO_NO_CARTAO = /pagamento|pgto|pagto/i;
const INVESTIMENTO = /aplica|resgate|invest|cdb|tesouro|poupanca/i;

// ---------- importacao ----------

const sha256 = (s: string) => crypto.createHash("sha256").update(s).digest("hex");
const somarDias = (data: string, n: number) => {
  const d = new Date(`${data}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

export interface ResultadoImportacao {
  id: number;
  conta: string;
  arquivo: string | null;
  de: string | null;
  ate: string | null;
  criados: number;
  unidos: number;
  ignorados: number;
  estornados: number;
  em: string;
  contaBancaria: ReturnType<typeof paraContaBancaria>;
  /** Cobrancas que o extrato mostrou pagas (US9). */
  avisos: string[];
}

export const paraContaBancaria = (c: ContaBancariaLinha) => ({
  id: c.id,
  tipo: c.type,
  nome: c.name,
  banco: c.bank_name,
  final: c.number_hint,
  saldo: c.balance_cents === null ? null : c.balance_cents / 100,
  saldoEm: c.balance_at,
  fechamento: c.close_day,
  vencimento: c.due_day,
  ultimaImportacao: c.last_import_at,
});

const paraImportacao = (i: ImportacaoLinha & { nome: string }) => ({
  id: i.id,
  conta: i.nome,
  arquivo: i.file_name,
  de: i.period_start,
  ate: i.period_end,
  criados: i.created,
  unidos: i.linked,
  ignorados: i.skipped,
  estornados: i.reversed,
  em: i.created_at,
});

/** O extrato traz despesas e receitas: so quem ve as duas importa. */
const exigirFinancas = (ctx: Contexto) => {
  exigir(ctx, "despesas");
  exigir(ctx, "receitas");
};

/**
 * Le o OFX e transforma cada movimentacao em lancamento, sem duplicar: FITID ja visto e pulado,
 * manual equivalente e ligado em vez de criar outro, e credito no cartao estorna a compra.
 */
export function importarExtrato(repo: Repo, ctx: Contexto, dados: Buffer, nomeArquivo: string | null, agora = new Date()): ResultadoImportacao {
  exigirFinancas(ctx);
  const db = repo.db;
  const ofx = lerOfx(dados);
  const conta = ctx.conta;
  const chave = sha256(`${ofx.banco.bankId ?? ofx.banco.org ?? ""}|${ofx.conta.acctId}`);
  const final = ofx.conta.acctId.replace(/\D/g, "").slice(-4) || null;
  const banco = ofx.banco.org ?? (ofx.banco.bankId ? `Banco ${ofx.banco.bankId}` : null);

  const resultado = db.transaction(() => {
    db.prepare(
      `INSERT OR IGNORE INTO bank_accounts (conta, account_key, type, name, bank_name, number_hint, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      conta,
      chave,
      ofx.conta.tipo,
      `${ofx.conta.tipo === "cartao" ? "Cartão" : "Conta"} ${banco ?? ""}${final ? ` final ${final}` : ""}`.replace(/\s+/g, " ").trim().slice(0, 60),
      banco,
      final,
      agora.toISOString(),
    );
    const cb = db.prepare(`SELECT * FROM bank_accounts WHERE conta = ? AND account_key = ?`).get(conta, chave) as ContaBancariaLinha;
    if (ofx.saldo) db.prepare(`UPDATE bank_accounts SET balance_cents = ?, balance_at = ? WHERE id = ?`).run(ofx.saldo.centavos, ofx.saldo.em, cb.id);

    const contagem = { criados: 0, unidos: 0, ignorados: 0, estornados: 0 };
    const avisos: string[] = [];
    const jaVisto = db.prepare(`SELECT 1 FROM transactions WHERE phone = ? AND bank_account_id = ? AND external_id = ?`);
    for (const m of [...ofx.movimentos].sort((a, b) => a.data.localeCompare(b.data))) {
      if (jaVisto.get(conta, cb.id, m.fitid)) {
        contagem.ignorados++;
        continue;
      }
      const efeito = aplicarMovimento(repo, ctx, cb, m, avisos);
      contagem[efeito]++;
    }

    db.prepare(`UPDATE bank_accounts SET last_import_at = ? WHERE id = ?`).run(agora.toISOString(), cb.id);
    const id = Number(
      db
        .prepare(
          `INSERT INTO bank_imports (bank_account_id, conta, created_by, file_name, period_start, period_end, created, linked, skipped, reversed, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(cb.id, conta, ctx.membro, nomeArquivo, ofx.periodo.de, ofx.periodo.ate, contagem.criados, contagem.unidos, contagem.ignorados, contagem.estornados, agora.toISOString())
        .lastInsertRowid,
    );
    const linha = db.prepare(`SELECT i.*, a.name AS nome FROM bank_imports i JOIN bank_accounts a ON a.id = i.bank_account_id WHERE i.id = ?`).get(id) as ImportacaoLinha & {
      nome: string;
    };
    const atual = db.prepare(`SELECT * FROM bank_accounts WHERE id = ?`).get(cb.id) as ContaBancariaLinha;
    return { ...paraImportacao(linha), contaBancaria: paraContaBancaria(atual), avisos };
  });
  return resultado();
}

type Efeito = "criados" | "unidos" | "ignorados" | "estornados";

function aplicarMovimento(repo: Repo, ctx: Contexto, cb: ContaBancariaLinha, m: MovimentoOfx, avisos: string[]): Efeito {
  const db = repo.db;
  const texto = `${m.nome} ${m.memo}`.trim();
  const valor = Math.abs(m.centavos);
  if (INVESTIMENTO.test(texto)) return "ignorados";

  if (cb.type === "cartao" && m.centavos > 0) {
    if (PAGAMENTO_NO_CARTAO.test(texto) && !/estorno/i.test(texto)) return "ignorados";
    const compra = db
      .prepare(
        `SELECT id FROM transactions WHERE phone = ? AND bank_account_id = ? AND kind = 'despesa' AND amount_cents = ?
         AND deleted_at IS NULL AND reversed_at IS NULL AND occurred_on BETWEEN ? AND ? ORDER BY occurred_on DESC LIMIT 1`,
      )
      .get(ctx.conta, cb.id, valor, somarDias(m.data, -90), m.data) as { id: number } | undefined;
    if (compra) {
      db.prepare(`UPDATE transactions SET reversed_at = ? WHERE id = ?`).run(new Date().toISOString(), compra.id);
      return "estornados";
    }
  }
  if (cb.type === "corrente" && m.centavos < 0 && PAGAMENTO_FATURA.test(texto)) return "ignorados";

  const kind: Kind = m.centavos < 0 ? "despesa" : "receita";
  const manual = db
    .prepare(
      `SELECT id FROM transactions WHERE phone = ? AND kind = ? AND amount_cents = ? AND external_id IS NULL
       AND deleted_at IS NULL AND reversed_at IS NULL AND occurred_on BETWEEN ? AND ?
       ORDER BY abs(julianday(occurred_on) - julianday(?)), id LIMIT 1`,
    )
    .get(ctx.conta, kind, valor, somarDias(m.data, -2), somarDias(m.data, 2), m.data) as { id: number } | undefined;
  if (manual) {
    db.prepare(`UPDATE transactions SET external_id = ?, bank_account_id = ? WHERE id = ?`).run(m.fitid, cb.id, manual.id);
    return "unidos";
  }

  const contraparte = limparContraparte(m.nome, m.memo);
  const estorno = cb.type === "cartao" && kind === "receita";
  const cobranca = cb.type === "corrente" && kind === "receita" ? cobrancaDoCredito(db, ctx.conta, valor, m.data, texto, contraparte) : null;
  const criada = repo.addTransaction({
    phone: ctx.conta,
    created_by: ctx.membro,
    kind,
    amount_cents: valor,
    category: estorno ? "Estornos" : categoriaPara(db, ctx.conta, contraparte, texto, kind),
    description: (contraparte ?? texto).slice(0, 80) || "Movimentacao do banco",
    payment_method: formaDePagamento(cb.type, m.tipo, texto),
    occurred_on: m.data,
    counterpart: contraparte,
    source: "extrato",
    external_id: m.fitid,
    bank_account_id: cb.id,
  });
  if (cobranca) avisos.push(textoPago(marcarPaga(repo, ctx, cobranca.id, { data: m.data, via: "extrato", transacaoId: criada.id })));
  return "criados";
}

// ---------- contas e fatura ----------

const contaDaConta = (db: Db, ctx: Contexto, id: number) => {
  const c = db.prepare(`SELECT * FROM bank_accounts WHERE id = ?`).get(id) as ContaBancariaLinha | undefined;
  if (!c || c.conta !== ctx.conta) throw new AuthError(404, "Conta bancária não encontrada.");
  return c;
};

export function contasBancarias(db: Db, ctx: Contexto) {
  exigir(ctx, "despesas");
  return db.prepare(`SELECT * FROM bank_accounts WHERE conta = ? ORDER BY type, name`).all(ctx.conta) as ContaBancariaLinha[];
}

export function atualizarConta(db: Db, ctx: Contexto, id: number, d: { nome?: string; fechamento?: number | null; vencimento?: number | null }) {
  exigirFinancas(ctx);
  const c = contaDaConta(db, ctx, id);
  if (c.type !== "cartao" && (d.fechamento != null || d.vencimento != null)) throw new AuthError(400, "Fechamento e vencimento são só do cartão.");
  db.prepare(`UPDATE bank_accounts SET name = ?, close_day = ?, due_day = ? WHERE id = ?`).run(
    d.nome?.trim().slice(0, 60) || c.name,
    d.fechamento === undefined ? c.close_day : d.fechamento,
    d.vencimento === undefined ? c.due_day : d.vencimento,
    id,
  );
  return db.prepare(`SELECT * FROM bank_accounts WHERE id = ?`).get(id) as ContaBancariaLinha;
}

/** Os lancamentos ficam: so perdem a ligacao com o banco. */
export function desligarConta(db: Db, ctx: Contexto, id: number) {
  exigirFinancas(ctx);
  contaDaConta(db, ctx, id);
  db.transaction(() => {
    db.prepare(`UPDATE transactions SET bank_account_id = NULL, external_id = NULL WHERE phone = ? AND bank_account_id = ?`).run(ctx.conta, id);
    db.prepare(`DELETE FROM bank_imports WHERE bank_account_id = ?`).run(id);
    db.prepare(`DELETE FROM bank_accounts WHERE id = ?`).run(id);
  })();
}

export function importacoes(db: Db, ctx: Contexto, limite = 20) {
  exigir(ctx, "despesas");
  return (
    db
      .prepare(
        `SELECT i.*, a.name AS nome FROM bank_imports i JOIN bank_accounts a ON a.id = i.bank_account_id
         WHERE i.conta = ? ORDER BY i.id DESC LIMIT ?`,
      )
      .all(ctx.conta, limite) as (ImportacaoLinha & { nome: string })[]
  ).map(paraImportacao);
}

/** Dia do mes que existe: fechamento no dia 31 cai no ultimo dia dos meses curtos. */
function dataNoMes(ano: number, mes: number, dia: number) {
  const ultimo = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  return `${ano}-${String(mes).padStart(2, "0")}-${String(Math.min(dia, ultimo)).padStart(2, "0")}`;
}
const mesAnterior = (ano: number, mes: number) => (mes === 1 ? [ano - 1, 12] : [ano, mes - 1]);
const mesSeguinte = (ano: number, mes: number) => (mes === 12 ? [ano + 1, 1] : [ano, mes + 1]);

export function faturaDoCartao(db: Db, ctx: Contexto, cartao: string | null | undefined, hoje: string) {
  exigir(ctx, "despesas");
  const alvo = cartao?.toLowerCase().trim();
  const cartoes = contasBancarias(db, ctx).filter(
    (c) => c.type === "cartao" && (!alvo || c.name.toLowerCase().includes(alvo) || c.number_hint === alvo.replace(/\D/g, "")),
  );
  const compras = (c: ContaBancariaLinha, de: string, ate: string) =>
    db
      .prepare(
        `SELECT * FROM transactions WHERE phone = ? AND bank_account_id = ? AND kind = 'despesa' AND deleted_at IS NULL AND reversed_at IS NULL
         AND occurred_on > ? AND occurred_on <= ? ORDER BY occurred_on`,
      )
      .all(ctx.conta, c.id, de, ate) as Transaction[];
  const [ano, mes] = hoje.split("-").map(Number);
  return cartoes.map((c) => {
    const soma = (ts: Transaction[]) => ts.reduce((s, t) => s + t.amount_cents, 0) / 100;
    const noMes = compras(c, somarDias(`${hoje.slice(0, 7)}-01`, -1), hoje);
    if (!c.close_day || !c.due_day) {
      return { cartao: c.name, configurado: false as const, comprasNoMes: soma(noMes), quantidade: noMes.length };
    }
    // Fatura atual: do ultimo fechamento (exclusive) ate o proximo (inclusive).
    const fechamentoEsteMes = dataNoMes(ano, mes, c.close_day);
    const proximoFechamento = hoje <= fechamentoEsteMes ? fechamentoEsteMes : dataNoMes(...(mesSeguinte(ano, mes) as [number, number]), c.close_day);
    const [pa, pm] = proximoFechamento.split("-").map(Number);
    const [ua, um] = mesAnterior(pa, pm);
    const ultimoFechamento = dataNoMes(ua, um, c.close_day);
    const penultimoFechamento = dataNoMes(...(mesAnterior(ua, um) as [number, number]), c.close_day);
    // Vencimento depois do fechamento no mesmo mes, ou no mes seguinte quando o dia e menor.
    const vencimentoDe = (a: number, m: number) =>
      c.due_day! > c.close_day! ? dataNoMes(a, m, c.due_day!) : dataNoMes(...(mesSeguinte(a, m) as [number, number]), c.due_day!);
    const atuais = compras(c, ultimoFechamento, proximoFechamento);
    const fechada = compras(c, penultimoFechamento, ultimoFechamento);
    const vencimentoFechada = vencimentoDe(ua, um);
    return {
      cartao: c.name,
      configurado: true as const,
      aberta: { fechamento: proximoFechamento, vencimento: vencimentoDe(pa, pm), total: soma(atuais), quantidade: atuais.length },
      ultimaFechada: { fechamento: ultimoFechamento, vencimento: vencimentoFechada, total: soma(fechada), aPagar: hoje <= vencimentoFechada },
      comprasNoMes: soma(noMes),
    };
  });
}
