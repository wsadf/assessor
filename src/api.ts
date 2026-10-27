import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { config, googleConfigurado } from "./config.js";
import type { Kind, Repo, Task, Transaction } from "./db.js";
import { fromLocal, localDate } from "./time.js";
import { assistantNumber, sendNotice } from "./whatsapp.js";
import { auth, AuthError } from "./auth.js";
import { conta as servicoConta, repoDoContexto, resolverContexto } from "./conta.js";
import { CAPACIDADES, contextoTitular, pode, PERFIS_CONVIDAVEIS, SemPermissao, type Capacidade, type Contexto } from "./permissoes.js";
import {
  addDias,
  alterarRecorrencia,
  atualizarConta,
  cancelarConta,
  contasAVencer,
  criarConta,
  criarRecorrencia,
  definirPreferencia,
  descreverFrequencia,
  listarContas,
  listarRecorrencias,
  pagarConta,
  preferencias,
  TIPO_IDS,
  type ContaPagar,
  type Recorrencia,
  type TipoAviso,
} from "./avisos.js";
import {
  concluirConexao,
  desconectar as desconectarGoogle,
  estado as estadoGoogle,
  eventosDoDia,
  urlDeAutorizacao,
  usarLink,
  type Evento,
} from "./google.js";
import { documentos as servicoDocumentos, nomeParaDownload, PASTA_IDS, podeVerDocumento, type Documento } from "./documentos.js";

const contaPagarBody = z.object({
  descricao: z.string().trim().min(1).max(80),
  vencimento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  valor: z.number().positive().nullable().optional(),
  categoria: z.string().trim().min(1).optional(),
  mensal: z.boolean(),
});

const recorrenciaBody = z.object({
  tipo: z.enum(["despesa", "receita"]),
  valor: z.number().positive(),
  categoria: z.string().trim().min(1),
  descricao: z.string().trim().min(1).max(80),
  frequencia: z.enum(["diaria", "semanal", "mensal"]),
  inicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  contraparte: z.string().trim().min(1).nullable().optional(),
  pagamento: z.string().trim().min(1).nullable().optional(),
});

const toConta = (c: ContaPagar) => ({
  id: c.id,
  descricao: c.description,
  valor: c.amount_cents === null ? null : c.amount_cents / 100,
  categoria: c.category,
  vencimento: c.due_on,
  mensal: c.due_day !== null,
  situacao: c.status,
  vencida: c.status === "aberta" && c.due_on < localDate(),
  ultimaTransacaoId: c.paid_transaction_id,
});

const toRecorrencia = (r: Recorrencia) => ({
  id: r.id,
  tipo: r.kind,
  valor: r.amount_cents / 100,
  categoria: r.category,
  descricao: r.description,
  contraparte: r.counterpart,
  pagamento: r.payment_method,
  frequencia: r.frequency,
  frequenciaTexto: descreverFrequencia(r),
  proxima: r.next_on,
  situacao: r.status,
});

const documentoBody = z.object({
  titulo: z.string().trim().min(1).max(120).optional(),
  pasta: z.enum(PASTA_IDS).optional(),
  descricao: z.string().trim().max(600).nullable().optional(),
});

const mesSchema = z.string().regex(/^\d{4}-\d{2}$/);
const dataSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const lastDay = (mes: string) => {
  const [y, m] = mes.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
};
const range = (mes: string) => ({ from: `${mes}-01`, to: `${mes}-${String(lastDay(mes)).padStart(2, "0")}` });
const shiftMonth = (mes: string, delta: number) => {
  const [y, m] = mes.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
};
const reais = (cents: number) => Math.round(cents) / 100;
const sum = (txs: Transaction[], kind: Kind) =>
  txs.filter((t) => t.kind === kind).reduce((s, t) => s + t.amount_cents, 0);

const toTx = (t: Transaction) => ({
  id: t.id,
  tipo: t.kind,
  valor: reais(t.amount_cents),
  categoria: t.category,
  descricao: t.description,
  pagamento: t.payment_method,
  data: t.occurred_on,
  contraparte: t.counterpart,
  parcela: t.installment_total ? { numero: t.installment_number!, total: t.installment_total, grupo: t.installment_group! } : null,
});

const toTask = (t: Task, today: string) => ({
  id: t.id,
  titulo: t.title,
  notas: t.notes,
  projeto: t.project,
  prazo: t.due_on,
  prioridade: t.priority,
  status: t.status,
  atrasada: t.status !== "concluida" && !!t.due_on && t.due_on < today,
  criadaEm: t.created_at,
  concluidaEm: t.done_at,
});

function groupBy<T>(items: T[], key: (i: T) => string, value: (i: T) => number) {
  const map = new Map<string, { total: number; qtd: number }>();
  for (const i of items) {
    const k = key(i);
    const cur = map.get(k) ?? { total: 0, qtd: 0 };
    cur.total += value(i);
    cur.qtd += 1;
    map.set(k, cur);
  }
  return [...map.entries()].map(([nome, v]) => ({ nome, total: v.total, qtd: v.qtd })).sort((a, b) => b.total - a.total);
}

const txBody = z.object({
  tipo: z.enum(["despesa", "receita"]),
  valor: z.number().positive(),
  categoria: z.string().trim().min(1),
  descricao: z.string().trim().min(1),
  pagamento: z.string().trim().min(1).nullable().optional(),
  data: dataSchema,
  contraparte: z.string().trim().min(1).nullable().optional(),
  parcelas: z.number().int().min(2).max(60).nullable().optional(),
});

const taskBody = z.object({
  titulo: z.string().trim().min(1),
  notas: z.string().nullable().optional(),
  projeto: z.string().trim().min(1).nullable().optional(),
  prazo: dataSchema.nullable().optional(),
  prioridade: z.enum(["normal", "alta", "urgente"]).optional(),
  status: z.enum(["pendente", "andamento", "concluida"]).optional(),
});

const reminderBody = z.object({
  texto: z.string().trim().min(1),
  dataHora: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/),
  recorrencia: z.enum(["diario", "semanal", "mensal"]).nullable().optional(),
});

/** O parser de JSON do servidor guarda o corpo em { raw, json } por causa da assinatura do webhook. */
const body = (req: FastifyRequest) => (req.body as { json?: unknown } | undefined)?.json;

