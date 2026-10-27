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

const { openDb, repo: makeRepo } = await import("../src/db.js");
const { conta, resolverContexto } = await import("../src/conta.js");
const { pode, CAPACIDADES } = await import("../src/permissoes.js");
const { executeTool } = await import("../src/tools.js");
const { auth } = await import("../src/auth.js");
const { runAgent } = await import("../src/agent.js");
const { runRemindersOnce } = await import("../src/scheduler.js");
const { buildServer } = await import("../src/server.js");
const { fromLocal, localDate } = await import("../src/time.js");

type PerfilMembro = "completo" | "so_gastos" | "agenda_tarefas";

const titular = "5511999990000";
const bia = "5511912345678";
const estranho = "5521000000000";
const hoje = localDate();
const amanha = (() => {
  const [y, m, d] = hoje.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
})();

function contaCom(perfil?: PerfilMembro) {
  const repo = makeRepo(openDb(":memory:"));
  repo.ensureUser(titular, "Wesley");
  repo.ensureUser(bia, "Bia");
  const c = conta(repo.db);
  if (perfil) c.aceitarConvite(c.gerarConvite(titular, perfil).codigo, bia);
  return { repo, c };
}

const gasto = (valor: number, tipo: "despesa" | "receita" = "despesa") => ({
  tipo, valor, categoria: tipo === "despesa" ? "Mercado" : "Salario", descricao: "x", forma_pagamento: null, data: hoje, contraparte: null, parcelas: null,
});
const consulta = (tipo: "despesa" | "receita" | null) => ({
  data_inicio: hoje, data_fim: hoje, tipo, categoria: null, contraparte: null, busca: null, valor_aproximado: null,
});

test("contexto: titular sem membros, membro ativo e membro removido", () => {
  const { repo, c } = contaCom();
  assert.deepEqual(
    { ...resolverContexto(repo.db, titular) },
    { membro: titular, conta: titular, perfil: "titular", nome: "Wesley", titular: "Wesley", compartilhada: false },
  );

  c.aceitarConvite(c.gerarConvite(titular, "so_gastos").codigo, bia);
  const membro = resolverContexto(repo.db, bia);
  assert.equal(membro.conta, titular);
  assert.equal(membro.perfil, "so_gastos");
  assert.equal(membro.titular, "Wesley");
  assert.ok(resolverContexto(repo.db, titular).compartilhada);

  c.removerMembro(titular, bia);
  const fora = resolverContexto(repo.db, bia);
  assert.equal(fora.conta, bia);
  assert.equal(fora.perfil, "titular");
});

test("capacidades de cada perfil", () => {
  const ctx = (perfil: keyof typeof CAPACIDADES) => ({ membro: bia, conta: titular, perfil, nome: "Bia", titular: "Wesley", compartilhada: true });
  assert.ok(pode(ctx("titular"), "acessos"));
  assert.ok(!pode(ctx("completo"), "acessos"));
  assert.ok(pode(ctx("completo"), "receitas"));
  assert.ok(pode(ctx("so_gastos"), "despesas"));
  assert.ok(!pode(ctx("so_gastos"), "receitas"));
  assert.ok(!pode(ctx("so_gastos"), "agenda"));
  assert.ok(pode(ctx("agenda_tarefas"), "tarefas"));
  assert.ok(!pode(ctx("agenda_tarefas"), "despesas"));
});

