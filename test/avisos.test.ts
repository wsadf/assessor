import assert from "node:assert/strict";
import crypto from "node:crypto";
import { test } from "node:test";

process.env.TIMEZONE = "America/Sao_Paulo";
process.env.WHATSAPP_VERIFY_TOKEN = "segredo-teste";
process.env.WHATSAPP_APP_SECRET = "app-secret-teste";
process.env.ALLOWED_NUMBERS = "5511999990000";
process.env.AI_PROVIDER = "gemini";
process.env.GEMINI_API_KEY = "chave-teste";
process.env.PAINEL_TOKEN = "token-teste";
process.env.PAINEL_TELEFONE = "5511999990000";
process.env.DAILY_SUMMARY_HOUR = "7";

const { openDb, repo: makeRepo } = await import("../src/db.js");
const { conta, resolverContexto } = await import("../src/conta.js");
const av = await import("../src/avisos.js");
const { executeTool } = await import("../src/tools.js");
const { auth } = await import("../src/auth.js");
const { buildServer } = await import("../src/server.js");
const { rodarAvisos, runRemindersOnce } = await import("../src/scheduler.js");
const { fromLocal, localDate } = await import("../src/time.js");

type PerfilMembro = "completo" | "so_gastos" | "agenda_tarefas";

const titular = "5511999990000";
const bia = "5511912345678";
// Terca-feira; a segunda anterior e 2026-11-09.
const HOJE = "2026-11-10";
const as = (data: string, hora = "10:00") => fromLocal(`${data}T${hora}`);

function contaCom(perfil?: PerfilMembro) {
  const repo = makeRepo(openDb(":memory:"));
  repo.ensureUser(titular, "Wesley");
  repo.ensureUser(bia, "Bia");
  const c = conta(repo.db);
  if (perfil) c.aceitarConvite(c.gerarConvite(titular, perfil).codigo, bia);
  return { repo, db: repo.db };
}
const ctxDe = (repo: ReturnType<typeof makeRepo>, phone: string) => resolverContexto(repo.db, phone);
const despesa = (repo: ReturnType<typeof makeRepo>, data: string, reais: number, categoria = "Mercado") =>
  repo.addTransaction({ phone: titular, kind: "despesa", amount_cents: Math.round(reais * 100), category: categoria, description: categoria, payment_method: null, occurred_on: data });

function coletor(falhar = false) {
  const enviados: { para: string; texto: string }[] = [];
  const send = async (para: string, texto: string) => {
    if (falhar) throw new Error("fora da janela de 24 horas");
    enviados.push({ para, texto });
  };
  return { enviados, send };
}

test("fundacao: preferencias padrao, registro unico e fila de pendentes", async () => {
  const { repo, db } = contaCom("so_gastos");
  const doTitular = Object.fromEntries(av.preferencias(db, ctxDe(repo, titular)).map((p) => [p.tipo, p]));
  assert.deepEqual(
    Object.fromEntries(Object.entries(doTitular).map(([k, p]) => [k, [p.ligado, p.hora, p.disponivel]])),
    { vencimentos: [true, 9, true], categoria: [true, 9, true], recorrentes: [true, 9, true], resumo_manha: [true, 7, true], resumo_noite: [false, 21, true] },
  );
  const daBia = Object.fromEntries(av.preferencias(db, ctxDe(repo, bia)).map((p) => [p.tipo, p]));
  assert.ok(Object.values(daBia).every((p) => !p.ligado));
  assert.equal(daBia.categoria.disponivel, true);

  av.definirPreferencia(db, titular, "resumo_noite", { ligado: true, hora: 22 });
  const noite = av.preferencias(db, ctxDe(repo, titular)).find((p) => p.tipo === "resumo_noite")!;
  assert.deepEqual([noite.ligado, noite.hora], [true, 22]);

  const agora = as(HOJE);
  assert.equal(av.marcarEnvio(db, titular, "categoria", "x", agora), true);
  assert.equal(av.marcarEnvio(db, titular, "categoria", "x", agora), false);

  const { send } = coletor(true);
  await av.entregar(db, send, titular, "vencimentos", "k1", "aviso 1", agora);
  await av.entregar(db, send, titular, "vencimentos", "k1", "aviso 1 de novo", agora);
  av.enfileirar(db, titular, "aviso velho", new Date(agora.getTime() - 8 * 86_400_000));
  assert.deepEqual(av.retirarPendentes(db, titular, agora), ["aviso 1"]);
  assert.deepEqual(av.retirarPendentes(db, titular, agora), []);
});

