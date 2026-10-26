import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { config } from "./config.js";
import type { Recurrence, Repo, Task, Transaction } from "./db.js";
import { brl, formatLocal, fromLocal, localDate } from "./time.js";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "use YYYY-MM-DD");
const nullableIsoDate = isoDate.nullable();
const kind = z.enum(["despesa", "receita"]);
const recurrence = z.enum(["diario", "semanal", "mensal"]).nullable();

const schemas = {
  registrar_transacao: z.object({
    tipo: kind,
    valor: z.number().positive(),
    categoria: z.string().min(1),
    descricao: z.string().min(1),
    forma_pagamento: z.string().nullable(),
    data: nullableIsoDate,
  }),
  consultar_transacoes: z.object({
    data_inicio: isoDate,
    data_fim: isoDate,
    tipo: kind.nullable(),
    categoria: z.string().nullable(),
  }),
  editar_transacao: z.object({
    id: z.number().int(),
    tipo: kind.nullable(),
    valor: z.number().positive().nullable(),
    categoria: z.string().nullable(),
    descricao: z.string().nullable(),
    forma_pagamento: z.string().nullable(),
    data: nullableIsoDate,
  }),
  excluir_transacao: z.object({ id: z.number().int() }),
  criar_lembrete: z.object({
    texto: z.string().min(1),
    data_hora: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "use YYYY-MM-DDTHH:mm"),
    recorrencia: recurrence,
  }),
  listar_lembretes: z.object({}),
  cancelar_lembrete: z.object({ id: z.number().int() }),
  criar_tarefa: z.object({
    titulo: z.string().min(1),
    prazo: nullableIsoDate,
    prioridade: z.enum(["normal", "alta", "urgente"]).nullable(),
    projeto: z.string().min(1).nullable(),
  }),
  listar_tarefas: z.object({ incluir_concluidas: z.boolean().nullable() }),
  atualizar_tarefa: z.object({
    id: z.number().int(),
    status: z.enum(["pendente", "andamento", "concluida"]).nullable(),
    prazo: nullableIsoDate,
    prioridade: z.enum(["normal", "alta", "urgente"]).nullable(),
  }),
};

export type ToolName = keyof typeof schemas;

const str = { type: "string" } as const;
const nullable = (t: object) => ({ anyOf: [t, { type: "null" }] });
const dateDesc = "Data no formato YYYY-MM-DD";

function tool(name: ToolName, description: string, properties: Record<string, object>): Anthropic.Tool {
  return {
    name,
    description,
    strict: true,
    input_schema: {
      type: "object",
      properties,
      required: Object.keys(properties),
      additionalProperties: false,
    },
  };
}