test("convite: formato, hash, uso unico, cancelamento, validade e limites", () => {
  const { repo, c } = contaCom();
  const { codigo, validoAte } = c.gerarConvite(titular, "completo", "Bia");
  assert.match(codigo, /^CONV-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$/);
  const dias = (new Date(validoAte).getTime() - Date.now()) / 86_400_000;
  assert.ok(dias > 6.99 && dias <= 7);
  assert.ok(!JSON.stringify(repo.db.prepare(`SELECT * FROM account_invites`).all()).includes(codigo));

  // Aceita minusculas e sem o prefixo.
  c.aceitarConvite(codigo.slice(5).toLowerCase(), bia);
  assert.equal(resolverContexto(repo.db, bia).conta, titular);

  const invalido = /Convite inválido ou vencido/;
  assert.throws(() => c.validarConvite(codigo, "5531900000001"), invalido);
  const cancelado = c.gerarConvite(titular, "completo");
  assert.ok(c.cancelarConvite(titular, cancelado.id));
  assert.throws(() => c.validarConvite(cancelado.codigo, "5531900000002"), invalido);
  const vencido = c.gerarConvite(titular, "completo");
  repo.db.prepare(`UPDATE account_invites SET expires_at = ? WHERE id = ?`).run(new Date(Date.now() - 1000).toISOString(), vencido.id);
  assert.throws(() => c.validarConvite(vencido.codigo, "5531900000003"), invalido);
  assert.equal(c.listarConvites(titular).find((x) => x.id === vencido.id)?.estado, "expirado");

  const chute = "5531900000009";
  for (let i = 0; i < 5; i++) assert.throws(() => c.validarConvite("CONV-ZZZZZZ", chute), invalido);
  assert.throws(() => c.validarConvite(c.gerarConvite(titular, "completo").codigo, chute), (e: { status?: number }) => e.status === 429);

  const outra = contaCom().c;
  for (let i = 0; i < 10; i++) outra.gerarConvite(titular, "so_gastos");
  assert.throws(() => outra.gerarConvite(titular, "so_gastos"), (e: { status?: number }) => e.status === 409);
});

test("membros: uma conta por numero, titular fixo, remocao derruba a sessao", () => {
  const { repo, c } = contaCom("completo");
  const segunda = "5541988887777";
  repo.ensureUser(segunda, "Carla");
  c.aceitarConvite(c.gerarConvite(segunda, "so_gastos").codigo, bia);
  assert.equal(resolverContexto(repo.db, bia).conta, segunda);
  assert.deepEqual(c.listarMembros(titular), []);

  assert.throws(() => c.removerMembro(segunda, segunda), /titular não pode ser removido/);

  const token = auth(repo.db).abrirSessao(bia);
  assert.ok(c.removerMembro(segunda, bia));
  assert.equal(auth(repo.db).sessao(token), null);

  // Titular com membros ativos nao entra em outra conta.
  c.aceitarConvite(c.gerarConvite(titular, "completo").codigo, bia);
  assert.throws(() => c.validarConvite(c.gerarConvite(segunda, "completo").codigo, titular), (e: { status?: number }) => e.status === 409);
});

test("numero com dados proprios entra em outra conta e os recupera ao sair", () => {
  const { repo, c } = contaCom();
  executeTool(repo, bia, "registrar_transacao", gasto(33));
  const { temDadosProprios } = c.validarConvite(c.gerarConvite(titular, "completo").codigo, "5500000000099");
  assert.equal(temDadosProprios, false);
  const convite = c.gerarConvite(titular, "completo");
  assert.equal(c.validarConvite(convite.codigo, bia).temDadosProprios, true);
  c.aceitarConvite(convite.codigo, bia);

  const dentro = resolverContexto(repo.db, bia);
  assert.doesNotMatch(executeTool(repo, dentro, "consultar_transacoes", consulta(null)), /33,00/);
  c.removerMembro(titular, bia);
  assert.match(executeTool(repo, resolverContexto(repo.db, bia), "consultar_transacoes", consulta(null)), /33,00/);
});

/** Ferramenta, argumentos e a capacidade que ela exige. */
const FERRAMENTAS: [string, () => object, string][] = [
  ["registrar_transacao", () => gasto(10), "despesas"],
  ["registrar_transacao", () => gasto(10, "receita"), "receitas"],
  ["consultar_transacoes", () => consulta("despesa"), "despesas"],
  ["consultar_transacoes", () => consulta("receita"), "receitas"],
  ["criar_lembrete", () => ({ texto: "Dentista", data_hora: `${amanha}T09:00`, recorrencia: null }), "agenda"],
  ["listar_lembretes", () => ({}), "agenda"],
  ["criar_tarefa", () => ({ titulo: "Revisar", prazo: null, prioridade: null, projeto: null }), "tarefas"],
  ["listar_tarefas", () => ({ incluir_concluidas: null }), "tarefas"],
  ["listar_acessos", () => ({}), "qualquer"],
  ["convidar_pessoa", () => ({ perfil: "so_gastos", rotulo: null }), "acessos"],
  ["alterar_acesso", () => ({ pessoa: "Bia", perfil: "completo" }), "acessos"],
  ["remover_acesso", () => ({ pessoa: "Bia", confirmado: false }), "acessos"],
];

