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
const { lerOfx } = await import("../src/ofx.js");
const x = await import("../src/extratos.js");
const { documentos } = await import("../src/documentos.js");
const { executarFerramenta } = await import("../src/tools.js");
const { auth } = await import("../src/auth.js");
const { buildServer } = await import("../src/server.js");

after(() => fs.rmSync(path.join(os.tmpdir(), `assessor-arquivos-${process.pid}`), { recursive: true, force: true }));

type PerfilMembro = "completo" | "so_gastos" | "agenda_tarefas";
type Repo = ReturnType<typeof makeRepo>;

const titular = "5511999990000";
const bia = "5511912345678";
const outro = "5511966662222";
const pasta = path.join(import.meta.dirname, "ofx");
const corrente = fs.readFileSync(path.join(pasta, "corrente-1x.ofx"));
const cartao = fs.readFileSync(path.join(pasta, "cartao-2x.ofx"));

function contaCom(perfil?: PerfilMembro) {
  const repo = makeRepo(openDb(":memory:"));
  repo.ensureUser(titular, "Wesley");
  repo.ensureUser(bia, "Bia");
  const c = conta(repo.db);
  if (perfil) c.aceitarConvite(c.gerarConvite(titular, perfil).codigo, bia);
  return { repo, db: repo.db };
}
const ctxDe = (repo: Repo, phone: string) => resolverContexto(repo.db, phone);
const doMes = (repo: Repo, kind?: "despesa" | "receita") => repo.listTransactions(titular, "2026-10-01", "2026-10-31", kind ? { kind } : {});
const soma = (ts: { amount_cents: number }[]) => ts.reduce((s, t) => s + t.amount_cents, 0);

test("fundacao: leitor de OFX 1.x e 2.x e estornadas fora dos totais", () => {
  const c = lerOfx(corrente);
  assert.deepEqual([c.conta.tipo, c.conta.acctId, c.banco.bankId, c.banco.org], ["corrente", "12345-6", "0260", "Banco Teste"]);
  assert.deepEqual(c.periodo, { de: "2026-10-01", ate: "2026-10-20" });
  assert.deepEqual(c.saldo, { centavos: 318170, em: "2026-10-20" });
  assert.equal(c.movimentos.length, 8);
  assert.deepEqual(c.movimentos[0], { fitid: "C1", data: "2026-10-01", centavos: -4590, tipo: "DEBIT", nome: "", memo: "COMPRA CARTAO IFOOD *RESTAURANTE" });
  assert.equal(c.movimentos[7].memo, "COMPRA CARTAO PADARIA SÃO JOSÉ 15/10");

  const k = lerOfx(cartao);
  assert.deepEqual([k.conta.tipo, k.conta.acctId, k.banco.org], ["cartao", "************4321", "Nu Pagamentos S.A."]);
  assert.equal(k.movimentos.length, 6);
  assert.deepEqual(k.saldo, { centavos: -41830, em: "2026-10-20" });
  assert.throws(() => lerOfx(Buffer.from("data;valor\n2026-10-01;10")), /nao parece um extrato OFX/);
  assert.throws(() => lerOfx(Buffer.from("<OFX><BANKACCTFROM><ACCTID>1</BANKACCTFROM></OFX>")), /nao parece um extrato OFX/);

  const { repo, db } = contaCom();
  const t = repo.addTransaction({ phone: titular, kind: "despesa", amount_cents: 1000, category: "X", description: "Y", payment_method: null, occurred_on: "2026-09-10" });
  db.prepare(`UPDATE transactions SET reversed_at = ? WHERE id = ?`).run(new Date().toISOString(), t.id);
  assert.equal(repo.listTransactions(titular, "2026-01-01", "2026-12-31").length, 0);
  assert.equal(repo.getTransaction(titular, t.id), undefined);
  assert.equal(repo.balanceBefore(titular, "2027-01-01"), 0);
  assert.deepEqual(repo.monthsWithData(titular), []);
});

