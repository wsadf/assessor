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
process.env.GOOGLE_CLIENT_ID = "cliente-teste.apps.googleusercontent.com";
process.env.GOOGLE_CLIENT_SECRET = "segredo-do-cliente";
process.env.GOOGLE_TOKEN_KEY = crypto.randomBytes(32).toString("base64");
process.env.PAINEL_URL = "http://localhost:3001";

const { openDb, repo: makeRepo } = await import("../src/db.js");
const { conta, resolverContexto } = await import("../src/conta.js");
const g = await import("../src/google.js");
const { config } = await import("../src/config.js");
const { executarFerramenta } = await import("../src/tools.js");
const { auth } = await import("../src/auth.js");
const { buildServer } = await import("../src/server.js");
const { resumoManha } = await import("../src/avisos.js");
const { fromLocal } = await import("../src/time.js");

type PerfilMembro = "completo" | "so_gastos" | "agenda_tarefas";

const titular = "5511999990000";
const bia = "5511912345678";
const ESCOPO = "https://www.googleapis.com/auth/calendar.events";
const idToken = (email: string) => `x.${Buffer.from(JSON.stringify({ email })).toString("base64url")}.y`;

function contaCom(perfil?: PerfilMembro) {
  const repo = makeRepo(openDb(":memory:"));
  repo.ensureUser(titular, "Wesley");
  repo.ensureUser(bia, "Bia");
  const c = conta(repo.db);
  if (perfil) c.aceitarConvite(c.gerarConvite(titular, perfil).codigo, bia);
  return { repo, db: repo.db };
}
const ctxDe = (repo: ReturnType<typeof makeRepo>, phone: string) => resolverContexto(repo.db, phone);

/** Google de mentira: troca `fetch` e guarda o que foi chamado. */
function googleFalso() {
  const chamadas: { metodo: string; url: string; corpo: any }[] = [];
  const eventos = new Map<string, any>();
  const estado = { refresh: "ok" as "ok" | "invalid_grant" | "fora", escopo: `openid email ${ESCOPO}`, n: 0, revogados: [] as string[] };
  const real = globalThis.fetch;
  globalThis.fetch = (async (url: string, init: RequestInit = {}) => {
    const u = new URL(String(url));
    const metodo = init.method ?? "GET";
    const texto = init.body ? String(init.body) : "";
    const corpo = texto.startsWith("{") ? JSON.parse(texto) : Object.fromEntries(new URLSearchParams(texto));
    chamadas.push({ metodo, url: String(url), corpo });
    const json = (status: number, dados: unknown) => new Response(JSON.stringify(dados), { status });
    if (u.host === "oauth2.googleapis.com" && u.pathname === "/token") {
      if (corpo.grant_type === "authorization_code") {
        return json(200, { access_token: "at-0", expires_in: 3599, refresh_token: "rt-segredo", scope: estado.escopo, id_token: idToken("wesley@gmail.com") });
      }
      if (estado.refresh === "invalid_grant") return json(400, { error: "invalid_grant" });
      if (estado.refresh === "fora") return json(503, { error: "backend" });
      return json(200, { access_token: `at-${++estado.n}`, expires_in: 3599 });
    }
    if (u.host === "oauth2.googleapis.com" && u.pathname === "/revoke") {
      estado.revogados.push(corpo.token);
      return json(200, {});
    }
    if (u.host === "www.googleapis.com") {
      const id = decodeURIComponent(u.pathname.split("/events/")[1] ?? "");
      if (metodo === "GET" && !id) {
        const de = new Date(u.searchParams.get("timeMin")!);
        const ate = new Date(u.searchParams.get("timeMax")!);
        const q = u.searchParams.get("q")?.toLowerCase();
        const items = [...eventos.values()].filter(
          (e) => new Date(e.start.dateTime) < ate && new Date(e.end.dateTime) > de && (!q || e.summary.toLowerCase().includes(q)),
        );
        return json(200, { items });
      }
      if (metodo === "POST") {
        const ev = { ...corpo, id: `ev${eventos.size + 1}`, htmlLink: "https://calendar.google.com/x" };
        if (corpo.conferenceData) ev.hangoutLink = "https://meet.google.com/abc-defg-hij";
        eventos.set(ev.id, ev);
        return json(200, ev);
      }
      const ev = eventos.get(id);
      if (!ev) return json(404, {});
      if (metodo === "GET") return json(200, ev);
      if (metodo === "PATCH") {
        Object.assign(ev, corpo);
        return json(200, ev);
      }
      if (metodo === "DELETE") {
        eventos.delete(id);
        return new Response(null, { status: 204 });
      }
    }
    return json(500, {});
  }) as typeof fetch;
  return { chamadas, eventos, estado, restaurar: () => (globalThis.fetch = real) };
}