const PERFIS: ("titular" | PerfilMembro)[] = ["titular", "completo", "so_gastos", "agenda_tarefas"];

test("isolamento: cada perfil so usa as ferramentas que o perfil libera", () => {
  let combinacoes = 0;
  for (const perfil of PERFIS) {
    for (const [nome, args, cap] of FERRAMENTAS) {
      const { repo } = contaCom(perfil === "titular" ? "completo" : perfil);
      const ctx = resolverContexto(repo.db, perfil === "titular" ? titular : bia);
      const out = executeTool(repo, ctx, nome, args());
      const liberado = cap === "qualquer" || CAPACIDADES[perfil].includes(cap as never);
      if (liberado) assert.doesNotMatch(out, /Sem permissao/, `${perfil} deveria usar ${nome} (${cap})`);
      else assert.match(out, /^Sem permissao: o acesso de .+ nesta conta nao inclui/, `${perfil} nao deveria usar ${nome} (${cap})`);
      combinacoes++;
    }
  }
  assert.equal(combinacoes, 48);
});

test("so gastos nao ve receitas nem saldo, e conta A nao ve conta B", () => {
  const { repo } = contaCom("so_gastos");
  executeTool(repo, titular, "registrar_transacao", gasto(800, "receita"));
  executeTool(repo, titular, "registrar_transacao", gasto(62));
  executeTool(repo, estranho, "registrar_transacao", gasto(9999));
  const ctx = resolverContexto(repo.db, bia);

  const tudo = executeTool(repo, ctx, "consultar_transacoes", consulta(null));
  assert.match(tudo, /62,00/);
  assert.doesNotMatch(tudo, /800|Receitas|Saldo|9\.999/);
  assert.match(executeTool(repo, ctx, "consultar_transacoes", consulta("receita")), /^Sem permissao/);
  // A receita e #1: para quem so ve gastos ela nao existe.
  assert.match(executeTool(repo, ctx, "excluir_transacao", { id: 1 }), /nao encontrada/);
  assert.match(
    executeTool(repo, ctx, "editar_transacao", { id: 2, tipo: "receita", valor: null, categoria: null, descricao: null, forma_pagamento: null, data: null, contraparte: null }),
    /^Sem permissao/,
  );
});

test("isolamento na API: rotas recusam o que o perfil nao libera", async () => {
  const ROTAS: [string, string, string, object?][] = [
    ["GET", "/api/financas", "despesas"],
    ["GET", "/api/transacoes", "despesas"],
    ["POST", "/api/transacoes", "receitas", { tipo: "receita", valor: 10, categoria: "Salario", descricao: "x", data: hoje }],
    ["GET", "/api/fiscal", "receitas"],
    ["GET", "/api/agenda", "agenda"],
    ["GET", "/api/tarefas", "tarefas"],
    ["GET", "/api/conta/convites", "acessos"],
    ["POST", "/api/conta/convites", "acessos", { perfil: "so_gastos" }],
  ];
  let combinacoes = 0;
  for (const perfil of PERFIS) {
    const { repo } = contaCom(perfil === "titular" ? "completo" : perfil);
    const app = buildServer(repo);
    const token = auth(repo.db).abrirSessao(perfil === "titular" ? titular : bia);
    for (const [method, url, cap, payload] of ROTAS) {
      const r = await app.inject({
        method: method as "GET" | "POST",
        url,
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        payload: payload ? JSON.stringify(payload) : undefined,
      });
      const liberado = CAPACIDADES[perfil].includes(cap as never);
      if (liberado) assert.ok(r.statusCode < 400, `${perfil} ${method} ${url}: ${r.statusCode} ${r.body}`);
      else assert.equal(r.statusCode, 403, `${perfil} ${method} ${url}`);
      combinacoes++;
    }
    await app.close();
  }
  assert.equal(combinacoes, 32);
});

