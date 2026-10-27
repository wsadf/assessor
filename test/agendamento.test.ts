import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

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
process.env.GOOGLE_CLIENT_ID = "cliente-teste.apps.googleusercontent.com";
process.env.GOOGLE_CLIENT_SECRET = "segredo-do-cliente";
process.env.GOOGLE_TOKEN_KEY = crypto.randomBytes(32).toString("base64");
process.env.PAINEL_URL = "http://localhost:3001";

const { default: Database } = await import("better-sqlite3");
const { openDb, repo: makeRepo } = await import("../src/db.js");
const { conta, resolverContexto } = await import("../src/conta.js");
const g = await import("../src/google.js");
const a = await import("../src/agendamento.js");
const { config } = await import("../src/config.js");
const { executarFerramenta } = await import("../src/tools.js");
const { auth, AuthError } = await import("../src/auth.js");
const { buildServer } = await import("../src/server.js");
const { definirPreferencia } = await import("../src/avisos.js");
const { confirmarVespera } = await import("../src/scheduler.js");
const { fromLocal, localDate } = await import("../src/time.js");
const { googleFalso } = await import("./googleFalso.js");

type PerfilMembro = "completo" | "so_gastos" | "agenda_tarefas";
type Repo = ReturnType<typeof makeRepo>;

const titular = "5511999990000";
const bia = "5511912345678";
const camila = "5511987654321";

function contaCom(perfil?: PerfilMembro) {
  const repo = makeRepo(openDb(":memory:"));
  repo.ensureUser(titular, "Wesley");
  repo.ensureUser(bia, "Bia");
  const c = conta(repo.db);
  if (perfil) c.aceitarConvite(c.gerarConvite(titular, perfil).codigo, bia);
  return { repo, db: repo.db };
}
const ctxDe = (repo: Repo, phone: string) => resolverContexto(repo.db, phone);

async function conectar(db: Repo["db"], phone: string) {
  const url = new URL(g.urlDeAutorizacao(db, phone));
  return g.concluirConexao(db, "codigo-do-google", url.searchParams.get("state")!);
}

const PADRAO = { nome: "Wesley Faria", duracoes: [30, 60], dias: [1, 2, 3, 4, 5], inicio: "09:00", fim: "18:00", antecedenciaHoras: 12, horizonteDias: 30, ativa: true };
/** Pagina que aceita qualquer hora de qualquer dia: para os testes que dependem do relogio real. */
const SEMPRE = { ...PADRAO, duracoes: [30], dias: [0, 1, 2, 3, 4, 5, 6], inicio: "00:00", fim: "23:30", antecedenciaHoras: 0 };

const dados = (inicio: string, extra: object = {}) => ({
  inicio: fromLocal(inicio).toISOString(),
  duracao: 30,
  nome: "Camila Prado",
  email: "camila.prado@email.com",
  whatsapp: "11987654321",
  aceite: true,
  fuso: "America/Sao_Paulo",
  site: "",
  ...extra,
});

function caixa() {
  const enviados: { para: string; texto: string }[] = [];
  return { enviados, send: async (para: string, texto: string) => void enviados.push({ para, texto }) };
}

const status = async (p: Promise<unknown>) => {
  try {
    await p;
    return 200;
  } catch (err) {
    if (err instanceof AuthError) return err.status;
    throw err;
  }
};

// Segunda, 2 de novembro de 2026, 9h em Sao Paulo.
const segunda = fromLocal("2026-11-02T09:00");
const amanha = () => localDate(new Date(Date.now() + 86_400_000));

