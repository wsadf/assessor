import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";

process.env.TIMEZONE = "America/Sao_Paulo";
process.env.WHATSAPP_VERIFY_TOKEN = "segredo-teste";
process.env.WHATSAPP_APP_SECRET = "app-secret-teste";
process.env.WHATSAPP_TOKEN = "token-meta-teste";
process.env.WHATSAPP_PHONE_NUMBER_ID = "1234567890";
process.env.ALLOWED_NUMBERS = "5511999990000";
process.env.AI_PROVIDER = "gemini";
process.env.GEMINI_API_KEY = "chave-teste";
process.env.PAINEL_TOKEN = "token-teste";
process.env.PAINEL_TELEFONE = "5511999990000";
process.env.PAINEL_URL = "http://localhost:3001";

const { openDb, repo: makeRepo } = await import("../src/db.js");
const { conta, resolverContexto } = await import("../src/conta.js");
const pix = await import("../src/pix.js");
const c = await import("../src/cobrancas.js");
const { importarExtrato } = await import("../src/extratos.js");
const { executarFerramenta } = await import("../src/tools.js");
const { auth, AuthError } = await import("../src/auth.js");
const { buildServer } = await import("../src/server.js");

after(() => fs.rmSync(path.join(os.tmpdir(), `assessor-arquivos-${process.pid}`), { recursive: true, force: true }));

type PerfilMembro = "completo" | "so_gastos" | "agenda_tarefas";
type Repo = ReturnType<typeof makeRepo>;

const titular = "5511999990000";
const bia = "5511912345678";
const outro = "5511966662222";

function contaCom(perfil?: PerfilMembro) {
  const repo = makeRepo(openDb(":memory:"));
  repo.ensureUser(titular, "Wesley");
  repo.ensureUser(bia, "Bia");
  const ct = conta(repo.db);
  if (perfil) ct.aceitarConvite(ct.gerarConvite(titular, perfil).codigo, bia);
  return { repo, db: repo.db };
}
const ctxDe = (repo: Repo, phone: string) => resolverContexto(repo.db, phone);
const CHAVE = { tipo: "email" as const, chave: "Wesley@Exemplo.com", nome: "Wésley Faria Consultoria Ltda", cidade: "São José dos Campos" };

const status = (f: () => unknown) => {
  try {
    f();
    return 200;
  } catch (err) {
    if (err instanceof AuthError) return err.status;
    throw err;
  }
};

/** Le o BR Code campo a campo, para conferir o que foi montado. */
function campos(payload: string) {
  const out: Record<string, string> = {};
  for (let i = 0; i < payload.length; ) {
    const id = payload.slice(i, i + 2);
    const n = Number(payload.slice(i + 2, i + 4));
    out[id] = payload.slice(i + 4, i + 4 + n);
    i += 4 + n;
  }
  return out;
}

function extrato(movs: { fitid: string; data: string; valor: string; memo: string }[]) {
  const linhas = movs.map((m) => `<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>${m.data.replace(/-/g, "")}<TRNAMT>${m.valor}<FITID>${m.fitid}<MEMO>${m.memo}</STMTTRN>`).join("\n");
  return Buffer.from(`OFXHEADER:100\n<OFX><BANKACCTFROM><BANKID>0260<ACCTID>12345-6</BANKACCTFROM><BANKTRANLIST>${linhas}</BANKTRANLIST></OFX>`);
}

test("fundacao: CRC, exemplo do manual do BR Code, campos e chaves", () => {
  assert.equal(pix.crc16("123456789"), "29B1");
  assert.equal(
    pix.payloadPix({ chave: "123e4567-e12b-12d1-a456-426655440000", nome: "Fulano de Tal", cidade: "BRASILIA", txid: "***" }),
    "00020126580014br.gov.bcb.pix0136123e4567-e12b-12d1-a456-4266554400005204000053039865802BR5913Fulano de Tal6008BRASILIA62070503***63041D3D",
  );

  const p = pix.payloadPix({ chave: "wesley@exemplo.com", nome: "Wésley Faria Consultoria Ltda", cidade: "São José dos Campos", valorCentavos: 85000, descricao: "Consultoria de agosto", txid: "A".repeat(25) });
  const f = campos(p);
  assert.equal(f["54"], "850.00");
  assert.equal(f["59"], "Wesley Faria Consultoria");
  assert.equal(f["60"], "Sao Jose dos Ca");
  assert.deepEqual(campos(f["26"]), { "00": "br.gov.bcb.pix", "01": "wesley@exemplo.com", "02": "Consultoria de agosto" });
  assert.deepEqual(campos(f["62"]), { "05": "A".repeat(25) });
  assert.equal(f["63"], pix.crc16(p.slice(0, -4)));

  assert.equal(pix.normalizarChave("cpf", "529.982.247-25"), "52998224725");
  assert.throws(() => pix.normalizarChave("cpf", "529.982.247-26"), /CPF inválido/);
  assert.throws(() => pix.normalizarChave("cpf", "111.111.111-11"), /CPF inválido/);
  assert.equal(pix.normalizarChave("cnpj", "11.222.333/0001-81"), "11222333000181");
  assert.throws(() => pix.normalizarChave("cnpj", "11.222.333/0001-82"), /CNPJ inválido/);
  assert.equal(pix.normalizarChave("telefone", "(11) 98765-4321"), "+5511987654321");
  assert.equal(pix.normalizarChave("aleatoria", "123E4567-E12B-12D1-A456-426655440000"), "123e4567-e12b-12d1-a456-426655440000");
  assert.throws(() => pix.normalizarChave("email", "sem-arroba"), /E-mail inválido/);
});

