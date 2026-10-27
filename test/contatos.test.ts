import assert from "node:assert/strict";
import crypto from "node:crypto";
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
process.env.PAINEL_URL = "http://localhost:3001";

const { openDb, repo: makeRepo } = await import("../src/db.js");
const { conta, resolverContexto } = await import("../src/conta.js");
const c = await import("../src/contatos.js");
const { executarFerramenta } = await import("../src/tools.js");
const { auth } = await import("../src/auth.js");
const { buildServer } = await import("../src/server.js");
const { parseStatuses, parseWebhook, sendNotice, sendText } = await import("../src/whatsapp.js");
const { fromLocal } = await import("../src/time.js");
const { googleFalso } = await import("./googleFalso.js");

type PerfilMembro = "completo" | "so_gastos" | "agenda_tarefas";
type Repo = ReturnType<typeof makeRepo>;

const titular = "5511999990000";
const bia = "5511912345678";
const joao = "5511987654321";

function contaCom(perfil?: PerfilMembro) {
  const repo = makeRepo(openDb(":memory:"));
  repo.ensureUser(titular, "Wesley");
  repo.ensureUser(bia, "Bia");
  const ct = conta(repo.db);
  if (perfil) ct.aceitarConvite(ct.gerarConvite(titular, perfil).codigo, bia);
  return { repo, db: repo.db };
}
const ctxDe = (repo: Repo, phone: string) => resolverContexto(repo.db, phone);

function caixa() {
  const enviados: { para: string; texto: string }[] = [];
  let falhar = false;
  const send = async (para: string, texto: string) => {
    if (falhar) throw new Error("WhatsApp API 400: fora da janela");
    enviados.push({ para, texto });
    return `w${enviados.length}`;
  };
  return { enviados, send, falhar: (f: boolean) => void (falhar = f) };
}

// Segunda, 2 de novembro de 2026, 9h em Sao Paulo.
const segunda = fromLocal("2026-11-02T09:00");
const pedido = (extra: object = {}) => ({ contato: "Joao", telefone: "11987654321", texto: "Lembrete: o personal vence hoje.", confirmado: true, ...extra });
const qtd = (db: Repo["db"], sql: string, ...args: unknown[]) => (db.prepare(sql).get(...args) as { n: number }).n;

let mensagemId = 0;
async function webhook(app: ReturnType<typeof buildServer>, value: object) {
  const corpo = JSON.stringify({ entry: [{ changes: [{ value }] }] });
  const assinatura = `sha256=${crypto.createHmac("sha256", "app-secret-teste").update(corpo).digest("hex")}`;
  const res = await app.inject({ method: "POST", url: "/webhook", headers: { "content-type": "application/json", "x-hub-signature-256": assinatura }, payload: corpo });
  assert.equal(res.statusCode, 200);
}
const texto = (app: ReturnType<typeof buildServer>, from: string, body: string) =>
  webhook(app, { messages: [{ id: `wamid.in${++mensagemId}`, from, type: "text", text: { body } }] });
const statuses = (app: ReturnType<typeof buildServer>, lista: { id: string; status: string; erro?: string }[]) =>
  webhook(app, { statuses: lista.map((s) => ({ id: s.id, status: s.status, recipient_id: joao, errors: s.erro ? [{ title: s.erro }] : undefined })) });
async function esperar(cond: () => boolean) {
  for (let i = 0; i < 200 && !cond(); i++) await new Promise((r) => setTimeout(r, 10));
  assert.ok(cond(), "a condicao esperada nao aconteceu");
}
const pausa = () => new Promise((r) => setTimeout(r, 150));

