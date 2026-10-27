import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";

process.env.TIMEZONE = "America/Sao_Paulo";
process.env.WHATSAPP_VERIFY_TOKEN = "segredo-teste";
process.env.WHATSAPP_APP_SECRET = "app-secret-teste";
process.env.ALLOWED_NUMBERS = "5511999990000";
process.env.AI_PROVIDER = "gemini";
process.env.GEMINI_API_KEY = "chave-teste";
process.env.PAINEL_TOKEN = "token-teste";
process.env.PAINEL_TELEFONE = "5511999990000";

const { openDb, repo: makeRepo } = await import("../src/db.js");
const { conta, resolverContexto } = await import("../src/conta.js");
const { documentos, podeVerDocumento } = await import("../src/documentos.js");
const { config } = await import("../src/config.js");
const { executeTool } = await import("../src/tools.js");
const { auth } = await import("../src/auth.js");
const { buildServer } = await import("../src/server.js");
const { parseWebhook } = await import("../src/whatsapp.js");
const { localDate } = await import("../src/time.js");

type PerfilMembro = "completo" | "so_gastos" | "agenda_tarefas";

// Banco em memoria grava os arquivos numa pasta temporaria deste processo.
after(() => fs.rmSync(path.join(os.tmpdir(), `assessor-arquivos-${process.pid}`), { recursive: true, force: true }));

const titular = "5511999990000";
const bia = "5511912345678";
const estranho = "5521000000000";
const hoje = localDate();
const PDF = Buffer.from("%PDF-1.4\n% contrato de teste\n");
const FOTO = Buffer.from("foto-de-cupom");

function contaCom(perfil?: PerfilMembro) {
  const repo = makeRepo(openDb(":memory:"));
  repo.ensureUser(titular, "Wesley");
  repo.ensureUser(bia, "Bia");
  const c = conta(repo.db);
  if (perfil) c.aceitarConvite(c.gerarConvite(titular, perfil).codigo, bia);
  return { repo, docs: documentos(repo.db) };
}

const ctxDe = (repo: ReturnType<typeof makeRepo>, phone: string) => resolverContexto(repo.db, phone);

function contratoGuardado(docs: ReturnType<typeof documentos>, dono = titular) {
  const p = docs.salvarPendente(dono, dono, { data: PDF, mimeType: "application/pdf", nomeOriginal: "scan-001.pdf" });
  return docs.guardar(p.id, {
    pasta: "contratos",
    titulo: "Contrato de aluguel do apartamento",
    descricao: "Locação com a Imobiliária Sol, assinado em março de 2026, 30 meses.",
    dataDocumento: "2026-03-12",
  }).documento;
}

const gasto = (extra: object = {}) => ({
  tipo: "despesa", valor: 38, categoria: "Alimentacao", descricao: "Almoco", forma_pagamento: "pix", data: hoje, contraparte: "Cantina", parcelas: null, ...extra,
});