test("importacao: categoria, contraparte, ignorados, uniao com manual, sem duplicar e estorno", () => {
  const { repo, db } = contaCom();
  const ctx = ctxDe(repo, titular);
  const manual = repo.addTransaction({
    phone: titular, created_by: titular, kind: "despesa", amount_cents: 15000, category: "Personal", description: "Personal de outubro", payment_method: "pix", occurred_on: "2026-10-03", counterpart: "Joao",
  });
  repo.addTransaction({ phone: titular, kind: "receita", amount_cents: 20000, category: "Freela", description: "Site", payment_method: "pix", occurred_on: "2026-09-10", counterpart: "Maria Souza" });

  const r = x.importarExtrato(repo, ctx, corrente, "extrato.ofx", new Date("2026-10-21T12:00:00Z"));
  assert.deepEqual([r.criados, r.unidos, r.ignorados, r.estornados], [5, 1, 2, 0]);
  assert.deepEqual([r.contaBancaria.tipo, r.contaBancaria.final, r.contaBancaria.saldo, r.de, r.ate], ["corrente", "3456", 3181.7, "2026-10-01", "2026-10-20"]);
  const linha = db.prepare(`SELECT * FROM bank_accounts`).get() as { account_key: string; name: string };
  assert.ok(!JSON.stringify(linha).includes("12345"));

  const porId = new Map(doMes(repo).map((t) => [t.external_id, t]));
  const ifood = porId.get("C1")!;
  assert.deepEqual([ifood.kind, ifood.amount_cents, ifood.counterpart, ifood.category, ifood.payment_method, ifood.source], ["despesa", 4590, "Ifood Restaurante", "Alimentação", "debito", "extrato"]);
  const ligado = repo.getTransaction(titular, manual.id)!;
  assert.deepEqual([ligado.external_id, ligado.category, ligado.description, ligado.source], ["C2", "Personal", "Personal de outubro", null]);
  assert.deepEqual([porId.get("C3")!.counterpart, porId.get("C3")!.category, porId.get("C3")!.payment_method], ["Maria Souza", "Freela", "pix"]);
  assert.equal(porId.get("C4")!.category, "Salário");
  assert.equal(porId.get("C5")!.category, "Tarifas bancárias");
  // A conta escreve "saude" do jeito dela: a regra segue a conta em vez de abrir outra categoria.
  repo.addTransaction({ phone: titular, kind: "despesa", amount_cents: 100, category: "saude", description: "Consulta", payment_method: null, occurred_on: "2026-08-01" });
  assert.equal(x.categoriaPara(db, titular, null, "DROGARIA SAO PAULO", "despesa"), "saude");
  assert.deepEqual([porId.get("C8")!.counterpart, porId.get("C8")!.category], ["Padaria São José", "Alimentação"]);
  assert.ok(!porId.has("C6") && !porId.has("C7"));

  const deNovo = x.importarExtrato(repo, ctx, corrente, "extrato.ofx");
  assert.deepEqual([deNovo.criados, deNovo.unidos, deNovo.ignorados], [0, 0, 8]);
  assert.equal(doMes(repo).length, 6);

  const k = x.importarExtrato(repo, ctx, cartao, "fatura.ofx");
  // A compra da Loja ABC entra e o credito seguinte a estorna.
  assert.deepEqual([k.criados, k.unidos, k.ignorados, k.estornados], [4, 0, 1, 1]);
  const doCartao = doMes(repo, "despesa").filter((t) => t.bank_account_id === k.contaBancaria.id);
  assert.deepEqual(doCartao.map((t) => [t.counterpart, t.category, t.payment_method]).sort(), [
    ["Netflix.com", "Assinaturas", "credito"],
    ["Posto Shell Sao Paulo", "Combustível", "credito"],
    ["Uber Trip", "Transporte", "credito"],
  ]);
  assert.equal(soma(doCartao), 3240 + 21000 + 5590);
  assert.equal((db.prepare(`SELECT COUNT(*) AS n FROM transactions WHERE reversed_at IS NOT NULL`).get() as { n: number }).n, 1);
  assert.equal((db.prepare(`SELECT COUNT(*) AS n FROM bank_imports`).get() as { n: number }).n, 3);

  const linhas = Array.from({ length: 1000 }, (_, i) =>
    `<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>202609${String((i % 28) + 1).padStart(2, "0")}<TRNAMT>-${(i % 90) + 1}.${String(i % 100).padStart(2, "0")}<FITID>G${i}<MEMO>LOJA ${i % 37}</STMTTRN>`,
  ).join("\n");
  const grande = Buffer.from(`OFXHEADER:100\n<OFX><BANKACCTFROM><BANKID>0001<ACCTID>999-9</BANKACCTFROM><BANKTRANLIST>${linhas}</BANKTRANLIST></OFX>`);
  const inicio = Date.now();
  assert.equal(x.importarExtrato(repo, ctx, grande, "grande.ofx").criados, 1000);
  assert.ok(Date.now() - inicio < 5000);
});