test("fundacao: telefone, contato, texto final, cartao, statuses e wamid", async () => {
  assert.equal(c.telefoneComDdi("(11) 98765-4321"), joao);
  assert.equal(c.telefoneComDdi("+351 912 345 678"), "351912345678");
  assert.equal(c.telefoneComDdi("98765-4321"), null);

  const { repo, db } = contaCom();
  const ctx = ctxDe(repo, titular);
  c.salvarContato(db, ctx, "Joao Silva", joao);
  assert.ok("nenhum" in c.acharContato(db, titular, "Pedro"));
  const um = c.acharContato(db, titular, "joão");
  assert.ok("um" in um && um.um.phone === joao);
  c.salvarContato(db, ctx, "Joao Lima", "5511911112222");
  assert.ok("varios" in c.acharContato(db, titular, "Joao"));
  assert.ok("um" in c.acharContato(db, titular, "joao lima"));
  c.salvarContato(db, ctx, "Joãozinho", joao);
  assert.equal(qtd(db, `SELECT COUNT(*) AS n FROM contacts`), 2);
  assert.equal((db.prepare(`SELECT name FROM contacts WHERE phone = ?`).get(joao) as { name: string }).name, "Joãozinho");

  assert.equal(
    c.textoFinal("Joao Silva", "Wesley", "Lembrete: o personal vence hoje."),
    "Oi, Joao! Aqui e o assessor de Wesley. Lembrete: o personal vence hoje. Para nao receber mais mensagens do assessor, responda PARAR.",
  );

  const cartao = parseWebhook({
    entry: [{ changes: [{ value: { messages: [{ id: "m1", from: titular, type: "contacts", contacts: [{ name: { formatted_name: "Joao Silva" }, phones: [{ phone: "+55 11 98765-4321", wa_id: joao }] }] }] } }] }],
  });
  assert.deepEqual(cartao[0], { id: "m1", from: titular, name: undefined, type: "contact", contatos: [{ nome: "Joao Silva", telefone: joao }] });
  assert.deepEqual(
    parseStatuses({ entry: [{ changes: [{ value: { statuses: [{ id: "w1", status: "delivered", recipient_id: joao }, { id: "w2", status: "failed", recipient_id: joao, errors: [{ title: "Re-engagement message" }] }] } }] }] }),
    [
      { id: "w1", status: "delivered", para: joao, erro: null },
      { id: "w2", status: "failed", para: joao, erro: "Re-engagement message" },
    ],
  );

  const fake = googleFalso();
  try {
    assert.equal(await sendText(joao, "oi"), "wamid.1");
    assert.equal(await sendNotice(joao, "oi de novo"), "wamid.2");
  } finally {
    fake.restaurar();
  }
});

