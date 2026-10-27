import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import zlib from "node:zlib";

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
const k = await import("../src/contador.js");
const { criarZip, lerZip } = await import("../src/zip.js");
const { documentos } = await import("../src/documentos.js");
const { executarFerramenta } = await import("../src/tools.js");
const { auth, AuthError } = await import("../src/auth.js");
const { buildServer } = await import("../src/server.js");
const { SemPermissao } = await import("../src/permissoes.js");
const { googleFalso } = await import("./googleFalso.js");

after(() => fs.rmSync(path.join(os.tmpdir(), `assessor-arquivos-${process.pid}`), { recursive: true, force: true }));

type PerfilMembro = "completo" | "so_gastos" | "agenda_tarefas";
type Repo = ReturnType<typeof makeRepo>;

const titular = "5511999990000";
const bia = "5511912345678";
const carla = "5511977771111";
const outroTitular = "5511966662222";

function contaCom(perfil?: PerfilMembro) {
  const repo = makeRepo(openDb(":memory:"));
  repo.ensureUser(titular, "Wesley");
  repo.ensureUser(bia, "Bia");
  const c = conta(repo.db);
  if (perfil) c.aceitarConvite(c.gerarConvite(titular, perfil).codigo, bia);
  return { repo, db: repo.db };
}
const ctxDe = (repo: Repo, phone: string) => resolverContexto(repo.db, phone);

/** Conta de painel ativa e sem plano, como a de um contador. */
function contador(db: Repo["db"], phone: string, nome: string) {
  const a = auth(db);
  a.cadastrar({ nome, telefone: phone, email: `${phone}@contador.local`, senha: "senha-forte-1", plano: null });
  a.ativar(phone);
  return a.abrirSessao(phone);
}

const status = (f: () => unknown) => {
  try {
    f();
    return 200;
  } catch (err) {
    if (err instanceof AuthError) return err.status;
    if (err instanceof SemPermissao) return 403;
    throw err;
  }
};

function lancar(repo: Repo, data: string, extra: object = {}) {
  return repo.addTransaction({
    phone: titular,
    created_by: bia,
    kind: "despesa",
    amount_cents: 123456,
    category: "Escritorio",
    description: "Papel; toner",
    payment_method: "pix",
    occurred_on: data,
    ...extra,
  });
}

function guardar(db: Repo["db"], pasta: string, titulo: string, data: string, transacaoId?: number) {
  const docs = documentos(db);
  const p = docs.salvarPendente(titular, titular, { data: Buffer.from(`%PDF-1.4 ${titulo}`), mimeType: "application/pdf", nomeOriginal: `${titulo}.pdf` });
  return docs.guardar(p.id, { pasta: pasta as never, titulo, dataDocumento: data, transacaoId }).documento;
}

