import assert from "node:assert/strict";
import crypto from "node:crypto";
import { test } from "node:test";

process.env.TIMEZONE = "America/Sao_Paulo";
process.env.WHATSAPP_VERIFY_TOKEN = "segredo-teste";
process.env.WHATSAPP_APP_SECRET = "app-secret-teste";
process.env.ALLOWED_NUMBERS = "5511999990000";
process.env.GEMINI_MODEL = "modelo-principal";
process.env.GEMINI_FALLBACK_MODEL = "modelo-reserva";
process.env.PAINEL_TOKEN = "token-teste";
process.env.PAINEL_TELEFONE = "5511999990000";

const { openDb, repo: makeRepo } = await import("../src/db.js");
const { executeTool, nextOccurrence } = await import("../src/tools.js");
const { fromLocal, localDate } = await import("../src/time.js");
const { runRemindersOnce } = await import("../src/scheduler.js");
const { parseWebhook, verifySignature } = await import("../src/whatsapp.js");
const { buildServer } = await import("../src/server.js");
const { geminiProvider, functionDeclarations, toGeminiSchema, resetGeminiFallback } = await import("../src/providers/gemini.js");

const phone = "5511999990000";
const fresh = () => makeRepo(openDb(":memory:"));

test("fromLocal converte horario de Sao Paulo para UTC", () => {
  assert.equal(fromLocal("2026-10-26T15:00").toISOString(), "2026-10-26T18:00:00.000Z");
});