test("dominio: chave, cobranca, confirmacao pelo usuario e pelo extrato, cancelamento", () => {
  const { repo, db } = contaCom();
  const ctx = ctxDe(repo, titular);
  const pedido = { pagador: "João Silva", descricao: "Consultoria de agosto", valor: 850, vencimento: "2026-11-05" };
  assert.equal(status(() => c.criarCobranca(db, ctx, pedido)), 409);
  assert.equal(status(() => c.salvarChave(db, ctx, { ...CHAVE, tipo: "cpf", chave: "123" })), 400);
  const chave = c.salvarChave(db, ctx, CHAVE);
  assert.deepEqual([chave.key, chave.merchant_name, chave.merchant_city], ["wesley@exemplo.com", "Wesley Faria Consultoria", "Sao Jose dos Ca"]);

  const cob = c.criarCobranca(db, ctx, { ...pedido, whatsapp: "11987654321" }, new Date("2026-10-20T12:00:00Z"));
  assert.match(cob.txid, /^[A-Za-z0-9]{25}$/);
  assert.match(cob.slug, /^[a-z0-9]{10}$/);
  assert.equal(cob.payer_phone, "5511987654321");
  assert.equal(campos(cob.pix_payload)["54"], "850.00");
  assert.equal(c.linkDaCobranca(cob.slug), `http://localhost:3001/pagar/${cob.slug}`);
  assert.equal(c.vencida(cob, "2026-11-06"), true);
  assert.equal(c.vencida(cob, "2026-11-05"), false);

  const publica = c.cobrancaPublica(db, cob.slug)!;
  assert.deepEqual(Object.keys(publica).sort(), ["copiaECola", "descricao", "recebedor", "situacao", "valor", "vencimento"]);
  assert.ok(!JSON.stringify(publica).includes(titular));

  // Pelo usuario: receita com o pagador como contraparte, na categoria que a conta usa para ele.
  repo.addTransaction({ phone: titular, kind: "receita", amount_cents: 50000, category: "Consultorias", description: "Julho", payment_method: "pix", occurred_on: "2026-07-31", counterpart: "João Silva" });
  const paga = c.marcarPaga(repo, ctx, cob.id, { data: "2026-10-22" });
  assert.deepEqual([paga.status, paga.paid_via, paga.paid_at], ["paga", "usuario", "2026-10-22"]);
  const receita = repo.getTransaction(titular, paga.transaction_id!)!;
  assert.deepEqual([receita.kind, receita.amount_cents, receita.counterpart, receita.category, receita.payment_method], ["receita", 85000, "João Silva", "Consultorias", "pix"]);
  assert.equal(status(() => c.marcarPaga(repo, ctx, cob.id)), 409);
  assert.ok(!("copiaECola" in c.cobrancaPublica(db, cob.slug)!));

  // Pelo extrato: credito do mesmo valor com o nome do pagador liga a receita importada.
  const ana = c.criarCobranca(db, ctx, { pagador: "Ana Maria Costa", descricao: "Aula particular", valor: 120 }, new Date("2026-10-20T12:00:00Z"));
  const cancelada = c.criarCobranca(db, ctx, { pagador: "Rui Lima", descricao: "Revisao", valor: 300 }, new Date("2026-10-20T12:00:00Z"));
  c.cancelarCobranca(db, ctx, cancelada.id);
  assert.equal(status(() => c.cancelarCobranca(db, ctx, cob.id)), 409);
  const r = importarExtrato(
    repo,
    ctx,
    extrato([
      { fitid: "P1", data: "2026-10-23", valor: "120.00", memo: "PIX RECEBIDO ANA COSTA" },
      { fitid: "P2", data: "2026-10-23", valor: "300.00", memo: "PIX RECEBIDO RUI LIMA" },
      { fitid: "P3", data: "2026-10-24", valor: "121.00", memo: "PIX RECEBIDO ANA COSTA" },
    ]),
    "extrato.ofx",
  );
  assert.deepEqual(r.avisos, [`💰 Ana Maria Costa pagou R$ 120,00 (cobrança #${ana.id}).`]);
  const anaPaga = c.cobrancaDaConta(db, ctx, ana.id);
  assert.deepEqual([anaPaga.status, anaPaga.paid_via], ["paga", "extrato"]);
  assert.equal(repo.getTransaction(titular, anaPaga.transaction_id!)!.external_id, "P1");
  assert.equal(repo.listTransactions(titular, "2026-10-01", "2026-10-31", { kind: "receita" }).filter((t) => t.amount_cents === 12000).length, 1);
  assert.equal(c.cobrancaDaConta(db, ctx, cancelada.id).status, "cancelada");
});