test("fundacao: zip, convite CONT- e vinculo", () => {
  const zip = criarZip([
    { nome: "lancamentos.csv", dados: Buffer.from("a;b\r\n1;2\r\n".repeat(50)) },
    { nome: "notas_fiscais/Nota de serviço.pdf", dados: crypto.randomBytes(64) },
  ]);
  const lidos = lerZip(zip);
  assert.deepEqual(lidos.map((a) => a.nome), ["lancamentos.csv", "notas_fiscais/Nota de serviço.pdf"]);
  assert.equal(lidos[0].dados.toString(), "a;b\r\n1;2\r\n".repeat(50));
  assert.equal(zlib.crc32(lidos[1].dados), zlib.crc32(lerZip(zip)[1].dados));

  const { repo, db } = contaCom("completo");
  const ctx = ctxDe(repo, titular);
  assert.equal(status(() => k.gerarConviteContador(db, ctxDe(repo, bia))), 403);
  const c1 = k.gerarConviteContador(db, ctx, "Escritorio Silva");
  assert.match(c1.codigo, /^CONT-[2-9A-HJKMNP-Z]{6}$/);
  assert.match(c1.mensagemWhatsapp, new RegExp(`Use o codigo ${c1.codigo} .+ dossie mensal de Wesley`));
  k.gerarConviteContador(db, ctx);
  k.gerarConviteContador(db, ctx);
  assert.equal(status(() => k.gerarConviteContador(db, ctx)), 409);

  contador(db, carla, "Carla Contadora");
  assert.equal(k.normalizarConviteContador(c1.codigo.toLowerCase().replace("-", " ")), c1.codigo);
  const membro = conta(db).gerarConvite(titular, "completo").codigo;
  assert.equal(status(() => k.validarConviteContador(db, membro, carla)), 400);
  assert.equal(status(() => conta(db).validarConvite(c1.codigo, carla)), 400);
  assert.equal(status(() => k.validarConviteContador(db, c1.codigo, titular)), 409);
  assert.equal(status(() => k.validarConviteContador(db, c1.codigo, bia)), 409);

  assert.deepEqual(k.aceitarConviteContador(db, c1.codigo, carla), { conta: titular, nome: "Wesley" });
  assert.equal(status(() => k.aceitarConviteContador(db, c1.codigo, carla)), 400);
  repo.ensureUser(outroTitular, "Otavio");
  const deOtavio = k.gerarConviteContador(db, ctxDe(repo, outroTitular));
  k.aceitarConviteContador(db, deOtavio.codigo, carla);
  assert.deepEqual(k.clientesDe(db, carla).map((c) => c.nome), ["Otavio", "Wesley"]);
  assert.deepEqual(k.contadoresDe(db, titular).map((c) => [c.nome, c.rotulo]), [["Carla Contadora", "Escritorio Silva"]]);

  const vencido = k.gerarConviteContador(db, ctxDe(repo, outroTitular));
  db.prepare(`UPDATE accountant_invites SET expires_at = ? WHERE id = ?`).run(new Date(Date.now() - 1000).toISOString(), vencido.id);
  contador(db, "5511955550000", "Rui");
  assert.equal(status(() => k.validarConviteContador(db, vencido.codigo, "5511955550000")), 400);
  const cancelado = k.gerarConviteContador(db, ctxDe(repo, outroTitular));
  assert.ok(k.cancelarConviteContador(db, ctxDe(repo, outroTitular), cancelado.id));
  assert.equal(status(() => k.validarConviteContador(db, cancelado.codigo, "5511955550000")), 400);
  for (let i = 0; i < 3; i++) assert.equal(status(() => k.validarConviteContador(db, "CONT-ZZZZZZ", "5511955550000")), 400);
  assert.equal(status(() => k.validarConviteContador(db, "CONT-ZZZZZZ", "5511955550000")), 429);

  k.exigirVinculo(db, carla, titular);
  assert.ok(k.revogarContador(db, ctx, k.contadoresDe(db, titular)[0].id));
  assert.equal(status(() => k.exigirVinculo(db, carla, titular)), 403);
  k.exigirVinculo(db, carla, outroTitular);
});

