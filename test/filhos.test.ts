import assert from "node:assert/strict";
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
const fh = await import("../src/filhos.js");
const av = await import("../src/avisos.js");
const { executeTool } = await import("../src/tools.js");
const { auth, AuthError } = await import("../src/auth.js");
const { SemPermissao } = await import("../src/permissoes.js");
const { buildServer } = await import("../src/server.js");
const { rodarAvisos, buildDailySummary } = await import("../src/scheduler.js");
const { fromLocal, localDate } = await import("../src/time.js");

type PerfilMembro = "completo" | "so_gastos" | "agenda_tarefas";

const titular = "5511999990000";
const bia = "5511912345678";
const outro = "5511988880000";
// Terca-feira. Toda data de teste e fixa: nada aqui depende do dia em que o teste roda.
const HOJE = "2026-11-10";
const as = (data: string, hora = "10:00") => fromLocal(`${data}T${hora}`);

function contaCom(perfil?: PerfilMembro) {
  const repo = makeRepo(openDb(":memory:"));
  repo.ensureUser(titular, "Wesley");
  repo.ensureUser(bia, "Bia");
  repo.ensureUser(outro, "Outra pessoa");
  const c = conta(repo.db);
  if (perfil) c.aceitarConvite(c.gerarConvite(titular, perfil).codigo, bia);
  return { repo, db: repo.db };
}
const ctxDe = (repo: ReturnType<typeof makeRepo>, phone: string) => resolverContexto(repo.db, phone);

function coletor(falhar = false) {
  const enviados: { para: string; texto: string }[] = [];
  const send = async (para: string, texto: string) => {
    if (falhar) throw new Error("fora da janela de 24 horas");
    enviados.push({ para, texto });
  };
  return { enviados, send };
}

/** A regra de dominio recusa com AuthError: confere o status e um pedaco da mensagem. */
const recusa = (fn: () => unknown, status: number, msg: RegExp) =>
  assert.throws(fn, (e: unknown) => e instanceof AuthError && e.status === status && msg.test(e.message), `esperava ${status} ${msg}`);

test("fundacao: cadastro de filho, limites, idade e nome", () => {
  const { repo, db } = contaCom("agenda_tarefas");
  fh.prepararTabelasFilhos(db);
  fh.prepararTabelasFilhos(db);
  const ctx = ctxDe(repo, titular);

  const marina = fh.cadastrarFilho(db, ctx, { nome: "  Marina ", nascimento: "2018-03-12" }, HOJE);
  assert.equal(marina.nome, "Marina");
  assert.equal(marina.nascimento, "2018-03-12");
  assert.equal(marina.idade, 8);
  assert.equal(marina.idadeAproximada, false);

  const pedro = fh.cadastrarFilho(db, ctx, { nome: "Pedro", idadeAproximada: 6 }, HOJE);
  assert.equal(pedro.nascimento, null);
  assert.equal(pedro.idade, 6);
  assert.equal(pedro.idadeAproximada, true);
  // A idade aproximada passa a contar os anos inteiros desde o dia em que foi informada.
  assert.equal(fh.listarFilhos(db, ctx, "2028-11-10").find((f) => f.nome === "Pedro")!.idade, 8);
  assert.equal(fh.listarFilhos(db, ctx, "2027-11-09").find((f) => f.nome === "Pedro")!.idade, 6);

  // Nome: 1 a 40 caracteres e unico por conta, sem acento e sem diferenca de maiusculas.
  recusa(() => fh.cadastrarFilho(db, ctx, { nome: "   " }, HOJE), 400, /nome/i);
  recusa(() => fh.cadastrarFilho(db, ctx, { nome: "x".repeat(41) }, HOJE), 400, /1 a 40/);
  fh.cadastrarFilho(db, ctx, { nome: "João" }, HOJE);
  recusa(() => fh.cadastrarFilho(db, ctx, { nome: "joao" }, HOJE), 409, /Ja existe um filho/);
  recusa(() => fh.cadastrarFilho(db, ctx, { nome: "MARINA" }, HOJE), 409, /Ja existe um filho/);

  // Nascimento ou idade aproximada, nunca os dois; sem data futura nem mais de 25 anos.
  recusa(() => fh.cadastrarFilho(db, ctx, { nome: "Ana", nascimento: "2019-01-01", idadeAproximada: 7 }, HOJE), 400, /nao as duas/);
  recusa(() => fh.cadastrarFilho(db, ctx, { nome: "Ana", nascimento: "2026-11-11" }, HOJE), 400, /futura/);
  recusa(() => fh.cadastrarFilho(db, ctx, { nome: "Ana", nascimento: "2000-01-01" }, HOJE), 400, /25 anos/);
  recusa(() => fh.cadastrarFilho(db, ctx, { nome: "Ana", nascimento: "2019-02-30" }, HOJE), 400, /data/i);
  recusa(() => fh.cadastrarFilho(db, ctx, { nome: "Ana", idadeAproximada: 26 }, HOJE), 400, /0 a 25/);
  recusa(() => fh.cadastrarFilho(db, ctx, { nome: "Ana", idadeAproximada: -1 }, HOJE), 400, /0 a 25/);
  assert.equal(fh.cadastrarFilho(db, ctx, { nome: "Bebe", idadeAproximada: 0 }, HOJE).idade, 0);

  // Limite de 10 por conta: Marina, Pedro, Joao e Bebe somam 4, mais 6 chegam a 10.
  for (const n of ["A1", "A2", "A3", "A4", "A5", "A6"]) fh.cadastrarFilho(db, ctx, { nome: n }, HOJE);
  recusa(() => fh.cadastrarFilho(db, ctx, { nome: "Onze" }, HOJE), 409, /Limite de 10 filhos por conta/);

  // Editar: renomear para um nome ja usado e corrigir o nascimento.
  recusa(() => fh.atualizarFilho(db, ctx, pedro.id, { nome: "marina" }, HOJE), 409, /Ja existe um filho/);
  const certo = fh.atualizarFilho(db, ctx, pedro.id, { nascimento: "2020-05-01" }, HOJE);
  assert.equal(certo.nascimento, "2020-05-01");
  assert.equal(certo.idade, 6);
  assert.equal(certo.idadeAproximada, false);
});

test("fundacao: resolver o filho pelo nome", () => {
  const { repo, db } = contaCom();
  const ctx = ctxDe(repo, titular);
  recusa(() => fh.resolverFilho(db, ctx, null), 404, /Nenhum filho cadastrado/);

  const marina = fh.cadastrarFilho(db, ctx, { nome: "Marina" }, HOJE);
  // Com um filho so, o nome pode faltar.
  assert.equal(fh.resolverFilho(db, ctx, null).id, marina.id);
  assert.equal(fh.resolverFilho(db, ctx, "").id, marina.id);

  const joao = fh.cadastrarFilho(db, ctx, { nome: "João Pedro" }, HOJE);
  assert.equal(fh.resolverFilho(db, ctx, "marina").id, marina.id);
  assert.equal(fh.resolverFilho(db, ctx, "joao pedro").id, joao.id);
  assert.equal(fh.resolverFilho(db, ctx, "Joa").id, joao.id, "prefixo unico");
  recusa(() => fh.resolverFilho(db, ctx, null), 409, /Mais de um filho cadastrado: .*Marina.*Joao Pedro|Mais de um filho cadastrado: .*Marina.*João Pedro/);
  recusa(() => fh.resolverFilho(db, ctx, "Zeca"), 404, /Nao achei filho chamado "Zeca"\. Filhos cadastrados: Marina.*Pergunte ou cadastre/);

  fh.cadastrarFilho(db, ctx, { nome: "Marcelo" }, HOJE);
  recusa(() => fh.resolverFilho(db, ctx, "Mar"), 409, /Mais de um filho combina com "Mar": .*Marina.*Marcelo.*Pergunte de qual/);
  assert.equal(fh.resolverFilho(db, ctx, "Marina").id, marina.id, "nome exato vale mesmo com prefixo repetido");
});