test("fundacao: pagina, slug, dias e horarios livres", async () => {
  const fake = googleFalso();
  try {
    const { repo, db } = contaCom();
    const ctx = ctxDe(repo, titular);
    assert.throws(() => a.salvarPagina(db, ctx, PADRAO), /Conecte o Google Agenda antes de ativar a página/);

    await conectar(db, titular);
    const p = a.salvarPagina(db, ctx, PADRAO);
    assert.match(p.slug, /^[a-z0-9]{10}$/);
    assert.equal(a.linkDaPagina(p), `http://localhost:3001/agendar/${p.slug}`);
    const trocada = a.novoSlug(db, ctx);
    assert.notEqual(trocada.slug, p.slug);
    assert.equal(a.paginaPorSlug(db, p.slug), undefined);
    assert.throws(() => a.salvarPagina(db, ctx, { ...PADRAO, duracoes: [20] }), /duração fora/);
    assert.throws(() => a.salvarPagina(db, ctx, { ...PADRAO, fim: "08:00" }), /depois do início/);

    // Segunda as 9h com 12 h de antecedencia: a janela de segunda ja acabou.
    const dias = a.diasDisponiveis(trocada, segunda);
    assert.equal(dias[0], "2026-11-03");
    assert.ok(!dias.includes("2026-11-07"));
    assert.ok(dias.includes("2026-12-02"));
    assert.ok(!dias.includes("2026-12-03"));

    const livres = (dur: number, agora = segunda) => a.horariosLivres(db, trocada, "2026-11-03", dur, agora);
    assert.equal((await livres(30)).length, 18);
    assert.equal((await livres(60)).length, 17);
    assert.equal((await livres(15)).length, 36);
    assert.equal((await livres(30, fromLocal("2026-11-02T22:00")))[0].inicio, fromLocal("2026-11-03T10:00").toISOString());

    await g.criarEvento(db, titular, { titulo: "Consulta particular", inicio: fromLocal("2026-11-03T10:00"), duracaoMin: 60, convidados: ["socio@exemplo.com"] });
    fake.eventos.set("feriado", { id: "feriado", summary: "Folga", start: { date: "2026-11-03" }, end: { date: "2026-11-04" } });
    db.prepare(
      `INSERT INTO bookings (page_id, owner_phone, client_name, client_email, client_phone, starts_at, ends_at, status, created_at)
       VALUES (?, ?, 'Outro Cliente', 'o@x.com', '5511900000000', ?, ?, 'agendado', ?)`,
    ).run(trocada.id, titular, fromLocal("2026-11-03T14:00").toISOString(), fromLocal("2026-11-03T14:30").toISOString(), new Date().toISOString());
    const depois = await livres(30);
    assert.equal(depois.length, 15);
    const inicios = depois.map((h) => h.inicio);
    assert.ok(inicios.includes(fromLocal("2026-11-03T09:30").toISOString()));
    assert.ok(!inicios.includes(fromLocal("2026-11-03T10:30").toISOString()));
    assert.ok(!inicios.includes(fromLocal("2026-11-03T14:00").toISOString()));
    assert.deepEqual(Object.keys(depois[0]).sort(), ["fim", "inicio"]);
    assert.ok(!JSON.stringify(depois).match(/Consulta|socio|Folga|Outro/));
  } finally {
    fake.restaurar();
  }
});

test("fundacao: banco com a lista antiga de avisos passa a aceitar agendamentos", () => {
  const arquivo = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "assessor-")), "antigo.db");
  try {
    const antigo = new Database(arquivo);
    antigo.exec(`CREATE TABLE notice_prefs (
      phone TEXT NOT NULL,
      kind TEXT NOT NULL CHECK (kind IN ('vencimentos', 'categoria', 'recorrentes', 'resumo_manha', 'resumo_noite')),
      enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
      hour INTEGER NOT NULL CHECK (hour BETWEEN 0 AND 23),
      PRIMARY KEY (phone, kind)
    ); INSERT INTO notice_prefs VALUES ('${titular}', 'resumo_noite', 1, 22);`);
    assert.throws(() => antigo.prepare(`INSERT INTO notice_prefs VALUES ('${titular}', 'agendamentos', 1, 0)`).run());
    antigo.close();

    const db = openDb(arquivo);
    definirPreferencia(db, titular, "agendamentos", { ligado: false });
    assert.deepEqual(db.prepare(`SELECT kind, enabled, hour FROM notice_prefs ORDER BY kind`).all(), [
      { kind: "agendamentos", enabled: 0, hour: 0 },
      { kind: "resumo_noite", enabled: 1, hour: 22 },
    ]);
    db.close();
  } finally {
    fs.rmSync(path.dirname(arquivo), { recursive: true, force: true });
  }
});