test("contas a pagar: unica, mensal com dia 31 e pagamento sem valor", () => {
  const { repo, db } = contaCom();
  const ctx = ctxDe(repo, titular);
  const unica = av.criarConta(db, ctx, { descricao: "IPVA", vencimento: "2026-11-20", valor: 1240, mensal: false });
  const r = av.pagarConta(repo, ctx, unica.id, { data: "2026-11-19" });
  assert.equal(r.conta.status, "paga");
  assert.equal(r.transacao.amount_cents, 124000);
  assert.equal(r.transacao.bill_id, unica.id);

  const aluguel = av.criarConta(db, ctx, { descricao: "Aluguel", vencimento: "2027-01-31", valor: 1650, mensal: true });
  assert.equal(av.pagarConta(repo, ctx, aluguel.id, {}).conta.due_on, "2027-02-28");
  assert.equal(av.pagarConta(repo, ctx, aluguel.id, {}).conta.due_on, "2027-03-31");

  const fatura = av.criarConta(db, ctx, { descricao: "Fatura Nubank", vencimento: "2026-11-15", mensal: true });
  assert.throws(() => av.pagarConta(repo, ctx, fatura.id, {}), /valor/);
  assert.equal(av.pagarConta(repo, ctx, fatura.id, { valor: 812.4 }).transacao.amount_cents, 81240);

  const abertas = av.listarContas(db, titular, { hoje: "2026-11-25" });
  assert.deepEqual(abertas.map((c) => c.description), ["Fatura Nubank", "Aluguel"]);
});

test("recorrencias: semanal, sem duplicar, pausa e limite de 7 dias", () => {
  const { repo, db } = contaCom();
  const ctx = ctxDe(repo, titular);
  const academia = av.criarRecorrencia(db, ctx, {
    tipo: "despesa", valor: 89.9, categoria: "Saude", descricao: "Academia", frequencia: "semanal", inicio: "2026-11-02",
  });
  assert.equal(academia.anchor_day, 1);
  av.lancarDevidas(repo, "2026-11-02");
  av.lancarDevidas(repo, "2026-11-09");
  av.lancarDevidas(repo, "2026-11-09");
  const lancadas = () => repo.listTransactions(titular, "2026-01-01", "2026-12-31").filter((t) => t.recurring_id === academia.id).map((t) => t.occurred_on).sort();
  assert.deepEqual(lancadas(), ["2026-11-02", "2026-11-09"]);

  av.alterarRecorrencia(db, ctx, academia.id, "pausar", "2026-11-10");
  av.lancarDevidas(repo, "2026-11-30");
  assert.equal(lancadas().length, 2);
  const retomada = av.alterarRecorrencia(db, ctx, academia.id, "retomar", "2026-12-02");
  assert.equal(retomada.next_on, "2026-12-07");

  const streaming = av.criarRecorrencia(db, ctx, {
    tipo: "despesa", valor: 10, categoria: "Lazer", descricao: "Diario", frequencia: "diaria", inicio: "2026-11-01",
  });
  av.lancarDevidas(repo, "2026-11-10");
  const diarias = repo.listTransactions(titular, "2026-11-01", "2026-11-10").filter((t) => t.recurring_id === streaming.id);
  assert.deepEqual(diarias.map((t) => t.occurred_on).sort(), ["2026-11-04", "2026-11-05", "2026-11-06", "2026-11-07", "2026-11-08", "2026-11-09", "2026-11-10"]);
});