async function conectar(db: ReturnType<typeof makeRepo>["db"], phone: string) {
  const url = new URL(g.urlDeAutorizacao(db, phone));
  return g.concluirConexao(db, "codigo-do-google", url.searchParams.get("state")!);
}

const daqui = (dias: number, hora: string) => {
  const d = new Date(Date.now() + dias * 86_400_000).toISOString().slice(0, 10);
  return `${d}T${hora}`;
};

test("fundacao: cifra, state e link de uso unico, renovacao e revogacao", async () => {
  const fake = googleFalso();
  try {
    const { db } = contaCom();
    const cifrado = g.cifrar("rt-segredo");
    assert.notEqual(cifrado, "rt-segredo");
    assert.equal(g.decifrar(cifrado), "rt-segredo");
    assert.throws(() => g.decifrar(cifrado, crypto.randomBytes(32)));

    const url = new URL(g.urlDeAutorizacao(db, titular));
    assert.equal(url.searchParams.get("scope"), `openid email ${ESCOPO}`);
    assert.equal(url.searchParams.get("access_type"), "offline");
    assert.equal(url.searchParams.get("redirect_uri"), "http://localhost:3001/api/google/retorno");
    const state = url.searchParams.get("state")!;
    assert.equal(await g.concluirConexao(db, "c", state), titular);
    await assert.rejects(g.concluirConexao(db, "c", state), /venceu ou já foi usado/);
    await assert.rejects(g.concluirConexao(db, "c", "inventado"), /venceu ou já foi usado/);
    assert.ok(!JSON.stringify(db.prepare(`SELECT * FROM google_accounts`).all()).includes("rt-segredo"));
    assert.deepEqual(
      (({ conectada, email, status }) => ({ conectada, email, status }))(g.estado(db, titular)),
      { conectada: true, email: "wesley@gmail.com", status: "conectada" },
    );

    const vencido = new URL(g.urlDeAutorizacao(db, bia, new Date(Date.now() - 11 * 60_000))).searchParams.get("state")!;
    await assert.rejects(g.concluirConexao(db, "c", vencido));
    fake.estado.escopo = "openid email";
    await assert.rejects(conectar(db, bia), /permissão/);
    assert.equal(g.estado(db, bia).status, null);
    fake.estado.escopo = `openid email ${ESCOPO}`;

    const link = g.criarLink(db, bia);
    const token = link.split("/").at(-1)!;
    assert.match(link, /^http:\/\/localhost:3001\/api\/google\/conectar\//);
    assert.equal(g.usarLink(db, token), bia);
    assert.equal(g.usarLink(db, token), null);

    const renovacoes = () => fake.chamadas.filter((c) => c.corpo.grant_type === "refresh_token").length;
    assert.equal(await g.accessToken(db, titular), "at-0");
    assert.equal(renovacoes(), 0);
    await g.accessToken(db, titular, Date.now() + 3_560_000);
    assert.equal(renovacoes(), 1);

    fake.estado.refresh = "invalid_grant";
    await assert.rejects(g.accessToken(db, titular, Date.now() + 9_000_000), g.GoogleExpirado);
    assert.equal(g.estado(db, titular).status, "expirada");

    await g.desconectar(db, titular);
    assert.deepEqual(fake.estado.revogados, ["rt-segredo"]);
    assert.equal(g.estado(db, titular).status, null);
  } finally {
    fake.restaurar();
  }
});

test("eventos: padrao de 60 min, convidados, Meet, conflito, mover e apagar", async () => {
  const fake = googleFalso();
  try {
    const { db } = contaCom();
    await conectar(db, titular);
    const inicio = fromLocal(daqui(2, "10:00"));
    const ev = await g.criarEvento(db, titular, { titulo: "Reuniao", inicio, duracaoMin: 60, convidados: ["ana@exemplo.com"], comVideo: true });
    const post = fake.chamadas.find((c) => c.metodo === "POST" && c.url.includes("/events"))!;
    assert.match(post.url, /sendUpdates=all/);
    assert.match(post.url, /conferenceDataVersion=1/);
    assert.equal(post.corpo.start.timeZone, "America/Sao_Paulo");
    assert.equal(new Date(post.corpo.end.dateTime).getTime() - inicio.getTime(), 3_600_000);
    assert.equal(post.corpo.conferenceData.createRequest.conferenceSolutionKey.type, "hangoutsMeet");
    assert.deepEqual(ev.convidados, ["ana@exemplo.com"]);
    assert.equal(ev.linkVideo, "https://meet.google.com/abc-defg-hij");

    assert.equal((await g.conflitos(db, titular, new Date(inicio.getTime() + 30 * 60_000), new Date(inicio.getTime() + 90 * 60_000))).length, 1);
    assert.equal((await g.conflitos(db, titular, new Date(inicio.getTime() + 60 * 60_000), new Date(inicio.getTime() + 120 * 60_000))).length, 0);

    const movido = await g.moverEvento(db, titular, ev.id, fromLocal(daqui(2, "15:00")));
    assert.equal(new Date(movido!.depois.fim).getTime() - new Date(movido!.depois.inicio).getTime(), 3_600_000);
    assert.match(fake.chamadas.find((c) => c.metodo === "PATCH")!.url, /sendUpdates=all/);
    assert.equal(await g.apagarEvento(db, titular, ev.id), true);
    assert.equal(await g.evento(db, titular, ev.id), null);
  } finally {
    fake.restaurar();
  }
});

test("ferramentas: criar, conflito, sem conexao, sem configuracao, expirado, consultar, remarcar e cancelar", async () => {
  const fake = googleFalso();
  try {
    const { repo, db } = contaCom("completo");
    const ctx = ctxDe(repo, titular);
    const criar = (extra: object = {}) =>
      executarFerramenta(repo, ctx, "criar_compromisso", {
        titulo: "Dentista", inicio: daqui(2, "15:00"), duracao_minutos: null, convidados: null, com_videochamada: null, lembrar_minutos_antes: null, confirmar_conflito: null, ...extra,
      });

    const semConexao = await criar();
    assert.match(semConexao, /Google Agenda nao conectada/);
    assert.match(semConexao, /http:\/\/localhost:3001\/api\/google\/conectar\//);
    assert.equal(repo.listReminders(titular).length, 1);
    repo.cancelReminder(titular, repo.listReminders(titular)[0].id);

    await conectar(db, titular);
    const criado = await criar();
    assert.match(criado, /Marcado no Google Agenda: Dentista/);
    assert.match(criado, /Lembro 60 min antes/);
    const lembrete = repo.listReminders(titular)[0];
    assert.equal(lembrete.google_event_id, "ev1");
    assert.equal(new Date(lembrete.next_run_at).getTime(), fromLocal(daqui(2, "14:00")).getTime());

    assert.match(await criar({ titulo: "Outra" }), /Conflito com Dentista/);
    assert.equal(fake.eventos.size, 1);
    assert.match(await criar({ titulo: "Outra", confirmar_conflito: true }), /Marcado/);

    const lista = await executarFerramenta(repo, ctx, "consultar_agenda", { data_inicio: daqui(2, "").slice(0, 10), data_fim: daqui(2, "").slice(0, 10), busca: null });
    assert.match(lista, /ev1 \|.*Dentista/);

    const remarcado = await executarFerramenta(repo, ctx, "remarcar_compromisso", { id: "ev1", novo_inicio: daqui(3, "09:00"), duracao_minutos: null });
    assert.match(remarcado, /Antes:.*Agora:/s);
    const movido = repo.listReminders(titular).find((r) => r.google_event_id === "ev1")!;
    assert.equal(new Date(movido.next_run_at).getTime(), fromLocal(daqui(3, "08:00")).getTime());

    assert.match(await executarFerramenta(repo, ctx, "cancelar_compromisso", { id: "ev1", confirmado: false }), /Confirme/);
    assert.ok(fake.eventos.has("ev1"));
    assert.match(await executarFerramenta(repo, ctx, "cancelar_compromisso", { id: "ev1", confirmado: true }), /Cancelado/);
    assert.ok(!fake.eventos.has("ev1"));
    assert.equal(repo.remindersDoEvento(titular, "ev1").length, 0);

    // A Bia tem acesso completo, mas a conta Google e do Wesley.
    assert.match(await executarFerramenta(repo, ctxDe(repo, bia), "consultar_agenda", { data_inicio: daqui(2, "").slice(0, 10), data_fim: daqui(3, "").slice(0, 10), busca: null }), /nao conectada/);

    const salvo = config.google.clientId;
    config.google.clientId = "";
    try {
      const desligado = await criar({ titulo: "Sem google", inicio: daqui(6, "10:00") });
      assert.match(desligado, /nao esta disponivel neste servidor/);
    } finally {
      config.google.clientId = salvo;
    }

    assert.match(await executarFerramenta(repo, ctx, "desconectar_google_agenda", { confirmado: false }), /Confirme/);
    assert.match(await executarFerramenta(repo, ctx, "desconectar_google_agenda", { confirmado: true }), /Desconectei/);
    assert.equal(g.estado(db, titular).status, null);
  } finally {
    fake.restaurar();
  }
});

test("ferramentas: acesso vencido vira lembrete interno com link, e perfil sem agenda e recusado", async () => {
  const fake = googleFalso();
  try {
    const { repo, db } = contaCom("so_gastos");
    await conectar(db, titular);
    db.prepare(`UPDATE google_accounts SET status = 'expirada'`).run();
    const out = await executarFerramenta(repo, ctxDe(repo, titular), "criar_compromisso", {
      titulo: "Medico", inicio: daqui(5, "11:00"), duracao_minutos: null, convidados: null, com_videochamada: null, lembrar_minutos_antes: null, confirmar_conflito: null,
    });
    assert.match(out, /acesso ao Google Agenda venceu/);
    assert.match(out, /api\/google\/conectar\//);
    assert.equal(repo.listReminders(titular).length, 1);
    assert.match(await executarFerramenta(repo, ctxDe(repo, bia), "consultar_agenda", { data_inicio: "2026-11-10", data_fim: "2026-11-10", busca: null }), /^Sem permissao/);
    assert.match(await executarFerramenta(repo, ctxDe(repo, titular), "conectar_google_agenda", {}), /api\/google\/conectar\//);
  } finally {
    fake.restaurar();
  }
});

test("API e resumo da manha", async () => {
  const fake = googleFalso();
  try {
    const { repo, db } = contaCom();
    const app = buildServer(repo);
    const token = auth(repo.db).abrirSessao(titular);
    const h = { authorization: `Bearer ${token}` };

    assert.deepEqual((await app.inject({ method: "GET", url: "/api/google", headers: h })).json().conectada, false);
    const conectar = (await app.inject({ method: "POST", url: "/api/google/conectar", headers: h })).json();
    const state = new URL(conectar.url).searchParams.get("state")!;
    const negado = await app.inject({ method: "GET", url: `/api/google/retorno?error=access_denied&state=${state}` });
    assert.match(negado.body, /não foi conectada/);
    const retorno = await app.inject({ method: "GET", url: `/api/google/retorno?code=abc&state=${state}` });
    assert.equal(retorno.statusCode, 200);
    assert.match(retorno.headers["content-type"] as string, /text\/html/);
    assert.match(retorno.body, /Google Agenda conectada/);
    assert.equal((await app.inject({ method: "GET", url: "/api/google", headers: h })).json().email, "wesley@gmail.com");

    const link = g.criarLink(db, titular).split("/").at(-1)!;
    const redireciona = await app.inject({ method: "GET", url: `/api/google/conectar/${link}` });
    assert.equal(redireciona.statusCode, 302);
    assert.match(String(redireciona.headers.location), /^https:\/\/accounts\.google\.com\//);
    assert.match((await app.inject({ method: "GET", url: `/api/google/conectar/${link}` })).body, /Link vencido/);

    const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
    await g.criarEvento(db, titular, { titulo: "Call com investidor", inicio: fromLocal(`${hoje}T23:00`), duracaoMin: 30 });
    const agenda = (await app.inject({ method: "GET", url: `/api/agenda?dia=${hoje}`, headers: h })).json();
    assert.deepEqual(agenda.google.eventos.map((e: { titulo: string }) => e.titulo), ["Call com investidor"]);

    const ctx = ctxDe(repo, titular);
    assert.match(resumoManha(repo, ctx, new Date(), await g.eventosDoDia(db, titular, hoje))!, /Compromissos de hoje: 23:00 Call com investidor/);
    assert.match(resumoManha(repo, ctx, new Date(), "falhou")!, /Nao consegui ler o Google Agenda agora/);

    assert.equal((await app.inject({ method: "DELETE", url: "/api/google", headers: h })).statusCode, 200);
    assert.equal(g.estado(db, titular).status, null);
    await app.close();
  } finally {
    fake.restaurar();
  }
});