test("reserva: evento com convidado, lembrete, aviso, concorrencia, falhas e limites", async () => {
  const fake = googleFalso();
  try {
    const { repo, db } = contaCom();
    await conectar(db, titular);
    const p = a.salvarPagina(db, ctxDe(repo, titular), PADRAO);
    const { enviados, send } = caixa();
    const reservar = (inicio: string, extra: object = {}, ip = "1.1.1.1") => a.reservar(repo, p, dados(inicio, extra), ip, segunda, send);

    const r = await reservar("2026-11-03T10:00");
    assert.equal(r.nome, "Wesley Faria");
    const b = db.prepare(`SELECT * FROM bookings`).get() as import("../src/agendamento.js").Agendamento;
    assert.equal(b.status, "agendado");
    assert.equal(b.client_phone, camila);
    assert.equal(b.client_tz, null);
    const ev = fake.eventos.get(b.google_event_id!);
    assert.deepEqual(ev.attendees, [{ email: "camila.prado@email.com" }]);
    const lembrete = repo.remindersDoEvento(titular, b.google_event_id!)[0];
    assert.equal(lembrete.next_run_at, fromLocal("2026-11-03T09:00").toISOString());
    assert.equal(lembrete.notify_phone, titular);
    assert.deepEqual(enviados.map((e) => e.para), [titular]);
    assert.match(enviados[0].texto, /📆 Camila Prado marcou terça, 03\/11 as 10:00 \(30 min\)/);

    // Dois pedidos para o mesmo horario sem await entre eles: so um passa.
    const resultados = await Promise.all([
      status(reservar("2026-11-03T11:00", { whatsapp: "11911112222", nome: "Ana Lima" }, "2.2.2.2")),
      status(reservar("2026-11-03T11:00", { whatsapp: "11933334444", nome: "Rui Souza" }, "3.3.3.3")),
    ]);
    assert.deepEqual(resultados.sort(), [200, 409]);

    fake.estado.agenda = "fora";
    assert.equal(await status(reservar("2026-11-03T12:00", { whatsapp: "11955556666" }, "4.4.4.4")), 503);
    fake.estado.agenda = "ok";
    assert.equal((db.prepare(`SELECT COUNT(*) AS n FROM bookings WHERE status = 'reservando'`).get() as { n: number }).n, 0);

    await g.criarEvento(db, titular, { titulo: "Particular", inicio: fromLocal("2026-11-03T13:00"), duracaoMin: 60 });
    assert.equal(await status(reservar("2026-11-03T13:00", { whatsapp: "11955556666" }, "4.4.4.4")), 409);

    const total = () => (db.prepare(`SELECT COUNT(*) AS n FROM bookings`).get() as { n: number }).n;
    const antes = total();
    assert.equal((await reservar("2026-11-03T15:00", { site: "http://spam" }, "5.5.5.5")).nome, "Wesley Faria");
    assert.equal(total(), antes);
    assert.equal(await status(reservar("2026-11-03T15:00", { aceite: false }, "5.5.5.5")), 400);
    assert.equal(await status(reservar("2026-11-03T15:10", {}, "5.5.5.5")), 400);
    assert.equal(await status(reservar("2026-11-03T15:00", { duracao: 45 }, "5.5.5.5")), 400);
    assert.equal(await status(reservar("2026-11-03T15:00", { fuso: "Lua/Base" }, "5.5.5.5")), 400);

    for (let i = 0; i < 5; i++) {
      assert.equal(await status(reservar(`2026-11-04T${String(i + 9).padStart(2, "0")}:00`, { whatsapp: `1190000000${i}` }, "9.9.9.9")), 200);
    }
    assert.equal(await status(reservar("2026-11-04T15:00", { whatsapp: "11900000009" }, "9.9.9.9")), 429);

    for (let i = 0; i < 3; i++) {
      assert.equal(await status(reservar(`2026-11-05T1${i}:00`, { whatsapp: "11977778888" }, `7.7.7.${i}`)), 200);
    }
    assert.equal(await status(reservar("2026-11-05T15:00", { whatsapp: "11977778888" }, "7.7.7.9")), 429);

    const lisboa = await reservar("2026-11-06T10:00", { whatsapp: "351912345678", fuso: "Europe/Lisbon" }, "8.8.8.8");
    assert.ok(lisboa);
    const deLisboa = db.prepare(`SELECT client_phone, client_tz FROM bookings WHERE client_tz IS NOT NULL`).get();
    assert.deepEqual(deLisboa, { client_phone: "351912345678", client_tz: "Europe/Lisbon" });
  } finally {
    fake.restaurar();
  }
});