test("pedido e envio: previa, confirmacao, recorrencia, limites, falha e opt-out", async () => {
  const { repo, db } = contaCom();
  const ctx = ctxDe(repo, titular);
  const { enviados, send, falhar } = caixa();
  const pedir = (extra: object = {}, agora = segunda) => c.pedirEnvio(db, ctx, pedido(extra), agora);
  const envios = () => qtd(db, `SELECT COUNT(*) AS n FROM contact_sends`);

  assert.match(c.pedirEnvio(db, ctx, { contato: "Joao", texto: "oi", confirmado: false }, segunda).texto, /Nao tenho Joao nos contatos\. Pergunte o WhatsApp/);
  const previa = pedir({ confirmado: false });
  assert.ok(previa.ok);
  assert.match(previa.texto, /Para: Joao \(final 4321\)/);
  assert.match(previa.texto, /"Oi, Joao! Aqui e o assessor de Wesley\. Lembrete: o personal vence hoje\. Para nao receber mais mensagens do assessor, responda PARAR\."/);
  assert.match(previa.texto, /Sem o modelo aprovado da Meta/);
  assert.equal(envios(), 0);
  assert.equal(qtd(db, `SELECT COUNT(*) AS n FROM contacts`), 0);
  assert.match(pedir({ dataHora: "2026-11-01T10:00" }).texto, /ja passou/);

  const mensal = pedir({ dataHora: "2026-11-05T09:00", recorrencia: "mensal" });
  assert.ok(mensal.ok && mensal.envio!.status === "ativo");
  await c.enviarVencidos(repo, send, fromLocal("2026-11-04T09:00"));
  assert.equal(enviados.length, 0);
  await c.enviarVencidos(repo, send, fromLocal("2026-11-05T09:00"));
  await c.enviarVencidos(repo, send, fromLocal("2026-11-05T09:01"));
  assert.deepEqual(enviados.map((e) => e.para), [joao]);
  const m = db.prepare(`SELECT * FROM contact_messages`).get() as import("../src/contatos.js").MensagemContato;
  assert.deepEqual([m.status, m.wamid, m.phone], ["enviada", "w1", joao]);
  assert.equal((db.prepare(`SELECT next_run_at FROM contact_sends WHERE id = ?`).get(mensal.envio!.id) as { next_run_at: string }).next_run_at, fromLocal("2026-12-05T09:00").toISOString());

  const agora = pedir({ contato: "Ana", telefone: "11955554444", texto: "Chego as 15h." }, fromLocal("2026-11-05T10:00"));
  await c.enviarVencidos(repo, send, fromLocal("2026-11-05T10:00"));
  assert.equal((db.prepare(`SELECT status FROM contact_sends WHERE id = ?`).get(agora.envio!.id) as { status: string }).status, "concluido");
  assert.equal(enviados.at(-1)!.texto, "Oi, Ana! Aqui e o assessor de Wesley. Chego as 15h. Para nao receber mais mensagens do assessor, responda PARAR.");

  // Ja foram 3 para o Joao no dia: a quarta e recusada no pedido e pulada no agendador.
  const dia = fromLocal("2026-11-05T11:00");
  pedir({ texto: "Segunda." }, dia);
  pedir({ texto: "Terceira." }, dia);
  await c.enviarVencidos(repo, send, dia);
  assert.match(pedir({ texto: "Quarta." }, dia).texto, /ja foram 3 mensagens para esse contato hoje/);
  const recorrente = pedir({ texto: "Diario.", recorrencia: "diario", dataHora: "2026-11-05T12:00" }, dia);
  enviados.length = 0;
  await c.enviarVencidos(repo, send, fromLocal("2026-11-05T12:00"));
  await c.enviarVencidos(repo, send, fromLocal("2026-11-05T12:01"));
  assert.equal(qtd(db, `SELECT COUNT(*) AS n FROM contact_messages WHERE status = 'pulada'`), 1);
  assert.deepEqual(enviados.map((e) => e.para), [titular]);
  assert.match(enviados[0].texto, /⚠️ A mensagem para Joao nao saiu hoje: ja foram 3 mensagens para esse contato hoje/);
  assert.equal((db.prepare(`SELECT next_run_at FROM contact_sends WHERE id = ?`).get(recorrente.envio!.id) as { next_run_at: string }).next_run_at, fromLocal("2026-11-06T12:00").toISOString());

  // Limite da conta: 20 por dia, contando todos os contatos.
  const outro = contaCom();
  const octx = ctxDe(outro.repo, titular);
  const lote = outro.db.prepare(`INSERT INTO contact_messages (send_id, conta, phone, status, sent_at) VALUES (0, ?, ?, 'entregue', ?)`);
  for (let i = 0; i < 20; i++) lote.run(titular, `55119000000${String(i).padStart(2, "0")}`, segunda.toISOString());
  assert.match(c.pedirEnvio(outro.db, octx, pedido({ contato: "Rui", telefone: "11933332222" }), segunda).texto, /limite de 20 mensagens a contatos por dia/);

  const falha = pedir({ contato: "Ana", telefone: "11955554444", texto: "Outro recado." }, fromLocal("2026-11-07T10:00"));
  falhar(true);
  await c.enviarVencidos(repo, send, fromLocal("2026-11-07T10:00"));
  falhar(false);
  const falhou = db.prepare(`SELECT * FROM contact_messages WHERE send_id = ?`).get(falha.envio!.id) as { status: string; error: string };
  assert.equal(falhou.status, "falhou");
  assert.match(falhou.error, /fora da janela/);
  // O WhatsApp fora tambem recusa o aviso: ele espera na fila para a proxima conversa.
  const pendentes = (db.prepare(`SELECT text FROM pending_notices WHERE phone = ?`).all(titular) as { text: string }[]).map((p) => p.text);
  assert.ok(pendentes.some((p) => /⚠️ A mensagem para Ana nao foi entregue/.test(p)));

  // PARAR registrado depois do pedido (pela pagina de agendamento, por exemplo): nada sai e o envio para.
  db.prepare(`INSERT INTO client_optouts (client_phone, created_at) VALUES (?, ?)`).run(joao, segunda.toISOString());
  enviados.length = 0;
  await c.enviarVencidos(repo, send, fromLocal("2026-12-05T09:00"));
  assert.ok(!enviados.some((e) => e.para === joao));
  assert.equal((db.prepare(`SELECT status FROM contact_sends WHERE id = ?`).get(mensal.envio!.id) as { status: string }).status, "cancelado");
  assert.match(pedir({ texto: "De novo." }, fromLocal("2026-12-06T09:00")).texto, /Joao pediu para nao receber mensagens do assessor/);
});