test("dossie e pacote do mes", () => {
  const { repo, db } = contaCom("completo");
  const t1 = lancar(repo, "2026-10-05");
  lancar(repo, "2026-10-20", { kind: "receita", amount_cents: 500000, category: "Servicos", description: "Consultoria", created_by: titular, payment_method: null });
  const t3 = lancar(repo, "2026-09-30", { description: "Aluguel" });
  guardar(db, "notas_fiscais", "Nota fiscal outubro", "2026-10-06");
  guardar(db, "notas_fiscais", "Nota fiscal outubro", "2026-10-07");
  guardar(db, "boletos", "Boleto internet", "2026-10-10");
  guardar(db, "saude", "Exame de sangue", "2026-10-11");
  guardar(db, "pessoais", "Recibo do toner", "2026-11-02", t1.id);
  guardar(db, "comprovantes", "Comprovante aluguel", "2026-09-30", t3.id);

  assert.deepEqual(k.mesesDe(db, titular), ["2026-10", "2026-09"]);
  const d = k.dossieDoMes(db, titular, "2026-10");
  assert.deepEqual([d.receitas, d.despesas], [5000, 1234.56]);
  assert.deepEqual(d.lancamentos.map((l) => [l.data, l.tipo, l.lancadoPor]), [["2026-10-05", "despesa", "Bia"], ["2026-10-20", "receita", "Wesley"]]);
  assert.deepEqual(d.documentos.map((x) => x.titulo).sort(), ["Boleto internet", "Nota fiscal outubro", "Nota fiscal outubro", "Recibo do toner"]);
  const exame = db.prepare(`SELECT id FROM documents WHERE title = 'Exame de sangue'`).get() as { id: number };
  assert.equal(k.documentoDoDossie(db, titular, exame.id), null);

  const arquivos = lerZip(k.pacoteDoMes(db, titular, "2026-10"));
  assert.deepEqual(arquivos.map((a) => a.nome).sort(), [
    "boletos/2026-10-10 Boleto internet.pdf",
    "lancamentos-2026-10.csv",
    "notas_fiscais/2026-10-06 Nota fiscal outubro.pdf",
    "notas_fiscais/2026-10-07 Nota fiscal outubro.pdf",
    "outros-comprovantes/2026-11-02 Recibo do toner.pdf",
  ]);
  const csv = arquivos.find((a) => a.nome.endsWith(".csv"))!.dados.toString("utf8");
  assert.ok(csv.startsWith("﻿data;tipo;valor;categoria;descricao;contraparte;pagamento;parcela;lancado_por\r\n"));
  assert.match(csv, /2026-10-05;despesa;1234,56;Escritorio;"Papel; toner";;pix;;Bia\r\n/);

  // Mesmo titulo no mesmo dia ganha sufixo; o que nao cabe vai para o LEIA-ME.
  guardar(db, "notas_fiscais", "Nota fiscal outubro", "2026-10-06");
  const pequeno = lerZip(k.pacoteDoMes(db, titular, "2026-10", 1));
  assert.deepEqual(pequeno.map((a) => a.nome), ["lancamentos-2026-10.csv", "LEIA-ME.txt"]);
  assert.ok(pequeno.some((a) => a.nome === "LEIA-ME.txt"));
  assert.match(pequeno.find((a) => a.nome === "LEIA-ME.txt")!.dados.toString(), /nao coube no pacote/);
  assert.ok(lerZip(k.pacoteDoMes(db, titular, "2026-10")).some((a) => a.nome === "notas_fiscais/2026-10-06 Nota fiscal outubro (2).pdf"));

  for (let i = 0; i < 300; i++) lancar(repo, `2026-08-${String((i % 28) + 1).padStart(2, "0")}`, { description: `Item ${i}` });
  const inicio = Date.now();
  const grande = lerZip(k.pacoteDoMes(db, titular, "2026-08"));
  assert.ok(Date.now() - inicio < 30_000);
  assert.equal(grande[0].dados.toString().trim().split("\r\n").length, 301);
});