test("registra, consulta, corrige e exclui transacoes", () => {
  const repo = fresh();
  const out = executeTool(repo, phone, "registrar_transacao", {
    tipo: "despesa", valor: 62, categoria: "Saude", descricao: "Farmacia", forma_pagamento: "debito", data: null,
  });
  assert.match(out, /#1 .* R\$\s?62,00 \| Saude/);
  executeTool(repo, phone, "registrar_transacao", {
    tipo: "receita", valor: 800, categoria: "Freela", descricao: "Site", forma_pagamento: "pix", data: null,
  });

  const today = localDate();
  const summary = executeTool(repo, phone, "consultar_transacoes", {
    data_inicio: today, data_fim: today, tipo: null, categoria: null,
  });
  assert.match(summary, /Despesas: R\$\s?62,00\. Receitas: R\$\s?800,00\. Saldo: R\$\s?738,00/);

  const edited = executeTool(repo, phone, "editar_transacao", {
    id: 1, tipo: null, valor: 92, categoria: null, descricao: null, forma_pagamento: null, data: null,
  });
  assert.match(edited, /Antes: #1 .*62,00[\s\S]*Agora: #1 .*92,00/);

  assert.match(executeTool(repo, phone, "excluir_transacao", { id: 1 }), /Excluido/);
  assert.match(executeTool(repo, phone, "excluir_transacao", { id: 1 }), /nao encontrada/);
});

test("transacoes de outro usuario nao aparecem", () => {
  const repo = fresh();
  executeTool(repo, phone, "registrar_transacao", {
    tipo: "despesa", valor: 10, categoria: "Mercado", descricao: "Pao", forma_pagamento: null, data: null,
  });
  assert.match(executeTool(repo, "5521000000000", "editar_transacao", {
    id: 1, tipo: null, valor: 1, categoria: null, descricao: null, forma_pagamento: null, data: null,
  }), /nao encontrada/);
});

test("rejeita entrada fora do schema", () => {
  assert.throws(
    () => executeTool(fresh(), phone, "registrar_transacao", { tipo: "despesa", valor: -5 }),
    /Entrada invalida/,
  );
});

test("lembrete mensal no dia 31 cai no ultimo dia do mes seguinte", () => {
  const next = nextOccurrence(fromLocal("2027-01-31T09:00"), "mensal")!;
  assert.equal(next.toISOString(), fromLocal("2027-02-28T09:00").toISOString());
});

test("agendador envia lembrete vencido e reagenda o recorrente", async () => {
  const repo = fresh();
  const due = new Date(Date.now() - 60_000);
  repo.addReminder(phone, "tomar remedio", due, "diario");
  repo.addReminder(phone, "ligar pro contador", due, null);

  const sent: string[] = [];
  await runRemindersOnce(repo, async (_to, text) => void sent.push(text));

  assert.deepEqual(sent.sort(), ["⏰ Lembrete: ligar pro contador", "⏰ Lembrete: tomar remedio"]);
  const active = repo.listReminders(phone);
  assert.equal(active.length, 1);
  assert.ok(new Date(active[0].next_run_at) > new Date());
});

test("parseWebhook extrai texto, audio e foto e ignora status", () => {
  const msgs = parseWebhook({
    entry: [{ changes: [{ value: {
      contacts: [{ wa_id: phone, profile: { name: "Wesley" } }],
      messages: [
        { id: "a", from: phone, type: "text", text: { body: "gastei 62" } },
        { id: "b", from: phone, type: "audio", audio: { id: "m1" } },
        { id: "c", from: phone, type: "image", image: { id: "m2", caption: "nota" } },
      ],
      statuses: [{ id: "x", status: "read" }],
    } }] }],
  });
  assert.deepEqual(msgs.map((m) => m.type), ["text", "audio", "image"]);
  assert.equal(msgs[0].name, "Wesley");
});

test("verifySignature confere o HMAC da Meta", () => {
  const body = Buffer.from('{"a":1}');
  const sig = "sha256=" + crypto.createHmac("sha256", "app-secret-teste").update(body).digest("hex");
  assert.ok(verifySignature(body, sig));
  assert.ok(!verifySignature(body, "sha256=" + "0".repeat(64)));
  assert.ok(!verifySignature(body, undefined));
});

test("webhook: verificacao do GET, assinatura invalida e numero nao autorizado", async () => {
  const app = buildServer(fresh());

  const ok = await app.inject({ method: "GET", url: "/webhook?hub.mode=subscribe&hub.verify_token=segredo-teste&hub.challenge=42" });
  assert.equal(ok.statusCode, 200);
  assert.equal(ok.body, "42");
  const bad = await app.inject({ method: "GET", url: "/webhook?hub.mode=subscribe&hub.verify_token=errado&hub.challenge=42" });
  assert.equal(bad.statusCode, 403);

  const payload = JSON.stringify({ entry: [{ changes: [{ value: {
    messages: [{ id: "z", from: "5599888887777", type: "text", text: { body: "oi" } }],
  } }] }] });
  const unsigned = await app.inject({ method: "POST", url: "/webhook", payload, headers: { "content-type": "application/json" } });
  assert.equal(unsigned.statusCode, 401);

  const sig = "sha256=" + crypto.createHmac("sha256", "app-secret-teste").update(payload).digest("hex");
  const stranger = await app.inject({
    method: "POST", url: "/webhook", payload,
    headers: { "content-type": "application/json", "x-hub-signature-256": sig },
  });
  assert.equal(stranger.statusCode, 200);
  await app.close();
});

test("schema do Gemini troca anyOf com null por nullable e remove additionalProperties", () => {
  const out = toGeminiSchema({
    type: "object",
    additionalProperties: false,
    properties: { data: { anyOf: [{ type: "string", description: "d" }, { type: "null" }] } },
    required: ["data"],
  });
  assert.deepEqual(out, {
    type: "object",
    properties: { data: { type: "string", description: "d", nullable: true } },
    required: ["data"],
  });
  const listar = functionDeclarations.find((f) => f.name === "listar_lembretes")!;
  assert.equal("parameters" in listar, false);
});

test("Gemini: executa a funcao pedida, devolve o resultado e preserva a assinatura", async () => {
  const bodies: any[] = [];
  const replies = [
    { candidates: [{ content: { role: "model", parts: [
      { functionCall: { id: "c1", name: "registrar_transacao", args: { tipo: "despesa", valor: 62 } }, thoughtSignature: "sig-abc" },
    ] } }] },
    { candidates: [{ content: { role: "model", parts: [{ text: "Lancei R$ 62,00 em Saude (#1)." }] }, finishReason: "STOP" }] },
  ];
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (_url: string, init: any) => {
    bodies.push(JSON.parse(init.body));
    return new Response(JSON.stringify(replies.shift()), { status: 200 });
  }) as typeof fetch;

  const calls: unknown[] = [];
  try {
    const reply = await geminiProvider(
      [{ role: "user", text: "oi" }, { role: "assistant", text: "Oi!" }],
      { text: "gastei 62", audio: { data: Buffer.from("ogg"), mimeType: "audio/ogg; codecs=opus" } },
      "[Agora: x]\ngastei 62",
      (name, args) => { calls.push([name, args]); return "Registrado #1"; },
    );
    assert.equal(reply, "Lancei R$ 62,00 em Saude (#1).");
  } finally {
    globalThis.fetch = realFetch;
  }

  assert.deepEqual(calls, [["registrar_transacao", { tipo: "despesa", valor: 62 }]]);
  const first = bodies[0];
  assert.deepEqual(first.contents.map((c: any) => c.role), ["user", "model", "user"]);
  assert.equal(first.contents[2].parts[0].inlineData.mimeType, "audio/ogg");
  const second = bodies[1].contents;
  assert.equal(second[3].parts[0].thoughtSignature, "sig-abc");
  assert.deepEqual(second[4].parts[0].functionResponse, {
    id: "c1", name: "registrar_transacao", response: { result: "Registrado #1" },
  });
});

test("Gemini: erro na ferramenta volta como error para o modelo", async () => {
  const bodies: any[] = [];
  const replies = [
    { candidates: [{ content: { role: "model", parts: [{ functionCall: { name: "excluir_transacao", args: { id: 9 } } }] } }] },
    { candidates: [{ content: { role: "model", parts: [{ text: "Nao achei a #9." }] } }] },
  ];
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (_u: string, init: any) => {
    bodies.push(JSON.parse(init.body));
    return new Response(JSON.stringify(replies.shift()), { status: 200 });
  }) as typeof fetch;
  try {
    const reply = await geminiProvider([], { text: "apaga a 9" }, "apaga a 9", () => { throw new Error("Entrada invalida"); });
    assert.equal(reply, "Nao achei a #9.");
  } finally {
    globalThis.fetch = realFetch;
  }
  assert.deepEqual(bodies[1].contents[2].parts[0].functionResponse.response, { error: "Entrada invalida" });
});