test("webhook: situacao, resposta repassada, PARAR, prioridade do agendamento e cartao de contato", async () => {
  const fake = googleFalso();
  try {
    const { repo, db } = contaCom();
    const ctx = ctxDe(repo, titular);
    const app = buildServer(repo);
    const para = (phone: string) => fake.mensagens.filter((m) => m.para === phone).map((m) => m.texto);
    const agora = new Date();

    const recorrente = c.pedirEnvio(db, ctx, pedido({ recorrencia: "semanal" }), agora);
    c.pedirEnvio(db, ctx, pedido({ contato: "Ana", telefone: "11955554444", texto: "Chego as 15h." }), agora);
    await c.enviarVencidos(repo, sendNotice, agora);
    const [mJoao, mAna] = db.prepare(`SELECT * FROM contact_messages ORDER BY id`).all() as { id: number; wamid: string }[];
    assert.match(mJoao.wamid, /^wamid\./);
    const situacao = (id: number) => (db.prepare(`SELECT status FROM contact_messages WHERE id = ?`).get(id) as { status: string }).status;

    await statuses(app, [{ id: mJoao.wamid, status: "delivered" }]);
    assert.equal(situacao(mJoao.id), "entregue");
    await statuses(app, [{ id: mJoao.wamid, status: "read" }, { id: mJoao.wamid, status: "delivered" }]);
    assert.equal(situacao(mJoao.id), "lida");
    await statuses(app, [{ id: mAna.wamid, status: "failed", erro: "Message undeliverable" }]);
    assert.equal(situacao(mAna.id), "falhou");
    assert.match(para(titular).join("\n"), /⚠️ A mensagem para Ana nao foi entregue: Message undeliverable/);

    await texto(app, joao, "Pode deixar, pago amanha");
    await esperar(() => para(joao).length === 2);
    assert.equal(para(joao)[1], "Recebido! Vou repassar para Wesley.");
    assert.match(para(titular).join("\n"), /💬 Joao respondeu: "Pode deixar, pago amanha"/);
    assert.equal((db.prepare(`SELECT reply_text FROM contact_messages WHERE id = ?`).get(mJoao.id) as { reply_text: string }).reply_text, "Pode deixar, pago amanha");
    await texto(app, joao, "Ja paguei!");
    await esperar(() => para(titular).some((t) => t.includes("Ja paguei!")));
    assert.equal(para(joao).length, 2);

    await texto(app, joao, "PARAR");
    await esperar(() => para(joao).length === 3);
    assert.equal(para(joao)[2], "Combinado, nao mando mais mensagens.");
    assert.ok(db.prepare(`SELECT 1 FROM client_optouts WHERE client_phone = ?`).get(joao));
    assert.equal((db.prepare(`SELECT status FROM contact_sends WHERE id = ?`).get(recorrente.envio!.id) as { status: string }).status, "cancelado");
    await esperar(() => para(titular).some((t) => t.includes("🚫 Joao pediu para nao receber mais mensagens")));

    // A Ana tambem tem horario marcado pela pagina: a resposta e da US5.
    db.prepare(
      `INSERT INTO booking_pages (phone, conta, slug, display_name, durations, weekdays, window_start, window_end, status, created_at)
       VALUES (?, ?, 'abc1234567', 'Wesley Faria', '[30]', '[1]', '09:00', '18:00', 'ativa', ?)`,
    ).run(titular, titular, agora.toISOString());
    db.prepare(
      `INSERT INTO bookings (page_id, owner_phone, client_name, client_email, client_phone, starts_at, ends_at, status, created_at)
       VALUES (1, ?, 'Ana Lima', 'ana@x.com', '5511955554444', ?, ?, 'agendado', ?)`,
    ).run(titular, new Date(Date.now() + 86_400_000).toISOString(), new Date(Date.now() + 88_200_000).toISOString(), agora.toISOString());
    await texto(app, "5511955554444", "1");
    await esperar(() => para("5511955554444").length === 2);
    assert.match(para("5511955554444")[1], /^Confirmado! Wesley Faria te espera/);

    await texto(app, "5511900000001", "oi");
    await pausa();
    assert.equal(para("5511900000001").length, 0);
    assert.equal(fake.estado.ia, 0);

    await webhook(app, {
      messages: [{ id: "wamid.cartao", from: titular, type: "contacts", contacts: [{ name: { formatted_name: "Pedro Alves" }, phones: [{ wa_id: "5511944443333" }] }] }],
    });
    await esperar(() => fake.estado.ia > 0);
    const pedidoAoModelo = fake.chamadas.find((x) => x.url.includes("generativelanguage"))!;
    assert.match(JSON.stringify(pedidoAoModelo.corpo), /\[contato compartilhado: Pedro Alves, 5511944443333\]/);
    await pausa();
    await app.close();
  } finally {
    fake.restaurar();
  }
});