test("API do titular, cadastro com CONT-, rotas do contador, isolamento e revogacao", async () => {
  const fake = googleFalso();
  try {
    const { repo, db } = contaCom("so_gastos");
    lancar(repo, "2026-10-05");
    const nota = guardar(db, "notas_fiscais", "Nota fiscal outubro", "2026-10-06");
    const exame = guardar(db, "saude", "Exame", "2026-10-06");
    const app = buildServer(repo);
    const h = (token: string) => ({ authorization: `Bearer ${token}` });
    const pedir = (method: "GET" | "POST" | "DELETE" | "PATCH", url: string, token: string, payload?: object) =>
      app.inject({ method, url, headers: payload ? { ...h(token), "content-type": "application/json" } : h(token), payload: payload ? JSON.stringify(payload) : undefined });
    const dono = auth(db).abrirSessao(titular);

    const criado = await pedir("POST", "/api/conta/contador/convites", dono, { rotulo: "Escritorio Silva" });
    assert.equal(criado.statusCode, 201);
    const { codigo } = criado.json();
    assert.equal((await pedir("GET", "/api/conta/contador", dono)).json().convites[0].estado, "pendente");
    assert.equal((await pedir("GET", "/api/conta/contador", auth(db).abrirSessao(bia))).statusCode, 403);

    // Cadastro novo com o codigo: sem plano, o vinculo nasce na ativacao.
    const cadastro = await app.inject({
      method: "POST",
      url: "/api/auth/cadastro",
      headers: { "content-type": "application/json" },
      payload: JSON.stringify({ nome: "Carla Contadora", telefone: carla, email: "carla@contabil.com", senha: "senha-forte-1", convite: codigo.toLowerCase() }),
    });
    assert.equal(cadastro.statusCode, 201);
    assert.equal(k.clientesDe(db, carla).length, 0);
    const codigoAtivacao = auth(db).gerarCodigo(carla, "ativacao");
    const ativado = await app.inject({
      method: "POST",
      url: "/api/auth/ativar",
      headers: { "content-type": "application/json" },
      payload: JSON.stringify({ telefone: carla, codigo: codigoAtivacao }),
    });
    assert.equal(ativado.statusCode, 200);
    const tk = ativado.json().token as string;
    assert.equal(ativado.json().conta.perfil, "titular");
    assert.deepEqual((await pedir("GET", "/api/me", tk)).json().clientes, [{ conta: titular, nome: "Wesley" }]);
    assert.equal(resolverContexto(db, carla).conta, carla);

    assert.deepEqual((await pedir("GET", `/api/contador/${titular}/meses`, tk)).json().meses, ["2026-10"]);
    const mes = (await pedir("GET", `/api/contador/${titular}/mes/2026-10`, tk)).json();
    assert.deepEqual(mes.documentos.map((x: { titulo: string }) => x.titulo), ["Nota fiscal outubro"]);
    assert.equal(mes.lancamentos[0].lancadoPor, "Bia");
    assert.ok(k.contadoresDe(db, titular)[0].ultimoAcesso);
    assert.equal((await pedir("GET", `/api/contador/${titular}/mes/2026-13`, tk)).statusCode, 400);
    const arquivo = await pedir("GET", `/api/contador/${titular}/documentos/${nota.id}/arquivo`, tk);
    assert.equal(arquivo.statusCode, 200);
    assert.match(String(arquivo.headers["content-disposition"]), /^attachment;/);
    assert.equal((await pedir("GET", `/api/contador/${titular}/documentos/${exame.id}/arquivo`, tk)).statusCode, 404);
    const pacote = await pedir("GET", `/api/contador/${titular}/mes/2026-10/pacote`, tk);
    assert.equal(pacote.headers["content-type"], "application/zip");
    assert.equal(pacote.headers["content-disposition"], 'attachment; filename="dossie-2026-10.zip"');
    assert.equal(lerZip(pacote.rawPayload).length, 2);

    // Com a propria sessao, o contador so ve a propria conta (vazia), nunca a do cliente.
    for (const url of ["/api/transacoes?mes=2026-10", "/api/documentos", "/api/financas?mes=2026-10", "/api/agenda", "/api/tarefas"]) {
      const r = await pedir("GET", url, tk);
      assert.ok(!r.body.includes("Papel") && !r.body.includes("Nota fiscal"), url);
    }
    assert.equal((await pedir("DELETE", `/api/documentos/${nota.id}`, tk)).statusCode, 404);
    assert.ok(documentos(db).porId(nota.id));

    // Outro contador e outro cliente: nada.
    const rui = contador(db, "5511955550000", "Rui");
    assert.equal((await pedir("GET", `/api/contador/${titular}/meses`, rui)).statusCode, 403);
    assert.equal((await pedir("GET", `/api/contador/${outroTitular}/meses`, tk)).statusCode, 403);
    assert.equal((await pedir("GET", `/api/contador/abc/meses`, tk)).statusCode, 403);

    // Quem ja tem conta usa o codigo logado.
    const deNovo = (await pedir("POST", "/api/conta/contador/convites", dono, {})).json();
    assert.deepEqual((await pedir("POST", "/api/contador/aceitar", rui, { codigo: deNovo.codigo })).json(), { conta: titular, nome: "Wesley" });
    assert.equal((await pedir("GET", "/api/contador/clientes", rui)).json().clientes.length, 1);

    const idCarla = (await pedir("GET", "/api/conta/contador", dono)).json().contadores.find((c: { nome: string }) => c.nome === "Carla Contadora").id;
    assert.equal((await pedir("DELETE", `/api/conta/contador/${idCarla}`, dono)).statusCode, 200);
    const depois = await pedir("GET", `/api/contador/${titular}/mes/2026-10`, tk);
    assert.equal(depois.statusCode, 403);
    assert.equal(depois.json().erro, "Seu acesso a este cliente foi encerrado.");
    assert.equal((await pedir("DELETE", `/api/conta/contador/${idCarla}`, dono)).statusCode, 404);

    // A contadora escrevendo no WhatsApp nao entra na conversa da conta do cliente.
    const antesDoWebhook = fake.mensagens.filter((m) => m.para === carla).length;
    const corpo = JSON.stringify({ entry: [{ changes: [{ value: { messages: [{ id: "wamid.cont1", from: carla, type: "text", text: { body: "quanto o Wesley gastou?" } }] } }] }] });
    const assinatura = `sha256=${crypto.createHmac("sha256", "app-secret-teste").update(corpo).digest("hex")}`;
    await app.inject({ method: "POST", url: "/webhook", headers: { "content-type": "application/json", "x-hub-signature-256": assinatura }, payload: corpo });
    await new Promise((r) => setTimeout(r, 150));
    assert.equal(fake.estado.ia, 0);
    assert.equal(fake.mensagens.filter((m) => m.para === carla).length, antesDoWebhook);
    await app.close();
  } finally {
    fake.restaurar();
  }
});

