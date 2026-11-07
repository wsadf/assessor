import { AuthError } from "./auth.js";
import { addDias } from "./avisos.js";
import type { Db } from "./db.js";
import { exigir, pode, type Contexto } from "./permissoes.js";
import { localDate } from "./time.js";

export const TIPOS_COMPROMISSO = ["escola", "aniversario_amigo", "vacina", "consulta", "outro"] as const;
export type TipoCompromisso = (typeof TIPOS_COMPROMISSO)[number];
export const LIMITE_FILHOS = 10;

export interface FilhoLinha {
  id: number;
  phone: string;
  created_by: string;
  name: string;
  birth_on: string | null;
  approx_age: number | null;
  approx_age_on: string | null;
  created_on: string;
  created_at: string;
}

export interface CompromissoLinha {
  id: number;
  phone: string;
  created_by: string;
  child_id: number;
  kind: TipoCompromisso;
  title: string;
  subject: string | null;
  friend_name: string | null;
  gift_idea: string | null;
  gift_status: "por_comprar" | "comprado" | null;
  place: string | null;
  notes: string | null;
  due_on: string | null;
  due_time: string | null;
  lead_days: number | null;
  repeat_months: number | null;
  anchor_md: string | null;
  status: "aberto" | "concluido" | "cancelado";
  done_at: string | null;
  created_on: string;
  created_at: string;
}

export interface VacinaLinha {
  id: number;
  phone: string;
  created_by: string;
  child_id: number;
  name: string;
  dose: string | null;
  applied_on: string;
  next_event_id: number | null;
  created_at: string;
}

/** Formas devolvidas ao painel e as que a conversa le; os nomes seguem contracts/api-filhos.md. */
export interface Compromisso {
  id: number | null;
  virtual: boolean;
  filhoId: number;
  filhoNome: string;
  tipo: TipoCompromisso | "aniversario";
  titulo: string;
  disciplina: string | null;
  amigo: string | null;
  presente: string | null;
  presenteSituacao: "por_comprar" | "comprado" | null;
  local: string | null;
  observacao: string | null;
  data: string | null;
  hora: string | null;
  antecedenciaDias: number | null;
  repetirMeses: number | null;
  situacao: "aberto" | "concluido" | "cancelado";
  aMarcar: boolean;
}

export interface Filho {
  id: number;
  nome: string;
  nascimento: string | null;
  idade: number | null;
  idadeAproximada: boolean;
  proximo: Compromisso | null;
}

export interface Vacina {
  id: number;
  vacina: string;
  dose: string | null;
  aplicadaEm: string;
  proximoCompromissoId: number | null;
}

export function prepararTabelasFilhos(db: Db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS children (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      phone TEXT NOT NULL,
      created_by TEXT NOT NULL,
      name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 40),
      birth_on TEXT,
      approx_age INTEGER CHECK (approx_age IS NULL OR approx_age BETWEEN 0 AND 25),
      approx_age_on TEXT,
      created_on TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_children_phone ON children (phone);
    CREATE TABLE IF NOT EXISTS child_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      phone TEXT NOT NULL,
      created_by TEXT NOT NULL,
      child_id INTEGER NOT NULL,
      kind TEXT NOT NULL CHECK (kind IN ('escola', 'aniversario_amigo', 'vacina', 'consulta', 'outro')),
      title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 80),
      subject TEXT,
      friend_name TEXT,
      gift_idea TEXT,
      gift_status TEXT CHECK (gift_status IS NULL OR gift_status IN ('por_comprar', 'comprado')),
      place TEXT,
      notes TEXT,
      due_on TEXT,
      due_time TEXT,
      lead_days INTEGER CHECK (lead_days IS NULL OR lead_days BETWEEN 0 AND 60),
      repeat_months INTEGER CHECK (repeat_months IS NULL OR repeat_months BETWEEN 1 AND 24),
      anchor_md TEXT,
      status TEXT NOT NULL DEFAULT 'aberto' CHECK (status IN ('aberto', 'concluido', 'cancelado')),
      done_at TEXT,
      created_on TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_child_events_conta ON child_events (phone, status, due_on);
    CREATE INDEX IF NOT EXISTS idx_child_events_filho ON child_events (child_id);
    CREATE TABLE IF NOT EXISTS child_vaccines (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      phone TEXT NOT NULL,
      created_by TEXT NOT NULL,
      child_id INTEGER NOT NULL,
      name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 60),
      dose TEXT,
      applied_on TEXT NOT NULL,
      next_event_id INTEGER,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_child_vaccines_filho ON child_vaccines (child_id, applied_on);
  `);
}

// ---------- datas ----------

const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const asUtc = (iso: string) => new Date(`${iso}T12:00:00Z`);
const pad = (n: number) => String(n).padStart(2, "0");

export function dataValida(s: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = asUtc(s);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

const bissexto = (ano: number) => (ano % 4 === 0 && ano % 100 !== 0) || ano % 400 === 0;

/** Mes e dia no ano pedido; 29 de fevereiro vale 28 nos anos comuns. */
export function mdNoAno(md: string, ano: number) {
  return md === "02-29" && !bissexto(ano) ? `${ano}-02-28` : `${ano}-${md}`;
}

/** Anos completos em `hoje` para quem nasceu, ou comecou a contar, em `nascimento`. */
export function idadeEm(nascimento: string, hoje: string) {
  const ano = Number(hoje.slice(0, 4));
  return ano - Number(nascimento.slice(0, 4)) - (hoje < mdNoAno(nascimento.slice(5), ano) ? 1 : 0);
}

// ---------- filhos ----------

const filhosDaConta = (db: Db, conta: string) =>
  db.prepare(`SELECT * FROM children WHERE phone = ? ORDER BY id`).all(conta) as FilhoLinha[];

export function filhoDaConta(db: Db, ctx: Contexto, id: number) {
  const f = db.prepare(`SELECT * FROM children WHERE id = ? AND phone = ?`).get(id, ctx.conta) as FilhoLinha | undefined;
  if (!f) throw new AuthError(404, `Filho #${id} nao encontrado.`);
  return f;
}