test("fundacao: remover filho, isolamento entre contas e perfis", () => {
  const { repo, db } = contaCom("so_gastos");
  const ctx = ctxDe(repo, titular);
  const ctxBia = ctxDe(repo, bia);
  const ctxOutro = ctxDe(repo, outro);

  const marina = fh.cadastrarFilho(db, ctx, { nome: "Marina", nascimento: "2018-03-12" }, HOJE);
  const dela = fh.cadastrarFilho(db, ctxOutro, { nome: "Marina", nascimento: "2017-01-05" }, HOJE);
  assert.notEqual(marina.id, dela.id);
  assert.deepEqual(fh.listarFilhos(db, ctx, HOJE).map((f) => f.id), [marina.id]);
  assert.deepEqual(fh.listarFilhos(db, ctxOutro, HOJE).map((f) => f.id), [dela.id]);
  assert.equal(fh.resolverFilho(db, ctxOutro, "Marina").id, dela.id);

  // Id de outra conta e como se nao existisse.
  recusa(() => fh.atualizarFilho(db, ctxOutro, marina.id, { nome: "X" }, HOJE), 404, /Filho #\d+ nao encontrado/);
  recusa(() => fh.removerFilho(db, ctxOutro, marina.id), 404, /Filho #\d+ nao encontrado/);

  // Perfil so gastos nao tem agenda: nada de filhos.
  assert.throws(() => fh.listarFilhos(db, ctxBia, HOJE), SemPermissao);
  assert.throws(() => fh.cadastrarFilho(db, ctxBia, { nome: "Ana" }, HOJE), SemPermissao);
  assert.throws(() => fh.removerFilho(db, ctxBia, marina.id), SemPermissao);

  // Remover apaga compromissos e vacinas do filho, so dele, na mesma transacao.
  const evento = db.prepare(
    `INSERT INTO child_events (phone, created_by, child_id, kind, title, created_on, created_at) VALUES (?, ?, ?, 'outro', ?, ?, ?)`,
  );
  evento.run(titular, titular, marina.id, "Reuniao da escola", HOJE, "2026-11-10T10:00:00.000Z");
  evento.run(titular, titular, marina.id, "Dentista", HOJE, "2026-11-10T10:00:00.000Z");
  evento.run(outro, outro, dela.id, "Natacao", HOJE, "2026-11-10T10:00:00.000Z");
  db.prepare(`INSERT INTO child_vaccines (phone, created_by, child_id, name, applied_on, created_at) VALUES (?, ?, ?, ?, ?, ?)`).run(
    titular, titular, marina.id, "Gripe", "2026-11-01", "2026-11-10T10:00:00.000Z",
  );
  assert.deepEqual(fh.removerFilho(db, ctx, marina.id), { compromissos: 2, vacinas: 1 });
  const resto = (tabela: string) => (db.prepare(`SELECT COUNT(*) AS n FROM ${tabela}`).get() as { n: number }).n;
  assert.equal(resto("children"), 1);
  assert.equal(resto("child_events"), 1, "o compromisso da outra conta fica");
  assert.equal(resto("child_vaccines"), 0);

  // Apagar tudo da conta nao encosta na dos outros.
  fh.apagarFilhosDaConta(db, titular);
  assert.equal(resto("children"), 1);
  fh.apagarFilhosDaConta(db, outro);
  assert.equal(resto("children") + resto("child_events"), 0);
});

// ---------- US1: registrar compromissos ----------

test("US1: criar compromisso respeita tipo, limites e datas", () => {
  const { repo, db } = contaCom("so_gastos");
  const ctx = ctxDe(repo, titular);
  const marina = fh.cadastrarFilho(db, ctx, { nome: "Marina", nascimento: "2018-03-12" }, HOJE);
  const base = { filhoId: marina.id };

  const prova = fh.criarCompromisso(
    db, ctx, { ...base, tipo: "escola", titulo: "Prova de ciencias", disciplina: "Ciencias", data: "2026-11-13", hora: "08:00" }, HOJE,
  );
  assert.equal(prova.tipo, "escola");
  assert.equal(prova.filhoNome, "Marina");
  assert.equal(prova.disciplina, "Ciencias");
  assert.equal(prova.data, "2026-11-13");
  assert.equal(prova.hora, "08:00");
  assert.equal(prova.situacao, "aberto");
  assert.equal(prova.aMarcar, false);
  assert.equal(prova.virtual, false);
  assert.equal(prova.presenteSituacao, null);
  assert.equal(prova.repetirMeses, null);

  const festa = fh.criarCompromisso(
    db, ctx,
    { ...base, tipo: "aniversario_amigo", titulo: "Aniversario do Joao", amigo: "Joao", presente: "quebra-cabeca", local: "Buffet Alegria", data: "2026-11-14", hora: "15:00" },
    HOJE,
  );
  assert.equal(festa.amigo, "Joao");
  assert.equal(festa.presente, "quebra-cabeca");
  assert.equal(festa.presenteSituacao, "por_comprar");
  assert.equal(festa.repetirMeses, 12);
  const linha = db.prepare(`SELECT anchor_md, repeat_months, created_by, created_on FROM child_events WHERE id = ?`).get(festa.id) as Record<string, unknown>;
  assert.deepEqual(linha, { anchor_md: "11-14", repeat_months: 12, created_by: titular, created_on: HOJE });

  // Sem data vira "a marcar", sem hora.
  const marcar = fh.criarCompromisso(db, ctx, { ...base, tipo: "consulta", titulo: "Pediatra" }, HOJE);
  assert.equal(marcar.aMarcar, true);
  assert.equal(marcar.data, null);
  assert.equal(marcar.hora, null);
  assert.equal(fh.criarCompromisso(db, ctx, { ...base, tipo: "outro", titulo: "Hoje mesmo", data: HOJE }, HOJE).data, HOJE, "hoje vale");

  // Hora precisa de data; data e hora precisam existir.
  recusa(() => fh.criarCompromisso(db, ctx, { ...base, tipo: "outro", titulo: "X", hora: "09:00" }, HOJE), 400, /hora/i);
  recusa(() => fh.criarCompromisso(db, ctx, { ...base, tipo: "outro", titulo: "X", data: "2026-02-30" }, HOJE), 400, /data/i);
  recusa(() => fh.criarCompromisso(db, ctx, { ...base, tipo: "outro", titulo: "X", data: "2026-11-20", hora: "25:00" }, HOJE), 400, /hora/i);
  recusa(() => fh.criarCompromisso(db, ctx, { ...base, tipo: "xyz" as never, titulo: "X", data: "2026-11-20" }, HOJE), 400, /tipo/i);

  // Campo de outro tipo e recusado, nao ignorado.
  recusa(() => fh.criarCompromisso(db, ctx, { ...base, tipo: "escola", titulo: "X", amigo: "Joao" }, HOJE), 400, /amigo/);
  recusa(() => fh.criarCompromisso(db, ctx, { ...base, tipo: "consulta", titulo: "X", presente: "livro" }, HOJE), 400, /presente/);
  recusa(() => fh.criarCompromisso(db, ctx, { ...base, tipo: "aniversario_amigo", titulo: "X", disciplina: "Ingles" }, HOJE), 400, /disciplina/);

  // Limites: titulo 1 a 80, amigo 1 a 40, presente ate 80, local ate 80, observacao ate 300.
  recusa(() => fh.criarCompromisso(db, ctx, { ...base, tipo: "outro", titulo: "" }, HOJE), 400, /1 a 80/);
  recusa(() => fh.criarCompromisso(db, ctx, { ...base, tipo: "outro", titulo: "x".repeat(81) }, HOJE), 400, /1 a 80/);
  recusa(() => fh.criarCompromisso(db, ctx, { ...base, tipo: "aniversario_amigo", titulo: "X", amigo: "x".repeat(41) }, HOJE), 400, /amigo/);
  recusa(() => fh.criarCompromisso(db, ctx, { ...base, tipo: "aniversario_amigo", titulo: "X", presente: "x".repeat(81) }, HOJE), 400, /presente/);
  recusa(() => fh.criarCompromisso(db, ctx, { ...base, tipo: "outro", titulo: "X", local: "x".repeat(81) }, HOJE), 400, /local/);
  recusa(() => fh.criarCompromisso(db, ctx, { ...base, tipo: "outro", titulo: "X", observacao: "x".repeat(301) }, HOJE), 400, /observacao/);
  fh.criarCompromisso(db, ctx, { ...base, tipo: "outro", titulo: "x".repeat(80), local: "x".repeat(80), observacao: "x".repeat(300) }, HOJE);

  // Antecedencia de 0 a 60; repeticao de 1 a 24, so em consulta; aniversario de amigo e sempre anual.
  recusa(() => fh.criarCompromisso(db, ctx, { ...base, tipo: "outro", titulo: "X", data: "2026-12-01", antecedenciaDias: 61 }, HOJE), 400, /0 a 60/);
  recusa(() => fh.criarCompromisso(db, ctx, { ...base, tipo: "outro", titulo: "X", data: "2026-12-01", antecedenciaDias: -1 }, HOJE), 400, /0 a 60/);
  assert.equal(fh.criarCompromisso(db, ctx, { ...base, tipo: "outro", titulo: "X", data: "2026-12-01", antecedenciaDias: 7 }, HOJE).antecedenciaDias, 7);
  recusa(() => fh.criarCompromisso(db, ctx, { ...base, tipo: "consulta", titulo: "X", repetirMeses: 0 }, HOJE), 400, /1 a 24/);
  recusa(() => fh.criarCompromisso(db, ctx, { ...base, tipo: "consulta", titulo: "X", repetirMeses: 25 }, HOJE), 400, /1 a 24/);
  recusa(() => fh.criarCompromisso(db, ctx, { ...base, tipo: "escola", titulo: "X", repetirMeses: 6 }, HOJE), 400, /so vale para consultas/);
  assert.equal(fh.criarCompromisso(db, ctx, { ...base, tipo: "consulta", titulo: "Pediatra", data: "2026-12-02", repetirMeses: 6 }, HOJE).repetirMeses, 6);

  // Data no passado pede confirmacao; com ela vira registro concluido, sem aviso.
  recusa(() => fh.criarCompromisso(db, ctx, { ...base, tipo: "consulta", titulo: "Dentista", data: "2026-11-09" }, HOJE), 400, /ja passou/);
  const feito = fh.criarCompromisso(db, ctx, { ...base, tipo: "consulta", titulo: "Dentista", data: "2026-11-09", jaAconteceu: true }, HOJE);
  assert.equal(feito.situacao, "concluido");

  // Filho de outra conta nao existe; so gastos nao tem agenda.
  const dela = fh.cadastrarFilho(db, ctxDe(repo, outro), { nome: "Lia" }, HOJE);
  recusa(() => fh.criarCompromisso(db, ctx, { filhoId: dela.id, tipo: "outro", titulo: "X" }, HOJE), 404, /Filho #\d+ nao encontrado/);
  assert.throws(() => fh.criarCompromisso(db, ctxDe(repo, bia), { ...base, tipo: "outro", titulo: "X" }, HOJE), SemPermissao);
});

const DIA = "(domingo|segunda|terca|quarta|quinta|sexta|sabado)";
/** As ferramentas leem o dia real; estas datas sao relativas e a conta de cada teste e nova. */
const em = (n: number) => av.addDias(localDate(), n);
const total = (db: ReturnType<typeof openDb>, tabela: string) => (db.prepare(`SELECT COUNT(*) AS n FROM ${tabela}`).get() as { n: number }).n;

test("US1: ferramentas de filhos e de compromisso pela conversa", () => {
  const { repo, db } = contaCom("so_gastos");
  const ctx = ctxDe(repo, titular);
  const rodar = (nome: string, entrada: object, quem = ctx) => executeTool(repo, quem, nome, entrada);

  assert.equal(rodar("listar_filhos", {}), "Nenhum filho cadastrado.");
  assert.match(rodar("cadastrar_filho", { nome: "Marina", nascimento: "2018-03-12" }), /^Filho cadastrado: #\d+ Marina, \d+ anos?\.$/);
  assert.match(rodar("listar_filhos", {}), /#\d+ Marina, \d+ anos?/);
  assert.match(rodar("cadastrar_filho", { nome: "marina" }), /Ja existe um filho com esse nome/);

  // Com um filho so, o nome pode faltar.
  const prova = rodar("registrar_compromisso_filho", { tipo: "escola", titulo: "Prova de ciencias", data: em(3), hora: "08:00", disciplina: "Ciencias" });
  assert.match(prova, new RegExp(`^Registrado: #\\d+ Prova de ciencias \\(Marina\\), ${DIA} \\d{2}/\\d{2} as 08:00\\. Aviso na vespera\\.$`));

  // Sem data nao grava como se fosse hoje.
  assert.match(rodar("registrar_compromisso_filho", { tipo: "consulta", titulo: "Pediatra" }), /^Registrado como a marcar: #\d+ Pediatra \(Marina\)\. Te lembro toda semana ate marcar\.$/);

  // Com dois filhos e sem nome, a ferramenta manda perguntar e nao grava nada.
  rodar("cadastrar_filho", { nome: "Pedro", idade_aproximada: 6 });
  const antes = total(db, "child_events");
  assert.match(rodar("registrar_compromisso_filho", { tipo: "escola", titulo: "Prova de matematica", data: em(4) }), /Mais de um filho cadastrado: Marina, Pedro\. Pergunte de qual/);
  assert.equal(total(db, "child_events"), antes);
  assert.match(rodar("cadastrar_filho", { nome: "Ana" }), /nao aviso o aniversario de Ana/);

  // Aniversario de amigo: presente e aviso 3 dias antes e na vespera.
  const festa = rodar("registrar_compromisso_filho", {
    filho: "Pedro", tipo: "aniversario_amigo", titulo: "Aniversario do Joao", amigo: "Joao", presente: "quebra-cabeca", data: em(5), hora: "15:00",
  });
  assert.match(festa, new RegExp(`Aniversario do Joao \\(Pedro\\), ${DIA} \\d{2}/\\d{2} as 15:00\\. Presente: quebra-cabeca \\(por comprar\\)\\. Aviso 3 dias antes e na vespera\\.$`));

  // Antecedencia pedida troca o padrao.
  assert.match(
    rodar("registrar_compromisso_filho", { filho: "pedro", tipo: "consulta", titulo: "Dentista", data: em(20), avisar_dias_antes: 7 }),
    /Aviso 7 dias antes\.$/,
  );

  // Data que ja passou volta como pergunta; confirmada, vira registro concluido.
  const ontem = em(-1);
  assert.match(
    rodar("registrar_compromisso_filho", { filho: "Pedro", tipo: "consulta", titulo: "Oculista", data: ontem }),
    /A data ja passou\. Pergunte se e um registro do que ja aconteceu; se for, chame de novo com ja_aconteceu true\./,
  );
  assert.match(
    rodar("registrar_compromisso_filho", { filho: "Pedro", tipo: "consulta", titulo: "Oculista", data: ontem, ja_aconteceu: true }),
    /Registrado como ja aconteceu: #\d+ Oculista \(Pedro\).*Sem aviso\./,
  );

  // Filho que nao existe.
  assert.match(rodar("registrar_compromisso_filho", { filho: "Zeca", tipo: "outro", titulo: "X", data: em(2) }), /Nao achei filho chamado "Zeca"/);

  // Remover pede confirmacao e conta o que some.
  assert.match(rodar("remover_filho", { filho: "Marina", confirmado: false }), /^Confirme com o usuario antes de remover Marina: apago tambem 2 compromissos e 0 vacinas\. Nao tem volta\.$/);
  assert.equal(total(db, "children"), 3);
  assert.match(rodar("remover_filho", { filho: "Marina", confirmado: true }), /^Removi Marina, com 2 compromissos e 0 vacinas\.$/);
  assert.equal(total(db, "children"), 2);

  // So gastos nao tem agenda.
  const daBia = ctxDe(repo, bia);
  for (const [nome, entrada] of [
    ["cadastrar_filho", { nome: "Ana" }],
    ["listar_filhos", {}],
    ["remover_filho", { filho: "Pedro", confirmado: true }],
    ["registrar_compromisso_filho", { filho: "Pedro", tipo: "outro", titulo: "X" }],
  ] as const) {
    assert.match(rodar(nome, entrada, daBia), /Sem permissao/, nome);
  }
  assert.equal(total(db, "children"), 2);
});

// ---------- US2: avisos ----------

test("US2: o aviso de cada compromisso sai na antecedencia certa, sem repetir nem voltar atras", () => {
  const { repo, db } = contaCom();
  const ctx = ctxDe(repo, titular);
  const CRIADO = "2026-11-01";
  const marina = fh.cadastrarFilho(db, ctx, { nome: "Marina", nascimento: "2018-03-12" }, CRIADO);
  const pedro = fh.cadastrarFilho(db, ctx, { nome: "Pedro", idadeAproximada: 6 }, CRIADO);
  const criar = (filhoId: number, d: Omit<Parameters<typeof fh.criarCompromisso>[2], "filhoId">, hoje = CRIADO) =>
    fh.criarCompromisso(db, ctx, { filhoId, ...d }, hoje);
  // So os avisos de compromisso; o aniversario do proprio filho tem outra chave.
  const devidos = (hoje: string, id?: number | null) =>
    fh.avisosDevidos(db, titular, hoje).filter((a) => a.chave.startsWith(id ? `filho:${id}:` : "filho:"));

  // Escola, vacina, consulta e outro avisam na vespera.
  const prova = criar(marina.id, { tipo: "escola", titulo: "Prova de ciencias", disciplina: "Ciencias", data: "2026-11-13", hora: "08:00" });
  assert.deepEqual(devidos("2026-11-11", prova.id), []);
  const vespera = devidos("2026-11-12", prova.id);
  assert.equal(vespera.length, 1);
  assert.equal(vespera[0].chave, `filho:${prova.id}:2026-11-13:1`);
  assert.match(vespera[0].texto, /Marina: Prova de ciencias \(Ciencias\) amanha, sexta 13\/11 as 08:00\./);
  // No proprio dia ainda sai, com a mesma chave, para quem ficou com o agendador parado.
  const noDia = devidos("2026-11-13", prova.id);
  assert.equal(noDia[0].chave, vespera[0].chave);
  assert.match(noDia[0].texto, /Prova de ciencias \(Ciencias\) hoje, sexta 13\/11 as 08:00\./);
  assert.deepEqual(devidos("2026-11-14", prova.id), [], "depois da data nao avisa mais");

  // Aniversario de amigo: 3 dias antes, com o presente, e na vespera.
  const festa = criar(pedro.id, {
    tipo: "aniversario_amigo", titulo: "Aniversario do Joao", amigo: "Joao", presente: "quebra-cabeca", data: "2026-11-14", hora: "15:00",
  });
  const tres = devidos("2026-11-11", festa.id);
  assert.deepEqual(tres.map((a) => a.chave), [`filho:${festa.id}:2026-11-14:3`]);
  assert.match(tres[0].texto, /Pedro: Aniversario do Joao em 3 dias, sabado 14\/11 as 15:00\. Presente: quebra-cabeca \(por comprar\)\./);
  assert.deepEqual(devidos("2026-11-12", festa.id).map((a) => a.chave), [`filho:${festa.id}:2026-11-14:3`], "entre os dois avisos so existe o de 3 dias");
  const ontem = devidos("2026-11-13", festa.id);
  assert.deepEqual(ontem.map((a) => a.chave), [`filho:${festa.id}:2026-11-14:1`]);
  assert.match(ontem[0].texto, /Pedro: Aniversario do Joao amanha, sabado 14\/11 as 15:00\. Presente: quebra-cabeca \(por comprar\)\./);
  // Presente comprado: a vespera nao cita mais o presente.
  db.prepare(`UPDATE child_events SET gift_status = 'comprado' WHERE id = ?`).run(festa.id);
  const semPresente = devidos("2026-11-13", festa.id)[0].texto;
  assert.match(semPresente, /amanha, sabado 14\/11 as 15:00\.$/);
  assert.doesNotMatch(semPresente, /Presente/);

  // Antecedencia pedida vale no lugar da padrao, e so ela.
  const consulta = criar(pedro.id, { tipo: "consulta", titulo: "Dentista", data: "2026-11-20", antecedenciaDias: 7 });
  assert.deepEqual(devidos("2026-11-12", consulta.id), []);
  assert.deepEqual(devidos("2026-11-13", consulta.id).map((a) => a.chave), [`filho:${consulta.id}:2026-11-20:7`]);
  assert.match(devidos("2026-11-13", consulta.id)[0].texto, /Dentista em 7 dias, sexta 20\/11\./);
  assert.deepEqual(devidos("2026-11-19", consulta.id).map((a) => a.chave), [`filho:${consulta.id}:2026-11-20:7`], "sem aviso extra na vespera");

  // Vacina, consulta e outro: padrao de 1 dia.
  const vacina = criar(marina.id, { tipo: "vacina", titulo: "Gripe", data: "2026-11-25", local: "Posto 12" });
  assert.deepEqual(devidos("2026-11-23", vacina.id), []);
  assert.match(devidos("2026-11-24", vacina.id)[0].texto, /Marina: Gripe amanha, quarta 25\/11\. Local: Posto 12\./);

  // Concluido, cancelado e sem data nao avisam.
  for (const status of ["concluido", "cancelado"]) {
    db.prepare(`UPDATE child_events SET status = ? WHERE id = ?`).run(status, prova.id);
    assert.deepEqual(devidos("2026-11-12", prova.id), [], status);
  }
  db.prepare(`UPDATE child_events SET status = 'aberto' WHERE id = ?`).run(prova.id);
  const marcar = criar(marina.id, { tipo: "consulta", titulo: "Pediatra" });
  for (const dia of ["2026-11-12", "2026-12-01"]) assert.deepEqual(devidos(dia, marcar.id), []);

  // Sem aviso retroativo: o aviso cairia no dia em que o usuario acabou de registrar.
  const tardio = criar(marina.id, { tipo: "outro", titulo: "Reuniao", data: "2026-11-13" }, "2026-11-12");
  for (const dia of ["2026-11-12", "2026-11-13"]) assert.deepEqual(devidos(dia, tardio.id), [], dia);
  const cedo = criar(marina.id, { tipo: "outro", titulo: "Feira", data: "2026-11-12" }, "2026-11-10");
  assert.equal(devidos("2026-11-11", cedo.id).length, 1, "criado antes do dia do aviso");

  // Agendador parado: o aviso sai quando volta, enquanto a data nao passou.
  const longe = criar(marina.id, { tipo: "outro", titulo: "Passeio", data: "2026-11-20" });
  assert.match(devidos("2026-11-20", longe.id)[0].texto, /Passeio hoje, sexta 20\/11\./);
  assert.deepEqual(devidos("2026-11-21", longe.id), []);

  // Remarcar muda a chave: o aviso da data antiga nao sai e o da nova sai.
  db.prepare(`UPDATE child_events SET due_on = '2026-11-18' WHERE id = ?`).run(prova.id);
  assert.deepEqual(devidos("2026-11-12", prova.id), []);
  assert.equal(devidos("2026-11-17", prova.id)[0].chave, `filho:${prova.id}:2026-11-18:1`);

  // Outra conta nao ve nada disso.
  assert.deepEqual(fh.avisosDevidos(db, outro, "2026-11-12"), []);
});

test("US2: aniversario do filho, aniversario de amigo que volta todo ano e 29 de fevereiro", () => {
  const { repo, db } = contaCom();
  const ctx = ctxDe(repo, titular);
  const marina = fh.cadastrarFilho(db, ctx, { nome: "Marina", nascimento: "2018-03-12" }, "2026-01-01");
  const pedro = fh.cadastrarFilho(db, ctx, { nome: "Pedro", idadeAproximada: 6 }, "2026-01-01");
  const bissexta = fh.cadastrarFilho(db, ctx, { nome: "Dia29", nascimento: "2020-02-29" }, "2026-01-01");
  const aniv = (id: number, hoje: string) => fh.avisosDevidos(db, titular, hoje).filter((a) => a.chave.startsWith(`filho-aniv:${id}:`));

  // 7 dias antes, com a idade que completa, e no proprio dia.
  assert.deepEqual(aniv(marina.id, "2027-03-04"), []);
  const sete = aniv(marina.id, "2027-03-05");
  assert.equal(sete.length, 1);
  assert.equal(sete[0].chave, `filho-aniv:${marina.id}:2027`);
  assert.match(sete[0].texto, /Marina faz 9 anos em 7 dias, sexta 12\/03\./);
  assert.match(aniv(marina.id, "2027-03-12")[0].texto, /Marina faz 9 anos hoje, sexta 12\/03\./);
  assert.deepEqual(aniv(marina.id, "2027-03-13"), []);

  // Sem data de nascimento nao ha aniversario, em dia nenhum.
  for (let i = 0; i < 400; i++) assert.deepEqual(aniv(pedro.id, av.addDias("2026-11-01", i)), []);

  // 29 de fevereiro vale 28 em ano comum e 29 em ano bissexto.
  assert.deepEqual(aniv(bissexta.id, "2027-02-20"), []);
  assert.match(aniv(bissexta.id, "2027-02-21")[0].texto, /Dia29 faz 7 anos em 7 dias, \w+ 28\/02\./);
  assert.match(aniv(bissexta.id, "2028-02-22")[0].texto, /Dia29 faz 8 anos em 7 dias, \w+ 29\/02\./);
  assert.equal(aniv(bissexta.id, "2028-02-22")[0].chave, `filho-aniv:${bissexta.id}:2028`);

  // Cadastrado dentro da janela: o aviso do ano ja teria passado; o do ano seguinte sai.
  const ana = fh.cadastrarFilho(db, ctx, { nome: "Ana", nascimento: "2019-11-15" }, "2026-11-10");
  assert.deepEqual(aniv(ana.id, "2026-11-12"), []);
  assert.equal(aniv(ana.id, "2027-11-08").length, 1);
});

test("US2: aniversario de amigo volta todo ano, com o presente por comprar, e o aviso sai uma vez por ano", () => {
  const { repo, db } = contaCom();
  const ctx = ctxDe(repo, titular);
  const pedro = fh.cadastrarFilho(db, ctx, { nome: "Pedro", idadeAproximada: 6 }, "2026-11-01");
  const festa = fh.criarCompromisso(
    db, ctx,
    { filhoId: pedro.id, tipo: "aniversario_amigo", titulo: "Aniversario do Joao", amigo: "Joao", presente: "quebra-cabeca", data: "2026-11-14" },
    "2026-11-01",
  );
  const linha = () => db.prepare(`SELECT due_on, gift_status, gift_idea, status FROM child_events WHERE id = ?`).get(festa.id) as Record<string, unknown>;

  // No proprio dia ainda nao venceu; no dia seguinte volta para o ano que vem.
  assert.equal(fh.avancarRepetidos(db, "2026-11-14"), 0);
  assert.equal(linha().due_on, "2026-11-14");
  db.prepare(`UPDATE child_events SET gift_status = 'comprado' WHERE id = ?`).run(festa.id);
  assert.equal(fh.avancarRepetidos(db, "2026-11-15"), 1);
  assert.deepEqual(linha(), { due_on: "2027-11-14", gift_status: "por_comprar", gift_idea: "quebra-cabeca", status: "aberto" });
  assert.equal(fh.avancarRepetidos(db, "2026-11-16"), 0, "ja esta no futuro");

  // Tres anos simulados dia a dia: um aviso de 3 dias e um de vespera por ano.
  const { db: db2, repo: repo2 } = contaCom();
  const ctx2 = ctxDe(repo2, titular);
  const pedro2 = fh.cadastrarFilho(db2, ctx2, { nome: "Pedro" }, "2026-11-01");
  fh.criarCompromisso(
    db2, ctx2,
    { filhoId: pedro2.id, tipo: "aniversario_amigo", titulo: "Aniversario do Joao", amigo: "Joao", presente: "quebra-cabeca", data: "2026-11-14" },
    "2026-11-01",
  );
  const chaves = new Set<string>();
  const textos: Record<string, string> = {};
  for (let dia = "2026-11-01"; dia <= "2029-11-30"; dia = av.addDias(dia, 1)) {
    fh.avancarRepetidos(db2, dia);
    for (const a of fh.avisosDevidos(db2, titular, dia).filter((x) => x.chave.startsWith("filho:"))) {
      chaves.add(a.chave);
      textos[a.chave] = a.texto;
    }
  }
  const esperadas = [2026, 2027, 2028, 2029].flatMap((ano) => [`:${ano}-11-14:3`, `:${ano}-11-14:1`]);
  assert.deepEqual([...chaves].map((c) => c.replace(/^filho:\d+/, "")).sort(), esperadas.sort());
  assert.match(textos[[...chaves].find((c) => c.endsWith(":2027-11-14:3"))!], /Presente: quebra-cabeca \(por comprar\)/, "o presente volta por comprar");

  // 29 de fevereiro: em ano comum o aniversario cai no dia 28 e volta ao 29 no bissexto.
  const { db: db3, repo: repo3 } = contaCom();
  const ctx3 = ctxDe(repo3, titular);
  const filho3 = fh.cadastrarFilho(db3, ctx3, { nome: "Pedro" }, "2028-01-10");
  const bissexto = fh.criarCompromisso(db3, ctx3, { filhoId: filho3.id, tipo: "aniversario_amigo", titulo: "Festa", data: "2028-02-29" }, "2028-01-10");
  const dueEm = (hoje: string) => {
    fh.avancarRepetidos(db3, hoje);
    return (db3.prepare(`SELECT due_on FROM child_events WHERE id = ?`).get(bissexto.id) as { due_on: string }).due_on;
  };
  assert.equal(dueEm("2028-03-01"), "2029-02-28");
  assert.equal(dueEm("2029-03-01"), "2030-02-28");
  assert.equal(dueEm("2030-03-01"), "2031-02-28");
  assert.equal(dueEm("2031-03-01"), "2032-02-29");
});

test("US2: o agendador avisa cada responsavel uma vez, respeitando perfil, preferencia e hora", async () => {
  const preparar = (perfil?: PerfilMembro) => {
    const { repo, db } = contaCom(perfil);
    const ctx = ctxDe(repo, titular);
    const marina = fh.cadastrarFilho(db, ctx, { nome: "Marina" }, "2026-11-01");
    fh.criarCompromisso(db, ctx, { filhoId: marina.id, tipo: "escola", titulo: "Prova de ciencias", data: "2026-11-13", hora: "08:00" }, "2026-11-01");
    return { repo, db, ctx, marina };
  };
  const donos = (enviados: { para: string; texto: string }[]) => enviados.filter((e) => /Prova de ciencias/.test(e.texto)).map((e) => e.para).sort();

  // Titular e membro com agenda recebem cada um o seu, uma unica vez, e so a partir da hora.
  {
    const { repo } = preparar("agenda_tarefas");
    const { enviados, send } = coletor();
    await rodarAvisos(repo, send, as("2026-11-12", "08:30"));
    assert.deepEqual(donos(enviados), [], "antes da hora escolhida");
    await rodarAvisos(repo, send, as("2026-11-12", "09:00"));
    assert.deepEqual(donos(enviados), [bia, titular].sort());
    await rodarAvisos(repo, send, as("2026-11-12", "09:01"));
    await rodarAvisos(repo, send, as("2026-11-12", "15:00"));
    assert.equal(donos(enviados).length, 2, "uma vez por pessoa");
  }

  // So gastos nao tem agenda: nao recebe.
  {
    const { repo } = preparar("so_gastos");
    const { enviados, send } = coletor();
    await rodarAvisos(repo, send, as("2026-11-12", "09:00"));
    assert.deepEqual(donos(enviados), [titular]);
  }

  // Preferencia desligada nao envia; hora escolhida adia.
  {
    const { repo, db } = preparar("agenda_tarefas");
    av.definirPreferencia(db, bia, "filhos", { ligado: false });
    av.definirPreferencia(db, titular, "filhos", { ligado: true, hora: 10 });
    const { enviados, send } = coletor();
    await rodarAvisos(repo, send, as("2026-11-12", "09:30"));
    assert.deepEqual(donos(enviados), []);
    await rodarAvisos(repo, send, as("2026-11-12", "10:00"));
    assert.deepEqual(donos(enviados), [titular]);
  }

  // Fora da janela de 24 horas a Meta recusa: o aviso vai para a fila e sai na proxima conversa.
  {
    const { repo, db } = preparar("agenda_tarefas");
    const { send } = coletor(true);
    await rodarAvisos(repo, send, as("2026-11-12", "09:00"));
    const fila = db.prepare(`SELECT phone FROM pending_notices WHERE text LIKE '%Prova de ciencias%' AND delivered_at IS NULL`).all() as { phone: string }[];
    assert.deepEqual(fila.map((l) => l.phone).sort(), [bia, titular].sort());
  }

  // Lembrete semanal do que esta "a marcar", uma vez por semana ISO.
  {
    const { repo, db, ctx, marina } = preparar();
    fh.criarCompromisso(db, ctx, { filhoId: marina.id, tipo: "consulta", titulo: "Pediatra" }, "2026-11-01");
    const { enviados, send } = coletor();
    const lembretes = () => enviados.filter((e) => /Ainda sem data/.test(e.texto));
    await rodarAvisos(repo, send, as("2026-11-10", "09:00"));
    assert.equal(lembretes().length, 1);
    assert.match(lembretes()[0].texto, /Pediatra \(Marina\)/);
    await rodarAvisos(repo, send, as("2026-11-11", "09:00"));
    assert.equal(lembretes().length, 1, "mesma semana");
    await rodarAvisos(repo, send, as("2026-11-16", "09:00"));
    assert.equal(lembretes().length, 2, "semana seguinte");
  }

  // O resumo da manha traz os compromissos dos filhos do dia.
  {
    const { repo } = preparar();
    const resumo = buildDailySummary(repo, titular, as("2026-11-13", "07:30"));
    assert.match(resumo ?? "", /Filhos hoje: Marina: Prova de ciencias, 08:00/);
    const { enviados, send } = coletor();
    await rodarAvisos(repo, send, as("2026-11-13", "07:30"));
    assert.equal(enviados.filter((e) => /Bom dia! Seu resumo:/.test(e.texto) && /Marina: Prova de ciencias/.test(e.texto)).length, 1);
  }
});

test("US2: ligar e desligar o aviso dos filhos pela conversa", () => {
  const { repo, db } = contaCom("so_gastos");
  const ctx = ctxDe(repo, titular);
  const ligado = () => av.preferencias(db, ctx).find((p) => p.tipo === "filhos")!.ligado;
  assert.equal(ligado(), true, "padrao ligado para quem tem agenda");
  assert.match(executeTool(repo, ctx, "configurar_avisos", { tipo: "filhos", ligado: false }), /^Compromissos dos filhos desligado\.$/);
  assert.equal(ligado(), false);
  assert.match(executeTool(repo, ctx, "configurar_avisos", { tipo: "filhos", ligado: true, hora: 8 }), /^Compromissos dos filhos ligado, as 8h\.$/);
  // So gastos nao tem agenda, entao o aviso nao se aplica.
  assert.match(executeTool(repo, ctxDe(repo, bia), "configurar_avisos", { tipo: "filhos", ligado: true }), /nao se aplica ao acesso/);
});

// ---------- US3: consultar e atualizar ----------

/** Conta com tres filhos e compromissos de todo tipo, criados em 2026-11-01. */
function contaComAgenda() {
  const { repo, db } = contaCom("so_gastos");
  const ctx = ctxDe(repo, titular);
  const CRIADO = "2026-11-01";
  const marina = fh.cadastrarFilho(db, ctx, { nome: "Marina", nascimento: "2018-03-12" }, CRIADO);
  const pedro = fh.cadastrarFilho(db, ctx, { nome: "Pedro", idadeAproximada: 6 }, CRIADO);
  const ana = fh.cadastrarFilho(db, ctx, { nome: "Ana", nascimento: "2019-11-18" }, CRIADO);
  const criar = (filhoId: number, d: Omit<Parameters<typeof fh.criarCompromisso>[2], "filhoId">) =>
    fh.criarCompromisso(db, ctx, { filhoId, ...d }, CRIADO);
  const prova = criar(marina.id, { tipo: "escola", titulo: "Prova de ciencias", data: "2026-11-13", hora: "08:00" });
  const gripe = criar(marina.id, { tipo: "vacina", titulo: "Gripe", data: "2026-11-25" });
  const festa = criar(pedro.id, { tipo: "aniversario_amigo", titulo: "Aniversario do Joao", amigo: "Joao", presente: "quebra-cabeca", data: "2026-11-14", hora: "15:00" });
  const dentista = criar(pedro.id, { tipo: "consulta", titulo: "Dentista", data: "2026-12-20" });
  const pediatra = criar(pedro.id, { tipo: "consulta", titulo: "Pediatra" });
  const reuniao = criar(marina.id, { tipo: "outro", titulo: "Reuniao", data: "2026-11-12" });
  const passeio = criar(pedro.id, { tipo: "outro", titulo: "Passeio", data: "2026-11-15" });
  db.prepare(`UPDATE child_events SET status = 'concluido' WHERE id = ?`).run(reuniao.id);
  db.prepare(`UPDATE child_events SET status = 'cancelado' WHERE id = ?`).run(passeio.id);
  return { repo, db, ctx, marina, pedro, ana, prova, gripe, festa, dentista, pediatra, reuniao, passeio };
}

test("US3: listar o que vem por ai por filho, na semana e a marcar", () => {
  const { repo, db, ctx, marina, pedro, ana, prova, gripe, festa, dentista, pediatra, reuniao, passeio } = contaComAgenda();
  const titulos = (l: { titulo: string }[]) => l.map((c) => c.titulo);

  // Padrao: de hoje a 30 dias, em ordem de data, com o aniversario do filho no meio.
  const lista = fh.listarCompromissos(db, ctx, {}, HOJE);
  assert.deepEqual(titulos(lista.compromissos), ["Prova de ciencias", "Aniversario do Joao", "Aniversario de Ana, 7 anos", "Gripe"]);
  const virtual = lista.compromissos[2];
  assert.deepEqual([virtual.id, virtual.virtual, virtual.tipo, virtual.filhoId, virtual.filhoNome, virtual.data], [null, true, "aniversario", ana.id, "Ana", "2026-11-18"]);
  assert.deepEqual(titulos(lista.aMarcar), ["Pediatra"]);
  assert.equal(lista.aMarcar[0].aMarcar, true);
  // A semana vai de hoje a 6 dias depois, de todos os filhos, sem filtro.
  assert.deepEqual(titulos(lista.semana), ["Prova de ciencias", "Aniversario do Joao"]);
  assert.deepEqual(titulos(fh.listarCompromissos(db, ctx, { filhoId: pedro.id, tipo: "vacina" }, HOJE).semana), ["Prova de ciencias", "Aniversario do Joao"]);

  // Filtros por filho, tipo e periodo.
  assert.deepEqual(titulos(fh.listarCompromissos(db, ctx, { filhoId: pedro.id }, HOJE).compromissos), ["Aniversario do Joao"]);
  assert.deepEqual(titulos(fh.listarCompromissos(db, ctx, { filhoId: pedro.id, ate: "2026-12-31" }, HOJE).compromissos), ["Aniversario do Joao", "Dentista"]);
  assert.deepEqual(titulos(fh.listarCompromissos(db, ctx, { tipo: "vacina" }, HOJE).compromissos), ["Gripe"]);
  assert.deepEqual(titulos(fh.listarCompromissos(db, ctx, { tipo: "aniversario" }, HOJE).compromissos), ["Aniversario de Ana, 7 anos"]);
  assert.deepEqual(titulos(fh.listarCompromissos(db, ctx, { tipo: "aniversario_amigo" }, HOJE).compromissos), ["Aniversario do Joao"]);
  assert.deepEqual(titulos(fh.listarCompromissos(db, ctx, { de: "2026-11-14", ate: "2026-11-14" }, HOJE).compromissos), ["Aniversario do Joao"]);
  assert.deepEqual(titulos(fh.listarCompromissos(db, ctx, { filhoId: ana.id }, HOJE).compromissos), ["Aniversario de Ana, 7 anos"]);

  // Concluidos e cancelados saem por padrao e voltam pela situacao; o aniversario do filho nao e concluido.
  assert.deepEqual(titulos(fh.listarCompromissos(db, ctx, { situacao: "concluido" }, HOJE).compromissos), ["Reuniao"]);
  assert.deepEqual(titulos(fh.listarCompromissos(db, ctx, { situacao: "cancelado" }, HOJE).compromissos), ["Passeio"]);
  assert.deepEqual(
    titulos(fh.listarCompromissos(db, ctx, { situacao: "todos" }, HOJE).compromissos),
    ["Reuniao", "Prova de ciencias", "Aniversario do Joao", "Passeio", "Aniversario de Ana, 7 anos", "Gripe"],
  );

  // Periodo vazio devolve vazio, e o "a marcar" continua aparecendo.
  const vazio = fh.listarCompromissos(db, ctx, { de: "2027-01-01", ate: "2027-01-07" }, HOJE);
  assert.deepEqual(vazio.compromissos, []);
  assert.deepEqual(titulos(vazio.aMarcar), ["Pediatra"]);
  recusa(() => fh.listarCompromissos(db, ctx, { de: "2026-13-01" }, HOJE), 400, /data/i);
  recusa(() => fh.listarCompromissos(db, ctx, { filhoId: 99999 }, HOJE), 404, /Filho #99999 nao encontrado/);

  // O proximo compromisso de cada filho, aniversario incluido, sem passado e sem "a marcar".
  const proximo = (nome: string) => fh.listarFilhos(db, ctx, HOJE).find((f) => f.nome === nome)!.proximo;
  assert.equal(proximo("Marina")!.titulo, "Prova de ciencias");
  assert.equal(proximo("Pedro")!.titulo, "Aniversario do Joao");
  assert.equal(proximo("Ana")!.virtual, true);

  // Outra conta e perfil sem agenda nao veem nada.
  const outraConta = ctxDe(repo, outro);
  const dela = fh.listarCompromissos(db, outraConta, {}, HOJE);
  assert.deepEqual([dela.compromissos, dela.aMarcar, dela.semana], [[], [], []]);
  assert.throws(() => fh.listarCompromissos(db, ctxDe(repo, bia), {}, HOJE), SemPermissao);
  void [marina, prova, gripe, festa, dentista, pediatra, reuniao, passeio];
});

test("US3: concluir, cancelar, reabrir, remarcar e marcar o presente como comprado", () => {
  const { repo, db, ctx, prova, festa, pediatra } = contaComAgenda();
  const devidos = (id: number | null, hoje: string) => fh.avisosDevidos(db, titular, hoje).filter((a) => a.chave.startsWith(`filho:${id}:`));
  const atualizar = (id: number | null, d: Parameters<typeof fh.atualizarCompromisso>[3], hoje = HOJE) => fh.atualizarCompromisso(db, ctx, id!, d, hoje);

  // Concluir e cancelar tiram o aviso; reabrir devolve.
  assert.equal(devidos(prova.id, "2026-11-12").length, 1);
  const feita = atualizar(prova.id, { acao: "concluir" });
  assert.equal(feita.compromisso.situacao, "concluido");
  assert.equal(feita.proximo, null);
  assert.equal((db.prepare(`SELECT done_at FROM child_events WHERE id = ?`).get(prova.id) as { done_at: string | null }).done_at !== null, true);
  assert.deepEqual(devidos(prova.id, "2026-11-12"), []);
  assert.equal(atualizar(prova.id, { acao: "cancelar" }).compromisso.situacao, "cancelado");
  assert.deepEqual(devidos(prova.id, "2026-11-12"), []);
  const reaberta = atualizar(prova.id, { acao: "reabrir" });
  assert.equal(reaberta.compromisso.situacao, "aberto");
  assert.equal(devidos(prova.id, "2026-11-12").length, 1);

  // Remarcar: o aviso passa para a data nova e a antiga nao sai mais.
  const remarcada = atualizar(prova.id, { data: "2026-11-18", hora: "09:00" });
  assert.deepEqual([remarcada.compromisso.data, remarcada.compromisso.hora, remarcada.compromisso.titulo], ["2026-11-18", "09:00", "Prova de ciencias"]);
  assert.deepEqual(devidos(prova.id, "2026-11-12"), []);
  assert.equal(devidos(prova.id, "2026-11-17")[0].chave, `filho:${prova.id}:2026-11-18:1`);
  assert.equal(atualizar(prova.id, { hora: "10:30" }).compromisso.data, "2026-11-18", "so a hora muda");
  assert.equal(atualizar(prova.id, { titulo: "Prova de matematica", antecedenciaDias: 2 }).compromisso.antecedenciaDias, 2);
  assert.equal(atualizar(prova.id, { data: null }).compromisso.aMarcar, true, "sem data volta a ser a marcar e sem hora");
  assert.equal(fh.listarCompromissos(db, ctx, {}, HOJE).aMarcar.some((c) => c.id === prova.id), true);
  recusa(() => atualizar(prova.id, { data: "2026-11-09" }), 400, /ja passou/);
  recusa(() => atualizar(prova.id, { hora: "08:00" }), 400, /hora/i);
  recusa(() => atualizar(prova.id, { titulo: "x".repeat(81) }), 400, /1 a 80/);
  recusa(() => atualizar(prova.id, { amigo: "Joao" }), 400, /amigo/);

  // Presente: so aniversario de amigo; comprado some do aviso da vespera.
  assert.match(devidos(festa.id, "2026-11-13")[0].texto, /Presente: quebra-cabeca \(por comprar\)/);
  assert.equal(atualizar(festa.id, { acao: "presente_comprado" }).compromisso.presenteSituacao, "comprado");
  assert.doesNotMatch(devidos(festa.id, "2026-11-13")[0].texto, /Presente/);
  assert.equal(atualizar(festa.id, { acao: "presente_por_comprar" }).compromisso.presenteSituacao, "por_comprar");
  recusa(() => atualizar(pediatra.id, { acao: "presente_comprado" }), 400, /presente/);

  // Concluir o aniversario de um amigo nao o encerra: ele volta no ano que vem, com o presente por comprar.
  atualizar(festa.id, { acao: "presente_comprado" });
  const concluida = atualizar(festa.id, { acao: "concluir" });
  assert.deepEqual(
    [concluida.compromisso.situacao, concluida.compromisso.data, concluida.compromisso.presenteSituacao, concluida.compromisso.presente],
    ["aberto", "2027-11-14", "por_comprar", "quebra-cabeca"],
  );
  assert.equal(atualizar(festa.id, { acao: "cancelar" }).compromisso.situacao, "cancelado", "cancelar encerra de vez");

  // Id de outra conta, id que nao existe e perfil sem agenda.
  const outraConta = ctxDe(repo, outro);
  recusa(() => fh.atualizarCompromisso(db, outraConta, prova.id!, { acao: "concluir" }, HOJE), 404, /Compromisso #\d+ nao encontrado/);
  recusa(() => atualizar(99999, { acao: "concluir" }), 404, /Compromisso #99999 nao encontrado/);
  assert.throws(() => fh.atualizarCompromisso(db, ctxDe(repo, bia), prova.id!, { acao: "concluir" }, HOJE), SemPermissao);

  // Apagar de vez; vacina que apontava para ele perde so o vinculo.
  db.prepare(`INSERT INTO child_vaccines (phone, created_by, child_id, name, applied_on, next_event_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
    titular, titular, prova.filhoId, "Gripe", "2026-05-01", pediatra.id, "2026-05-01T10:00:00.000Z",
  );
  fh.apagarCompromisso(db, ctx, pediatra.id!);
  recusa(() => fh.compromissoDaConta(db, ctx, pediatra.id!), 404, /nao encontrado/);
  assert.equal((db.prepare(`SELECT next_event_id FROM child_vaccines`).get() as { next_event_id: number | null }).next_event_id, null);
  recusa(() => fh.apagarCompromisso(db, outraConta, prova.id!), 404, /nao encontrado/);
});

test("US3: ferramentas de consulta e de atualizacao pela conversa", () => {
  const { repo, db } = contaCom("so_gastos");
  const ctx = ctxDe(repo, titular);
  const rodar = (nome: string, entrada: object, quem = ctx) => executeTool(repo, quem, nome, entrada);
  // Sem data de nascimento: o aniversario de um filho cairia na lista em algum dia do ano e o teste dependeria dele.
  rodar("cadastrar_filho", { nome: "Marina", idade_aproximada: 8 });
  rodar("cadastrar_filho", { nome: "Pedro", idade_aproximada: 6 });
  const id = (texto: string) => Number(/#(\d+)/.exec(texto)![1]);
  const prova = id(rodar("registrar_compromisso_filho", { filho: "Marina", tipo: "escola", titulo: "Prova de ciencias", data: em(3), hora: "08:00" }));
  const festa = id(
    rodar("registrar_compromisso_filho", { filho: "Pedro", tipo: "aniversario_amigo", titulo: "Aniversario do Joao", amigo: "Joao", presente: "quebra-cabeca", data: em(5), hora: "15:00" }),
  );
  rodar("registrar_compromisso_filho", { filho: "Pedro", tipo: "consulta", titulo: "Pediatra" });

  // Lista agrupada por filho, em ordem de data, com o presente e os "a marcar" no fim.
  const lista = rodar("consultar_compromissos_filhos", {});
  assert.match(lista, new RegExp(`^Marina:\\n- #${prova} Prova de ciencias \\(escola\\) \\| ${DIA} \\d{2}/\\d{2} as 08:00\\nPedro:\\n- #${festa} Aniversario do Joao \\(aniversario de amigo\\) \\| ${DIA} \\d{2}/\\d{2} as 15:00 \\| presente: quebra-cabeca \\(por comprar\\)\\nA marcar:\\n- #\\d+ Pediatra \\(Pedro\\)$`));
  assert.match(rodar("consultar_compromissos_filhos", { filho: "Pedro" }), /^Pedro:\n- #\d+ Aniversario do Joao/);
  assert.doesNotMatch(rodar("consultar_compromissos_filhos", { filho: "Pedro" }), /Marina/);
  assert.match(rodar("consultar_compromissos_filhos", { filho: "Marina", de: em(40), ate: em(47) }), /^Nenhum compromisso de Marina nesse periodo\.$/);
  assert.match(rodar("consultar_compromissos_filhos", { de: em(40), ate: em(47) }), /^Nenhum compromisso dos filhos nesse periodo\.\nA marcar:\n- #\d+ Pediatra \(Pedro\)$/);
  assert.match(rodar("consultar_compromissos_filhos", { filho: "Zeca" }), /Nao achei filho chamado "Zeca"/);

  // Atualizar pelo id que veio da consulta.
  assert.match(rodar("atualizar_compromisso_filho", { id: prova, acao: "concluir" }), new RegExp(`^Concluido: #${prova} Prova de ciencias \\(Marina\\)\\.$`));
  assert.doesNotMatch(rodar("consultar_compromissos_filhos", {}), /Prova de ciencias/);
  assert.match(rodar("consultar_compromissos_filhos", { incluir_concluidos: true }), /Prova de ciencias \(escola\) \| .* \| concluido/);
  assert.match(rodar("atualizar_compromisso_filho", { id: prova, acao: "reabrir" }), /^Reaberto: #\d+ Prova de ciencias \(Marina\)\.$/);
  assert.match(rodar("atualizar_compromisso_filho", { id: prova, nova_data: em(7), nova_hora: "09:00" }), new RegExp(`^Remarcado: #${prova} Prova de ciencias \\(Marina\\), ${DIA} \\d{2}/\\d{2} as 09:00\\.$`));
  assert.match(rodar("atualizar_compromisso_filho", { id: festa, acao: "presente_comprado" }), new RegExp(`^Presente comprado: #${festa} Aniversario do Joao \\(Pedro\\)\\.$`));
  assert.match(rodar("consultar_compromissos_filhos", { filho: "Pedro" }), /presente: quebra-cabeca \(comprado\)/);
  assert.match(rodar("atualizar_compromisso_filho", { id: festa, acao: "concluir" }), new RegExp(`^Concluido: #${festa} Aniversario do Joao \\(Pedro\\)\\. Volta no ano que vem: ${DIA} \\d{2}/\\d{2} as 15:00\\.$`));
  assert.match(rodar("atualizar_compromisso_filho", { id: prova, acao: "cancelar" }), /^Cancelado: #\d+ Prova de ciencias \(Marina\)\. Nao aviso mais\.$/);
  assert.match(rodar("atualizar_compromisso_filho", { id: prova, titulo: "Prova de historia" }), /^Atualizado: #\d+ Prova de historia \(Marina\)/);
  assert.match(rodar("atualizar_compromisso_filho", { id: 99999, acao: "concluir" }), /^Compromisso #99999 nao encontrado\.$/);
  assert.match(rodar("atualizar_compromisso_filho", { id: prova, nova_data: em(-1) }), /ja passou/);

  // So gastos nao tem agenda.
  const daBia = ctxDe(repo, bia);
  for (const [nome, entrada] of [
    ["consultar_compromissos_filhos", {}],
    ["atualizar_compromisso_filho", { id: prova, acao: "concluir" }],
  ] as const) {
    assert.match(rodar(nome, entrada, daBia), /Sem permissao/, nome);
  }
});

// ---------- US4: rotas do painel ----------

test("US4: rotas de filhos e de compromissos no painel", async () => {
  const { repo, db } = contaCom("so_gastos");
  const app = buildServer(repo);
  const contas = auth(repo.db);
  const tTitular = contas.abrirSessao(titular);
  const tBia = contas.abrirSessao(bia);
  const tOutro = contas.abrirSessao(outro);
  const req = (method: string, url: string, token: string | null, corpo?: object) =>
    app.inject({
      method: method as "GET",
      url,
      headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), "content-type": "application/json" },
      payload: corpo ? JSON.stringify(corpo) : undefined,
    });

  // Lista vazia, com o limite.
  assert.deepEqual((await req("GET", "/api/filhos", tTitular)).json(), { filhos: [], limite: 10 });

  // Cadastro.
  const criada = await req("POST", "/api/filhos", tTitular, { nome: "Marina", idadeAproximada: 8 });
  assert.equal(criada.statusCode, 201);
  const marina = criada.json();
  assert.deepEqual([marina.nome, marina.idade, marina.idadeAproximada, marina.nascimento, marina.proximo], ["Marina", 8, true, null, null]);
  assert.equal((await req("POST", "/api/filhos", tTitular, { nome: "marina" })).statusCode, 409);
  assert.match((await req("POST", "/api/filhos", tTitular, { nome: "marina" })).json().erro, /Ja existe um filho/);
  for (const corpo of [{ nome: "" }, { nome: "x".repeat(41) }, { nome: "Ana", nascimento: "2999-01-01" }, { nome: "Ana", nascimento: "2019-01-01", idadeAproximada: 7 }, { nome: "Ana", nascimento: "ontem" }]) {
    assert.equal((await req("POST", "/api/filhos", tTitular, corpo)).statusCode, 400, JSON.stringify(corpo));
  }
  // Sem data de nascimento: o aniversario de um filho cairia na lista em algum dia do ano e o teste dependeria dele.
  const pedro = (await req("POST", "/api/filhos", tTitular, { nome: "Pedro", idadeAproximada: 6 })).json();
  const editado = await req("PATCH", `/api/filhos/${marina.id}`, tTitular, { nome: "Marina S." });
  assert.equal(editado.json().nome, "Marina S.");
  assert.equal((await req("PATCH", `/api/filhos/${marina.id}`, tTitular, { nome: "Pedro" })).statusCode, 409);
  assert.equal((await req("PATCH", "/api/filhos/abc", tTitular, { nome: "X" })).statusCode, 400);

  // Compromisso: criar, validar.
  const prova = await req("POST", "/api/filhos/compromissos", tTitular, { filhoId: marina.id, tipo: "escola", titulo: "Prova de ciencias", data: em(3), hora: "08:00", disciplina: "Ciencias" });
  assert.equal(prova.statusCode, 201);
  const p = prova.json();
  assert.deepEqual(
    [p.tipo, p.titulo, p.filhoId, p.filhoNome, p.data, p.hora, p.disciplina, p.situacao, p.aMarcar, p.virtual],
    ["escola", "Prova de ciencias", marina.id, "Marina S.", em(3), "08:00", "Ciencias", "aberto", false, false],
  );
  const festa = (
    await req("POST", "/api/filhos/compromissos", tTitular, { filhoId: pedro.id, tipo: "aniversario_amigo", titulo: "Aniversario do Joao", amigo: "Joao", presente: "quebra-cabeca", data: em(5), hora: "15:00" })
  ).json();
  assert.deepEqual([festa.presenteSituacao, festa.repetirMeses, festa.amigo], ["por_comprar", 12, "Joao"]);
  const marcar = (await req("POST", "/api/filhos/compromissos", tTitular, { filhoId: pedro.id, tipo: "consulta", titulo: "Pediatra" })).json();
  assert.equal(marcar.aMarcar, true);
  const passado = await req("POST", "/api/filhos/compromissos", tTitular, { filhoId: pedro.id, tipo: "consulta", titulo: "Dentista", data: em(-2) });
  assert.equal(passado.statusCode, 400);
  assert.match(passado.json().erro, /ja passou/);
  const registro = await req("POST", "/api/filhos/compromissos", tTitular, { filhoId: pedro.id, tipo: "consulta", titulo: "Dentista", data: em(-2), situacao: "concluido" });
  assert.equal(registro.statusCode, 201);
  assert.equal(registro.json().situacao, "concluido");
  for (const corpo of [
    { filhoId: marina.id, tipo: "xyz", titulo: "X" },
    { filhoId: marina.id, tipo: "outro", titulo: "" },
    { filhoId: marina.id, tipo: "outro", titulo: "x".repeat(81) },
    { filhoId: marina.id, tipo: "outro", titulo: "X", data: em(2), hora: "25:00" },
    { filhoId: marina.id, tipo: "outro", titulo: "X", antecedenciaDias: 61 },
    { filhoId: marina.id, tipo: "consulta", titulo: "X", repetirMeses: 25 },
    { filhoId: marina.id, tipo: "escola", titulo: "X", amigo: "Joao" },
    { filhoId: marina.id, tipo: "outro", titulo: "X", observacao: "x".repeat(301) },
  ]) {
    assert.equal((await req("POST", "/api/filhos/compromissos", tTitular, corpo)).statusCode, 400, JSON.stringify(corpo));
  }

  // Listagem com a semana, o "a marcar" e os filtros.
  const lista = (await req("GET", "/api/filhos/compromissos", tTitular)).json();
  assert.deepEqual(lista.compromissos.map((c: { titulo: string }) => c.titulo), ["Prova de ciencias", "Aniversario do Joao"]);
  assert.deepEqual(lista.aMarcar.map((c: { titulo: string }) => c.titulo), ["Pediatra"]);
  assert.deepEqual(lista.semana.map((c: { titulo: string }) => c.titulo), ["Prova de ciencias", "Aniversario do Joao"]);
  const titulosDe = async (consulta: string) => (await req("GET", `/api/filhos/compromissos${consulta}`, tTitular)).json().compromissos.map((c: { titulo: string }) => c.titulo);
  assert.deepEqual(await titulosDe(`?filho=${pedro.id}`), ["Aniversario do Joao"]);
  assert.deepEqual(await titulosDe("?tipo=escola"), ["Prova de ciencias"]);
  assert.deepEqual(await titulosDe(`?de=${em(4)}&ate=${em(6)}`), ["Aniversario do Joao"]);
  assert.deepEqual(await titulosDe("?situacao=concluido"), [], "o padrao e de hoje em diante");
  assert.deepEqual(await titulosDe(`?situacao=concluido&de=${em(-5)}`), ["Dentista"]);
  assert.equal((await req("GET", "/api/filhos/compromissos?de=amanha", tTitular)).statusCode, 400);
  assert.equal((await req("GET", "/api/filhos/compromissos?tipo=xyz", tTitular)).statusCode, 400);
  assert.equal((await req("GET", "/api/filhos/compromissos?filho=99999", tTitular)).statusCode, 404);
  const cartoes = (await req("GET", "/api/filhos", tTitular)).json().filhos;
  assert.equal(cartoes.find((f: { nome: string }) => f.nome === "Marina S.").proximo.titulo, "Prova de ciencias");

  // Atualizar: a resposta e sempre { compromisso, proximo }.
  const concluida = (await req("PATCH", `/api/filhos/compromissos/${p.id}`, tTitular, { acao: "concluir" })).json();
  assert.deepEqual([concluida.compromisso.situacao, concluida.proximo], ["concluido", null]);
  const remarcada = (await req("PATCH", `/api/filhos/compromissos/${p.id}`, tTitular, { acao: "reabrir", data: em(9), hora: "10:00" })).json();
  assert.deepEqual([remarcada.compromisso.situacao, remarcada.compromisso.data, remarcada.compromisso.hora], ["aberto", em(9), "10:00"]);
  assert.equal((await req("PATCH", `/api/filhos/compromissos/${festa.id}`, tTitular, { acao: "presente_comprado" })).json().compromisso.presenteSituacao, "comprado");
  assert.equal((await req("PATCH", `/api/filhos/compromissos/${p.id}`, tTitular, { acao: "apagar" })).statusCode, 400);
  assert.equal((await req("PATCH", `/api/filhos/compromissos/${p.id}`, tTitular, { data: em(-1) })).statusCode, 400);
  const volta = (await req("PATCH", `/api/filhos/compromissos/${festa.id}`, tTitular, { acao: "concluir" })).json();
  assert.deepEqual([volta.compromisso.situacao, volta.compromisso.presenteSituacao, volta.proximo], ["aberto", "por_comprar", null]);

  // O que se grava na tela a conversa le, e o contrario.
  const ctx = ctxDe(repo, titular);
  assert.match(executeTool(repo, ctx, "consultar_compromissos_filhos", { filho: "Marina" }), /Prova de ciencias/);
  executeTool(repo, ctx, "registrar_compromisso_filho", { filho: "Pedro", tipo: "outro", titulo: "Natacao", data: em(4) });
  assert.ok((await titulosDe(`?filho=${pedro.id}`)).includes("Natacao"));

  // So gastos nao tem agenda; sem sessao nao entra; outra conta nao enxerga nem mexe.
  const rotas: [string, string, object?][] = [
    ["GET", "/api/filhos"],
    ["POST", "/api/filhos", { nome: "Ana" }],
    ["PATCH", `/api/filhos/${pedro.id}`, { nome: "X" }],
    ["DELETE", `/api/filhos/${pedro.id}`],
    ["GET", "/api/filhos/compromissos"],
    ["POST", "/api/filhos/compromissos", { filhoId: pedro.id, tipo: "outro", titulo: "X" }],
    ["PATCH", `/api/filhos/compromissos/${p.id}`, { acao: "concluir" }],
    ["DELETE", `/api/filhos/compromissos/${p.id}`],
  ];
  for (const [metodo, url, corpo] of rotas) {
    assert.equal((await req(metodo, url, tBia, corpo)).statusCode, 403, `${metodo} ${url} so gastos`);
    assert.equal((await req(metodo, url, null, corpo)).statusCode, 401, `${metodo} ${url} sem sessao`);
  }
  assert.deepEqual((await req("GET", "/api/filhos", tOutro)).json().filhos, []);
  assert.equal((await req("PATCH", `/api/filhos/${pedro.id}`, tOutro, { nome: "X" })).statusCode, 404);
  assert.equal((await req("DELETE", `/api/filhos/${pedro.id}`, tOutro)).statusCode, 404);
  assert.equal((await req("PATCH", `/api/filhos/compromissos/${p.id}`, tOutro, { acao: "concluir" })).statusCode, 404);
  assert.equal((await req("DELETE", `/api/filhos/compromissos/${p.id}`, tOutro)).statusCode, 404);
  assert.equal((await req("POST", "/api/filhos/compromissos", tOutro, { filhoId: pedro.id, tipo: "outro", titulo: "X" })).statusCode, 404);

  // Apagar um compromisso, e depois o filho com tudo dele.
  assert.deepEqual((await req("DELETE", `/api/filhos/compromissos/${marcar.id}`, tTitular)).json(), { ok: true });
  assert.equal((await req("DELETE", `/api/filhos/compromissos/${marcar.id}`, tTitular)).statusCode, 404);
  const removido = (await req("DELETE", `/api/filhos/${pedro.id}`, tTitular)).json();
  assert.deepEqual([removido.ok, removido.compromissosApagados], [true, 3], "a festa, o dentista concluido e a natacao");
  assert.equal((db.prepare(`SELECT COUNT(*) AS n FROM child_events WHERE child_id = ?`).get(pedro.id) as { n: number }).n, 0);
  assert.equal((await req("DELETE", `/api/filhos/${pedro.id}`, tTitular)).statusCode, 404);
  await app.close();
});

// ---------- US5: vacinas e consultas de rotina ----------

test("US5: vacina aplicada vira historico e, com proxima dose, um compromisso com aviso", () => {
  const { repo, db } = contaCom("so_gastos");
  const ctx = ctxDe(repo, titular);
  const pedro = fh.cadastrarFilho(db, ctx, { nome: "Pedro", idadeAproximada: 6 }, HOJE);
  const vacina = (d: Partial<Parameters<typeof fh.registrarVacina>[2]> = {}) =>
    fh.registrarVacina(db, ctx, { filhoId: pedro.id, vacina: "Gripe", data: HOJE, ...d }, HOJE);

  // Proxima dose em N meses: guarda o historico e cria o compromisso, que avisa na vespera.
  const r = vacina({ dose: "2a dose", proximaEmMeses: 6 });
  assert.deepEqual([r.vacina.vacina, r.vacina.dose, r.vacina.aplicadaEm], ["Gripe", "2a dose", HOJE]);
  assert.deepEqual([r.proximo!.tipo, r.proximo!.titulo, r.proximo!.data, r.proximo!.filhoNome, r.proximo!.situacao], ["vacina", "Proxima dose: Gripe", "2027-05-10", "Pedro", "aberto"]);
  assert.equal(r.vacina.proximoCompromissoId, r.proximo!.id);
  assert.deepEqual(fh.avisosDevidos(db, titular, "2027-05-09").map((a) => a.chave), [`filho:${r.proximo!.id}:2027-05-10:1`]);

  // Proxima dose por data; sem proxima dose nao cria compromisso.
  assert.equal(vacina({ vacina: "Triplice", data: "2026-11-01", proximaData: "2027-03-01" }).proximo!.data, "2027-03-01");
  const antes = fh.listarCompromissos(db, ctx, { tipo: "vacina", ate: "2030-01-01" }, HOJE).compromissos.length;
  const sem = vacina({ vacina: "Hepatite B", data: "2026-10-01" });
  assert.equal(sem.proximo, null);
  assert.equal(sem.vacina.proximoCompromissoId, null);
  assert.equal(fh.listarCompromissos(db, ctx, { tipo: "vacina", ate: "2030-01-01" }, HOJE).compromissos.length, antes);

  // Fim de mes: 31 de agosto mais 6 meses cai no ultimo dia de fevereiro.
  assert.equal(vacina({ vacina: "Febre amarela", data: "2026-08-31", proximaEmMeses: 24 }).proximo!.data, "2028-08-31");
  assert.equal(fh.somarMeses("2026-08-31", 6), "2027-02-28");
  assert.equal(fh.somarMeses("2026-12-31", 2), "2027-02-28");
  assert.equal(fh.somarMeses("2026-11-10", 14), "2028-01-10");

  // Regras: nome 1 a 60, dose ate 20, sem data futura, uma forma so de dizer a proxima dose.
  recusa(() => vacina({ vacina: "" }), 400, /1 a 60/);
  recusa(() => vacina({ vacina: "x".repeat(61) }), 400, /1 a 60/);
  recusa(() => vacina({ dose: "x".repeat(21) }), 400, /20/);
  recusa(() => vacina({ data: "2026-11-11" }), 400, /futura/);
  recusa(() => vacina({ data: "2026-02-30" }), 400, /data/i);
  recusa(() => vacina({ proximaData: "2027-01-01", proximaEmMeses: 6 }), 400, /nao os dois/);
  recusa(() => vacina({ proximaEmMeses: 0 }), 400, /1 a 24/);
  recusa(() => vacina({ proximaEmMeses: 25 }), 400, /1 a 24/);
  recusa(() => vacina({ proximaData: "2026-11-10" }), 400, /depois da aplicacao/);
  recusa(() => vacina({ data: "2026-01-01", proximaData: "2026-06-01" }), 400, /ja passou/);
  // Nada ficou gravado pelas recusas.
  assert.equal(fh.listarVacinas(db, ctx, pedro.id).vacinas.length, 4);

  // Historico do mais novo para o mais antigo, e as proximas doses abertas em ordem de data.
  const { vacinas, proximas } = fh.listarVacinas(db, ctx, pedro.id);
  assert.deepEqual(vacinas.map((v) => v.aplicadaEm), [HOJE, "2026-11-01", "2026-10-01", "2026-08-31"]);
  assert.deepEqual(proximas.map((c) => c.data), ["2027-03-01", "2027-05-10", "2028-08-31"]);
  fh.atualizarCompromisso(db, ctx, proximas[0].id!, { acao: "concluir" }, HOJE);
  assert.equal(fh.listarVacinas(db, ctx, pedro.id).proximas.length, 2, "concluida sai das proximas");

  // Outra conta e perfil sem agenda.
  const outraConta = ctxDe(repo, outro);
  recusa(() => fh.registrarVacina(db, outraConta, { filhoId: pedro.id, vacina: "Gripe", data: HOJE }, HOJE), 404, /Filho #\d+ nao encontrado/);
  recusa(() => fh.listarVacinas(db, outraConta, pedro.id), 404, /Filho #\d+ nao encontrado/);
  assert.throws(() => fh.registrarVacina(db, ctxDe(repo, bia), { filhoId: pedro.id, vacina: "Gripe", data: HOJE }, HOJE), SemPermissao);
  assert.throws(() => fh.listarVacinas(db, ctxDe(repo, bia), pedro.id), SemPermissao);
});

test("US5: consulta de rotina volta depois de concluida, sem duplicar nem repetir o que foi cancelado", () => {
  const { repo, db } = contaCom();
  const ctx = ctxDe(repo, titular);
  const marina = fh.cadastrarFilho(db, ctx, { nome: "Marina" }, HOJE);
  const criar = (d: Omit<Parameters<typeof fh.criarCompromisso>[2], "filhoId" | "tipo">) => fh.criarCompromisso(db, ctx, { filhoId: marina.id, tipo: "consulta", ...d }, HOJE);
  const abertas = () => (db.prepare(`SELECT COUNT(*) AS n FROM child_events WHERE status = 'aberto'`).get() as { n: number }).n;

  const pediatra = criar({ titulo: "Pediatra", data: "2026-11-20", hora: "09:00", local: "Clinica Sol", antecedenciaDias: 2, repetirMeses: 6 });
  const r = fh.atualizarCompromisso(db, ctx, pediatra.id!, { acao: "concluir" }, HOJE);
  assert.equal(r.compromisso.situacao, "concluido");
  const prox = r.proximo!;
  assert.notEqual(prox.id, pediatra.id);
  assert.deepEqual(
    [prox.data, prox.hora, prox.titulo, prox.local, prox.antecedenciaDias, prox.repetirMeses, prox.situacao, prox.tipo],
    ["2027-05-20", "09:00", "Pediatra", "Clinica Sol", 2, 6, "aberto", "consulta"],
  );
  assert.equal(abertas(), 1);
  // Concluida de novo (reaberta e concluida), a seguinte nao duplica.
  fh.atualizarCompromisso(db, ctx, pediatra.id!, { acao: "reabrir" }, HOJE);
  const de_novo = fh.atualizarCompromisso(db, ctx, pediatra.id!, { acao: "concluir" }, HOJE);
  assert.equal(de_novo.proximo!.id, prox.id);
  assert.equal(abertas(), 1);
  // A cadeia continua: a seguinte tambem repete.
  assert.equal(fh.atualizarCompromisso(db, ctx, prox.id!, { acao: "concluir" }, HOJE).proximo!.data, "2027-11-20");

  // Fim de mes: 31 de dezembro mais 2 meses vira 28 de fevereiro.
  const fim = criar({ titulo: "Fono", data: "2026-12-31", repetirMeses: 2 });
  assert.equal(fh.atualizarCompromisso(db, ctx, fim.id!, { acao: "concluir" }, HOJE).proximo!.data, "2027-02-28");

  // Concluida muito depois: a seguinte cai na primeira data que ainda nao passou.
  const velha = criar({ titulo: "Ortopedista", data: "2026-11-12", repetirMeses: 1 });
  assert.equal(fh.atualizarCompromisso(db, ctx, velha.id!, { acao: "concluir" }, "2027-02-20").proximo!.data, "2027-03-12");

  // Sem repeticao, cancelada ou a marcar: nao cria nada.
  const sem = criar({ titulo: "Dentista", data: "2026-11-25" });
  assert.equal(fh.atualizarCompromisso(db, ctx, sem.id!, { acao: "concluir" }, HOJE).proximo, null);
  const cancelada = criar({ titulo: "Oftalmo", data: "2026-11-26", repetirMeses: 6 });
  assert.equal(fh.atualizarCompromisso(db, ctx, cancelada.id!, { acao: "cancelar" }, HOJE).proximo, null);
  const aMarcar = criar({ titulo: "Alergista", repetirMeses: 6 });
  assert.equal(fh.atualizarCompromisso(db, ctx, aMarcar.id!, { acao: "concluir" }, HOJE).proximo, null);
  // So consulta repete.
  const prova = fh.criarCompromisso(db, ctx, { filhoId: marina.id, tipo: "escola", titulo: "Prova", data: "2026-11-27" }, HOJE);
  assert.equal(fh.atualizarCompromisso(db, ctx, prova.id!, { acao: "concluir" }, HOJE).proximo, null);
});

test("US5: ferramentas e rotas de vacina, e a frase que nao indica vacina", async () => {
  const { repo, db } = contaCom("so_gastos");
  const ctx = ctxDe(repo, titular);
  const rodar = (nome: string, entrada: object, quem = ctx) => executeTool(repo, quem, nome, entrada);
  rodar("cadastrar_filho", { nome: "Pedro", idade_aproximada: 6 });

  // Com proxima dose o compromisso nasce com aviso; sem ela o assistente pergunta.
  assert.match(
    rodar("registrar_vacina", { filho: "Pedro", vacina: "Gripe", dose: "2a dose", data: em(0), proxima_em_meses: 6 }),
    new RegExp(`^Vacina registrada: Gripe, 2a dose \\(Pedro\\), aplicada em ${DIA} \\d{2}/\\d{2}\\. Proxima dose: ${DIA} \\d{2}/\\d{2}, com aviso\\.$`),
  );
  assert.match(rodar("registrar_vacina", { vacina: "Triplice", data: em(-3) }), /^Vacina registrada: Triplice \(Pedro\), aplicada em .* Tem proxima dose\? Se tiver, me diga a data\.$/);
  assert.match(rodar("registrar_vacina", { vacina: "Gripe", data: em(1) }), /nao pode ser futura/);
  assert.match(rodar("registrar_vacina", { vacina: "Gripe", data: em(0), proxima_data: em(60), proxima_em_meses: 6 }), /nao os dois/);
  assert.match(rodar("registrar_vacina", { filho: "Zeca", vacina: "Gripe", data: em(0) }), /Nao achei filho chamado "Zeca"/);

  // Quem pergunta que vacinas o filho precisa tomar recebe so o que foi registrado e o aviso fixo.
  const AVISO = "Nao indico quais vacinas ou consultas fazer. Isso e com o calendario oficial de vacinacao e o pediatra. Aqui tenho so o que voce registrou.";
  const vacinas = rodar("consultar_compromissos_filhos", { filho: "Pedro", tipo: "vacina", ate: em(400) });
  assert.match(vacinas, /Proxima dose: Gripe \(vacina\)/);
  assert.ok(vacinas.endsWith(`\n${AVISO}`), vacinas);
  assert.ok(rodar("consultar_compromissos_filhos", { tipo: "consulta" }).endsWith(`\n${AVISO}`));
  assert.ok(rodar("consultar_compromissos_filhos", { tipo: "vacina", filho: "Pedro", de: em(900), ate: em(905) }).endsWith(`\n${AVISO}`), "tambem quando nao ha nada");
  assert.doesNotMatch(rodar("consultar_compromissos_filhos", {}), /calendario oficial/);
  assert.doesNotMatch(rodar("consultar_compromissos_filhos", { tipo: "escola" }), /calendario oficial/);
  // O assistente nao completa vacinas, doses ou prazos: nada alem do que foi registrado aparece.
  assert.doesNotMatch(vacinas, /Triplice|BCG|Hepatite|Polio|Pentavalente/);

  // Consulta de rotina pela conversa.
  assert.match(
    rodar("registrar_compromisso_filho", { filho: "Pedro", tipo: "consulta", titulo: "Pediatra", data: em(10), hora: "09:00", repetir_meses: 6 }),
    /Repete a cada 6 meses\. Aviso na vespera\.$/,
  );
  const id = Number(/#(\d+)/.exec(rodar("consultar_compromissos_filhos", { tipo: "consulta" }))![1]);
  assert.match(rodar("atualizar_compromisso_filho", { id, acao: "concluir" }), new RegExp(`^Concluido: #${id} Pediatra \\(Pedro\\)\\. Proxima consulta marcada para ${DIA} \\d{2}/\\d{2} as 09:00\\.$`));
  assert.match(rodar("registrar_compromisso_filho", { filho: "Pedro", tipo: "escola", titulo: "Prova", data: em(3), repetir_meses: 6 }), /so vale para consultas/);

  // Rotas: historico, registro e a seguinte da consulta pelo painel.
  const app = buildServer(repo);
  const contas = auth(repo.db);
  const tTitular = contas.abrirSessao(titular);
  const tBia = contas.abrirSessao(bia);
  const tOutro = contas.abrirSessao(outro);
  const req = (method: string, url: string, token: string | null, corpo?: object) =>
    app.inject({
      method: method as "GET",
      url,
      headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), "content-type": "application/json" },
      payload: corpo ? JSON.stringify(corpo) : undefined,
    });
  const pedro = (await req("GET", "/api/filhos", tTitular)).json().filhos[0];
  const historico = (await req("GET", `/api/filhos/${pedro.id}/vacinas`, tTitular)).json();
  assert.deepEqual(historico.vacinas.map((v: { vacina: string }) => v.vacina), ["Gripe", "Triplice"], "a mais recente primeiro");
  assert.deepEqual(Object.keys(historico.vacinas[0]).sort(), ["aplicadaEm", "dose", "id", "proximoCompromissoId", "vacina"]);
  assert.equal(historico.proximas.length, 1);

  const nova = await req("POST", "/api/filhos/vacinas", tTitular, { filhoId: pedro.id, vacina: "Hepatite A", dose: "1a dose", data: em(0), proximaEmMeses: 6 });
  assert.equal(nova.statusCode, 201);
  assert.deepEqual([nova.json().vacina.vacina, nova.json().proximo.tipo, nova.json().proximo.titulo], ["Hepatite A", "vacina", "Proxima dose: Hepatite A"]);
  for (const corpo of [
    { filhoId: pedro.id, vacina: "", data: em(0) },
    { filhoId: pedro.id, vacina: "Gripe", data: em(1) },
    { filhoId: pedro.id, vacina: "Gripe", data: em(0), proximaData: em(90), proximaEmMeses: 6 },
    { filhoId: pedro.id, vacina: "Gripe", data: "ontem" },
    { filhoId: pedro.id, vacina: "Gripe", data: em(0), proximaEmMeses: 25 },
  ]) {
    assert.equal((await req("POST", "/api/filhos/vacinas", tTitular, corpo)).statusCode, 400, JSON.stringify(corpo));
  }
  const consulta = (await req("POST", "/api/filhos/compromissos", tTitular, { filhoId: pedro.id, tipo: "consulta", titulo: "Dentista", data: em(7), repetirMeses: 6 })).json();
  const concluida = (await req("PATCH", `/api/filhos/compromissos/${consulta.id}`, tTitular, { acao: "concluir" })).json();
  assert.deepEqual([concluida.compromisso.situacao, concluida.proximo.titulo, concluida.proximo.situacao], ["concluido", "Dentista", "aberto"]);

  // Perfil sem agenda, sem sessao e outra conta.
  for (const [metodo, url, corpo] of [
    ["GET", `/api/filhos/${pedro.id}/vacinas`],
    ["POST", "/api/filhos/vacinas", { filhoId: pedro.id, vacina: "Gripe", data: em(0) }],
  ] as [string, string, object?][]) {
    assert.equal((await req(metodo, url, tBia, corpo)).statusCode, 403, `${metodo} ${url}`);
    assert.equal((await req(metodo, url, null, corpo)).statusCode, 401, `${metodo} ${url}`);
    assert.equal((await req(metodo, url, tOutro, corpo)).statusCode, 404, `${metodo} ${url}`);
  }
  assert.equal((await req("GET", "/api/filhos/abc/vacinas", tTitular)).statusCode, 400);
  assert.equal(total(db, "child_vaccines") > 0, true);
  await app.close();
});

// FIM-DOS-TESTES