test("Gemini: modelo sobrecarregado passa para o reserva e o reserva vai na frente depois", async () => {
  resetGeminiFallback();
  const urls: string[] = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string) => {
    urls.push(url.includes("modelo-reserva") ? "reserva" : "principal");
    if (!url.includes("modelo-reserva")) return new Response('{"error":{"code":503}}', { status: 503 });
    return new Response(JSON.stringify({ candidates: [{ content: { role: "model", parts: [{ text: "ok" }] } }] }), { status: 200 });
  }) as typeof fetch;
  try {
    assert.equal(await geminiProvider([], { text: "oi" }, "oi", () => ""), "ok");
    assert.deepEqual(urls, ["principal", "principal", "principal", "reserva"]);
    urls.length = 0;
    assert.equal(await geminiProvider([], { text: "oi" }, "oi", () => ""), "ok");
    assert.deepEqual(urls, ["reserva"]);
  } finally {
    globalThis.fetch = realFetch;
    resetGeminiFallback();
  }
});

test("API do painel exige token", async () => {
  const app = buildServer(fresh());
  assert.equal((await app.inject({ method: "GET", url: "/api/me" })).statusCode, 401);
  assert.equal((await app.inject({ method: "GET", url: "/api/me", headers: { "x-painel-token": "errado" } })).statusCode, 401);
  assert.equal((await app.inject({ method: "GET", url: "/api/me", headers: { "x-painel-token": "token-teste" } })).statusCode, 200);
  await app.close();
});

test("API de financas soma o mes e cria, edita e exclui transacoes", async () => {
  const repo = fresh();
  const app = buildServer(repo);
  const h = { "x-painel-token": "token-teste", "content-type": "application/json" };
  const hoje = localDate();
  const mes = hoje.slice(0, 7);
  const criar = (body: object) => app.inject({ method: "POST", url: "/api/transacoes", headers: h, payload: JSON.stringify(body) });

  assert.equal((await criar({ tipo: "receita", valor: 1000, categoria: "Salario", descricao: "Salario", data: hoje })).statusCode, 201);
  const gasto = (await criar({ tipo: "despesa", valor: 250.5, categoria: "Mercado", descricao: "Compra", pagamento: "pix", data: hoje })).json();
  assert.equal((await criar({ tipo: "despesa", valor: -1, categoria: "x", descricao: "x", data: hoje })).statusCode, 400);

  const f = (await app.inject({ method: "GET", url: `/api/financas?mes=${mes}`, headers: h })).json();
  assert.equal(f.receitas, 1000);
  assert.equal(f.despesas, 250.5);
  assert.equal(f.saldoAtual, 749.5);
  assert.equal(f.porCategoria[0].nome, "Mercado");

  const editado = await app.inject({ method: "PATCH", url: `/api/transacoes/${gasto.id}`, headers: h, payload: JSON.stringify({ valor: 300 }) });
  assert.equal(editado.json().valor, 300);
  assert.equal((await app.inject({ method: "DELETE", url: `/api/transacoes/${gasto.id}`, headers: h })).statusCode, 200);
  const depois = (await app.inject({ method: "GET", url: `/api/financas?mes=${mes}`, headers: h })).json();
  assert.equal(depois.despesas, 0);
  await app.close();
});