function filhoDe(l: FilhoLinha, hoje: string): Filho {
  const idade = l.birth_on ? idadeEm(l.birth_on, hoje) : l.approx_age != null ? l.approx_age + idadeEm(l.approx_age_on!, hoje) : null;
  return { id: l.id, nome: l.name, nascimento: l.birth_on, idade, idadeAproximada: !l.birth_on && l.approx_age != null, proximo: null };
}

function validarNome(nome: string) {
  const n = nome.trim();
  if (n.length < 1 || n.length > 40) throw new AuthError(400, "O nome do filho precisa ter de 1 a 40 caracteres.");
  return n;
}

function validarIdade(nascimento: string | null, aproximada: number | null, hoje: string) {
  if (nascimento != null && aproximada != null) throw new AuthError(400, "Informe a data de nascimento ou a idade aproximada, nao as duas.");
  if (nascimento != null) {
    if (!dataValida(nascimento)) throw new AuthError(400, "Data de nascimento invalida: use AAAA-MM-DD.");
    if (nascimento > hoje) throw new AuthError(400, "A data de nascimento nao pode ser futura.");
    if (idadeEm(nascimento, hoje) > 25) throw new AuthError(400, "Confira a data de nascimento: o limite e de 25 anos.");
    return { birth_on: nascimento, approx_age: null, approx_age_on: null };
  }
  if (aproximada != null) {
    if (!Number.isInteger(aproximada) || aproximada < 0 || aproximada > 25) throw new AuthError(400, "A idade aproximada vai de 0 a 25 anos.");
    return { birth_on: null, approx_age: aproximada, approx_age_on: hoje };
  }
  return { birth_on: null, approx_age: null, approx_age_on: null };
}