test("ferramentas e API: contato, previa, consulta, cancelamento, permissao e isolamento", async () => {
  const fake = googleFalso();
  try {
    const { repo, db } = contaCom("so_gastos");
    const ctx = ctxDe(repo, titular);
    const ferramenta = (nome: string, entrada: object) => executarFerramenta(repo, ctx, nome, entrada);
    const base = { contato: "Joao", telefone: null, texto: "Lembrete: o personal vence hoje.", data_hora: null, recorrencia: null, confirmado: false };

    assert.match(await ferramenta("mensagem_para_contato", base), /Nao tenho Joao nos contatos/);
    assert.match(await ferramenta("mensagem_para_contato", { ...base, telefone: "11987654321" }), /^Previa/);
    assert.equal(qtd(db, `SELECT COUNT(*) AS n FROM contact_sends`), 0);
    const proximoDia5 = (() => {
      const d = new Date(Date.now() + 2 * 86_400_000);
      return `${d.toISOString().slice(0, 10)}T09:00`;
    })();
    assert.match(
      await ferramenta("mensagem_para_contato", { ...base, telefone: "11987654321", data_hora: proximoDia5, recorrencia: "mensal", confirmado: true }),
      /Combinado \(#1\)\. Sai .+ e repete todo mes para Joao/,
    );
    c.salvarContato(db, ctx, "Joao Lima", "5511911112222");
    assert.match(await ferramenta("mensagem_para_contato", { ...base, contato: "jo" }), /mais de um contato com esse nome: Joao \(final 4321\), Joao Lima \(final 2222\)/);
    assert.match(await ferramenta("mensagem_para_contato", base), /Para: Joao \(final 4321\)/);

    assert.match(await ferramenta("consultar_mensagens_contato", { contato: "joao" }), /Envios ativos:\n#1 \| Joao \| proximo .+ \| mensal \| "Lembrete: o personal vence hoje\."/);
    assert.match(await ferramenta("cancelar_mensagem_contato", { id: 1, confirmado: false }), /Confirme/);

    // Outra conta no mesmo banco nao ve nem cancela o envio.
    repo.ensureUser("5511900001111", "Carla");
    const deCarla = c.pedirEnvio(db, ctxDe(repo, "5511900001111"), pedido({ contato: "Mae", telefone: "11922223333", dataHora: proximoDia5 }), new Date());
    assert.match(await ferramenta("cancelar_mensagem_contato", { id: deCarla.envio!.id, confirmado: true }), /não encontrado/);

    const app = buildServer(repo);
    const h = { authorization: `Bearer ${auth(db).abrirSessao(titular)}` };
    const lista = await app.inject({ method: "GET", url: "/api/contatos/mensagens", headers: h });
    assert.equal(lista.statusCode, 200);
    assert.deepEqual(lista.json().envios.map((e: { contato: string; recorrencia: string; pedidoPor: string }) => [e.contato, e.recorrencia, e.pedidoPor]), [["Joao", "mensal", "Wesley"]]);
    assert.ok(!lista.body.includes("987654321") && !lista.body.includes("Mae"));
    assert.equal((await app.inject({ method: "DELETE", url: `/api/contatos/envios/${deCarla.envio!.id}`, headers: h })).statusCode, 404);
    assert.equal((await app.inject({ method: "DELETE", url: "/api/contatos/envios/1", headers: h })).statusCode, 200);
    assert.equal((await app.inject({ method: "GET", url: "/api/contatos/mensagens", headers: h })).json().envios.length, 0);
    assert.match(await ferramenta("cancelar_mensagem_contato", { id: 1, confirmado: true }), /não encontrado/);

    assert.match(await executarFerramenta(repo, ctxDe(repo, bia), "mensagem_para_contato", { ...base, telefone: "11987654321" }), /^Sem permissao/);
    const hBia = { authorization: `Bearer ${auth(db).abrirSessao(bia)}` };
    assert.equal((await app.inject({ method: "GET", url: "/api/contatos/mensagens", headers: hBia })).statusCode, 403);
    await app.close();
  } finally {
    fake.restaurar();
  }
});