test("dominio: pendente, guardar, buscar sem acento, limites e limpeza", () => {
  const { repo, docs } = contaCom("completo");
  const pendente = docs.salvarPendente(titular, bia, { data: PDF, mimeType: "application/pdf", nomeOriginal: "contrato.pdf" });
  assert.equal(pendente.status, "pendente");
  assert.ok(fs.existsSync(docs.caminho(pendente)));
  assert.match(pendente.storage_path, new RegExp(`^${titular}[\\\\/]${pendente.id}-[0-9a-f]{8}\\.pdf$`));
  assert.equal(docs.ultimoPendente(bia)?.id, pendente.id);
  assert.equal(docs.ultimoPendente(titular), undefined);
  assert.ok(!podeVerDocumento(repo, ctxDe(repo, titular), pendente));
  assert.deepEqual(docs.buscar(titular, "contrato"), []);

  const guardado = contratoGuardado(docs);
  assert.equal(guardado.status, "guardado");
  assert.deepEqual(docs.buscar(titular, "acha o contrato do apartamento que assinei em marco").map((d) => d.id), [guardado.id]);
  assert.deepEqual(docs.buscar(titular, "IMOBILIARIA sol").map((d) => d.id), [guardado.id]);
  assert.deepEqual(docs.buscar(titular, "barco"), []);
  assert.deepEqual(docs.buscar(estranho, "contrato"), []);

  assert.throws(
    () => docs.salvarPendente(titular, titular, { data: Buffer.alloc(config.arquivos.maxBytes + 1), mimeType: "application/pdf" }),
    (e: { status?: number }) => e.status === 413,
  );

  const pequeno = documentos(repo.db, { ...config.arquivos, contaBytes: PDF.length * 2 + 10 });
  const p2 = pequeno.salvarPendente(titular, titular, { data: PDF, mimeType: "application/pdf" });
  assert.equal(pequeno.guardar(p2.id, { pasta: "outros", titulo: "Segundo" }).alerta, true);
  const p3 = pequeno.salvarPendente(titular, titular, { data: PDF, mimeType: "application/pdf" });
  assert.throws(() => pequeno.guardar(p3.id, { pasta: "outros", titulo: "Terceiro" }), (e: { status?: number }) => e.status === 507);

  const vencido = docs.salvarPendente(titular, titular, { data: FOTO, mimeType: "image/jpeg" });
  assert.match(vencido.original_name, /^foto-\d{8}-\d{4}\.jpg$/);
  const daqui25h = new Date(Date.now() + 25 * 3_600_000);
  assert.ok(docs.limparPendentes(daqui25h) >= 1);
  assert.equal(docs.porId(vencido.id), undefined);
  assert.ok(!fs.existsSync(docs.caminho(vencido)));
  assert.ok(docs.porId(guardado.id));

  assert.ok(docs.excluir(guardado.id));
  assert.ok(!fs.existsSync(docs.caminho(guardado)));
});

test("dominio: quem ve cada documento", () => {
  for (const [perfil, veContrato, veComprovante] of [
    ["completo", true, true],
    ["so_gastos", false, true],
    ["agenda_tarefas", false, false],
  ] as const) {
    const { repo, docs } = contaCom(perfil);
    const contrato = contratoGuardado(docs);
    const tx = repo.addTransaction({ phone: titular, kind: "despesa", amount_cents: 3800, category: "x", description: "Almoco", payment_method: "pix", occurred_on: hoje });
    const p = docs.salvarPendente(titular, titular, { data: FOTO, mimeType: "image/jpeg" });
    const comprovante = docs.guardar(p.id, { pasta: "comprovantes", titulo: "Almoco", transacaoId: tx.id }).documento;
    const ctx = ctxDe(repo, bia);
    assert.equal(podeVerDocumento(repo, ctx, contrato), veContrato, `${perfil} contrato`);
    assert.equal(podeVerDocumento(repo, ctx, comprovante), veComprovante, `${perfil} comprovante`);
    assert.ok(podeVerDocumento(repo, ctxDe(repo, titular), contrato));
    assert.ok(!podeVerDocumento(repo, ctxDe(repo, estranho), contrato));
  }
});

test("ferramentas: guardar, buscar, enviar, mover e excluir", () => {
  const { repo, docs } = contaCom();
  const ctx = ctxDe(repo, titular);
  const guardar = { pasta: "contratos", titulo: "Contrato do apartamento", descricao: "Assinado em março com a Imobiliária Sol", data_documento: "2026-03-12" };
  assert.match(executeTool(repo, ctx, "guardar_documento", guardar), /Nenhum arquivo recebido para guardar/);

  const p = docs.salvarPendente(titular, titular, { data: PDF, mimeType: "application/pdf", nomeOriginal: "scan.pdf" });
  const out = executeTool(repo, ctx, "guardar_documento", guardar, { anexoId: p.id });
  assert.match(out, new RegExp(`#${p.id}.*Contratos`));

  const busca = executeTool(repo, ctx, "buscar_documentos", { consulta: "contrato apartamento marco", pasta: null, data_inicio: null, data_fim: null });
  assert.match(busca, new RegExp(`#${p.id} Contrato do apartamento \\(Contratos, 2026-03-12\\)`));
  assert.match(executeTool(repo, ctx, "buscar_documentos", { consulta: "barco", pasta: null, data_inicio: null, data_fim: null }), /Nenhum documento/);

  const enviados: number[] = [];
  assert.match(executeTool(repo, ctx, "enviar_documento", { id: p.id }, { enviar: (id) => void enviados.push(id) }), /sera enviado/);
  assert.deepEqual(enviados, [p.id]);
  assert.match(executeTool(repo, ctxDe(repo, estranho), "enviar_documento", { id: p.id }, { enviar: (id) => void enviados.push(id) }), /nao encontrado/);
  assert.deepEqual(enviados, [p.id]);

  assert.match(executeTool(repo, ctx, "mover_documento", { id: p.id, pasta: "casa", titulo: null }), /Casa/);
  assert.match(executeTool(repo, ctx, "listar_pastas", {}), /Casa: 1/);
  assert.match(executeTool(repo, ctx, "excluir_documento", { id: p.id, confirmado: false }), /Confirme/);
  assert.ok(docs.porId(p.id));
  assert.match(executeTool(repo, ctx, "excluir_documento", { id: p.id, confirmado: true }), /Excluido/);
  assert.equal(docs.porId(p.id), undefined);
});