export function cadastrarFilho(
  db: Db,
  ctx: Contexto,
  d: { nome: string; nascimento?: string | null; idadeAproximada?: number | null },
  hoje = localDate(),
): Filho {
  exigir(ctx, "agenda");
  const nome = validarNome(d.nome);
  const idade = validarIdade(d.nascimento ?? null, d.idadeAproximada ?? null, hoje);
  const existentes = filhosDaConta(db, ctx.conta);
  if (existentes.length >= LIMITE_FILHOS) throw new AuthError(409, `Limite de ${LIMITE_FILHOS} filhos por conta.`);
  if (existentes.some((l) => semAcento(l.name) === semAcento(nome))) throw new AuthError(409, "Ja existe um filho com esse nome.");
  const id = db
    .prepare(
      `INSERT INTO children (phone, created_by, name, birth_on, approx_age, approx_age_on, created_on, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(ctx.conta, ctx.membro, nome, idade.birth_on, idade.approx_age, idade.approx_age_on, hoje, new Date().toISOString()).lastInsertRowid;
  return filhoDe(filhoDaConta(db, ctx, Number(id)), hoje);
}

/** Cada filho com o proximo compromisso aberto, aniversario dele incluido; "a marcar" e passado ficam de fora. */
export function listarFilhos(db: Db, ctx: Contexto, hoje = localDate()): Filho[] {
  exigir(ctx, "agenda");
  const linhas = filhosDaConta(db, ctx.conta);
  const proximos = [
    ...compromissosDaConta(db, ctx.conta).filter((c) => c.situacao === "aberto" && c.data && c.data >= hoje),
    ...aniversariosNoPeriodo(linhas, hoje, addDias(hoje, 366)),
  ].sort(ordenar);
  return linhas.map((l) => ({ ...filhoDe(l, hoje), proximo: proximos.find((c) => c.filhoId === l.id) ?? null }));
}

export function atualizarFilho(
  db: Db,
  ctx: Contexto,
  id: number,
  d: { nome?: string; nascimento?: string | null; idadeAproximada?: number | null },
  hoje = localDate(),
): Filho {
  exigir(ctx, "agenda");
  const atual = filhoDaConta(db, ctx, id);
  const nome = d.nome !== undefined ? validarNome(d.nome) : atual.name;
  if (filhosDaConta(db, ctx.conta).some((l) => l.id !== id && semAcento(l.name) === semAcento(nome))) {
    throw new AuthError(409, "Ja existe um filho com esse nome.");
  }
  let idade = { birth_on: atual.birth_on, approx_age: atual.approx_age, approx_age_on: atual.approx_age_on };
  if (d.nascimento !== undefined || d.idadeAproximada !== undefined) {
    // Informar um dos dois troca o outro; nunca ficam os dois.
    const nascimento = d.nascimento !== undefined ? d.nascimento : d.idadeAproximada !== undefined ? null : atual.birth_on;
    const aproximada = d.idadeAproximada !== undefined ? d.idadeAproximada : d.nascimento !== undefined ? null : atual.approx_age;
    idade = validarIdade(nascimento, aproximada, hoje);
  }
  db.prepare(`UPDATE children SET name = ?, birth_on = ?, approx_age = ?, approx_age_on = ? WHERE id = ? AND phone = ?`).run(
    nome,
    idade.birth_on,
    idade.approx_age,
    idade.approx_age_on,
    id,
    ctx.conta,
  );
  return filhoDe(filhoDaConta(db, ctx, id), hoje);
}

/** Quanto some junto com o filho, para o assistente avisar antes de pedir a confirmacao. */
export function contarDoFilho(db: Db, ctx: Contexto, id: number) {
  exigir(ctx, "agenda");
  filhoDaConta(db, ctx, id);
  const n = (tabela: string) => (db.prepare(`SELECT COUNT(*) AS n FROM ${tabela} WHERE child_id = ? AND phone = ?`).get(id, ctx.conta) as { n: number }).n;
  return { compromissos: n("child_events"), vacinas: n("child_vaccines") };
}

/** Apaga o filho, os compromissos e as vacinas dele de uma vez e devolve quantos eram. */
export function removerFilho(db: Db, ctx: Contexto, id: number) {
  exigir(ctx, "agenda");
  filhoDaConta(db, ctx, id);
  return db.transaction(() => {
    const vacinas = db.prepare(`DELETE FROM child_vaccines WHERE child_id = ? AND phone = ?`).run(id, ctx.conta).changes;
    const compromissos = db.prepare(`DELETE FROM child_events WHERE child_id = ? AND phone = ?`).run(id, ctx.conta).changes;
    db.prepare(`DELETE FROM children WHERE id = ? AND phone = ?`).run(id, ctx.conta);
    return { compromissos, vacinas };
  })();
}

/** Para a exclusao de conta, que o produto ainda nao tem; hoje so a restauracao do seed usa. */
export function apagarFilhosDaConta(db: Db, conta: string) {
  db.transaction(() => {
    for (const tabela of ["child_vaccines", "child_events", "children"]) db.prepare(`DELETE FROM ${tabela} WHERE phone = ?`).run(conta);
  })();
}

const nomes = (ls: FilhoLinha[]) => ls.map((l) => l.name).join(", ");

/** O filho pelo nome dito; sem nome so vale com um filho. Ambiguo ou ausente vira texto para o modelo perguntar. */
export function resolverFilho(db: Db, ctx: Contexto, nome: string | null | undefined): FilhoLinha {
  exigir(ctx, "agenda");
  const todos = filhosDaConta(db, ctx.conta);
  if (!todos.length) throw new AuthError(404, "Nenhum filho cadastrado. Pergunte o nome e cadastre com cadastrar_filho.");
  const alvo = semAcento(nome ?? "");
  if (!alvo) {
    if (todos.length === 1) return todos[0];
    throw new AuthError(409, `Mais de um filho cadastrado: ${nomes(todos)}. Pergunte de qual e chame de novo.`);
  }
  const exatos = todos.filter((l) => semAcento(l.name) === alvo);
  if (exatos.length === 1) return exatos[0];
  const prefixo = todos.filter((l) => semAcento(l.name).startsWith(alvo));
  if (prefixo.length === 1) return prefixo[0];
  if (prefixo.length > 1) throw new AuthError(409, `Mais de um filho combina com "${nome}": ${nomes(prefixo)}. Pergunte de qual e chame de novo.`);
  throw new AuthError(404, `Nao achei filho chamado "${nome}". Filhos cadastrados: ${nomes(todos)}. Pergunte ou cadastre.`);
}

// ---------- compromissos ----------

const SEMANA = ["domingo", "segunda", "terca", "quarta", "quinta", "sexta", "sabado"];
const ddmm = (data: string) => `${data.slice(8, 10)}/${data.slice(5, 7)}`;
/** "sexta 13/11 as 08:00" */
export const quando = (data: string, hora: string | null) => `${SEMANA[asUtc(data).getUTCDay()]} ${ddmm(data)}${hora ? ` as ${hora}` : ""}`;

export interface CamposCompromisso {
  titulo: string;
  disciplina?: string | null;
  amigo?: string | null;
  presente?: string | null;
  local?: string | null;
  observacao?: string | null;
  data?: string | null;
  hora?: string | null;
  antecedenciaDias?: number | null;
  repetirMeses?: number | null;
}

export interface EntradaCompromisso extends CamposCompromisso {
  filhoId: number;
  tipo: TipoCompromisso;
  /** Registro do que ja aconteceu: grava como concluido e sem aviso. */
  jaAconteceu?: boolean | null;
}

function compromissoDe(l: CompromissoLinha, filhoNome: string): Compromisso {
  return {
    id: l.id,
    virtual: false,
    filhoId: l.child_id,
    filhoNome,
    tipo: l.kind,
    titulo: l.title,
    disciplina: l.subject,
    amigo: l.friend_name,
    presente: l.gift_idea,
    presenteSituacao: l.gift_status,
    local: l.place,
    observacao: l.notes,
    data: l.due_on,
    hora: l.due_time,
    antecedenciaDias: l.lead_days,
    repetirMeses: l.repeat_months,
    situacao: l.status,
    aMarcar: l.due_on == null && l.status === "aberto",
  };
}

const texto = (v: string | null | undefined, max: number, erro: string, obrigatorio = false) => {
  const s = (v ?? "").trim();
  if (!s) {
    if (obrigatorio) throw new AuthError(400, erro);
    return null;
  }
  if (s.length > max) throw new AuthError(400, erro);
  return s;
};

/** As regras de campo valem igual na criacao e na edicao. Campo de outro tipo e recusado, nao ignorado. */
export function normalizarCampos(tipo: TipoCompromisso, d: CamposCompromisso) {
  if (!TIPOS_COMPROMISSO.includes(tipo)) throw new AuthError(400, "Tipo de compromisso invalido.");
  const titulo = texto(d.titulo, 80, "O titulo precisa ter de 1 a 80 caracteres.", true)!;
  const disciplina = texto(d.disciplina, 40, "A disciplina tem ate 40 caracteres.");
  if (disciplina && tipo !== "escola") throw new AuthError(400, "A disciplina so vale para compromisso de escola.");
  const amigo = texto(d.amigo, 40, "O nome do amigo precisa ter de 1 a 40 caracteres.");
  if (amigo && tipo !== "aniversario_amigo") throw new AuthError(400, "O nome do amigo so vale para aniversario de amigo.");
  const presente = texto(d.presente, 80, "A ideia de presente tem ate 80 caracteres.");
  if (presente && tipo !== "aniversario_amigo") throw new AuthError(400, "A ideia de presente so vale para aniversario de amigo.");
  const local = texto(d.local, 80, "O local tem ate 80 caracteres.");
  const observacao = texto(d.observacao, 300, "A observacao tem ate 300 caracteres.");

  const data = d.data || null;
  if (data && !dataValida(data)) throw new AuthError(400, "Data invalida: use AAAA-MM-DD.");
  const hora = d.hora || null;
  if (hora && !/^([01]\d|2[0-3]):[0-5]\d$/.test(hora)) throw new AuthError(400, "Hora invalida: use HH:MM.");
  if (hora && !data) throw new AuthError(400, "A hora precisa de uma data.");

  const lead = d.antecedenciaDias ?? null;
  if (lead != null && (!Number.isInteger(lead) || lead < 0 || lead > 60)) throw new AuthError(400, "A antecedencia do aviso vai de 0 a 60 dias.");

  let repetir: number | null = d.repetirMeses ?? null;
  if (tipo === "aniversario_amigo") {
    if (repetir != null && repetir !== 12) throw new AuthError(400, "A repeticao so vale para consultas.");
    repetir = 12;
  } else if (repetir != null) {
    if (tipo !== "consulta") throw new AuthError(400, "A repeticao so vale para consultas.");
    if (!Number.isInteger(repetir) || repetir < 1 || repetir > 24) throw new AuthError(400, "A repeticao vai de 1 a 24 meses.");
  }
  return { titulo, disciplina, amigo, presente, local, observacao, data, hora, lead, repetir };
}

/** O assistente reescreve esta mensagem para dizer ao modelo qual campo mandar de volta. */
export const DATA_PASSADA = "A data ja passou. Confirme se e um registro do que ja aconteceu.";

export function criarCompromisso(db: Db, ctx: Contexto, d: EntradaCompromisso, hoje = localDate()): Compromisso {
  exigir(ctx, "agenda");
  const filho = filhoDaConta(db, ctx, d.filhoId);
  const c = normalizarCampos(d.tipo, d);
  const jaFoi = d.jaAconteceu === true;
  if (c.data && c.data < hoje && !jaFoi) throw new AuthError(400, DATA_PASSADA);
  const amigoAnual = d.tipo === "aniversario_amigo";
  const agora = new Date().toISOString();
  const id = db
    .prepare(
      `INSERT INTO child_events (phone, created_by, child_id, kind, title, subject, friend_name, gift_idea, gift_status, place, notes,
         due_on, due_time, lead_days, repeat_months, anchor_md, status, done_at, created_on, created_at)
       VALUES (@phone, @by, @child, @kind, @title, @subject, @friend, @gift, @giftStatus, @place, @notes,
         @dueOn, @dueTime, @lead, @repeat, @anchor, @status, @doneAt, @hoje, @agora)`,
    )
    .run({
      phone: ctx.conta,
      by: ctx.membro,
      child: filho.id,
      kind: d.tipo,
      title: c.titulo,
      subject: c.disciplina,
      friend: c.amigo,
      gift: c.presente,
      giftStatus: amigoAnual ? "por_comprar" : null,
      place: c.local,
      notes: c.observacao,
      dueOn: c.data,
      dueTime: c.hora,
      lead: c.lead,
      repeat: c.repetir,
      anchor: amigoAnual && c.data ? c.data.slice(5) : null,
      status: jaFoi ? "concluido" : "aberto",
      doneAt: jaFoi ? agora : null,
      hoje,
      agora,
    }).lastInsertRowid;
  return compromissoDaConta(db, ctx, Number(id));
}

export function compromissoDaConta(db: Db, ctx: Contexto, id: number): Compromisso {
  const l = db
    .prepare(`SELECT e.*, c.name AS filho_nome FROM child_events e JOIN children c ON c.id = e.child_id WHERE e.id = ? AND e.phone = ?`)
    .get(id, ctx.conta) as (CompromissoLinha & { filho_nome: string }) | undefined;
  if (!l) throw new AuthError(404, `Compromisso #${id} nao encontrado.`);
  return compromissoDe(l, l.filho_nome);
}

/** "Aviso na vespera." conforme a antecedencia do compromisso. */
function textoDoAviso(c: Compromisso) {
  const n = c.antecedenciaDias;
  if (n != null) return n === 0 ? "Aviso no dia." : n === 1 ? "Aviso na vespera." : `Aviso ${n} dias antes.`;
  return c.tipo === "aniversario_amigo" ? "Aviso 3 dias antes e na vespera." : "Aviso na vespera.";
}

/** Confirmacao curta que o assistente repassa. O filho vai entre parenteses para nao depender do genero do nome. */
export function descreverCompromisso(c: Compromisso) {
  const base = `#${c.id} ${c.titulo} (${c.filhoNome})`;
  if (c.situacao === "concluido" && c.data) return `Registrado como ja aconteceu: ${base}, ${quando(c.data, c.hora)}. Sem aviso.`;
  if (c.situacao === "concluido") return `Registrado como ja aconteceu: ${base}. Sem aviso.`;
  if (!c.data) return `Registrado como a marcar: ${base}. Te lembro toda semana ate marcar.`;
  const presente = c.tipo === "aniversario_amigo" && c.presente ? ` Presente: ${c.presente} (${c.presenteSituacao === "comprado" ? "comprado" : "por comprar"}).` : "";
  const repete = c.tipo === "consulta" && c.repetirMeses ? ` Repete a cada ${c.repetirMeses === 1 ? "mes" : `${c.repetirMeses} meses`}.` : "";
  return `Registrado: ${base}, ${quando(c.data, c.hora)}.${presente}${repete} ${textoDoAviso(c)}`;
}

// ---------- avisos ----------

/** Dias antes do compromisso em que o aviso sai; `lead_days` do compromisso vale no lugar. */
const ANTECEDENCIA_PADRAO: Record<TipoCompromisso, number[]> = {
  escola: [1],
  vacina: [1],
  consulta: [1],
  outro: [1],
  aniversario_amigo: [3, 1],
};
const ANTECEDENCIA_ANIVERSARIO_DO_FILHO = 7;
const EMOJI: Record<TipoCompromisso, string> = { escola: "📚", aniversario_amigo: "🎂", vacina: "💉", consulta: "🩺", outro: "📌" };

export const diasEntre = (de: string, ate: string) => Math.round((asUtc(ate).getTime() - asUtc(de).getTime()) / 86_400_000);
const faltam = (n: number) => (n <= 0 ? "hoje" : n === 1 ? "amanha" : `em ${n} dias`);

export interface AvisoFilho {
  chave: string;
  texto: string;
}

function textoDoCompromisso(l: CompromissoLinha, filho: string, hoje: string) {
  const disciplina = l.subject ? ` (${l.subject})` : "";
  let t = `${EMOJI[l.kind]} ${filho}: ${l.title}${disciplina} ${faltam(diasEntre(hoje, l.due_on!))}, ${quando(l.due_on!, l.due_time)}.`;
  if (l.place) t += ` Local: ${l.place}.`;
  if (l.kind === "aniversario_amigo" && l.gift_status === "por_comprar") t += l.gift_idea ? ` Presente: ${l.gift_idea} (por comprar).` : " Presente ainda por comprar.";
  return t;
}

/** Proximo dia do ano, de hoje em diante, em que cai o mes e dia `md`. */
function proximaOcorrencia(md: string, hoje: string) {
  const ano = Number(hoje.slice(0, 4));
  const neste = mdNoAno(md, ano);
  return neste >= hoje ? neste : mdNoAno(md, ano + 1);
}

function proximoAniversario(nascimento: string, hoje: string) {
  const data = proximaOcorrencia(nascimento.slice(5), hoje);
  return { data, idade: Number(data.slice(0, 4)) - Number(nascimento.slice(0, 4)) };
}

const anos = (n: number) => `${n} ${n === 1 ? "ano" : "anos"}`;

/**
 * O que deve sair hoje para a conta. A funcao e pura: quem entrega (`entregar`) grava a chave, e e ela que
 * impede repetir. Dos avisos que ja chegaram na hora, vale o mais proximo da data, para o agendador que ficou
 * parado nao mandar tres mensagens de uma vez. Nao ha aviso retroativo: se o dia dele e o do registro, ou ja
 * passou, o usuario acabou de saber.
 */
export function avisosDevidos(db: Db, conta: string, hoje: string): AvisoFilho[] {
  const devidos: AvisoFilho[] = [];
  const eventos = db
    .prepare(
      `SELECT e.*, c.name AS filho_nome FROM child_events e JOIN children c ON c.id = e.child_id
       WHERE e.phone = ? AND e.status = 'aberto' AND e.due_on IS NOT NULL AND e.due_on >= ?
       ORDER BY e.due_on, e.due_time, e.id`,
    )
    .all(conta, hoje) as (CompromissoLinha & { filho_nome: string })[];
  for (const e of eventos) {
    const antecedencias = e.lead_days != null ? [e.lead_days] : ANTECEDENCIA_PADRAO[e.kind];
    const prontos = antecedencias.filter((n) => hoje >= addDias(e.due_on!, -n) && addDias(e.due_on!, -n) > e.created_on);
    if (!prontos.length) continue;
    const n = Math.min(...prontos);
    devidos.push({ chave: `filho:${e.id}:${e.due_on}:${n}`, texto: textoDoCompromisso(e, e.filho_nome, hoje) });
  }
  const filhos = db.prepare(`SELECT * FROM children WHERE phone = ? AND birth_on IS NOT NULL ORDER BY id`).all(conta) as FilhoLinha[];
  for (const f of filhos) {
    const { data, idade } = proximoAniversario(f.birth_on!, hoje);
    const avisoEm = addDias(data, -ANTECEDENCIA_ANIVERSARIO_DO_FILHO);
    if (hoje < avisoEm || avisoEm <= f.created_on) continue;
    devidos.push({
      chave: `filho-aniv:${f.id}:${data.slice(0, 4)}`,
      texto: `🎂 ${f.name} faz ${anos(idade)} ${faltam(diasEntre(hoje, data))}, ${quando(data, null)}.`,
    });
  }
  return devidos;
}

/**
 * Aniversario de amigo que ja passou volta para a proxima data, com o presente de novo por comprar e a ideia
 * mantida. Roda a cada tick: so mexe no que venceu, entao repetir nao custa.
 */
export function avancarRepetidos(db: Db, hoje: string) {
  const vencidos = db
    .prepare(
      `SELECT id, anchor_md FROM child_events
       WHERE kind = 'aniversario_amigo' AND status = 'aberto' AND due_on IS NOT NULL AND due_on < ? AND anchor_md IS NOT NULL`,
    )
    .all(hoje) as { id: number; anchor_md: string }[];
  const mover = db.prepare(`UPDATE child_events SET due_on = ?, gift_status = 'por_comprar' WHERE id = ?`);
  for (const v of vencidos) mover.run(proximaOcorrencia(v.anchor_md, hoje), v.id);
  return vencidos.length;
}

/** Lembrete semanal do que ainda esta sem data; null quando nao ha nada a marcar. */
export function lembreteAMarcar(db: Db, conta: string): string | null {
  const itens = db
    .prepare(
      `SELECT e.title, c.name AS filho FROM child_events e JOIN children c ON c.id = e.child_id
       WHERE e.phone = ? AND e.status = 'aberto' AND e.due_on IS NULL ORDER BY e.id`,
    )
    .all(conta) as { title: string; filho: string }[];
  if (!itens.length) return null;
  const lista = itens.slice(0, 5).map((i) => `${i.title} (${i.filho})`).join("; ");
  const resto = itens.length > 5 ? ` e mais ${itens.length - 5}` : "";
  return `📝 Ainda sem data: ${lista}${resto}. Me diga quando marcar e eu te lembro.`;
}

/** Linha do resumo da manha com o que os filhos tem hoje; vazio para quem nao tem agenda. */
export function linhasDoDia(db: Db, ctx: Contexto, hoje: string): string[] {
  if (!pode(ctx, "agenda")) return [];
  const eventos = db
    .prepare(
      `SELECT e.title, e.due_time, c.name AS filho FROM child_events e JOIN children c ON c.id = e.child_id
       WHERE e.phone = ? AND e.status = 'aberto' AND e.due_on = ? ORDER BY e.due_time, e.id`,
    )
    .all(ctx.conta, hoje) as { title: string; due_time: string | null; filho: string }[];
  const partes = eventos.map((e) => `${e.filho}: ${e.title}${e.due_time ? `, ${e.due_time}` : ""}`);
  const filhos = db.prepare(`SELECT * FROM children WHERE phone = ? AND birth_on IS NOT NULL ORDER BY id`).all(ctx.conta) as FilhoLinha[];
  for (const f of filhos) {
    const { data, idade } = proximoAniversario(f.birth_on!, hoje);
    if (data === hoje) partes.push(`${f.name}: aniversario de ${anos(idade)}`);
  }
  return partes.length ? [`- Filhos hoje: ${partes.join("; ")}`] : [];
}

// ---------- consulta ----------

export interface FiltroCompromissos {
  filhoId?: number | null;
  /** `aniversario` e o aniversario do proprio filho, que nao e um compromisso gravado. */
  tipo?: TipoCompromisso | "aniversario" | null;
  de?: string | null;
  ate?: string | null;
  situacao?: "aberto" | "concluido" | "cancelado" | "todos" | null;
}

export interface ListaCompromissos {
  compromissos: Compromisso[];
  aMarcar: Compromisso[];
  semana: Compromisso[];
}

const ordenar = (a: Compromisso, b: Compromisso) =>
  (a.data ?? "").localeCompare(b.data ?? "") || (a.hora ?? "").localeCompare(b.hora ?? "") || (a.id ?? Infinity) - (b.id ?? Infinity) || 0;

function compromissosDaConta(db: Db, conta: string): Compromisso[] {
  const linhas = db
    .prepare(`SELECT e.*, c.name AS filho_nome FROM child_events e JOIN children c ON c.id = e.child_id WHERE e.phone = ?`)
    .all(conta) as (CompromissoLinha & { filho_nome: string })[];
  return linhas.map((l) => compromissoDe(l, l.filho_nome));
}

/** Aniversario do filho como item `virtual`, so de quem tem data de nascimento e so a partir do primeiro ano. */
function aniversariosNoPeriodo(filhos: FilhoLinha[], de: string, ate: string): Compromisso[] {
  const lista: Compromisso[] = [];
  for (const f of filhos) {
    if (!f.birth_on) continue;
    for (let ano = Number(de.slice(0, 4)); ano <= Number(ate.slice(0, 4)); ano++) {
      const data = mdNoAno(f.birth_on.slice(5), ano);
      const idade = ano - Number(f.birth_on.slice(0, 4));
      if (idade < 1 || data < de || data > ate) continue;
      lista.push({
        id: null,
        virtual: true,
        filhoId: f.id,
        filhoNome: f.name,
        tipo: "aniversario",
        titulo: `Aniversario de ${f.name}, ${anos(idade)}`,
        disciplina: null,
        amigo: null,
        presente: null,
        presenteSituacao: null,
        local: null,
        observacao: null,
        data,
        hora: null,
        antecedenciaDias: null,
        repetirMeses: null,
        situacao: "aberto",
        aMarcar: false,
      });
    }
  }
  return lista;
}

/**
 * O que vem por ai: `compromissos` no periodo (padrao hoje a 30 dias) pelos filtros, `aMarcar` sem data, e `semana`,
 * sempre os proximos 7 dias de todos os filhos, sem filtro, para o painel.
 */
export function listarCompromissos(db: Db, ctx: Contexto, filtro: FiltroCompromissos = {}, hoje = localDate()): ListaCompromissos {
  exigir(ctx, "agenda");
  const de = filtro.de ?? hoje;
  const ate = filtro.ate ?? addDias(hoje, 30);
  if (!dataValida(de) || !dataValida(ate)) throw new AuthError(400, "Data invalida: use AAAA-MM-DD.");
  if (ate < de) throw new AuthError(400, "A data final vem antes da inicial.");
  if (diasEntre(de, ate) > 1826) throw new AuthError(400, "O periodo vai ate 5 anos.");
  if (filtro.filhoId != null) filhoDaConta(db, ctx, filtro.filhoId);
  const situacao = filtro.situacao ?? "aberto";
  const filhos = filhosDaConta(db, ctx.conta);
  const todos = compromissosDaConta(db, ctx.conta);
  const pelosFiltros = (c: Compromisso) => (filtro.filhoId == null || c.filhoId === filtro.filhoId) && (!filtro.tipo || c.tipo === filtro.tipo);
  const comAniversarios = situacao === "aberto" || situacao === "todos";

  const compromissos = [
    ...todos.filter((c) => c.data && c.data >= de && c.data <= ate && (situacao === "todos" || c.situacao === situacao) && pelosFiltros(c)),
    ...(comAniversarios ? aniversariosNoPeriodo(filhos, de, ate).filter(pelosFiltros) : []),
  ].sort(ordenar);
  const fimDaSemana = addDias(hoje, 6);
  const semana = [
    ...todos.filter((c) => c.situacao === "aberto" && c.data && c.data >= hoje && c.data <= fimDaSemana),
    ...aniversariosNoPeriodo(filhos, hoje, fimDaSemana),
  ].sort(ordenar);
  return { compromissos, aMarcar: todos.filter((c) => c.aMarcar && pelosFiltros(c)), semana };
}

const ROTULO: Record<TipoCompromisso | "aniversario", string> = {
  escola: "escola",
  aniversario_amigo: "aniversario de amigo",
  vacina: "vacina",
  consulta: "consulta",
  outro: "outro",
  aniversario: "aniversario",
};

/** Resposta da ferramenta: agrupada por filho, em ordem de data, com os "a marcar" no fim. */
export function textoLista(l: ListaCompromissos, filhoNome: string | null) {
  const grupos = new Map<string, Compromisso[]>();
  for (const c of l.compromissos) grupos.set(c.filhoNome, [...(grupos.get(c.filhoNome) ?? []), c]);
  const linhas: string[] = [];
  for (const [nome, itens] of grupos) {
    linhas.push(`${nome}:`);
    for (const c of itens) {
      if (c.virtual) {
        linhas.push(`- ${c.titulo} | ${quando(c.data!, null)}`);
        continue;
      }
      const presente = c.tipo === "aniversario_amigo" && c.presente ? ` | presente: ${c.presente} (${c.presenteSituacao === "comprado" ? "comprado" : "por comprar"})` : "";
      const situacao = c.situacao === "aberto" ? "" : ` | ${c.situacao}`;
      linhas.push(`- #${c.id} ${c.titulo} (${ROTULO[c.tipo]}) | ${quando(c.data!, c.hora)}${presente}${situacao}`);
    }
  }
  if (!grupos.size) linhas.push(filhoNome ? `Nenhum compromisso de ${filhoNome} nesse periodo.` : "Nenhum compromisso dos filhos nesse periodo.");
  if (l.aMarcar.length) {
    linhas.push("A marcar:");
    for (const c of l.aMarcar) linhas.push(`- #${c.id} ${c.titulo} (${c.filhoNome})`);
  }
  return linhas.join("\n");
}

// ---------- atualizacao ----------

export type AcaoCompromisso = "concluir" | "cancelar" | "reabrir" | "presente_comprado" | "presente_por_comprar";

export interface AlteracaoCompromisso extends Partial<CamposCompromisso> {
  acao?: AcaoCompromisso | null;
}

/**
 * Edita campos e/ou muda a situacao. `undefined` mantem o valor, `null` limpa. Concluir o aniversario de um
 * amigo nao o encerra: ele vai para a proxima data com o presente de novo por comprar.
 */
export function atualizarCompromisso(
  db: Db,
  ctx: Contexto,
  id: number,
  d: AlteracaoCompromisso,
  hoje = localDate(),
): { compromisso: Compromisso; proximo: Compromisso | null } {
  exigir(ctx, "agenda");
  const atual = db.prepare(`SELECT * FROM child_events WHERE id = ? AND phone = ?`).get(id, ctx.conta) as CompromissoLinha | undefined;
  if (!atual) throw new AuthError(404, `Compromisso #${id} nao encontrado.`);
  const muda = (campo: keyof AlteracaoCompromisso) => d[campo] !== undefined;
  const c = normalizarCampos(atual.kind, {
    titulo: d.titulo ?? atual.title,
    disciplina: muda("disciplina") ? d.disciplina : atual.subject,
    amigo: muda("amigo") ? d.amigo : atual.friend_name,
    presente: muda("presente") ? d.presente : atual.gift_idea,
    local: muda("local") ? d.local : atual.place,
    observacao: muda("observacao") ? d.observacao : atual.notes,
    data: muda("data") ? d.data : atual.due_on,
    hora: muda("hora") ? d.hora : muda("data") && !d.data ? null : atual.due_time,
    antecedenciaDias: muda("antecedenciaDias") ? d.antecedenciaDias : atual.lead_days,
    repetirMeses: muda("repetirMeses") ? d.repetirMeses : atual.repeat_months,
  });
  if (muda("data") && c.data && c.data < hoje) throw new AuthError(400, "A nova data ja passou.");

  let { status, done_at: feitoEm, gift_status: presente, anchor_md: ancora } = atual;
  let data = c.data;
  if (muda("data") && atual.kind === "aniversario_amigo" && data) ancora = data.slice(5);
  let proximo: Compromisso | null = null;
  switch (d.acao) {
    case "concluir":
      if (atual.kind === "aniversario_amigo" && data) {
        data = proximaOcorrencia(ancora ?? data.slice(5), addDias(data, 1));
        presente = "por_comprar";
      } else {
        status = "concluido";
        feitoEm = new Date().toISOString();
      }
      break;
    case "cancelar":
      status = "cancelado";
      break;
    case "reabrir":
      status = "aberto";
      feitoEm = null;
      break;
    case "presente_comprado":
    case "presente_por_comprar":
      if (atual.kind !== "aniversario_amigo") throw new AuthError(400, "O presente so vale para aniversario de amigo.");
      presente = d.acao === "presente_comprado" ? "comprado" : "por_comprar";
      break;
  }
  db.transaction(() => {
    db.prepare(
      `UPDATE child_events SET title = ?, subject = ?, friend_name = ?, gift_idea = ?, gift_status = ?, place = ?, notes = ?,
         due_on = ?, due_time = ?, lead_days = ?, repeat_months = ?, anchor_md = ?, status = ?, done_at = ? WHERE id = ? AND phone = ?`,
    ).run(c.titulo, c.disciplina, c.amigo, c.presente, presente, c.local, c.observacao, data, c.hora, c.lead, c.repetir, ancora, status, feitoEm, id, ctx.conta);
    if (d.acao === "concluir" && status === "concluido" && atual.kind === "consulta" && atual.repeat_months && data) {
      proximo = proximaConsulta(db, ctx, { ...atual, due_on: data }, hoje);
    }
  })();
  return { compromisso: compromissoDaConta(db, ctx, id), proximo };
}

/**
 * A consulta de rotina so volta depois de concluida: `repeat_months` depois da data dela, ou na primeira data
 * ainda por vir se o usuario concluiu muito depois. Reabrir e concluir de novo nao duplica a seguinte.
 */
function proximaConsulta(db: Db, ctx: Contexto, c: CompromissoLinha, hoje: string) {
  let data = somarMeses(c.due_on!, c.repeat_months!);
  while (data < hoje) data = somarMeses(data, c.repeat_months!);
  const existente = db
    .prepare(`SELECT id FROM child_events WHERE phone = ? AND child_id = ? AND kind = 'consulta' AND title = ? AND due_on = ? AND status = 'aberto'`)
    .get(ctx.conta, c.child_id, c.title, data) as { id: number } | undefined;
  if (existente) return compromissoDaConta(db, ctx, existente.id);
  return criarCompromisso(
    db,
    ctx,
    {
      filhoId: c.child_id,
      tipo: "consulta",
      titulo: c.title,
      data,
      hora: c.due_time,
      local: c.place,
      observacao: c.notes,
      antecedenciaDias: c.lead_days,
      repetirMeses: c.repeat_months,
    },
    hoje,
  );
}

/** Apaga de vez; a vacina que apontava para ele perde so o vinculo. Para guardar o historico, use `cancelar`. */
export function apagarCompromisso(db: Db, ctx: Contexto, id: number) {
  exigir(ctx, "agenda");
  compromissoDaConta(db, ctx, id);
  db.transaction(() => {
    db.prepare(`UPDATE child_vaccines SET next_event_id = NULL WHERE next_event_id = ? AND phone = ?`).run(id, ctx.conta);
    db.prepare(`DELETE FROM child_events WHERE id = ? AND phone = ?`).run(id, ctx.conta);
  })();
}

// ---------- vacinas ----------

/** Resposta fixa para quem pergunta que vacinas ou consultas o filho deve fazer: o produto so guarda o que foi dito. */
export const AVISO_SAUDE =
  "Nao indico quais vacinas ou consultas fazer. Isso e com o calendario oficial de vacinacao e o pediatra. Aqui tenho so o que voce registrou.";

/** Mesmo dia `n` meses depois; dia 31 vira o ultimo dia dos meses curtos. */
export function somarMeses(data: string, n: number) {
  const [ano, mes, dia] = data.split("-").map(Number);
  const total = ano * 12 + (mes - 1) + n;
  const a = Math.floor(total / 12);
  const m = (total % 12) + 1;
  const ultimo = new Date(Date.UTC(a, m, 0)).getUTCDate();
  return `${a}-${pad(m)}-${pad(Math.min(dia, ultimo))}`;
}

const vacinaDe = (l: VacinaLinha): Vacina => ({ id: l.id, vacina: l.name, dose: l.dose, aplicadaEm: l.applied_on, proximoCompromissoId: l.next_event_id });

export interface EntradaVacina {
  filhoId: number;
  vacina: string;
  dose?: string | null;
  /** Dia em que foi aplicada; nao pode ser futuro. */
  data: string;
  proximaData?: string | null;
  proximaEmMeses?: number | null;
}

/** Guarda a vacina aplicada e, se houver proxima dose, cria o compromisso dela com aviso. Nada indica doses ou prazos. */
export function registrarVacina(db: Db, ctx: Contexto, d: EntradaVacina, hoje = localDate()): { vacina: Vacina; proximo: Compromisso | null } {
  exigir(ctx, "agenda");
  const filho = filhoDaConta(db, ctx, d.filhoId);
  const nome = texto(d.vacina, 60, "O nome da vacina precisa ter de 1 a 60 caracteres.", true)!;
  const dose = texto(d.dose, 20, "A dose tem ate 20 caracteres.");
  if (!dataValida(d.data)) throw new AuthError(400, "Data invalida: use AAAA-MM-DD.");
  if (d.data > hoje) throw new AuthError(400, "A data da vacina nao pode ser futura.");
  if (d.proximaData && d.proximaEmMeses != null) throw new AuthError(400, "Informe a data da proxima dose ou em quantos meses, nao os dois.");
  let proxima: string | null = null;
  if (d.proximaEmMeses != null) {
    if (!Number.isInteger(d.proximaEmMeses) || d.proximaEmMeses < 1 || d.proximaEmMeses > 24) throw new AuthError(400, "A proxima dose vai de 1 a 24 meses depois.");
    proxima = somarMeses(d.data, d.proximaEmMeses);
  } else if (d.proximaData) {
    if (!dataValida(d.proximaData)) throw new AuthError(400, "Data invalida: use AAAA-MM-DD.");
    proxima = d.proximaData;
  }
  if (proxima && proxima <= d.data) throw new AuthError(400, "A proxima dose precisa ser depois da aplicacao.");
  if (proxima && proxima < hoje) throw new AuthError(400, "A proxima dose cairia numa data que ja passou. Me diga a data certa.");
  return db.transaction(() => {
    const proximo = proxima ? criarCompromisso(db, ctx, { filhoId: filho.id, tipo: "vacina", titulo: `Proxima dose: ${nome}`, data: proxima }, hoje) : null;
    const id = db
      .prepare(`INSERT INTO child_vaccines (phone, created_by, child_id, name, dose, applied_on, next_event_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(ctx.conta, ctx.membro, filho.id, nome, dose, d.data, proximo?.id ?? null, new Date().toISOString()).lastInsertRowid;
    return { vacina: vacinaDe(db.prepare(`SELECT * FROM child_vaccines WHERE id = ?`).get(id) as VacinaLinha), proximo };
  })();
}

/** Historico do mais novo para o mais antigo e as proximas doses abertas, por data. */
export function listarVacinas(db: Db, ctx: Contexto, filhoId: number): { vacinas: Vacina[]; proximas: Compromisso[] } {
  exigir(ctx, "agenda");
  filhoDaConta(db, ctx, filhoId);
  const linhas = db.prepare(`SELECT * FROM child_vaccines WHERE child_id = ? AND phone = ? ORDER BY applied_on DESC, id DESC`).all(filhoId, ctx.conta) as VacinaLinha[];
  const proximas = compromissosDaConta(db, ctx.conta)
    .filter((c) => c.filhoId === filhoId && c.tipo === "vacina" && c.situacao === "aberto" && c.data)
    .sort(ordenar);
  return { vacinas: linhas.map(vacinaDe), proximas };
}

// FIM-DO-MODULO