export const toolDefinitions: Anthropic.Tool[] = [
  tool(
    "registrar_transacao",
    "Registra um gasto (despesa) ou um dinheiro recebido (receita). Use quando o usuario disser que gastou, pagou, comprou, recebeu ou mandar foto de nota ou comprovante.",
    {
      tipo: { type: "string", enum: ["despesa", "receita"] },
      valor: { type: "number", description: "Valor em reais, ex.: 62.5" },
      categoria: { ...str, description: "Categoria curta em portugues, ex.: Alimentacao, Mercado, Transporte, Saude, Moradia, Lazer, Salario, Freela" },
      descricao: { ...str, description: "O que foi, ex.: Almoco no iFood" },
      forma_pagamento: nullable({ ...str, description: "pix, debito, credito, dinheiro, boleto, ou o cartao citado" }),
      data: nullable({ ...str, description: `${dateDesc}. null = hoje` }),
    },
  ),
  tool(
    "consultar_transacoes",
    "Soma e lista transacoes de um periodo. Use para perguntas como quanto gastei, quanto sobrou, gastos por categoria.",
    {
      data_inicio: { ...str, description: dateDesc },
      data_fim: { ...str, description: `${dateDesc}, inclusiva` },
      tipo: nullable({ type: "string", enum: ["despesa", "receita"] }),
      categoria: nullable({ ...str, description: "Filtra por uma categoria existente" }),
    },
  ),
  tool(
    "editar_transacao",
    "Corrige uma transacao ja registrada pelo id. Envie null nos campos que nao mudam.",
    {
      id: { type: "integer" },
      tipo: nullable({ type: "string", enum: ["despesa", "receita"] }),
      valor: nullable({ type: "number" }),
      categoria: nullable(str),
      descricao: nullable(str),
      forma_pagamento: nullable(str),
      data: nullable({ ...str, description: dateDesc }),
    },
  ),
  tool("excluir_transacao", "Apaga uma transacao pelo id. So use depois que o usuario confirmar.", {
    id: { type: "integer" },
  }),
  tool(
    "criar_lembrete",
    "Agenda um lembrete enviado no WhatsApp na data e hora indicadas, uma vez ou recorrente.",
    {
      texto: { ...str, description: "O que lembrar, escrito como o aviso que sera enviado" },
      data_hora: { ...str, description: "Primeiro disparo, YYYY-MM-DDTHH:mm no horario local do usuario" },
      recorrencia: nullable({ type: "string", enum: ["diario", "semanal", "mensal"] }),
    },
  ),
  tool("listar_lembretes", "Lista os lembretes ativos do usuario.", {}),
  tool("cancelar_lembrete", "Cancela um lembrete ativo pelo id.", { id: { type: "integer" } }),
  tool(
    "criar_tarefa",
    "Cria uma tarefa (algo a fazer, sem horario marcado). Para avisos em data e hora, use criar_lembrete.",
    {
      titulo: { ...str, description: "O que fazer, curto, ex.: Revisar o contrato" },
      prazo: nullable({ ...str, description: `${dateDesc}. null = sem prazo` }),
      prioridade: nullable({ type: "string", enum: ["normal", "alta", "urgente"] }),
      projeto: nullable({ ...str, description: "Projeto ou assunto que agrupa tarefas, ex.: Mudanca do escritorio" }),
    },
  ),
  tool("listar_tarefas", "Lista as tarefas do usuario, das atrasadas e urgentes para as outras.", {
    incluir_concluidas: nullable({ type: "boolean" }),
  }),
  tool(
    "atualizar_tarefa",
    "Marca uma tarefa como feita, em andamento ou pendente, ou muda prazo e prioridade. Envie null no que nao muda.",
    {
      id: { type: "integer" },
      status: nullable({ type: "string", enum: ["pendente", "andamento", "concluida"] }),
      prazo: nullable({ ...str, description: dateDesc }),
      prioridade: nullable({ type: "string", enum: ["normal", "alta", "urgente"] }),
    },
  ),
];

function describeTask(t: Task) {
  const prazo = t.due_on ? ` | prazo ${t.due_on}` : "";
  const projeto = t.project ? ` | ${t.project}` : "";
  return `#${t.id} [${t.status}] ${t.title} | ${t.priority}${prazo}${projeto}`;
}

const toCents = (v: number) => Math.round(v * 100);

function describe(t: Transaction) {
  const pay = t.payment_method ? `, ${t.payment_method}` : "";
  return `#${t.id} ${t.occurred_on} ${t.kind} ${brl(t.amount_cents)} | ${t.category} | ${t.description}${pay}`;
}

/** Proxima ocorrencia no mesmo horario local. */
export function nextOccurrence(current: Date, rec: Recurrence): Date | null {
  if (!rec) return null;
  const day = localDate(current);
  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone: config.timezone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(current);
  const [y, m, d] = day.split("-").map(Number);
  const base = new Date(Date.UTC(y, m - 1, d));
  if (rec === "diario") base.setUTCDate(base.getUTCDate() + 1);
  if (rec === "semanal") base.setUTCDate(base.getUTCDate() + 7);
  if (rec === "mensal") {
    // Dia 31 vira o ultimo dia do mes seguinte, em vez de pular para o mes depois.
    const target = new Date(Date.UTC(y, m, 1));
    const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    target.setUTCDate(Math.min(d, lastDay));
    return fromLocal(`${target.toISOString().slice(0, 10)}T${time}`);
  }
  return fromLocal(`${base.toISOString().slice(0, 10)}T${time}`);
}