let mensagemId = 0;
async function webhook(app: ReturnType<typeof buildServer>, from: string, texto: string) {
  const corpo = JSON.stringify({ entry: [{ changes: [{ value: { messages: [{ id: `wamid.cli${++mensagemId}`, from, type: "text", text: { body: texto } }] } }] }] });
  const assinatura = `sha256=${crypto.createHmac("sha256", "app-secret-teste").update(corpo).digest("hex")}`;
  const res = await app.inject({ method: "POST", url: "/webhook", headers: { "content-type": "application/json", "x-hub-signature-256": assinatura }, payload: corpo });
  assert.equal(res.statusCode, 200);
}
async function esperar(cond: () => boolean) {
  for (let i = 0; i < 200 && !cond(); i++) await new Promise((r) => setTimeout(r, 10));
  assert.ok(cond(), "a condicao esperada nao aconteceu");
}
const pausa = () => new Promise((r) => setTimeout(r, 150));

test("vespera e respostas do cliente pelo webhook, sem IA", async () => {
  const fake = googleFalso();
  const modelo = config.whatsapp.noticeTemplate;
  try {
    const { repo, db } = contaCom();
    await conectar(db, titular);
    const p = a.salvarPagina(db, ctxDe(repo, titular), SEMPRE);
    const { enviados, send } = caixa();
    const dia = amanha();
    const reservar = (hora: string, whatsapp: string, nome: string) =>
      a.reservar(repo, p, dados(`${dia}T${hora}`, { whatsapp, nome }), `ip-${whatsapp}`, new Date(), send);
    await reservar("10:00", "11987654321", "Camila Prado");
    const id = (phone: string) => (db.prepare(`SELECT id FROM bookings WHERE client_phone = ?`).get(phone) as { id: number }).id;
    const linha = (phone: string) => a.agendamentoPorId(db, id(phone))!;
    enviados.length = 0;

    const hoje = localDate();
    await confirmarVespera(repo, send, fromLocal(`${hoje}T17:00`));
    assert.equal(enviados.length, 0);

    config.whatsapp.noticeTemplate = "";
    await confirmarVespera(repo, send, fromLocal(`${hoje}T18:30`));
    assert.equal(linha(camila).confirmation_failed, 1);
    assert.deepEqual(enviados.map((e) => e.para), [titular]);
    assert.match(enviados[0].texto, /⚠️ Nao consegui mandar a confirmacao para Camila; o WhatsApp precisa do modelo aprovado/);

    config.whatsapp.noticeTemplate = "aviso_assessor";
    await reservar("11:00", "11976543210", "Bruno Dias");
    await reservar("12:00", "11965432109", "Carla Melo");
    db.prepare(`INSERT INTO client_optouts (client_phone, created_at) VALUES ('5511965432109', ?)`).run(new Date().toISOString());
    enviados.length = 0;
    await confirmarVespera(repo, send, fromLocal(`${hoje}T18:30`));
    await confirmarVespera(repo, send, fromLocal(`${hoje}T19:00`));
    assert.deepEqual(enviados.map((e) => e.para), ["5511976543210"]);
    assert.match(enviados[0].texto, /^Oi, Bruno! Confirmando seu horario com Wesley Faria: .+, as 11:00\. Responda 1 para confirmar, 2 se precisar remarcar ou PARAR/);
    assert.ok(linha("5511976543210").confirmation_sent_at);

    const app = buildServer(repo);
    const para = (phone: string) => fake.mensagens.filter((m) => m.para === phone).map((m) => m.texto);

    await webhook(app, camila, "1");
    await esperar(() => para(camila).length === 1);
    assert.equal(linha(camila).status, "confirmado");
    assert.match(para(camila)[0], /^Confirmado! Wesley Faria te espera .+, as 10:00\.$/);
    assert.match(para(titular).join("\n"), /✅ Camila confirmou/);

    await webhook(app, "5511976543210", "2");
    await esperar(() => para("5511976543210").length === 1);
    assert.equal(para("5511976543210")[0], "Certo, avisei Wesley Faria. Logo voce recebe novas opcoes.");
    assert.match(para(titular).join("\n"), /🔁 Bruno pediu para remarcar/);

    await webhook(app, "5511976543210", "quanto o Wesley gastou esse mes?");
    await esperar(() => para("5511976543210").length === 2);
    assert.equal(para("5511976543210")[1], "Responda 1 para confirmar, 2 para remarcar ou PARAR. Para outros assuntos, fale direto com Wesley Faria.");

    await webhook(app, "5511976543210", "PARAR");
    await esperar(() => para("5511976543210").length === 3);
    assert.equal(para("5511976543210")[2], "Combinado, nao mando mais mensagens.");
    assert.ok(a.clienteEmOptout(db, "5511976543210"));

    const r = await a.remarcar(repo, ctxDe(repo, titular), id(camila), new Date(), send);
    assert.equal(r.opcoes.length, 3);
    assert.equal(linha(camila).status, "remarcando");
    const evento = linha(camila).google_event_id!;
    await webhook(app, camila, "2");
    await esperar(() => para(camila).length === 2);
    const movido = linha(camila);
    assert.equal(movido.status, "agendado");
    assert.equal(movido.starts_at, r.opcoes[1].inicio);
    assert.equal(new Date(fake.eventos.get(evento).start.dateTime).toISOString(), r.opcoes[1].inicio);
    assert.equal(repo.remindersDoEvento(titular, evento)[0].next_run_at, new Date(new Date(r.opcoes[1].inicio).getTime() - 3_600_000).toISOString());
    assert.match(para(camila)[1], /^Prontinho! .+\. Te lembro na vespera\.$/);
    assert.match(para(titular).join("\n"), /🔁 Camila escolheu/);

    await webhook(app, "5511900000001", "oi");
    await pausa();
    assert.equal(para("5511900000001").length, 0);
    assert.equal(fake.estado.ia, 0);
    await app.close();
  } finally {
    config.whatsapp.noticeTemplate = modelo;
    fake.restaurar();
  }
});