test("categoria acima do normal, comparativo e resumo da noite", () => {
  const { repo, db } = contaCom("agenda_tarefas");
  despesa(repo, "2026-10-05", 300);
  despesa(repo, "2026-11-05", 360);
  despesa(repo, "2026-10-05", 200, "Padaria");
  despesa(repo, "2026-11-05", 220, "Padaria");
  despesa(repo, "2026-10-06", 80, "Lazer");
  despesa(repo, "2026-11-06", 130, "Lazer");
  despesa(repo, "2026-10-20", 999, "Mercado");

  const acima = av.categoriasAcima(repo, titular, HOJE);
  assert.deepEqual(acima.map((a) => a.categoria), ["Mercado"]);
  assert.equal(Math.round(acima[0].percentual * 100), 20);
  assert.equal(acima[0].projecao, Math.round((36000 / 10) * 30));
  assert.match(av.textoCategoria(acima[0]), /Mercado esta 20% acima/);

  const comp = av.compararMeses(repo, titular, null, HOJE);
  assert.equal(comp.total, 71000);
  assert.equal(comp.totalAnterior, 58000);
  assert.deepEqual(comp.variacoes.map((v) => v.categoria), ["Mercado", "Lazer", "Padaria"]);

  const hoje = localDate();
  repo.addTransaction({ phone: titular, kind: "despesa", amount_cents: 4000, category: "x", description: "x", payment_method: null, occurred_on: hoje });
  repo.addTask(titular, { title: "Revisar" });
  const now = new Date();
  assert.match(av.resumoNoite(repo, ctxDe(repo, titular), now)!, /1 gasto \(R\$\s?40,00\).*1 tarefa/);
  const daBia = av.resumoNoite(repo, ctxDe(repo, bia), now)!;
  assert.doesNotMatch(daBia, /gasto/);
  assert.match(daBia, /1 tarefa/);
  const vazio = contaCom();
  assert.equal(av.resumoNoite(vazio.repo, ctxDe(vazio.repo, titular), now), null);
});

test("agendador: vencimento uma vez, recorrente, categoria por semana e lembrete pendente", async () => {
  const { repo, db } = contaCom("completo");
  const ctx = ctxDe(repo, titular);
  // O resumo da manha sai as 7h e atrapalharia a conferencia do que sai as 9h.
  av.definirPreferencia(db, titular, "resumo_manha", { ligado: false });
  const condominio = av.criarConta(db, ctx, { descricao: "Condominio", vencimento: "2026-11-11", valor: 480, mensal: true });
  av.criarRecorrencia(db, ctx, { tipo: "despesa", valor: 89.9, categoria: "Saude", descricao: "Academia", frequencia: "semanal", inicio: HOJE });
  despesa(repo, "2026-10-05", 300);
  despesa(repo, "2026-11-05", 360);

  const { enviados, send } = coletor();
  await rodarAvisos(repo, send, as(HOJE, "08:00"));
  assert.equal(enviados.length, 0, "antes das 9h nada sai");
  assert.equal(repo.listTransactions(titular, HOJE, HOJE).filter((t) => t.recurring_id).length, 1, "o lancamento nao espera a hora do aviso");

  await rodarAvisos(repo, send, as(HOJE, "10:00"));
  await rodarAvisos(repo, send, as(HOJE, "10:01"));
  const doTitular = enviados.filter((e) => e.para === titular).map((e) => e.texto);
  assert.equal(doTitular.filter((t) => /Amanha vence Condominio: R\$\s?480,00/.test(t)).length, 1);
  assert.equal(doTitular.filter((t) => /Lancei Academia/.test(t)).length, 1);
  assert.equal(doTitular.filter((t) => /Mercado esta 20% acima/.test(t)).length, 1);
  assert.ok(enviados.every((e) => e.para === titular), "membro com tudo desligado nao recebe");

  av.pagarConta(repo, ctx, condominio.id, {});
  await rodarAvisos(repo, send, as("2026-11-12", "10:00"));
  assert.equal(enviados.filter((e) => /Mercado esta/.test(e.texto)).length, 1, "categoria no maximo uma vez por semana");
  assert.equal(enviados.filter((e) => /Condominio/.test(e.texto)).length, 1);

  av.definirPreferencia(db, titular, "recorrentes", { ligado: false });
  av.criarRecorrencia(db, ctx, { tipo: "despesa", valor: 5, categoria: "x", descricao: "Cafe", frequencia: "diaria", inicio: "2026-11-12" });
  await rodarAvisos(repo, send, as("2026-11-12", "11:00"));
  assert.ok(!enviados.some((e) => /Cafe/.test(e.texto)));
  assert.equal(repo.listTransactions(titular, "2026-11-12", "2026-11-12").filter((t) => t.description === "Cafe").length, 1);

  repo.addReminder(titular, "remedio", new Date(Date.now() - 60_000), null);
  const falha = coletor(true);
  await runRemindersOnce(repo, falha.send);
  await runRemindersOnce(repo, falha.send);
  assert.equal(repo.listReminders(titular).length, 0, "lembrete que falha avanca em vez de repetir");
  assert.deepEqual(av.retirarPendentes(db, titular, new Date()), ["⏰ Lembrete: remedio"]);
});