test("ferramentas: convidar, listar e revogar contador", async () => {
  const { repo, db } = contaCom("completo");
  const ctx = ctxDe(repo, titular);
  const ferramenta = (nome: string, entrada: object, quem = ctx) => executarFerramenta(repo, quem, nome, entrada);

  const convite = await ferramenta("convidar_contador", { rotulo: "Escritorio Silva" });
  assert.match(convite, /Convite de contador criado: CONT-\w{6}/);
  assert.match(convite, /Texto para o usuario encaminhar: "Use o codigo CONT-/);
  assert.match(await ferramenta("convidar_contador", { rotulo: null }, ctxDe(repo, bia)), /^Sem permissao/);

  contador(db, carla, "Carla Contadora");
  k.aceitarConviteContador(db, convite.match(/CONT-\w{6}/)![0], carla);
  assert.match(await ferramenta("listar_acessos", {}), /Contador: Carla Contadora \(Escritorio Silva\), desde .+, ultimo acesso nunca/);
  assert.match(await ferramenta("remover_acesso", { pessoa: "escritorio", confirmado: false }), /Confirme com o usuario antes: tirar o acesso de contador de Carla Contadora/);
  assert.equal(k.clientesDe(db, carla).length, 1);
  assert.match(await ferramenta("remover_acesso", { pessoa: "contador", confirmado: true }), /Carla Contadora nao e mais contador desta conta/);
  assert.equal(k.clientesDe(db, carla).length, 0);
  assert.doesNotMatch(await ferramenta("listar_acessos", {}), /Contador:/);
});