test("ferramentas e API privada", async () => {
  const fake = googleFalso();
  try {
    const { repo, db } = contaCom("so_gastos");
    const ctx = ctxDe(repo, titular);
    const ferramenta = (nome: string, entrada: object = {}) => executarFerramenta(repo, ctx, nome, entrada);

    assert.match(await ferramenta("link_de_agendamento"), /precisa do Google Agenda.*api\/google\/conectar\//);
    await conectar(db, titular);
    assert.match(await ferramenta("link_de_agendamento"), /Ainda nao ha pagina de agendamento.*http:\/\/localhost:3001\/agenda/);
    const p = a.salvarPagina(db, ctx, SEMPRE);
    assert.match(await ferramenta("link_de_agendamento"), new RegExp(`http://localhost:3001/agendar/${p.slug}`));

    const dia = amanha();
    const { send } = caixa();
    await a.reservar(repo, p, dados(`${dia}T10:00`), "1.1.1.1", new Date(), send);
    await a.reservar(repo, p, dados(`${dia}T16:00`, { nome: "Davi Rocha", whatsapp: "11944445555" }), "1.1.1.2", new Date(), send);
    const [camilaId, daviId] = (db.prepare(`SELECT id FROM bookings ORDER BY id`).all() as { id: number }[]).map((x) => x.id);

    const lista = await ferramenta("consultar_agendamentos", { data_inicio: dia, data_fim: dia, cliente: "camila" });
    assert.match(lista, new RegExp(`^#${camilaId} \\| .+ \\| Camila Prado \\| agendado$`));

    const remarcou = await ferramenta("remarcar_agendamento", { id: camilaId });
    assert.match(remarcou, /Mandei para Camila Prado as opcoes 1\) .+ 2\) .+ 3\) /);
    const opcoes = fake.mensagens.filter((m) => m.para === camila).at(-1)!.texto;
    assert.match(opcoes, /^Wesley Faria precisou remarcar o horario de .+ as 10:00\. Opcoes: 1\) .+ 2\) .+ 3\) .+\. Responda com o numero, ou 0 se nenhuma servir\.$/);

    assert.match(await ferramenta("cancelar_agendamento", { id: camilaId, confirmado: false }), /Confirme/);
    const evento = a.agendamentoPorId(db, camilaId)!.google_event_id!;
    assert.match(await ferramenta("cancelar_agendamento", { id: camilaId, confirmado: true }), /Cancelado: Camila Prado.*O cliente foi avisado/);
    assert.ok(!fake.eventos.has(evento));
    assert.equal(repo.remindersDoEvento(titular, evento).length, 0);
    assert.match(fake.mensagens.filter((m) => m.para === camila).at(-1)!.texto, new RegExp(`cancelou o horario .+ Se quiser marcar outro: http://localhost:3001/agendar/${p.slug}$`));
    assert.match(await ferramenta("cancelar_agendamento", { id: camilaId, confirmado: true }), /não encontrado/);

    // Um compromisso cobrindo os proximos 15 dias inteiros nao deixa nenhuma opcao.
    const de = new Date(Date.now() - 86_400_000).toISOString();
    const ate = new Date(Date.now() + 16 * 86_400_000).toISOString();
    fake.eventos.set("ferias", { id: "ferias", summary: "Ferias", start: { dateTime: de }, end: { dateTime: ate } });
    assert.match(await ferramenta("remarcar_agendamento", { id: daviId }), /Nao ha horario livre nos proximos 14 dias/);
    assert.equal(a.agendamentoPorId(db, daviId)!.status, "agendado");
    fake.eventos.delete("ferias");

    assert.match(await executarFerramenta(repo, ctxDe(repo, bia), "consultar_agendamentos", { data_inicio: dia, data_fim: dia, cliente: null }), /^Sem permissao/);

    const app = buildServer(repo);
    const h = { authorization: `Bearer ${auth(db).abrirSessao(titular)}` };
    const pedir = (method: "GET" | "PUT" | "POST" | "DELETE", url: string, payload?: object, headers = h) =>
      app.inject({ method, url, headers: payload ? { ...headers, "content-type": "application/json" } : headers, payload: payload ? JSON.stringify(payload) : undefined });

    const atual = (await pedir("GET", "/api/agendamento/pagina")).json();
    assert.equal(atual.googleConectado, true);
    assert.equal(atual.pagina.nome, "Wesley Faria");
    assert.equal(atual.link, `http://localhost:3001/agendar/${p.slug}`);
    const salvo = await pedir("PUT", "/api/agendamento/pagina", { ...SEMPRE, nome: "Dr. Wesley" });
    assert.equal(salvo.statusCode, 200);
    assert.equal(salvo.json().nome, "Dr. Wesley");
    assert.equal((await pedir("PUT", "/api/agendamento/pagina", { ...SEMPRE, duracoes: [25] })).statusCode, 400);
    const novo = (await pedir("POST", "/api/agendamento/pagina/novo-link")).json();
    assert.notEqual(novo.slug, p.slug);

    const agendamentos = (await pedir("GET", "/api/agendamento")).json().agendamentos;
    assert.deepEqual(agendamentos.map((x: { cliente: string }) => x.cliente), ["Davi Rocha"]);
    const remarcado = await pedir("POST", `/api/agendamento/${daviId}/remarcar`);
    assert.equal(remarcado.json().situacao, "remarcando");
    assert.equal(remarcado.json().opcoes.length, 3);
    assert.equal((await pedir("DELETE", `/api/agendamento/${daviId}`)).json().situacao, "cancelado");
    assert.equal((await pedir("DELETE", `/api/agendamento/${daviId}`)).statusCode, 404);

    const hBia = { authorization: `Bearer ${auth(db).abrirSessao(bia)}` };
    assert.equal((await pedir("GET", "/api/agendamento/pagina", undefined, hBia)).statusCode, 403);
    assert.equal((await pedir("GET", "/api/agendamento", undefined, hBia)).statusCode, 403);
    await app.close();
  } finally {
    fake.restaurar();
  }
});

