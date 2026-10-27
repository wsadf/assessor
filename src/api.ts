import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { config } from "./config.js";
import type { Kind, Repo, Task, Transaction } from "./db.js";
import { fromLocal, localDate } from "./time.js";

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

export function registerApi(app: FastifyInstance, repo: Repo) {
  const phone = config.panel.phone;

  app.register(
    async (api) => {
      // O tunel do webhook deixa o servidor publico; sem token, nenhum dado financeiro sai.
      api.addHook("onRequest", async (req, reply) => {
        if (!config.panel.token) return reply.code(503).send({ erro: "PAINEL_TOKEN nao configurado no .env" });
        if (req.headers["x-painel-token"] !== config.panel.token) return reply.code(401).send({ erro: "token invalido" });
      });

      api.get("/me", async () => {
        const user = repo.getUser(phone);
        return { telefone: phone, nome: user?.name ?? null, ia: config.aiProvider, hoje: localDate() };
      });

      api.get("/meses", async () => {
        const atual = localDate().slice(0, 7);
        const meses = repo.monthsWithData(phone);
        return { meses: meses.includes(atual) ? meses : [atual, ...meses] };
      });

      api.get("/financas", async (req, reply) => {
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

        return {
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
      });

      api.get("/transacoes", async (req, reply) => {
        const q = req.query as { mes?: string; categoria?: string; tipo?: string; contraparte?: string };
        const mes = parse(mesSchema, q.mes ?? localDate().slice(0, 7), reply);
        if (!mes) return;
        const tipo = q.tipo === "despesa" || q.tipo === "receita" ? q.tipo : undefined;
        const { from, to } = range(mes);
        const txs = repo.listTransactions(phone, from, to, { kind: tipo, category: q.categoria || undefined, counterpart: q.contraparte || undefined });
        return { mes, transacoes: txs.map(toTx), categorias: repo.categories(phone), contrapartes: repo.counterparts(phone) };
      });

      api.post("/transacoes", async (req, reply) => {
        const b = parse(txBody, body(req), reply);
        if (!b) return;
        const base = {
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
        const id = Number((req.params as { id: string }).id);
        const b = parse(txBody.partial(), body(req), reply);
        if (!b) return;
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
        const id = Number((req.params as { id: string }).id);
        return repo.deleteTransaction(phone, id) ? { ok: true } : reply.code(404).send({ erro: "transacao nao encontrada" });
      });

      api.get("/categorias", async (req, reply) => {
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
        return {
          mes,
          resumo: { receitas: reais(sum(txs, "receita")), despesas: reais(sum(txs, "despesa")), lancamentos: txs.length },
          fluxo,
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

      api.get("/agenda", async (req, reply) => {
        const dia = parse(dataSchema, (req.query as { dia?: string }).dia ?? localDate(), reply);
        if (!dia) return;
        const ativos = repo.listReminders(phone);
        const item = (r: (typeof ativos)[number]) => ({ id: r.id, texto: r.text, quando: r.next_run_at, recorrencia: r.recurrence });
        const todos = repo.allReminders(phone);
        return {
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
        const b = parse(reminderBody, body(req), reply);
        if (!b) return;
        const when = fromLocal(b.dataHora);
        if (when.getTime() < Date.now()) return reply.code(400).send({ erro: "esse horario ja passou" });
        const r = repo.addReminder(phone, b.texto, when, b.recorrencia ?? null);
        return reply.code(201).send({ id: r.id, texto: r.text, quando: r.next_run_at, recorrencia: r.recurrence });
      });

      api.delete("/lembretes/:id", async (req, reply) => {
        const id = Number((req.params as { id: string }).id);
        return repo.cancelReminder(phone, id) ? { ok: true } : reply.code(404).send({ erro: "lembrete nao encontrado" });
      });

      api.get("/tarefas", async () => {
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
        const b = parse(taskBody, body(req), reply);
        if (!b) return;
        const t = repo.addTask(phone, { title: b.titulo, notes: b.notas, project: b.projeto, due_on: b.prazo, priority: b.prioridade });
        return reply.code(201).send(toTask(t, localDate()));
      });

      api.patch("/tarefas/:id", async (req, reply) => {
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
        const id = Number((req.params as { id: string }).id);
        return repo.deleteTask(phone, id) ? { ok: true } : reply.code(404).send({ erro: "tarefa nao encontrada" });
      });

      api.get("/operacao", async () => {
        const atual = localDate().slice(0, 7);
        const meses = Array.from({ length: 12 }, (_, i) => shiftMonth(atual, i - 11));
        const a = repo.activityByMonth(phone, `${meses[0]}-01`);
        const at = (rows: { month: string; total: number }[], m: string) => rows.find((r) => r.month === m)?.total ?? 0;
        const porMes = meses.map((m) => ({
          mes: m,
          lancamentos: at(a.transactions, m),
          lembretes: at(a.reminders, m),
          tarefas: at(a.tasks, m),
          mensagens: at(a.messages, m),
        }));
        const registros = (p: (typeof porMes)[number]) => p.lancamentos + p.lembretes + p.tarefas;
        const total12 = porMes.reduce((s, p) => s + registros(p), 0);
        const ativos = porMes.filter((p) => registros(p) > 0).length || 1;
        const tarefas = repo.listTasks(phone);
        return {
          registrosNoMes: registros(porMes.at(-1)!),
          mensagensNoMes: porMes.at(-1)!.mensagens,
          ultimos12: total12,
          mediaMensal: Math.round(total12 / ativos),
          tarefasAbertas: tarefas.filter((t) => t.status !== "concluida").length,
          tarefasConcluidas: tarefas.filter((t) => t.status === "concluida").length,
          lembretesAtivos: repo.listReminders(phone).length,
          ia: config.aiProvider,
          porMes,
        };
      });

      api.get("/fiscal", async (req, reply) => {
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

      api.get("/pesquisas", async () => {
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