test("fatura do cartao, API, ferramentas, permissao e isolamento", async () => {
  const { repo, db } = contaCom("so_gastos");
  const ctx = ctxDe(repo, titular);
  const k = x.importarExtrato(repo, ctx, cartao, "fatura.ofx");

  const semDias = x.faturaDoCartao(db, ctx, null, "2026-10-20")[0];
  assert.deepEqual(semDias, { cartao: k.contaBancaria.nome, configurado: false, comprasNoMes: 298.3, quantidade: 3 });
  assert.throws(() => x.atualizarConta(db, ctx, x.importarExtrato(repo, ctx, corrente, null).contaBancaria.id, { fechamento: 5 }), /só do cartão/);
  x.atualizarConta(db, ctx, k.contaBancaria.id, { fechamento: 5, vencimento: 12 });
  const depois = x.faturaDoCartao(db, ctx, "4321", "2026-10-20")[0];
  assert.ok(depois.configurado);
  assert.deepEqual(depois.aberta, { fechamento: "2026-11-05", vencimento: "2026-11-12", total: 55.9, quantidade: 1 });
  assert.deepEqual(depois.ultimaFechada, { fechamento: "2026-10-05", vencimento: "2026-10-12", total: 242.4, aPagar: false });
  const antes = x.faturaDoCartao(db, ctx, null, "2026-10-04")[0];
  assert.ok(antes.configurado);
  assert.deepEqual(antes.aberta, { fechamento: "2026-10-05", vencimento: "2026-10-12", total: 242.4, quantidade: 2 });

  const ferramenta = (nome: string, entrada: object, quem = ctx, extras = {}) => executarFerramenta(repo, quem, nome, entrada, extras);
  assert.match(await ferramenta("fatura_do_cartao", { cartao: null }), /fatura em aberto R\$\s55,90 .+ fecha em 2026-1\d-05/);
  assert.match(await ferramenta("contas_bancarias", {}), /fechamento 5, vencimento 12/);
  assert.match(await ferramenta("importar_extrato", {}), /Nenhum extrato OFX recebido/);

  // Arquivo que chegou pelo WhatsApp neste turno: importa e some do servidor.
  const outroBanco = Buffer.from(corrente.toString("latin1").replace("12345-6", "77777-7"), "latin1");
  const anexo = documentos(db).salvarPendente(titular, titular, { data: outroBanco, mimeType: "application/x-ofx", nomeOriginal: "extrato.ofx" });
  assert.match(await ferramenta("importar_extrato", {}, ctx, { anexoId: anexo.id }), /Extrato importado: Conta Banco Teste final 7777 de 2026-10-01 a 2026-10-20\.\n6 lancamentos novos/);
  assert.equal(documentos(db).porId(anexo.id), undefined);
  assert.match(await ferramenta("consultar_transacoes", { data_inicio: "2026-10-01", data_fim: "2026-10-31", tipo: null, categoria: null, contraparte: "ifood", busca: null, valor_aproximado: null }), /\[extrato\]/);
  assert.match(await ferramenta("importar_extrato", {}, ctxDe(repo, bia)), /^Sem permissao/);

  const app = buildServer(repo);
  const h = (phone: string) => ({ authorization: `Bearer ${auth(db).abrirSessao(phone)}`, "content-type": "application/json" });
  const dono = h(titular);
  const enviar = (dados: Buffer, quem = dono) =>
    app.inject({ method: "POST", url: "/api/extratos", headers: quem, payload: JSON.stringify({ nome: "x.ofx", conteudo: dados.toString("base64") }) });
  const terceiro = await enviar(Buffer.from(corrente.toString("latin1").replace("12345-6", "55555-5"), "latin1"));
  assert.equal(terceiro.statusCode, 201);
  assert.equal(terceiro.json().criados, 6);
  assert.equal((await enviar(Buffer.from("isso nao e um extrato"))).statusCode, 400);
  const lista = (await app.inject({ method: "GET", url: "/api/extratos", headers: dono })).json();
  assert.equal(lista.contas.length, 4);
  assert.equal(lista.importacoes[0].criados, 6);
  const cartaoApi = lista.contas.find((c: { tipo: string }) => c.tipo === "cartao");
  assert.deepEqual([cartaoApi.fechamento, cartaoApi.vencimento], [5, 12]);
  const renomeado = await app.inject({ method: "PATCH", url: `/api/extratos/contas/${cartaoApi.id}`, headers: dono, payload: JSON.stringify({ nome: "Nubank" }) });
  assert.equal(renomeado.json().nome, "Nubank");
  const transacoes = (await app.inject({ method: "GET", url: "/api/transacoes?mes=2026-10", headers: dono })).json();
  assert.ok(JSON.stringify(transacoes).includes('"origem":"extrato"'));

  const terceiraConta = terceiro.json().contaBancaria.id;
  const antesDeDesligar = doMes(repo).length;
  assert.equal((await app.inject({ method: "DELETE", url: `/api/extratos/contas/${terceiraConta}`, headers: dono })).statusCode, 200);
  assert.equal(doMes(repo).length, antesDeDesligar);

  assert.equal((await app.inject({ method: "GET", url: "/api/extratos", headers: h(bia) })).statusCode, 403);
  assert.equal((await enviar(cartao, h(bia))).statusCode, 403);

  repo.ensureUser(outro, "Otavio");
  assert.deepEqual(x.contasBancarias(db, ctxDe(repo, outro)), []);
  assert.equal((await app.inject({ method: "PATCH", url: `/api/extratos/contas/${cartaoApi.id}`, headers: h(outro), payload: JSON.stringify({ nome: "Meu" }) })).statusCode, 404);
  await app.close();
});