export function executeTool(repo: Repo, phone: string, name: string, rawInput: unknown): string {
  if (!(name in schemas)) throw new Error(`Ferramenta desconhecida: ${name}`);
  const toolName = name as ToolName;
  const parsed = schemas[toolName].safeParse(rawInput);
  if (!parsed.success) {
    throw new Error(`Entrada invalida: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
  }
  const input = parsed.data as any;

  switch (toolName) {
    case "registrar_transacao": {
      const t = repo.addTransaction({
        phone,
        kind: input.tipo,
        amount_cents: toCents(input.valor),
        category: input.categoria,
        description: input.descricao,
        payment_method: input.forma_pagamento,
        occurred_on: input.data ?? localDate(),
      });
      const month = t.occurred_on.slice(0, 7);
      const monthTotal = repo
        .listTransactions(phone, `${month}-01`, `${month}-31`, { kind: t.kind, category: t.category })
        .reduce((s, x) => s + x.amount_cents, 0);
      return `Registrado: ${describe(t)}. Total de ${t.category} no mes: ${brl(monthTotal)}.`;
    }

    case "consultar_transacoes": {
      const rows = repo.listTransactions(phone, input.data_inicio, input.data_fim, {
        kind: input.tipo ?? undefined,
        category: input.categoria ?? undefined,
      });
      if (rows.length === 0) {
        const cats = repo.categories(phone);
        return `Nenhuma transacao no periodo.${cats.length ? ` Categorias existentes: ${cats.join(", ")}.` : ""}`;
      }
      const sum = (k: string) => rows.filter((r) => r.kind === k).reduce((s, r) => s + r.amount_cents, 0);
      const byCat = new Map<string, number>();
      for (const r of rows.filter((r) => r.kind === "despesa")) {
        byCat.set(r.category, (byCat.get(r.category) ?? 0) + r.amount_cents);
      }
      const cats = [...byCat.entries()].sort((a, b) => b[1] - a[1]).map(([c, v]) => `${c}: ${brl(v)}`);
      const latest = rows.slice(0, 15).map(describe);
      return [
        `Periodo ${input.data_inicio} a ${input.data_fim}: ${rows.length} transacoes.`,
        `Despesas: ${brl(sum("despesa"))}. Receitas: ${brl(sum("receita"))}. Saldo: ${brl(sum("receita") - sum("despesa"))}.`,
        cats.length ? `Despesas por categoria: ${cats.join("; ")}.` : "",
        `Mais recentes:\n${latest.join("\n")}${rows.length > 15 ? `\n(+${rows.length - 15} anteriores)` : ""}`,
      ]
        .filter(Boolean)
        .join("\n");
    }

    case "editar_transacao": {
      const before = repo.getTransaction(phone, input.id);
      if (!before) return `Transacao #${input.id} nao encontrada.`;
      const after = repo.updateTransaction(phone, input.id, {
        kind: input.tipo ?? undefined,
        amount_cents: input.valor != null ? toCents(input.valor) : undefined,
        category: input.categoria ?? undefined,
        description: input.descricao ?? undefined,
        payment_method: input.forma_pagamento ?? undefined,
        occurred_on: input.data ?? undefined,
      })!;
      return `Atualizado.\nAntes: ${describe(before)}\nAgora: ${describe(after)}`;
    }

    case "excluir_transacao": {
      const t = repo.getTransaction(phone, input.id);
      if (!t || !repo.deleteTransaction(phone, input.id)) return `Transacao #${input.id} nao encontrada.`;
      return `Excluido: ${describe(t)}`;
    }

    case "criar_lembrete": {
      const when = fromLocal(input.data_hora);
      if (when.getTime() < Date.now() - 60_000) return `Esse horario (${formatLocal(when)}) ja passou. Confirme a data com o usuario.`;
      const r = repo.addReminder(phone, input.texto, when, input.recorrencia);
      return `Lembrete #${r.id} criado para ${formatLocal(when)}${r.recurrence ? `, repete ${r.recurrence}` : ""}: ${r.text}`;
    }

    case "listar_lembretes": {
      const list = repo.listReminders(phone);
      if (list.length === 0) return "Nenhum lembrete ativo.";
      return list
        .map((r) => `#${r.id} ${formatLocal(new Date(r.next_run_at))}${r.recurrence ? ` (${r.recurrence})` : ""}: ${r.text}`)
        .join("\n");
    }

    case "cancelar_lembrete":
      return repo.cancelReminder(phone, input.id)
        ? `Lembrete #${input.id} cancelado.`
        : `Lembrete #${input.id} nao encontrado ou ja encerrado.`;

    case "criar_tarefa": {
      const t = repo.addTask(phone, {
        title: input.titulo,
        due_on: input.prazo,
        priority: input.prioridade ?? "normal",
        project: input.projeto,
      });
      return `Tarefa criada: ${describeTask(t)}`;
    }

    case "listar_tarefas": {
      const list = repo.listTasks(phone).filter((t) => input.incluir_concluidas || t.status !== "concluida");
      if (list.length === 0) return "Nenhuma tarefa.";
      const today = localDate();
      return list.map((t) => describeTask(t) + (t.status !== "concluida" && t.due_on && t.due_on < today ? " | ATRASADA" : "")).join("\n");
    }

    case "atualizar_tarefa": {
      const t = repo.updateTask(phone, input.id, {
        status: input.status ?? undefined,
        due_on: input.prazo ?? undefined,
        priority: input.prioridade ?? undefined,
      });
      return t ? `Atualizada: ${describeTask(t)}` : `Tarefa #${input.id} nao encontrada.`;
    }
  }
}