test("ferramentas: contas, recorrencias, comparativo e avisos por perfil", () => {
  const FERRAMENTAS: [string, () => object, "despesas" | "receitas" | "qualquer"][] = [
    ["cadastrar_conta_pagar", () => ({ descricao: "Condominio", vencimento: "2026-11-20", valor: 480, categoria: null, mensal: true }), "despesas"],
    ["listar_contas_pagar", () => ({ incluir_pagas: null }), "despesas"],
    ["criar_recorrencia", () => ({ tipo: "despesa", valor: 89.9, categoria: "Saude", descricao: "Academia", frequencia: "semanal", inicio: "2026-11-09", contraparte: null, forma_pagamento: null }), "despesas"],
    ["criar_recorrencia", () => ({ tipo: "receita", valor: 7800, categoria: "Salario", descricao: "Salario", frequencia: "mensal", inicio: "2026-11-05", contraparte: null, forma_pagamento: null }), "receitas"],
    ["listar_recorrencias", () => ({}), "despesas"],
    ["comparar_meses", () => ({ mes: null }), "despesas"],
  ];
  for (const perfil of ["titular", "completo", "so_gastos", "agenda_tarefas"] as const) {
    for (const [nome, args, cap] of FERRAMENTAS) {
      const { repo } = contaCom(perfil === "titular" ? "completo" : perfil);
      const quem = perfil === "titular" ? titular : bia;
      const out = executeTool(repo, ctxDe(repo, quem), nome, args());
      const liberado = perfil === "titular" || perfil === "completo" || (perfil === "so_gastos" && cap === "despesas");
      if (liberado) assert.doesNotMatch(out, /Sem permissao/, `${perfil} ${nome} ${cap}`);
      else assert.match(out, /^Sem permissao/, `${perfil} ${nome} ${cap}`);
    }
  }

  const { repo, db } = contaCom("agenda_tarefas");
  const ctx = ctxDe(repo, titular);
  assert.match(executeTool(repo, ctx, "cadastrar_conta_pagar", { descricao: "Condominio", vencimento: "2026-11-20", valor: 480, categoria: null, mensal: true }), /#\d+ Condominio.*mensal/);
  const id = av.listarContas(db, titular, { hoje: HOJE })[0].id;
  assert.match(executeTool(repo, ctx, "pagar_conta", { id, valor: null, data: "2026-11-19", forma_pagamento: "boleto" }), /Proximo vencimento: 2026-12-20/);
  assert.match(executeTool(repo, ctx, "criar_recorrencia", { tipo: "despesa", valor: 89.9, categoria: "Saude", descricao: "Academia", frequencia: "semanal", inicio: "2026-11-09", contraparte: null, forma_pagamento: null }), /toda segunda/);
  assert.match(executeTool(repo, ctxDe(repo, bia), "configurar_avisos", { tipo: "categoria", ligado: true, hora: null }), /nao se aplica/);
  assert.match(executeTool(repo, ctxDe(repo, bia), "configurar_avisos", { tipo: "resumo_noite", ligado: true, hora: 22 }), /22h/);
  assert.equal(av.preferencias(db, ctxDe(repo, bia)).find((p) => p.tipo === "resumo_noite")!.ligado, true);
});

test("API: contas a pagar, recorrencias, avisos e campos novos", async () => {
  const { repo } = contaCom("so_gastos");
  const app = buildServer(repo);
  const contas = auth(repo.db);
  const tTitular = contas.abrirSessao(titular);
  const tBia = contas.abrirSessao(bia);
  const req = (method: string, url: string, token: string, body?: object) =>
    app.inject({ method: method as "GET", url, headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, payload: body ? JSON.stringify(body) : undefined });
  const hoje = localDate();
  const [y, m, d] = hoje.split("-").map(Number);
  const daqui3 = new Date(Date.UTC(y, m - 1, d + 3)).toISOString().slice(0, 10);

  const criada = await req("POST", "/api/contas-pagar", tTitular, { descricao: "Fatura Nubank", vencimento: daqui3, mensal: true });
  assert.equal(criada.statusCode, 201);
  const id = criada.json().id;
  assert.equal((await req("POST", `/api/contas-pagar/${id}/pagar`, tTitular, {})).statusCode, 400);
  const fin = (await req("GET", "/api/financas", tTitular)).json();
  assert.deepEqual(fin.contasProximas.map((c: { descricao: string }) => c.descricao), ["Fatura Nubank"]);
  const pago = (await req("POST", `/api/contas-pagar/${id}/pagar`, tTitular, { valor: 812.4, data: hoje })).json();
  assert.equal(pago.transacao.valor, 812.4);
  const tx = (await req("GET", "/api/transacoes", tTitular)).json().transacoes.find((t: { id: number }) => t.id === pago.transacao.id);
  assert.equal(tx.contaPagarId, id);
  assert.equal(tx.recorrente, false);
  assert.equal((await req("DELETE", `/api/contas-pagar/${id}`, tTitular)).statusCode, 200);

  const rec = await req("POST", "/api/recorrencias", tBia, { tipo: "despesa", valor: 89.9, categoria: "Saude", descricao: "Academia", frequencia: "semanal", inicio: hoje });
  assert.equal(rec.statusCode, 201);
  assert.equal((await req("POST", "/api/recorrencias", tBia, { tipo: "receita", valor: 100, categoria: "x", descricao: "x", frequencia: "mensal", inicio: hoje })).statusCode, 403);
  assert.equal((await req("PATCH", `/api/recorrencias/${rec.json().id}`, tBia, { acao: "pausar" })).json().situacao, "pausada");
  assert.equal((await req("GET", "/api/recorrencias", tTitular)).json().recorrencias.length, 1);

  const avisos = (await req("GET", "/api/avisos", tBia)).json();
  assert.equal(avisos.modeloAprovado, false);
  assert.ok(avisos.avisos.every((a: { ligado: boolean }) => !a.ligado));
  assert.equal((await req("PUT", "/api/avisos/categoria", tBia, { ligado: true, hora: 8 })).statusCode, 200);
  assert.equal((await req("PUT", "/api/avisos/inexistente", tBia, { ligado: true })).statusCode, 400);
  const depois = (await req("GET", "/api/avisos", tBia)).json().avisos.find((a: { tipo: string }) => a.tipo === "categoria");
  assert.deepEqual([depois.ligado, depois.hora], [true, 8]);
  const doTitular = (await req("GET", "/api/avisos", tTitular)).json().avisos.find((a: { tipo: string }) => a.tipo === "categoria");
  assert.equal(doTitular.hora, 9);
  await app.close();
});

test("webhook entrega os avisos pendentes antes da resposta", async () => {
  const { repo, db } = contaCom();
  av.enfileirar(db, titular, "📅 Amanha vence Condominio: R$ 480,00.", new Date());
  const app = buildServer(repo);
  const textos: string[] = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string, init?: { body?: unknown }) => {
    if (String(url).includes("generativelanguage")) {
      return new Response(JSON.stringify({ candidates: [{ content: { role: "model", parts: [{ text: "Oi, Wesley!" }] } }] }), { status: 200 });
    }
    const corpo = init?.body ? JSON.parse(String(init.body)) : {};
    if (corpo.type === "text") textos.push(corpo.text.body);
    return new Response("{}", { status: 200 });
  }) as typeof fetch;
  process.env.WHATSAPP_TOKEN = "token-meta-teste";
  process.env.WHATSAPP_PHONE_NUMBER_ID = "123";
  try {
    const payload = JSON.stringify({ entry: [{ changes: [{ value: { messages: [{ id: "p1", from: titular, type: "text", text: { body: "oi" } }] } }] }] });
    const sig = "sha256=" + crypto.createHmac("sha256", "app-secret-teste").update(payload).digest("hex");
    await app.inject({ method: "POST", url: "/webhook", payload, headers: { "content-type": "application/json", "x-hub-signature-256": sig } });
    for (let i = 0; i < 100 && textos.length < 2; i++) await new Promise((r) => setTimeout(r, 20));
    assert.equal(textos.length, 2);
    assert.match(textos[0], /^Avisos que ficaram para depois:\n- 📅 Amanha vence Condominio/);
    assert.equal(textos[1], "Oi, Wesley!");
    assert.deepEqual(av.retirarPendentes(db, titular, new Date()), []);
  } finally {
    globalThis.fetch = realFetch;
    delete process.env.WHATSAPP_TOKEN;
    delete process.env.WHATSAPP_PHONE_NUMBER_ID;
    await app.close();
  }
});
