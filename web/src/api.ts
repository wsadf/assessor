import { ref } from "vue";

const TOKEN_KEY = "assessor-painel-token";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** Fica true quando a API recusa o token; o App mostra a tela de token. */
export const precisaToken = ref(false);

function token(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function salvarToken(valor: string) {
  try {
    localStorage.setItem(TOKEN_KEY, valor.trim());
  } catch {
    // Sem localStorage (janela privada), o token vale so ate recarregar.
  }
  precisaToken.value = false;
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  const t = token();
  if (t) headers["x-painel-token"] = t;
  if (body !== undefined) headers["content-type"] = "application/json";
  const res = await fetch(`/api${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 || res.status === 503) precisaToken.value = true;
  if (!res.ok) throw new ApiError(res.status, (data as { erro?: string }).erro ?? `Erro ${res.status}`);
  return data as T;
}

const qs = (params: Record<string, string | number | undefined | null>) => {
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== "");
  return entries.length ? `?${new URLSearchParams(entries.map(([k, v]) => [k, String(v)]))}` : "";
};

export const api = {
  get: <T>(path: string, params: Record<string, string | number | undefined | null> = {}) => request<T>("GET", path + qs(params)),
  post: <T>(path: string, body: unknown) => request<T>("POST", path, body),
  patch: <T>(path: string, body: unknown) => request<T>("PATCH", path, body),
  del: <T>(path: string) => request<T>("DELETE", path),
};

export type Tipo = "despesa" | "receita";

export interface Transacao {
  id: number;
  tipo: Tipo;
  valor: number;
  categoria: string;
  descricao: string;
  pagamento: string | null;
  data: string;
  contraparte: string | null;
  parcela: { numero: number; total: number; grupo: string } | null;
}

export interface Contraparte {
  nome: string;
  enviado: number;
  recebido: number;
  qtd: number;
  ultima: string;
  pix: number;
  transacoes: Transacao[];
}

export interface Grupo {
  nome: string;
  total: number;
  qtd: number;
}

export interface Financas {
  mes: string;
  inicioDoMes: number;
  receitas: number;
  despesas: number;
  saldoDoMes: number;
  saldoAtual: number;
  diario: { dia: number; saldo: number }[];
  ultimos: Transacao[];
  maioresSaidas: Transacao[];
  porCategoria: Grupo[];
  projecao: { despesas: number; saldoFinal: number; ritmoDiario: number } | null;
  mesAnterior: { mes: string; despesas: number };
  renda: { meses: { mes: string; receitas: number }[]; media: number; menor: number; maior: number; variacao: number };
  comprometido: { mes: string; valor: number }[];
  pulso: {
    lancamentos: number;
    ticketMedio: number;
    diaMaisMovimentado: { data: string; qtd: number } | null;
    porPagamento: Grupo[];
  };
}

export interface Analises {
  mes: string;
  resumo: { receitas: number; despesas: number; lancamentos: number };
  fluxo: { mes: string; receitas: number; despesas: number }[];
  porCategoria: Grupo[];
  porReceita: Grupo[];
  porPagamento: Grupo[];
  porDia: { dia: number; despesas: number }[];
}

export interface Lembrete {
  id: number;
  texto: string;
  quando: string;
  recorrencia: "diario" | "semanal" | "mensal" | null;
}

export interface Agenda {
  dia: string;
  doDia: Lembrete[];
  proximos: Lembrete[];
  ativos: number;
  recorrentes: number;
  concluidos: number;
  porDia: { data: string; qtd: number }[];
}

export type StatusTarefa = "pendente" | "andamento" | "concluida";
export type Prioridade = "normal" | "alta" | "urgente";

export interface Tarefa {
  id: number;
  titulo: string;
  notas: string | null;
  projeto: string | null;
  prazo: string | null;
  prioridade: Prioridade;
  status: StatusTarefa;
  atrasada: boolean;
  criadaEm: string;
  concluidaEm: string | null;
}

export interface Tarefas {
  tarefas: Tarefa[];
  resumo: { total: number; atrasadas: number; pendentes: number; andamento: number; concluidas: number };
  projetos: { nome: string; qtd: number }[];
}

export interface Operacao {
  registrosNoMes: number;
  mensagensNoMes: number;
  ultimos12: number;
  mediaMensal: number;
  tarefasAbertas: number;
  tarefasConcluidas: number;
  lembretesAtivos: number;
  ia: string;
  porMes: { mes: string; lancamentos: number; lembretes: number; tarefas: number; mensagens: number }[];
}

export interface Fiscal {
  mes: string;
  integracaoNotas: boolean;
  notas: unknown[];
  faturamentoBase: number;
  porCategoria: Grupo[];
  receitas: Transacao[];
  meses: { mes: string; receitas: number }[];
}

export interface Pesquisas {
  pesquisas: { id: number; pergunta: string; resumo: string | null; fontes: { titulo: string; url: string }[]; status: string; criadaEm: string }[];
  entregues: number;
  andamento: number;
  fontes: number;
  habilitado: boolean;
}