test("API, pagina publica e ferramentas, com permissao e isolamento", async () => {
  const { repo, db } = contaCom("so_gastos");
  const ctx = ctxDe(repo, titular);
  const app = buildServer(repo);
  const h = (phone: string) => ({ authorization: `Bearer ${auth(db).abrirSessao(phone)}`, "content-type": "application/json" });
  const pedir = (method: "GET" | "PUT" | "POST" | "DELETE", url: string, payload?: object, quem = titular) =>
    app.inject({ method, url, headers: h(quem), payload: payload ? JSON.stringify(payload) : undefined });

  assert.equal((await pedir("GET", "/api/cobrancas")).json().chave, null);
  assert.equal((await pedir("POST", "/api/cobrancas", { pagador: "João", descricao: "Aula", valor: 100 })).statusCode, 409);
  assert.equal((await pedir("PUT", "/api/cobrancas/chave", { ...CHAVE, tipo: "cnpj", chave: "1" })).statusCode, 400);
  assert.equal((await pedir("PUT", "/api/cobrancas/chave", CHAVE)).json().chave, "wesley@exemplo.com");
  const criada = await pedir("POST", "/api/cobrancas", { pagador: "João Silva", descricao: "Consultoria de agosto", valor: 850, vencimento: "2026-11-05" });
  assert.equal(criada.statusCode, 201);
  const cob = criada.json();
  assert.match(cob.link, /^http:\/\/localhost:3001\/pagar\/[a-z0-9]{10}$/);
  const slug = cob.link.split("/").at(-1);

  const publica = await app.inject({ method: "GET", url: `/api/pagar/${slug}` });
  assert.equal(publica.statusCode, 200);
  assert.deepEqual([publica.json().recebedor, publica.json().valor, publica.json().situacao], ["Wesley Faria Consultoria", 850, "aberta"]);
  assert.ok(!publica.body.includes(titular));
  assert.equal((await app.inject({ method: "GET", url: "/api/pagar/naoexiste1" })).statusCode, 404);

  const recebida = await pedir("POST", `/api/cobrancas/${cob.id}/recebida`, {});
  assert.equal(recebida.json().situacao, "paga");
  assert.equal((await pedir("POST", `/api/cobrancas/${cob.id}/recebida`, {})).statusCode, 409);
  assert.equal((await app.inject({ method: "GET", url: `/api/pagar/${slug}` })).json().copiaECola, undefined);
  const outra = (await pedir("POST", "/api/cobrancas", { pagador: "Ana", descricao: "Aula", valor: 120 })).json();
  assert.equal((await pedir("DELETE", `/api/cobrancas/${outra.id}`)).json().situacao, "cancelada");
  assert.deepEqual((await pedir("GET", "/api/cobrancas?situacao=paga")).json().cobrancas.map((x: { id: number }) => x.id), [cob.id]);

  const ferramenta = (nome: string, entrada: object, quem = ctx) => executarFerramenta(repo, quem, nome, entrada);
  const nova = await ferramenta("criar_cobranca", { pagador: "Carla Dias", whatsapp: null, valor: 400, descricao: "Mentoria", vencimento: null });
  assert.match(nova, /^Cobranca #\d+: Carla Dias, R\$\s400,00, Mentoria\.\nLink de pagamento: http:\/\/localhost:3001\/pagar\/[a-z0-9]{10}\nCopia-e-cola: 000201/);
  const id = Number(nova.match(/#(\d+)/)![1]);
  assert.match(await ferramenta("consultar_cobrancas", { situacao: "aberta", pagador: "carla" }), new RegExp(`^#${id} \\| Carla Dias \\| R\\$\\s400,00 \\| sem vencimento \\| aberta$`));
  assert.match(await ferramenta("cancelar_cobranca", { id, confirmado: false }), /Confirme .+ continua pagável/);
  assert.match(await ferramenta("marcar_cobranca_paga", { id, data: null }), new RegExp(`Cobranca #${id} paga: receita de R\\$\\s400,00 de Carla Dias lancada`));

  assert.match(await ferramenta("criar_cobranca", { pagador: "X", whatsapp: null, valor: 1, descricao: "Y", vencimento: null }, ctxDe(repo, bia)), /^Sem permissao/);
  assert.equal((await pedir("GET", "/api/cobrancas", undefined, bia)).statusCode, 403);

  repo.ensureUser(outro, "Otavio");
  assert.equal((await pedir("POST", `/api/cobrancas/${outra.id}/recebida`, {}, outro)).statusCode, 404);
  assert.deepEqual((await pedir("GET", "/api/cobrancas", undefined, outro)).json().cobrancas, []);
  await app.close();
});