test("API publica: dados minimos, 404, horarios e reserva", async () => {
  const fake = googleFalso();
  try {
    const { repo, db } = contaCom();
    await conectar(db, titular);
    const ctx = ctxDe(repo, titular);
    const p = a.salvarPagina(db, ctx, SEMPRE);
    const app = buildServer(repo);
    const get = (url: string) => app.inject({ method: "GET", url });
    const post = (body: object, remoteAddress = "10.0.0.1") =>
      app.inject({ method: "POST", url: `/api/agendar/${p.slug}`, headers: { "content-type": "application/json" }, payload: JSON.stringify(body), remoteAddress });

    const pagina = await get(`/api/agendar/${p.slug}`);
    assert.equal(pagina.statusCode, 200);
    assert.deepEqual(Object.keys(pagina.json()).sort(), ["dias", "duracoes", "fusoDoProfissional", "nome"]);
    assert.equal(pagina.json().nome, "Wesley Faria");
    assert.deepEqual(pagina.json().duracoes, [30]);
    assert.ok(!pagina.body.includes(titular) && !pagina.body.includes("wesley@gmail.com"));

    assert.equal((await get("/api/agendar/naoexiste1")).statusCode, 404);
    a.salvarPagina(db, ctx, { ...SEMPRE, ativa: false });
    assert.equal((await get(`/api/agendar/${p.slug}`)).statusCode, 404);
    a.salvarPagina(db, ctx, SEMPRE);
    db.prepare(`UPDATE google_accounts SET status = 'expirada'`).run();
    assert.equal((await get(`/api/agendar/${p.slug}`)).json().erro, "Página de agendamento não encontrada.");
    db.prepare(`UPDATE google_accounts SET status = 'conectada'`).run();

    const dia = amanha();
    assert.equal((await get(`/api/agendar/${p.slug}/horarios?dia=${dia}&duracao=25`)).statusCode, 400);
    assert.equal((await get(`/api/agendar/${p.slug}/horarios?dia=2020-01-01&duracao=30`)).statusCode, 400);
    fake.estado.agenda = "fora";
    const fora = await get(`/api/agendar/${p.slug}/horarios?dia=${dia}&duracao=30`);
    assert.equal(fora.statusCode, 503);
    assert.equal(fora.json().erro, "Não consegui ver a agenda agora. Tente em alguns minutos.");
    fake.estado.agenda = "ok";
    const horarios = (await get(`/api/agendar/${p.slug}/horarios?dia=${dia}&duracao=30`)).json().horarios as { inicio: string }[];
    assert.ok(horarios.length > 10);

    const corpo = (i: number, extra: object = {}) => ({ ...dados(`${dia}T10:00`), inicio: horarios[i].inicio, whatsapp: `1198000000${i}`, ...extra });
    const criado = await post(corpo(0));
    assert.equal(criado.statusCode, 201);
    assert.deepEqual(Object.keys(criado.json()).sort(), ["fim", "inicio", "nome"]);
    assert.equal((await post(corpo(0, { whatsapp: "11981111111" }))).statusCode, 409);
    assert.equal((await post(corpo(1, { aceite: false }))).statusCode, 400);
    for (let i = 1; i <= 4; i++) assert.equal((await post(corpo(i))).statusCode, 201);
    const limite = await post(corpo(5));
    assert.equal(limite.statusCode, 429);
    assert.equal(limite.json().erro, "Muitos agendamentos seguidos. Tente mais tarde.");
    await app.close();
  } finally {
    fake.restaurar();
  }
});