test("tarefas: ferramenta do agente e API marcam atraso e conclusao", async () => {
  const repo = fresh();
  const [ay, am, ad] = localDate().split("-").map(Number);
  const ontem = new Date(Date.UTC(ay, am - 1, ad - 1)).toISOString().slice(0, 10);
  assert.match(executeTool(repo, phone, "criar_tarefa", { titulo: "Revisar contrato", prazo: ontem, prioridade: "urgente", projeto: null }), /#1/);
  assert.match(executeTool(repo, phone, "listar_tarefas", { incluir_concluidas: null }), /ATRASADA/);

  const app = buildServer(repo);
  const h = { "x-painel-token": "token-teste", "content-type": "application/json" };
  const antes = (await app.inject({ method: "GET", url: "/api/tarefas", headers: h })).json();
  assert.equal(antes.resumo.atrasadas, 1);
  await app.inject({ method: "PATCH", url: "/api/tarefas/1", headers: h, payload: JSON.stringify({ status: "concluida" }) });
  const depois = (await app.inject({ method: "GET", url: "/api/tarefas", headers: h })).json();
  assert.equal(depois.resumo.concluidas, 1);
  assert.equal(depois.resumo.atrasadas, 0);
  assert.ok(depois.tarefas[0].concluidaEm);
  await app.close();
});

test("contraparte, busca e valor aproximado respondem para quem foi e onde foi o gasto", () => {
  const repo = fresh();
  const hoje = localDate();
  const reg = (valor: number, descricao: string, contraparte: string | null, forma = "pix") =>
    executeTool(repo, phone, "registrar_transacao", {
      tipo: "despesa", valor, categoria: "Pessoal", descricao, forma_pagamento: forma, data: hoje, contraparte, parcelas: null,
    });
  assert.match(reg(50, "Pix", "João"), /para João/);
  reg(30, "Pix", "João");
  reg(200, "Relógio novo", "Relojoaria Central", "credito");
  reg(80, "Pix", "Ana");

  const consulta = (extra: object) =>
    executeTool(repo, phone, "consultar_transacoes", {
      data_inicio: hoje, data_fim: hoje, tipo: null, categoria: null, contraparte: null, busca: null, valor_aproximado: null, ...extra,
    });
  assert.match(consulta({ contraparte: "joão" }), /Despesas: R\$\s?80,00/);
  assert.match(consulta({ busca: "relogio" }), /Nenhuma/);
  assert.match(consulta({ busca: "Relógio" }), /Despesas: R\$\s?200,00/);
  assert.match(consulta({ valor_aproximado: 199 }), /Relojoaria Central/);
  assert.doesNotMatch(consulta({ valor_aproximado: 199 }), /Ana/);
});

test("compra parcelada cria uma parcela por mes e aparece como comprometida", async () => {
  const repo = fresh();
  const hoje = localDate();
  const out = executeTool(repo, phone, "registrar_transacao", {
    tipo: "despesa", valor: 150, categoria: "Compras", descricao: "TV", forma_pagamento: "credito", data: `${hoje.slice(0, 7)}-31`.replace(/-31$/, "-28"), contraparte: "Loja X", parcelas: 10,
  });
  assert.match(out, /10x de R\$\s?150,00, total R\$\s?1\.500,00/);

  const app = buildServer(repo);
  const h = { "x-painel-token": "token-teste" };
  const f = (await app.inject({ method: "GET", url: `/api/financas?mes=${hoje.slice(0, 7)}`, headers: h })).json();
  assert.equal(f.comprometido.length, 6);
  assert.ok(f.comprometido.every((m: { valor: number }) => m.valor === 150));
  const c = (await app.inject({ method: "GET", url: `/api/contrapartes?mes=${hoje.slice(0, 7)}`, headers: h })).json();
  assert.equal(c.contrapartes[0].nome, "Loja X");
  assert.equal(c.contrapartes[0].enviado, 150);
  await app.close();
});

test("parcela no dia 31 cai no ultimo dia dos meses curtos", () => {
  const repo = fresh();
  const parcelas = repo.addInstallments(
    { phone, kind: "despesa", amount_cents: 1000, category: "x", description: "x", payment_method: null, occurred_on: "2027-01-31" },
    3,
  );
  assert.deepEqual(parcelas.map((p) => p.occurred_on), ["2027-01-31", "2027-02-28", "2027-03-31"]);
  assert.deepEqual(parcelas.map((p) => `${p.installment_number}/${p.installment_total}`), ["1/3", "2/3", "3/3"]);
});

test("renda variavel: media, faixa e variacao dos ultimos 6 meses", async () => {
  const repo = fresh();
  const mes = localDate().slice(0, 7);
  const anterior = (n: number) => {
    const [y, m] = mes.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1 - n, 10)).toISOString().slice(0, 10);
  };
  for (const [n, valor] of [[0, 1000], [1, 5000], [2, 3000]] as const) {
    repo.addTransaction({ phone, kind: "receita", amount_cents: valor * 100, category: "Palestras", description: "Palestra", payment_method: "pix", occurred_on: anterior(n) });
  }
  const app = buildServer(repo);
  const f = (await app.inject({ method: "GET", url: `/api/financas?mes=${mes}`, headers: { "x-painel-token": "token-teste" } })).json();
  assert.equal(f.renda.media, 3000);
  assert.equal(f.renda.menor, 1000);
  assert.equal(f.renda.maior, 5000);
  assert.ok(f.renda.variacao > 0.25);
  await app.close();
});