test("API: so gastos ve financas sem receita e saldo; titular ve quem lancou", async () => {
  const { repo } = contaCom("so_gastos");
  executeTool(repo, titular, "registrar_transacao", gasto(800, "receita"));
  executeTool(repo, resolverContexto(repo.db, bia), "registrar_transacao", gasto(62));
  const app = buildServer(repo);
  const contas = auth(repo.db);
  const get = (url: string, phone: string) =>
    app.inject({ method: "GET", url, headers: { authorization: `Bearer ${contas.abrirSessao(phone)}` } });

  const f = await get("/api/financas", bia);
  assert.equal(f.statusCode, 200);
  assert.equal(f.json().despesas, 62);
  for (const campo of ["receitas", "saldoAtual", "saldoDoMes", "renda", "inicioDoMes"]) assert.equal(f.json()[campo], undefined, campo);
  assert.doesNotMatch(f.body, /800/);

  const me = (await get("/api/me", bia)).json();
  assert.deepEqual(me.conta, { titular: "Wesley", perfil: "so_gastos", capacidades: ["despesas"], compartilhada: true });

  const tx = (await get("/api/transacoes", titular)).json();
  const doBia = tx.transacoes.find((t: { valor: number }) => t.valor === 62);
  assert.equal(doBia.criadoPor, "Bia");

  const acessos = (await get("/api/conta/acessos", bia)).json();
  assert.equal(acessos.membros[0].nome, "Bia");
  await app.close();
});

test("API: titular convida, lista, altera e remove; cadastro com convite entra na conta", async () => {
  const { repo } = contaCom();
  const app = buildServer(repo);
  const token = auth(repo.db).abrirSessao(titular);
  const h = { authorization: `Bearer ${token}`, "content-type": "application/json" };
  const req = (method: string, url: string, body?: object, headers: Record<string, string> = h) =>
    app.inject({ method: method as "GET", url, headers, payload: body ? JSON.stringify(body) : undefined });

  const criado = await req("POST", "/api/conta/convites", { perfil: "so_gastos", rotulo: "Socio" });
  assert.equal(criado.statusCode, 201);
  const { codigo } = criado.json();
  assert.match(criado.json().mensagemWhatsapp, new RegExp(codigo));

  const json = { "content-type": "application/json" };
  const novo = "5521977776666";
  const valida = await req("POST", "/api/auth/convite", { codigo, telefone: novo }, json);
  assert.deepEqual(valida.json(), { titular: "Wesley", perfil: "so_gastos", temDadosProprios: false });

  let codigoAtivacao = "";
  const original = console.log;
  console.log = (...args: unknown[]) => {
    const m = /-> (\d{6})/.exec(args.join(" "));
    if (m) codigoAtivacao = m[1];
  };
  try {
    const cad = await req("POST", "/api/auth/cadastro", { nome: "Socio", telefone: novo, email: "socio@teste.com", senha: "senha-forte-1", convite: codigo }, json);
    assert.equal(cad.statusCode, 201, cad.body);
  } finally {
    console.log = original;
  }
  const ativado = await req("POST", "/api/auth/ativar", { telefone: novo, codigo: codigoAtivacao }, json);
  assert.equal(ativado.statusCode, 200, ativado.body);
  const { nome, titular: dono, perfil } = ativado.json().conta;
  assert.deepEqual({ nome, dono, perfil }, { nome: "Socio", dono: "Wesley", perfil: "so_gastos" });
  assert.equal(resolverContexto(repo.db, novo).conta, titular);

  const convites = (await req("GET", "/api/conta/convites")).json();
  assert.equal(convites.convites[0].estado, "aceito");
  assert.equal((await req("PATCH", `/api/conta/membros/${novo}`, { perfil: "completo" })).statusCode, 200);
  assert.equal(resolverContexto(repo.db, novo).perfil, "completo");
  assert.equal((await req("DELETE", `/api/conta/membros/${titular}`)).statusCode, 400);
  assert.equal((await req("DELETE", `/api/conta/membros/${novo}`)).statusCode, 200);
  assert.equal(resolverContexto(repo.db, novo).conta, novo);

  const pendente = (await req("POST", "/api/conta/convites", { perfil: "completo" })).json();
  assert.equal((await req("DELETE", `/api/conta/convites/${pendente.id}`)).statusCode, 200);
  assert.equal((await req("POST", "/api/auth/convite", { codigo: pendente.codigo, telefone: "5521911112222" }, json)).statusCode, 400);
  await app.close();
});