test("foto com lancamento vira comprovante ligado, inclusive para quem so ve gastos", () => {
  const { repo, docs } = contaCom("so_gastos");
  const ctx = ctxDe(repo, bia);
  const foto = docs.salvarPendente(titular, bia, { data: FOTO, mimeType: "image/jpeg" });
  const out = executeTool(repo, ctx, "registrar_transacao", gasto(), { anexoId: foto.id });
  assert.match(out, /Comprovante guardado \(#\d+\)/);
  const doc = docs.porId(foto.id)!;
  assert.equal(doc.status, "guardado");
  assert.equal(doc.folder, "comprovantes");
  assert.equal(doc.title, "Almoco - Cantina");
  assert.equal(doc.transaction_id, repo.listTransactions(titular, hoje, hoje)[0].id);
  assert.ok(podeVerDocumento(repo, ctx, doc));

  const nota = docs.salvarPendente(titular, titular, { data: FOTO, mimeType: "image/jpeg" });
  executeTool(repo, ctxDe(repo, titular), "registrar_transacao", gasto({ forma_pagamento: "credito", contraparte: null }), { anexoId: nota.id });
  assert.equal(docs.porId(nota.id)!.folder, "notas_fiscais");
  assert.equal(docs.porId(nota.id)!.title, "Almoco");
});

test("isolamento: cada perfil so usa as ferramentas de documentos que o perfil libera", () => {
  const FERRAMENTAS: [string, (id: number) => object][] = [
    ["guardar_documento", () => ({ pasta: "outros", titulo: "Teste", descricao: null, data_documento: null })],
    ["buscar_documentos", () => ({ consulta: "contrato", pasta: null, data_inicio: null, data_fim: null })],
    ["mover_documento", (id) => ({ id, pasta: "casa", titulo: null })],
    ["excluir_documento", (id) => ({ id, confirmado: false })],
    ["listar_pastas", () => ({})],
  ];
  let combinacoes = 0;
  for (const perfil of ["titular", "completo", "so_gastos", "agenda_tarefas"] as const) {
    for (const [nome, args] of FERRAMENTAS) {
      const { repo, docs } = contaCom(perfil === "titular" ? "completo" : perfil);
      const quem = perfil === "titular" ? titular : bia;
      const contrato = contratoGuardado(docs);
      const p = docs.salvarPendente(titular, quem, { data: PDF, mimeType: "application/pdf" });
      const out = executeTool(repo, ctxDe(repo, quem), nome, args(contrato.id), { anexoId: p.id });
      const liberado = perfil === "titular" || perfil === "completo";
      if (liberado) assert.doesNotMatch(out, /Sem permissao/, `${perfil} ${nome}`);
      else assert.match(out, /^Sem permissao/, `${perfil} ${nome}`);
      combinacoes++;
    }
    // Enviar depende do documento: o comprovante de um gasto visivel sai ate para quem so ve gastos.
    const { repo, docs } = contaCom(perfil === "titular" ? "completo" : perfil);
    const quem = perfil === "titular" ? titular : bia;
    const tx = repo.addTransaction({ phone: titular, kind: "despesa", amount_cents: 100, category: "x", description: "x", payment_method: null, occurred_on: hoje });
    const p = docs.salvarPendente(titular, titular, { data: FOTO, mimeType: "image/jpeg" });
    docs.guardar(p.id, { pasta: "comprovantes", titulo: "x", transacaoId: tx.id });
    const enviados: number[] = [];
    executeTool(repo, ctxDe(repo, quem), "enviar_documento", { id: p.id }, { enviar: (id) => void enviados.push(id) });
    assert.equal(enviados.length, perfil === "agenda_tarefas" ? 0 : 1, `${perfil} enviar comprovante`);
    combinacoes++;
  }
  assert.equal(combinacoes, 24);
});

test("API: listar, buscar, baixar, renomear, mover, excluir e comprovante em Transacoes", async () => {
  const { repo, docs } = contaCom("so_gastos");
  const contrato = contratoGuardado(docs);
  const tx = repo.addTransaction({ phone: titular, kind: "despesa", amount_cents: 3800, category: "Alimentacao", description: "Almoco", payment_method: "pix", occurred_on: hoje, created_by: bia });
  const p = docs.salvarPendente(titular, bia, { data: FOTO, mimeType: "image/jpeg" });
  const comprovante = docs.guardar(p.id, { pasta: "comprovantes", titulo: "Almoco", transacaoId: tx.id }).documento;
  const pendenteDaBia = docs.salvarPendente(titular, bia, { data: PDF, mimeType: "application/pdf" });
  const deOutraConta = contratoGuardado(docs, estranho);

  const app = buildServer(repo);
  const contas = auth(repo.db);
  const tTitular = contas.abrirSessao(titular);
  const tBia = contas.abrirSessao(bia);
  const req = (method: string, url: string, token: string, body?: object) =>
    app.inject({ method: method as "GET", url, headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, payload: body ? JSON.stringify(body) : undefined });

  const lista = (await req("GET", "/api/documentos", tTitular)).json();
  assert.equal(lista.total, 2);
  assert.equal(lista.pastas.find((x: { id: string }) => x.id === "contratos").qtd, 1);
  assert.equal(lista.uso.alerta, false);
  const busca = (await req("GET", "/api/documentos?busca=imobiliaria", tTitular)).json();
  assert.deepEqual(busca.documentos.map((d: { id: number }) => d.id), [contrato.id]);

  const arquivo = await req("GET", `/api/documentos/${contrato.id}/arquivo`, tTitular);
  assert.equal(arquivo.statusCode, 200);
  assert.equal(arquivo.headers["content-type"], "application/pdf");
  assert.equal(arquivo.rawPayload.toString(), PDF.toString());
  assert.match(String(arquivo.headers["content-disposition"]), /^inline; filename\*=UTF-8''Contrato%20de%20aluguel/);
  assert.equal((await req("GET", `/api/documentos/${deOutraConta.id}/arquivo`, tTitular)).statusCode, 404);
  assert.equal((await req("GET", `/api/documentos/${pendenteDaBia.id}/arquivo`, tTitular)).statusCode, 404);

  assert.equal((await req("GET", "/api/documentos", tBia)).statusCode, 403);
  assert.equal((await req("GET", `/api/documentos/${contrato.id}/arquivo`, tBia)).statusCode, 404);
  assert.equal((await req("GET", `/api/documentos/${comprovante.id}/arquivo`, tBia)).statusCode, 200);
  const txBia = (await req("GET", "/api/transacoes", tBia)).json();
  assert.equal(txBia.transacoes.find((t: { id: number }) => t.id === tx.id).comprovanteId, comprovante.id);

  const editado = await req("PATCH", `/api/documentos/${contrato.id}`, tTitular, { titulo: "Contrato do ape", pasta: "casa" });
  assert.equal(editado.statusCode, 200);
  assert.equal(editado.json().pasta, "casa");
  assert.equal((await req("PATCH", `/api/documentos/${contrato.id}`, tTitular, { pasta: "inexistente" })).statusCode, 400);
  assert.deepEqual((await req("GET", "/api/documentos?busca=ape", tTitular)).json().documentos.map((d: { id: number }) => d.id), [contrato.id]);

  assert.equal((await req("DELETE", `/api/documentos/${contrato.id}`, tTitular)).statusCode, 200);
  assert.ok(!fs.existsSync(docs.caminho(contrato)));
  assert.equal((await req("DELETE", `/api/documentos/${deOutraConta.id}`, tTitular)).statusCode, 404);
  await app.close();
});

test("webhook: documento vira pendente, vai ao modelo e o arquivo pedido sai depois do texto", async () => {
  assert.deepEqual(
    parseWebhook({ entry: [{ changes: [{ value: { messages: [
      { id: "d", from: titular, type: "document", document: { id: "m9", filename: "contrato.pdf", mime_type: "application/pdf", caption: "guarda" } },
    ] } }] }] }),
    [{ id: "d", from: titular, name: undefined, type: "document", mediaId: "m9", filename: "contrato.pdf", mimeType: "application/pdf", caption: "guarda" }],
  );

  const { repo, docs } = contaCom();
  const app = buildServer(repo);
  const enviar = async (id: string, msg: object) => {
    const payload = JSON.stringify({ entry: [{ changes: [{ value: { messages: [{ id, from: titular, ...msg }] } }] }] });
    const sig = "sha256=" + crypto.createHmac("sha256", "app-secret-teste").update(payload).digest("hex");
    await app.inject({ method: "POST", url: "/webhook", payload, headers: { "content-type": "application/json", "x-hub-signature-256": sig } });
  };
  const respostasGemini: object[] = [];
  const corposGemini: string[] = [];
  const saida: string[] = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string, init?: { method?: string; body?: unknown }) => {
    const u = String(url);
    if (u.includes("generativelanguage")) {
      corposGemini.push(String(init?.body));
      return new Response(JSON.stringify(respostasGemini.shift()), { status: 200 });
    }
    if (u.endsWith("/media-1")) return new Response(JSON.stringify({ url: "https://cdn.teste/arquivo", mime_type: "application/pdf" }), { status: 200 });
    if (u.startsWith("https://cdn.teste/")) return new Response(PDF, { status: 200 });
    if (u.endsWith("/media")) {
      saida.push("upload");
      return new Response(JSON.stringify({ id: "up-1" }), { status: 200 });
    }
    if (u.endsWith("/messages")) {
      const corpo = JSON.parse(String(init?.body));
      if (corpo.type) saida.push(corpo.type === "document" ? `document:${corpo.document.id}` : corpo.type);
    }
    return new Response("{}", { status: 200 });
  }) as typeof fetch;
  process.env.WHATSAPP_TOKEN = "token-meta-teste";
  process.env.WHATSAPP_PHONE_NUMBER_ID = "123";
  const esperarHistorico = async (n: number) => {
    for (let i = 0; i < 100 && repo.recentHistory(titular).length < n; i++) await new Promise((r) => setTimeout(r, 20));
  };
  try {
    respostasGemini.push({ candidates: [{ content: { role: "model", parts: [{ text: "Parece um contrato de aluguel. Guardo em Contratos?" }] } }] });
    await enviar("w1", { type: "document", document: { id: "media-1", filename: "contrato.pdf", mime_type: "application/pdf" } });
    await esperarHistorico(2);
    assert.match(corposGemini[0], /"mimeType":"application\/pdf"/);
    assert.equal(docs.ultimoPendente(titular)?.original_name, "contrato.pdf");
    assert.match(repo.recentHistory(titular)[0].text, /^\[documento\] contrato\.pdf/);

    const guardado = contratoGuardado(docs);
    saida.length = 0;
    respostasGemini.push(
      { candidates: [{ content: { role: "model", parts: [{ functionCall: { name: "enviar_documento", args: { id: guardado.id } } }] } }] },
      { candidates: [{ content: { role: "model", parts: [{ text: "Achei! Mandando o contrato." }] } }] },
    );
    await enviar("w2", { type: "text", text: { body: "me manda o contrato do apartamento" } });
    await esperarHistorico(4);
    for (let i = 0; i < 50 && saida.length < 3; i++) await new Promise((r) => setTimeout(r, 20));
    assert.deepEqual(saida, ["text", "upload", "document:up-1"]);
  } finally {
    globalThis.fetch = realFetch;
    delete process.env.WHATSAPP_TOKEN;
    delete process.env.WHATSAPP_PHONE_NUMBER_ID;
    await app.close();
  }
});