function parse<T>(schema: z.ZodType<T>, value: unknown, reply: FastifyReply): T | undefined {
  const r = schema.safeParse(value);
  if (r.success) return r.data;
  reply.code(400).send({ erro: r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") });
  return undefined;
}

const cadastroBody = z
  .object({
    nome: z.string().trim().min(2, "informe seu nome"),
    telefone: z.string().transform((s) => s.replace(/\D/g, "")).pipe(z.string().min(10, "WhatsApp incompleto").max(15)),
    email: z.string().trim().email("e-mail invalido"),
    senha: z.string().min(8, "a senha precisa de pelo menos 8 caracteres"),
    plano: z.enum(["mensal", "anual"]).optional(),
    // Quem entra por convite usa o plano do titular.
    convite: z.string().trim().min(1).optional(),
  })
  .refine((b) => b.plano || b.convite, { message: "escolha um plano", path: ["plano"] });
const telefoneSchema = z.string().transform((s) => s.replace(/\D/g, "")).pipe(z.string().min(10).max(15));

/** Capacidades aceitas por rota (basta uma). Rota fora da lista vale para qualquer perfil. */
const FINANCAS: Capacidade[] = ["despesas", "receitas"];
const CAPACIDADE_ROTA: Record<string, Capacidade[]> = {
  "GET /api/meses": FINANCAS,
  "GET /api/financas": ["despesas"],
  "GET /api/transacoes": FINANCAS,
  "POST /api/transacoes": FINANCAS,
  "PATCH /api/transacoes/:id": FINANCAS,
  "DELETE /api/transacoes/:id": FINANCAS,
  "GET /api/categorias": FINANCAS,
  "GET /api/contrapartes": FINANCAS,
  "GET /api/pagamentos": ["despesas"],
  "GET /api/analises": ["despesas"],
  "GET /api/fiscal": ["receitas"],
  "GET /api/agenda": ["agenda"],
  "POST /api/lembretes": ["agenda"],
  "DELETE /api/lembretes/:id": ["agenda"],
  "GET /api/tarefas": ["tarefas"],
  "POST /api/tarefas": ["tarefas"],
  "PATCH /api/tarefas/:id": ["tarefas"],
  "DELETE /api/tarefas/:id": ["tarefas"],
  "GET /api/pesquisas": ["agenda", "tarefas"],
  "GET /api/conta/convites": ["acessos"],
  "POST /api/conta/convites": ["acessos"],
  "DELETE /api/conta/convites/:id": ["acessos"],
  "PATCH /api/conta/membros/:telefone": ["acessos"],
  "DELETE /api/conta/membros/:telefone": ["acessos"],
  // O download de um arquivo fica fora: a regra de visibilidade do documento decide (R18).
  "GET /api/documentos": ["documentos"],
  "PATCH /api/documentos/:id": ["documentos"],
  "DELETE /api/documentos/:id": ["documentos"],
  "GET /api/contas-pagar": ["despesas"],
  "POST /api/contas-pagar": ["despesas"],
  "PATCH /api/contas-pagar/:id": ["despesas"],
  "POST /api/contas-pagar/:id/pagar": ["despesas"],
  "DELETE /api/contas-pagar/:id": ["despesas"],
  // O tipo da recorrencia (despesa ou receita) e conferido na propria rota.
  "GET /api/recorrencias": FINANCAS,
  "POST /api/recorrencias": FINANCAS,
  "PATCH /api/recorrencias/:id": FINANCAS,
  "GET /api/google": ["agenda"],
  "POST /api/google/conectar": ["agenda"],
  "DELETE /api/google": ["agenda"],
};
const SEM_ACESSO = { erro: "Seu acesso a esta conta não inclui isso." };

const conviteBody = z.object({
  perfil: z.enum(PERFIS_CONVIDAVEIS),
  rotulo: z.string().trim().min(1).max(40).nullable().optional(),
});

const mascarar = (phone: string) => `+${phone.slice(0, 2)} ••••• ${phone.slice(-4)}`;

/**
 * Envia o codigo pelo WhatsApp quando o app da Meta esta configurado. Sem ele (ou se a Meta
 * recusar), o codigo vai para o terminal do servidor, o que basta para testar localmente.
 */
async function enviarCodigo(phone: string, codigo: string, log: FastifyInstance["log"]): Promise<"whatsapp" | "terminal"> {
  const texto = `Seu código do Assessor é ${codigo}. Ele vale por 10 minutos. Não compartilhe com ninguém.`;
  if (process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID) {
    try {
      await sendNotice(phone, texto);
      return "whatsapp";
    } catch (err) {
      log.warn({ err }, "falha ao enviar o codigo pelo WhatsApp; usando o terminal");
    }
  }
  console.log(`\n[codigo de acesso] ${mascarar(phone)} -> ${codigo}\n`);
  return "terminal";
}

export function registerApi(app: FastifyInstance, repo: Repo) {
  const contas = auth(repo.db);
  const acessos = servicoConta(repo.db);
  const arquivos = servicoDocumentos(repo.db);
  const contextoDa = new WeakMap<FastifyRequest, Contexto>();
  /** Dados da conta vistos pelo perfil de quem pediu: `phone` e o telefone da conta, nao o de quem esta logado. */
  const de = (req: FastifyRequest) => {
    const ctx = contextoDa.get(req)!;
    return { ctx, phone: ctx.conta, repo: repoDoContexto(repo, ctx) };
  };
  const bearer = (req: FastifyRequest) => req.headers.authorization?.match(/^Bearer\s+(.+)$/i)?.[1];

  const responderErro = (reply: FastifyReply, err: unknown) => {
    if (err instanceof AuthError) return reply.code(err.status).send({ erro: err.message });
    throw err;
  };
  const sessaoPara = (phone: string) => {
    const c = contas.porTelefone(phone)!;
    const ctx = resolverContexto(repo.db, phone);
    return {
      token: contas.abrirSessao(phone),
      conta: {
        nome: c.name,
        email: c.email,
        plano: c.plan,
        testeAte: c.trial_ends_on,
        titular: ctx.perfil === "titular" ? null : ctx.titular,
        perfil: ctx.perfil,
      },
    };
  };

  // Rotas publicas: cadastro, ativacao, entrada e recuperacao de senha.
  app.register(
    async (pub) => {
      pub.post("/convite", async (req, reply) => {
        const b = parse(z.object({ codigo: z.string().trim().min(1), telefone: telefoneSchema }), body(req), reply);
        if (!b) return;
        try {
          const v = acessos.validarConvite(b.codigo, b.telefone);
          return { titular: v.titular, perfil: v.perfil, temDadosProprios: v.temDadosProprios };
        } catch (err) {
          return responderErro(reply, err);
        }
      });

      pub.post("/cadastro", async (req, reply) => {
        const b = parse(cadastroBody, body(req), reply);
        if (!b) return;
        try {
          const convite = b.convite ? acessos.validarConvite(b.convite, b.telefone).convite : null;
          contas.cadastrar({ ...b, plano: b.plano ?? null });
          if (convite) acessos.guardarConvitePendente(b.telefone, convite.id);
          const canal = await enviarCodigo(b.telefone, contas.gerarCodigo(b.telefone, "ativacao"), app.log);
          return reply.code(201).send({ telefone: b.telefone, telefoneMascarado: mascarar(b.telefone), canal });
        } catch (err) {
          return responderErro(reply, err);
        }
      });

      pub.post("/reenviar", async (req, reply) => {
        const b = parse(z.object({ telefone: telefoneSchema }), body(req), reply);
        if (!b) return;
        if (!contas.porTelefone(b.telefone)) return reply.code(404).send({ erro: "Cadastro não encontrado. Comece de novo." });
        try {
          const canal = await enviarCodigo(b.telefone, contas.gerarCodigo(b.telefone, "ativacao"), app.log);
          return { canal, telefoneMascarado: mascarar(b.telefone) };
        } catch (err) {
          return responderErro(reply, err);
        }
      });

      pub.post("/ativar", async (req, reply) => {
        const b = parse(z.object({ telefone: telefoneSchema, codigo: z.string().regex(/^\d{6}$/, "o código tem 6 números") }), body(req), reply);
        if (!b) return;
        try {
          contas.conferirCodigo(b.telefone, "ativacao", b.codigo);
          contas.ativar(b.telefone);
          const convite = acessos.aceitarPendente(b.telefone);
          const sessao = sessaoPara(b.telefone);
          return convite && "expirou" in convite ? { ...sessao, aviso: "O convite venceu. Peça um novo a quem convidou." } : sessao;
        } catch (err) {
          return responderErro(reply, err);
        }
      });

      pub.post("/entrar", async (req, reply) => {
        const b = parse(z.object({ email: z.string().trim().min(3), senha: z.string().min(1) }), body(req), reply);
        if (!b) return;
        try {
          return sessaoPara(contas.entrar(b.email, b.senha).phone);
        } catch (err) {
          return responderErro(reply, err);
        }
      });

      pub.post("/esqueci", async (req, reply) => {
        const b = parse(z.object({ email: z.string().trim().email("e-mail invalido") }), body(req), reply);
        if (!b) return;
        const conta = contas.porEmail(b.email);
        // Resposta igual com ou sem conta, para nao revelar quais e-mails estao cadastrados.
        if (conta) {
          try {
            await enviarCodigo(conta.phone, contas.gerarCodigo(conta.phone, "senha"), app.log);
          } catch (err) {
            return responderErro(reply, err);
          }
        }
        return { ok: true };
      });

      pub.post("/redefinir", async (req, reply) => {
        const b = parse(
          z.object({ email: z.string().trim().email(), codigo: z.string().regex(/^\d{6}$/, "o código tem 6 números"), senha: z.string().min(8, "a senha precisa de pelo menos 8 caracteres") }),
          body(req),
          reply,
        );
        if (!b) return;
        const conta = contas.porEmail(b.email);
        if (!conta) return reply.code(400).send({ erro: "Código incorreto." });
        try {
          contas.conferirCodigo(conta.phone, "senha", b.codigo);
          contas.trocarSenha(conta.phone, b.senha);
          // O codigo chegou no WhatsApp da conta: isso tambem comprova o numero.
          contas.ativar(conta.phone);
          return sessaoPara(conta.phone);
        } catch (err) {
          return responderErro(reply, err);
        }
      });

      pub.post("/sair", async (req) => {
        const t = bearer(req);
        if (t) contas.fecharSessao(t);
        return { ok: true };
      });
    },
    { prefix: "/api/auth" },
  );

  // Rotas que o Google e o link do WhatsApp abrem no navegador, sem sessao do painel.
  // Ficam num plugin proprio para nao passar pelo hook de sessao das rotas privadas.
  app.register(
    async (pub) => {
      const pagina = (reply: FastifyReply, titulo: string, texto: string, status = 200) =>
        reply
          .code(status)
          .type("text/html; charset=utf-8")
          .send(
            `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
              `<title>${titulo}</title><body style="font-family:system-ui,sans-serif;max-width:420px;margin:15vh auto;padding:0 16px;line-height:1.5">` +
              `<h1 style="font-size:22px">${titulo}</h1><p>${texto}</p></body></html>`,
          );

      pub.get("/conectar/:token", async (req, reply) => {
        if (!googleConfigurado()) return pagina(reply, "Google Agenda indisponível", "A agenda do Google não está configurada neste servidor.", 503);
        const phone = usarLink(repo.db, (req.params as { token: string }).token);
        if (!phone) return pagina(reply, "Link vencido", "Link vencido ou já usado. Peça outro ao assessor no WhatsApp.", 400);
        return reply.redirect(urlDeAutorizacao(repo.db, phone), 302);
      });

      pub.get("/retorno", async (req, reply) => {
        const q = req.query as { code?: string; state?: string; error?: string };
        if (q.error || !q.code || !q.state) {
          return pagina(reply, "Agenda não conectada", "A Google Agenda não foi conectada. Se quiser tentar de novo, peça outro link ao assessor.", 400);
        }
        try {
          await concluirConexao(repo.db, q.code, q.state);
          return pagina(reply, "Google Agenda conectada", "Tudo certo. Pode voltar para o WhatsApp ou para o painel.");
        } catch (err) {
          req.log.warn({ err }, "falha ao concluir a conexao com o Google");
          return pagina(reply, "Agenda não conectada", (err as Error).message, 400);
        }
      });
    },
    { prefix: "/api/google" },
  );

  app.register(
    async (api) => {
      // O tunel do webhook deixa o servidor publico: sem sessao (ou o PAINEL_TOKEN de servico), nenhum dado sai.
      api.addHook("onRequest", async (req, reply) => {
        const t = bearer(req);
        let ctx: Contexto;
        if (t) {
          const phone = contas.sessao(t);
          if (!phone) return reply.code(401).send({ erro: "Sessão expirada. Entre de novo." });
          ctx = resolverContexto(repo.db, phone);
        } else if (config.panel.token && req.headers["x-painel-token"] === config.panel.token) {
          ctx = contextoTitular(config.panel.phone);
        } else {
          return reply.code(401).send({ erro: "Entre para continuar." });
        }
        contextoDa.set(req, ctx);
        const exige = CAPACIDADE_ROTA[`${req.method} ${req.routeOptions.url}`];
        if (exige && !exige.some((c) => pode(ctx, c))) return reply.code(403).send(SEM_ACESSO);
      });

      api.get("/me", async (req) => {
        const { ctx } = de(req);
        // Dados pessoais sao de quem esta logado; a conta e a do titular.
        const user = contas.porTelefone(ctx.membro);
        const titular = ctx.perfil === "titular" ? user : contas.porTelefone(ctx.conta);
        return {
          telefone: ctx.membro,
          nome: user?.name ?? null,
          email: user?.email ?? null,
          plano: titular?.plan ?? null,
          testeAte: titular?.trial_ends_on ?? null,
          ia: config.aiProvider,
          hoje: localDate(),
          whatsapp: await assistantNumber(),
          conta: {
            titular: ctx.titular,
            perfil: ctx.perfil,
            capacidades: [...CAPACIDADES[ctx.perfil]],
            compartilhada: ctx.compartilhada,
          },
        };
      });

      api.get("/conta/acessos", async (req) => {
        const { ctx } = de(req);
        const titular = contas.porTelefone(ctx.conta);
        return {
          titular: { nome: titular?.name ?? null, telefoneMascarado: mascarar(ctx.conta) },
          membros: acessos.listarMembros(ctx.conta).map((m) => ({
            telefone: pode(ctx, "acessos") ? m.telefone : null,
            telefoneMascarado: mascarar(m.telefone),
            nome: m.nome,
            perfil: m.perfil,
            desde: m.desde.slice(0, 10),
            voce: m.telefone === ctx.membro,
          })),
          podeGerir: pode(ctx, "acessos"),
        };
      });

      api.get("/conta/convites", async (req) => ({ convites: acessos.listarConvites(de(req).ctx.conta) }));

      /** Documento guardado que quem pediu pode ver; o resto responde como inexistente. */
      const documentoVisivel = (req: FastifyRequest): Documento | undefined => {
        const doc = arquivos.porId(Number((req.params as { id: string }).id));
        return podeVerDocumento(repo, de(req).ctx, doc) && doc.status === "guardado" ? doc : undefined;
      };
      const toDoc = (d: Documento, nomes: Map<string, string>) => ({
        id: d.id,
        titulo: d.title,
        descricao: d.description,
        pasta: d.folder,
        tipo: d.mime_type,
        tamanho: d.size_bytes,
        nomeOriginal: d.original_name,
        dataDocumento: d.document_date,
        enviadoPor: nomes.get(d.created_by) ?? null,
        guardadoEm: d.saved_at,
        transacaoId: d.transaction_id,
      });

      api.get("/documentos", async (req) => {
        const { phone } = de(req);
        const q = req.query as { pasta?: string; busca?: string; pagina?: string };
        const pasta = PASTA_IDS.includes(q.pasta as never) ? q.pasta! : null;
        const nomes = acessos.nomes(phone);
        const lista = q.busca?.trim()
          ? { documentos: arquivos.buscar(phone, q.busca, { pasta, limite: 30 }), total: 0 }
          : arquivos.listar(phone, { pasta, pagina: Number(q.pagina) || 1 });
        const bytes = arquivos.uso(phone);
        return {
          pastas: arquivos.pastasComUso(phone),
          documentos: lista.documentos.map((d) => toDoc(d, nomes)),
          total: q.busca?.trim() ? lista.documentos.length : lista.total,
          uso: { bytes, limite: arquivos.limites.contaBytes, alerta: bytes >= arquivos.limites.contaBytes * 0.8 },
        };
      });

      api.get("/documentos/:id/arquivo", async (req, reply) => {
        const doc = documentoVisivel(req);
        if (!doc) return reply.code(404).send({ erro: "documento nao encontrado" });
        return reply
          .type(doc.mime_type)
          .header("content-disposition", `inline; filename*=UTF-8''${encodeURIComponent(nomeParaDownload(doc))}`)
          .header("cache-control", "private, no-store")
          .send(arquivos.ler(doc));
      });

      api.patch("/documentos/:id", async (req, reply) => {
        const b = parse(documentoBody, body(req), reply);
        if (!b) return;
        const doc = documentoVisivel(req);
        if (!doc) return reply.code(404).send({ erro: "documento nao encontrado" });
        const novo = arquivos.atualizar(doc.id, b)!;
        return toDoc(novo, acessos.nomes(de(req).phone));
      });

      api.delete("/documentos/:id", async (req, reply) => {
        const doc = documentoVisivel(req);
        if (!doc) return reply.code(404).send({ erro: "documento nao encontrado" });
        arquivos.excluir(doc.id);
        return { ok: true };
      });

      api.get("/contas-pagar", async (req) => {
        const { phone } = de(req);
        const incluirPagas = (req.query as { incluirPagas?: string }).incluirPagas === "true";
        return { contas: listarContas(repo.db, phone, { hoje: localDate(), incluirPagas }).map(toConta) };
      });

      api.post("/contas-pagar", async (req, reply) => {
        const b = parse(contaPagarBody, body(req), reply);
        if (!b) return;
        return reply.code(201).send(toConta(criarConta(repo.db, de(req).ctx, b)));
      });

      api.patch("/contas-pagar/:id", async (req, reply) => {
        const b = parse(contaPagarBody.partial(), body(req), reply);
        if (!b) return;
        try {
          return toConta(atualizarConta(repo.db, de(req).ctx, Number((req.params as { id: string }).id), b));
        } catch (err) {
          return responderErro(reply, err);
        }
      });

      api.post("/contas-pagar/:id/pagar", async (req, reply) => {
        const b = parse(z.object({ valor: z.number().positive().optional(), data: dataSchema.optional(), pagamento: z.string().trim().min(1).optional() }), body(req) ?? {}, reply);
        if (!b) return;
        const { ctx, repo: r } = de(req);
        try {
          const pago = pagarConta(r, ctx, Number((req.params as { id: string }).id), b);
          return { conta: toConta(pago.conta), transacao: toTx(pago.transacao) };
        } catch (err) {
          return responderErro(reply, err);
        }
      });

      api.delete("/contas-pagar/:id", async (req, reply) => {
        try {
          cancelarConta(repo.db, de(req).ctx, Number((req.params as { id: string }).id));
          return { ok: true };
        } catch (err) {
          return responderErro(reply, err);
        }
      });

      api.get("/recorrencias", async (req) => ({ recorrencias: listarRecorrencias(repo.db, de(req).ctx).map(toRecorrencia) }));

      api.post("/recorrencias", async (req, reply) => {
        const b = parse(recorrenciaBody, body(req), reply);
        if (!b) return;
        const { ctx } = de(req);
        if (!pode(ctx, b.tipo === "receita" ? "receitas" : "despesas")) return reply.code(403).send(SEM_ACESSO);
        return reply.code(201).send(toRecorrencia(criarRecorrencia(repo.db, ctx, b)));
      });

      api.patch("/recorrencias/:id", async (req, reply) => {
        const b = parse(z.object({ acao: z.enum(["pausar", "retomar", "cancelar"]).optional(), valor: z.number().positive().optional() }), body(req), reply);
        if (!b) return;
        try {
          return toRecorrencia(alterarRecorrencia(repo.db, de(req).ctx, Number((req.params as { id: string }).id), b.acao ?? null, localDate(), b.valor));
        } catch (err) {
          if (err instanceof SemPermissao) return reply.code(403).send(SEM_ACESSO);
          return responderErro(reply, err);
        }
      });

      api.get("/avisos", async (req) => ({
        avisos: preferencias(repo.db, de(req).ctx),
        modeloAprovado: Boolean(config.whatsapp.noticeTemplate),
      }));

      api.put("/avisos/:tipo", async (req, reply) => {
        const tipo = (req.params as { tipo: string }).tipo;
        if (!TIPO_IDS.includes(tipo as TipoAviso)) return reply.code(400).send({ erro: "tipo de aviso invalido" });
        const b = parse(z.object({ ligado: z.boolean(), hora: z.number().int().min(0).max(23).optional() }), body(req), reply);
        if (!b) return;
        const { ctx } = de(req);
        const atual = preferencias(repo.db, ctx).find((p) => p.tipo === tipo)!;
        if (!atual.disponivel) return reply.code(403).send(SEM_ACESSO);
        definirPreferencia(repo.db, ctx.membro, tipo as TipoAviso, b);
        return preferencias(repo.db, ctx).find((p) => p.tipo === tipo);
      });

      api.post("/conta/convites", async (req, reply) => {
        const { ctx } = de(req);
        const b = parse(conviteBody, body(req), reply);
        if (!b) return;
        try {
          const c = acessos.gerarConvite(ctx.conta, b.perfil, b.rotulo);
          const ate = new Date(c.validoAte).toLocaleDateString("pt-BR", { timeZone: config.timezone });
          const quem = ctx.titular ?? "quem te convidou";
          return reply.code(201).send({
            id: c.id,
            codigo: c.codigo,
            perfil: c.perfil,
            validoAte: c.validoAte,
            mensagemWhatsapp: `Oi! Use o código ${c.codigo} em Criar conta no painel do Assessor para entrar na conta de ${quem}. Vale até ${ate}.`,
          });
        } catch (err) {
          return responderErro(reply, err);
        }
      });

      api.delete("/conta/convites/:id", async (req, reply) => {
        const id = Number((req.params as { id: string }).id);
        return acessos.cancelarConvite(de(req).ctx.conta, id) ? { ok: true } : reply.code(404).send({ erro: "convite nao encontrado ou ja usado" });
      });

      api.patch("/conta/membros/:telefone", async (req, reply) => {
        const b = parse(z.object({ perfil: z.enum(PERFIS_CONVIDAVEIS) }), body(req), reply);
        if (!b) return;
        const membro = (req.params as { telefone: string }).telefone;
        return acessos.alterarPerfil(de(req).ctx.conta, membro, b.perfil) ? { ok: true } : reply.code(404).send({ erro: "pessoa nao encontrada" });
      });

      api.delete("/conta/membros/:telefone", async (req, reply) => {
        const membro = (req.params as { telefone: string }).telefone;
        try {
          return acessos.removerMembro(de(req).ctx.conta, membro) ? { ok: true } : reply.code(404).send({ erro: "pessoa nao encontrada" });
        } catch (err) {
          return responderErro(reply, err);
        }
      });

      api.get("/meses", async (req, reply) => {
        const { phone, repo } = de(req);
        const atual = localDate().slice(0, 7);
        const meses = repo.monthsWithData(phone);
        return { meses: meses.includes(atual) ? meses : [atual, ...meses] };
      });

      api.get("/financas", async (req, reply) => {
        const { phone, repo } = de(req);
        const mes = parse(mesSchema, (req.query as { mes?: string }).mes ?? localDate().slice(0, 7), reply);
        if (!mes) return;
        const { from, to } = range(mes);
        const today = localDate();
        const txs = repo.listTransactions(phone, from, to);
        const inicio = repo.balanceBefore(phone, from);
        const receitas = sum(txs, "receita");
        const despesas = sum(txs, "despesa");

        const ultimoDiaVisivel = today.startsWith(mes) ? Number(today.slice(8)) : lastDay(mes);
        const diario: { dia: number; saldo: number }[] = [];
        let acumulado = inicio;
        for (let dia = 1; dia <= ultimoDiaVisivel; dia++) {
          const data = `${mes}-${String(dia).padStart(2, "0")}`;
          for (const t of txs.filter((x) => x.occurred_on === data)) {
            acumulado += t.kind === "receita" ? t.amount_cents : -t.amount_cents;
          }
          diario.push({ dia, saldo: reais(acumulado) });
        }

        const despesasTx = txs.filter((t) => t.kind === "despesa");
        let projecao: { despesas: number; saldoFinal: number; ritmoDiario: number } | null = null;
        if (today.startsWith(mes)) {
          const diasPassados = Number(today.slice(8));
          const ritmo = despesas / diasPassados;
          const projDespesas = ritmo * lastDay(mes);
          projecao = {
            despesas: reais(projDespesas),
            saldoFinal: reais(inicio + receitas - projDespesas),
            ritmoDiario: reais(ritmo),
          };
        } else if (mes < today.slice(0, 7)) {
          projecao = { despesas: reais(despesas), saldoFinal: reais(inicio + receitas - despesas), ritmoDiario: reais(despesas / lastDay(mes)) };
        }

        // Renda variavel: com entradas irregulares, a media e a faixa dizem mais que o mes isolado.
        const ultimos6 = Array.from({ length: 6 }, (_, i) => shiftMonth(mes, i - 5)).map((m) => ({
          mes: m,
          receitas: sum(repo.listTransactions(phone, range(m).from, range(m).to, { kind: "receita" }), "receita"),
        }));
        const comReceita = ultimos6.filter((m) => m.receitas > 0).map((m) => m.receitas);
        const media = comReceita.length ? comReceita.reduce((s, v) => s + v, 0) / comReceita.length : 0;
        const desvio = comReceita.length
          ? Math.sqrt(comReceita.reduce((s, v) => s + (v - media) ** 2, 0) / comReceita.length)
          : 0;

        // Parcelas ja lancadas que vencem nos proximos meses: dinheiro que ja tem destino.
        const futuras = repo
          .listTransactions(phone, shiftMonth(mes, 1) + "-01", range(shiftMonth(mes, 6)).to, { kind: "despesa" })
          .filter((t) => t.installment_total);
        const comprometido = Array.from({ length: 6 }, (_, i) => shiftMonth(mes, i + 1)).map((m) => ({
          mes: m,
          valor: reais(futuras.filter((t) => t.occurred_on.startsWith(m)).reduce((s, t) => s + t.amount_cents, 0)),
        }));

        const anterior = shiftMonth(mes, -1);
        const anteriorTx = repo.listTransactions(phone, range(anterior).from, range(anterior).to, { kind: "despesa" });
        const porDia = groupBy(txs, (t) => t.occurred_on, () => 1);

        const resposta = {
          mes,
          inicioDoMes: reais(inicio),
          receitas: reais(receitas),
          despesas: reais(despesas),
          saldoDoMes: reais(receitas - despesas),
          saldoAtual: reais(inicio + receitas - despesas),
          diario,
          ultimos: txs.slice(0, 6).map(toTx),
          maioresSaidas: [...despesasTx].sort((a, b) => b.amount_cents - a.amount_cents).slice(0, 6).map(toTx),
          porCategoria: groupBy(despesasTx, (t) => t.category, (t) => t.amount_cents).map((c) => ({ ...c, total: reais(c.total) })),
          projecao,
          mesAnterior: { mes: anterior, despesas: reais(anteriorTx.reduce((s, t) => s + t.amount_cents, 0)) },
          renda: {
            meses: ultimos6.map((m) => ({ mes: m.mes, receitas: reais(m.receitas) })),
            media: reais(media),
            menor: reais(comReceita.length ? Math.min(...comReceita) : 0),
            maior: reais(comReceita.length ? Math.max(...comReceita) : 0),
            // Coeficiente de variacao: 0 e renda fixa; acima de ~0,25 a renda oscila bastante.
            variacao: media ? desvio / media : 0,
          },
          comprometido,
          contasProximas: contasAVencer(repo.db, phone, today, addDias(today, 7)).slice(0, 5).map(toConta),
          pulso: {
            lancamentos: txs.length,
            ticketMedio: despesasTx.length ? reais(despesas / despesasTx.length) : 0,
            diaMaisMovimentado: porDia[0] ? { data: porDia[0].nome, qtd: porDia[0].qtd } : null,
            porPagamento: groupBy(despesasTx, (t) => t.payment_method ?? "nao informado", (t) => t.amount_cents).map((p) => ({
              ...p,
              total: reais(p.total),
            })),
          },
        };
        if (pode(de(req).ctx, "receitas")) return resposta;
        // Sem receitas, saldo e renda nao fazem sentido e revelariam quanto entrou.
        const { receitas: _r, saldoDoMes: _s, saldoAtual: _a, inicioDoMes: _i, diario: _d, renda: _n, ...soGastos } = resposta;
        return { ...soGastos, projecao: projecao && { despesas: projecao.despesas, ritmoDiario: projecao.ritmoDiario } };
      });

      api.get("/transacoes", async (req, reply) => {
        const { ctx, phone, repo } = de(req);
        const q = req.query as { mes?: string; categoria?: string; tipo?: string; contraparte?: string };
        const mes = parse(mesSchema, q.mes ?? localDate().slice(0, 7), reply);
        if (!mes) return;
        const tipo = q.tipo === "despesa" || q.tipo === "receita" ? q.tipo : undefined;
        const { from, to } = range(mes);
        const txs = repo.listTransactions(phone, from, to, { kind: tipo, category: q.categoria || undefined, counterpart: q.contraparte || undefined });
        // Autoria so aparece quando ha mais de uma pessoa lancando; nulo e o titular.
        const nomes = ctx.compartilhada ? acessos.nomes(phone) : null;
        const criadoPor = (t: Transaction) => (nomes && t.created_by && t.created_by !== phone ? (nomes.get(t.created_by) ?? "Membro") : null);
        // Transacoes ja vem filtradas pelo perfil, e o comprovante de uma transacao visivel tambem e visivel.
        const comprovantes = arquivos.comprovantes(phone, txs.map((t) => t.id));
        return {
          mes,
          transacoes: txs.map((t) => ({
            ...toTx(t),
            criadoPor: criadoPor(t),
            comprovanteId: comprovantes.get(t.id) ?? null,
            recorrente: t.recurring_id !== null,
            contaPagarId: t.bill_id,
          })),
          categorias: repo.categories(phone),
          contrapartes: repo.counterparts(phone),
        };
      });

      api.post("/transacoes", async (req, reply) => {
        const { ctx, phone, repo } = de(req);
        const b = parse(txBody, body(req), reply);
        if (!b) return;
        if (!pode(ctx, b.tipo === "receita" ? "receitas" : "despesas")) return reply.code(403).send(SEM_ACESSO);
        const base = {
          created_by: ctx.membro,
          phone,
          kind: b.tipo,
          amount_cents: Math.round(b.valor * 100),
          category: b.categoria,
          description: b.descricao,
          payment_method: b.pagamento ?? null,
          occurred_on: b.data,
          counterpart: b.contraparte ?? null,
        };
        if (b.parcelas) return reply.code(201).send(repo.addInstallments(base, b.parcelas).map(toTx)[0]);
        return reply.code(201).send(toTx(repo.addTransaction(base)));
      });

      api.patch("/transacoes/:id", async (req, reply) => {
        const { ctx, phone, repo } = de(req);
        const id = Number((req.params as { id: string }).id);
        const b = parse(txBody.partial(), body(req), reply);
        if (!b) return;
        if (b.tipo && !pode(ctx, b.tipo === "receita" ? "receitas" : "despesas")) return reply.code(403).send(SEM_ACESSO);
        const t = repo.updateTransaction(phone, id, {
          kind: b.tipo,
          amount_cents: b.valor !== undefined ? Math.round(b.valor * 100) : undefined,
          category: b.categoria,
          description: b.descricao,
          payment_method: b.pagamento,
          occurred_on: b.data,
          counterpart: b.contraparte,
        });
        return t ? toTx(t) : reply.code(404).send({ erro: "transacao nao encontrada" });
      });

      api.delete("/transacoes/:id", async (req, reply) => {
        const { phone, repo } = de(req);
        const id = Number((req.params as { id: string }).id);
        return repo.deleteTransaction(phone, id) ? { ok: true } : reply.code(404).send({ erro: "transacao nao encontrada" });
      });

      api.get("/categorias", async (req, reply) => {
        const { phone, repo } = de(req);
        const mes = parse(mesSchema, (req.query as { mes?: string }).mes ?? localDate().slice(0, 7), reply);
        if (!mes) return;
        const { from, to } = range(mes);
        const txs = repo.listTransactions(phone, from, to);
        const categorias = repo.categoryKinds(phone).map(({ category, kind }) => {
          const doMes = txs.filter((t) => t.category === category && t.kind === kind);
          return { nome: category, tipo: kind, totalMes: reais(doMes.reduce((s, t) => s + t.amount_cents, 0)), qtdMes: doMes.length };
        });
        return { mes, categorias: categorias.sort((a, b) => b.totalMes - a.totalMes) };
      });

      api.get("/contrapartes", async (req, reply) => {
        const { phone, repo } = de(req);
        const q = req.query as { mes?: string; busca?: string };
        const mes = parse(mesSchema, q.mes ?? localDate().slice(0, 7), reply);
        if (!mes) return;
        const { from, to } = range(mes);
        const txs = repo.listTransactions(phone, from, to).filter((t) => t.counterpart);
        const semContraparte = repo.listTransactions(phone, from, to).length - txs.length;
        const nomes = [...new Set(txs.map((t) => t.counterpart!))];
        const lista = nomes
          .map((nome) => {
            const deles = txs.filter((t) => t.counterpart === nome);
            return {
              nome,
              enviado: reais(sum(deles, "despesa")),
              recebido: reais(sum(deles, "receita")),
              qtd: deles.length,
              ultima: deles[0].occurred_on,
              pix: deles.filter((t) => /pix/i.test(t.payment_method ?? "")).length,
              transacoes: deles.slice(0, 5).map(toTx),
            };
          })
          .filter((c) => !q.busca || c.nome.toLowerCase().includes(q.busca.toLowerCase()))
          .sort((a, b) => b.enviado + b.recebido - (a.enviado + a.recebido));
        return { mes, contrapartes: lista, semContraparte };
      });

      api.get("/pagamentos", async (req, reply) => {
        const { phone, repo } = de(req);
        const mes = parse(mesSchema, (req.query as { mes?: string }).mes ?? localDate().slice(0, 7), reply);
        if (!mes) return;
        const { from, to } = range(mes);
        const despesasTx = repo.listTransactions(phone, from, to, { kind: "despesa" });
        const total = despesasTx.reduce((s, t) => s + t.amount_cents, 0);
        const formas = groupBy(despesasTx, (t) => t.payment_method ?? "nao informado", (t) => t.amount_cents).map((p) => ({
          nome: p.nome,
          total: reais(p.total),
          qtd: p.qtd,
          participacao: total ? p.total / total : 0,
          ultimos: despesasTx.filter((t) => (t.payment_method ?? "nao informado") === p.nome).slice(0, 3).map(toTx),
        }));
        return { mes, total: reais(total), formas };
      });

      api.get("/analises", async (req, reply) => {
        const { phone, repo } = de(req);
        const q = req.query as { mes?: string; meses?: string };
        const mes = parse(mesSchema, q.mes ?? localDate().slice(0, 7), reply);
        if (!mes) return;
        const n = Math.min(Math.max(Number(q.meses ?? 6) || 6, 2), 12);
        const fluxo = [];
        for (let i = n - 1; i >= 0; i--) {
          const m = shiftMonth(mes, -i);
          const txs = repo.listTransactions(phone, range(m).from, range(m).to);
          fluxo.push({ mes: m, receitas: reais(sum(txs, "receita")), despesas: reais(sum(txs, "despesa")) });
        }
        const { from, to } = range(mes);
        const txs = repo.listTransactions(phone, from, to);
        const despesasTx = txs.filter((t) => t.kind === "despesa");
        const porDia = [];
        for (let dia = 1; dia <= lastDay(mes); dia++) {
          const data = `${mes}-${String(dia).padStart(2, "0")}`;
          porDia.push({ dia, despesas: reais(despesasTx.filter((t) => t.occurred_on === data).reduce((s, t) => s + t.amount_cents, 0)) });
        }
        const veReceitas = pode(de(req).ctx, "receitas");
        return {
          mes,
          resumo: { receitas: veReceitas ? reais(sum(txs, "receita")) : undefined, despesas: reais(sum(txs, "despesa")), lancamentos: txs.length },
          fluxo: veReceitas ? fluxo : fluxo.map(({ receitas: _r, ...f }) => f),
          porCategoria: groupBy(despesasTx, (t) => t.category, (t) => t.amount_cents).map((c) => ({ ...c, total: reais(c.total) })),
          porReceita: groupBy(txs.filter((t) => t.kind === "receita"), (t) => t.category, (t) => t.amount_cents).map((c) => ({
            ...c,
            total: reais(c.total),
          })),
          porPagamento: groupBy(despesasTx, (t) => t.payment_method ?? "nao informado", (t) => t.amount_cents).map((p) => ({
            ...p,
            total: reais(p.total),
          })),
          porDia,
        };
      });

      api.get("/google", async (req) => estadoGoogle(repo.db, de(req).ctx.membro));

      api.post("/google/conectar", async (req, reply) => {
        if (!googleConfigurado()) return reply.code(503).send({ erro: "Google Agenda não configurada neste servidor." });
        return { url: urlDeAutorizacao(repo.db, de(req).ctx.membro) };
      });

      api.delete("/google", async (req) => {
        await desconectarGoogle(repo.db, de(req).ctx.membro);
        return { ok: true };
      });

      api.get("/agenda", async (req, reply) => {
        const { ctx, phone, repo } = de(req);
        const dia = parse(dataSchema, (req.query as { dia?: string }).dia ?? localDate(), reply);
        if (!dia) return;
        const ativos = repo.listReminders(phone);
        const item = (r: (typeof ativos)[number]) => ({ id: r.id, texto: r.text, quando: r.next_run_at, recorrencia: r.recurrence });
        const todos = repo.allReminders(phone);
        // A agenda do Google e de quem esta logado; falha do Google nao derruba a mesa.
        const google = { conectada: estadoGoogle(repo.db, ctx.membro).conectada, eventos: [] as Evento[], erro: null as string | null };
        if (google.conectada) {
          try {
            google.eventos = await eventosDoDia(repo.db, ctx.membro, dia);
          } catch (err) {
            google.erro = (err as Error).message;
          }
        }
        return {
          google,
          dia,
          doDia: ativos.filter((r) => localDate(new Date(r.next_run_at)) === dia).map(item),
          proximos: ativos.filter((r) => new Date(r.next_run_at) > new Date()).slice(0, 12).map(item),
          ativos: ativos.length,
          recorrentes: ativos.filter((r) => r.recurrence).length,
          concluidos: todos.filter((r) => r.status === "concluido").length,
          porDia: groupBy(ativos, (r) => localDate(new Date(r.next_run_at)), () => 1).map((d) => ({ data: d.nome, qtd: d.qtd })),
        };
      });

      api.post("/lembretes", async (req, reply) => {
        const { ctx, phone, repo } = de(req);
        const b = parse(reminderBody, body(req), reply);
        if (!b) return;
        const when = fromLocal(b.dataHora);
        if (when.getTime() < Date.now()) return reply.code(400).send({ erro: "esse horario ja passou" });
        const r = repo.addReminder(phone, b.texto, when, b.recorrencia ?? null, { created_by: ctx.membro, notify_phone: ctx.membro });
        return reply.code(201).send({ id: r.id, texto: r.text, quando: r.next_run_at, recorrencia: r.recurrence });
      });

      api.delete("/lembretes/:id", async (req, reply) => {
        const { phone, repo } = de(req);
        const id = Number((req.params as { id: string }).id);
        return repo.cancelReminder(phone, id) ? { ok: true } : reply.code(404).send({ erro: "lembrete nao encontrado" });
      });

      api.get("/tarefas", async (req, reply) => {
        const { phone, repo } = de(req);
        const today = localDate();
        const tarefas = repo.listTasks(phone).map((t) => toTask(t, today));
        const conta = (f: (t: (typeof tarefas)[number]) => boolean) => tarefas.filter(f).length;
        return {
          tarefas,
          resumo: {
            total: tarefas.length,
            atrasadas: conta((t) => t.atrasada),
            pendentes: conta((t) => t.status === "pendente" && !t.atrasada),
            andamento: conta((t) => t.status === "andamento" && !t.atrasada),
            concluidas: conta((t) => t.status === "concluida"),
          },
          projetos: groupBy(tarefas.filter((t) => t.projeto), (t) => t.projeto!, () => 1).map((p) => ({ nome: p.nome, qtd: p.qtd })),
        };
      });

      api.post("/tarefas", async (req, reply) => {
        const { ctx, phone, repo } = de(req);
        const b = parse(taskBody, body(req), reply);
        if (!b) return;
        const t = repo.addTask(phone, { created_by: ctx.membro, title: b.titulo, notes: b.notas, project: b.projeto, due_on: b.prazo, priority: b.prioridade });
        return reply.code(201).send(toTask(t, localDate()));
      });

      api.patch("/tarefas/:id", async (req, reply) => {
        const { phone, repo } = de(req);
        const id = Number((req.params as { id: string }).id);
        const b = parse(taskBody.partial(), body(req), reply);
        if (!b) return;
        const t = repo.updateTask(phone, id, {
          title: b.titulo,
          notes: b.notas,
          project: b.projeto,
          due_on: b.prazo,
          priority: b.prioridade,
          status: b.status,
        });
        return t ? toTask(t, localDate()) : reply.code(404).send({ erro: "tarefa nao encontrada" });
      });

      api.delete("/tarefas/:id", async (req, reply) => {
        const { phone, repo } = de(req);
        const id = Number((req.params as { id: string }).id);
        return repo.deleteTask(phone, id) ? { ok: true } : reply.code(404).send({ erro: "tarefa nao encontrada" });
      });

      api.get("/operacao", async (req, reply) => {
        const { phone, repo } = de(req);
        const atual = localDate().slice(0, 7);
        const meses = Array.from({ length: 12 }, (_, i) => shiftMonth(atual, i - 11));
        const a = repo.activityByMonth(phone, `${meses[0]}-01`);
        const at = (rows: { month: string; total: number }[], m: string) => rows.find((r) => r.month === m)?.total ?? 0;
        // A contagem tambem segue o perfil: quem nao ve tarefas nao sabe quantas existem.
        const { ctx } = de(req);
        const se = (cap: Capacidade, n: number) => (pode(ctx, cap) ? n : 0);
        const porMes = meses.map((m) => ({
          mes: m,
          lancamentos: se("despesas", at(a.transactions, m)),
          lembretes: se("agenda", at(a.reminders, m)),
          tarefas: se("tarefas", at(a.tasks, m)),
          mensagens: at(a.messages, m),
        }));
        const registros = (p: (typeof porMes)[number]) => p.lancamentos + p.lembretes + p.tarefas;
        const total12 = porMes.reduce((s, p) => s + registros(p), 0);
        const ativos = porMes.filter((p) => registros(p) > 0).length || 1;
        const tarefas = pode(ctx, "tarefas") ? repo.listTasks(phone) : [];
        return {
          registrosNoMes: registros(porMes.at(-1)!),
          mensagensNoMes: porMes.at(-1)!.mensagens,
          ultimos12: total12,
          mediaMensal: Math.round(total12 / ativos),
          tarefasAbertas: tarefas.filter((t) => t.status !== "concluida").length,
          tarefasConcluidas: tarefas.filter((t) => t.status === "concluida").length,
          lembretesAtivos: pode(ctx, "agenda") ? repo.listReminders(phone).length : 0,
          ia: config.aiProvider,
          porMes,
        };
      });

      api.get("/fiscal", async (req, reply) => {
        const { phone, repo } = de(req);
        const mes = parse(mesSchema, (req.query as { mes?: string }).mes ?? localDate().slice(0, 7), reply);
        if (!mes) return;
        const { from, to } = range(mes);
        const receitas = repo.listTransactions(phone, from, to, { kind: "receita" });
        const meses = Array.from({ length: 6 }, (_, i) => shiftMonth(mes, i - 5)).map((m) => ({
          mes: m,
          receitas: reais(
            repo.listTransactions(phone, range(m).from, range(m).to, { kind: "receita" }).reduce((s, t) => s + t.amount_cents, 0),
          ),
        }));
        return {
          mes,
          integracaoNotas: false,
          notas: [],
          faturamentoBase: reais(receitas.reduce((s, t) => s + t.amount_cents, 0)),
          porCategoria: groupBy(receitas, (t) => t.category, (t) => t.amount_cents).map((c) => ({ ...c, total: reais(c.total) })),
          receitas: receitas.map(toTx),
          meses,
        };
      });

      api.get("/pesquisas", async (req, reply) => {
        const { phone, repo } = de(req);
        const pesquisas = repo.listResearch(phone).map((p) => ({
          id: p.id,
          pergunta: p.question,
          resumo: p.summary,
          fontes: JSON.parse(p.sources) as { titulo: string; url: string }[],
          status: p.status,
          criadaEm: p.created_at,
        }));
        return {
          pesquisas,
          entregues: pesquisas.filter((p) => p.status === "entregue").length,
          andamento: pesquisas.filter((p) => p.status === "andamento").length,
          fontes: pesquisas.reduce((s, p) => s + p.fontes.length, 0),
          habilitado: false,
        };
      });
    },
    { prefix: "/api" },
  );
}