test("autoria e destino: lancamento e lembrete do membro, historico separado", async () => {
  const { repo } = contaCom("completo");
  const ctx = resolverContexto(repo.db, bia);
  executeTool(repo, ctx, "registrar_transacao", gasto(40));
  assert.equal(repo.listTransactions(titular, hoje, hoje)[0].created_by, bia);

  executeTool(repo, ctx, "criar_lembrete", { texto: "remedio", data_hora: `${amanha}T09:00`, recorrencia: null });
  const enviados: string[] = [];
  await runRemindersOnce(repo, async (to) => void enviados.push(to), new Date(fromLocal(`${amanha}T09:01`)));
  assert.deepEqual(enviados, [bia]);

  const bodies: string[] = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (_u: string, init: { body: string }) => {
    bodies.push(init.body);
    return new Response(JSON.stringify({ candidates: [{ content: { role: "model", parts: [{ text: "Oi, Bia!" }] } }] }), { status: 200 });
  }) as typeof fetch;
  try {
    assert.equal(await runAgent(repo, bia, { text: "oi" }), "Oi, Bia!");
  } finally {
    globalThis.fetch = realFetch;
  }
  assert.match(bodies[0], /\[Quem fala: Bia, perfil acesso completo na conta de Wesley/);
  assert.equal(repo.recentHistory(bia).length, 2);
  assert.equal(repo.recentHistory(titular).length, 0);
});

test("webhook atende membro ativo de titular autorizado e ignora removido", async () => {
  const { repo, c } = contaCom("completo");
  const app = buildServer(repo);
  const enviar = async (id: string, from: string) => {
    const payload = JSON.stringify({ entry: [{ changes: [{ value: { messages: [{ id, from, type: "text", text: { body: "oi" } }] } }] }] });
    const sig = "sha256=" + crypto.createHmac("sha256", "app-secret-teste").update(payload).digest("hex");
    await app.inject({ method: "POST", url: "/webhook", payload, headers: { "content-type": "application/json", "x-hub-signature-256": sig } });
  };
  // A mensagem aceita vai para a fila, chama a IA e responde pelo WhatsApp: tudo simulado aqui.
  const realFetch = globalThis.fetch;
  const enviados: string[] = [];
  globalThis.fetch = (async (url: string, init: { body?: string }) => {
    if (String(url).includes("generativelanguage")) {
      return new Response(JSON.stringify({ candidates: [{ content: { role: "model", parts: [{ text: "Oi, Bia!" }] } }] }), { status: 200 });
    }
    if (init?.body?.includes("Oi, Bia!")) enviados.push(String(url));
    return new Response("{}", { status: 200 });
  }) as typeof fetch;
  process.env.WHATSAPP_TOKEN = "token-meta-teste";
  process.env.WHATSAPP_PHONE_NUMBER_ID = "123";
  try {
    await enviar("m1", bia);
    for (let i = 0; i < 50 && repo.recentHistory(bia).length < 2; i++) await new Promise((r) => setTimeout(r, 20));
    assert.equal(repo.recentHistory(bia).length, 2);
    assert.equal(enviados.length, 1);

    c.removerMembro(titular, bia);
    await enviar("m2", bia);
    // markProcessed devolve true se o servidor nem chegou a aceitar a mensagem.
    assert.equal(repo.markProcessed("m2"), true);
  } finally {
    globalThis.fetch = realFetch;
    delete process.env.WHATSAPP_TOKEN;
    delete process.env.WHATSAPP_PHONE_NUMBER_ID;
    await app.close();
  }
});
