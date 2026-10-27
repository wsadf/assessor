const SESSAO_KEY = "assessor-sessao";
// Sem localStorage (janela privada bloqueada), a sessao vale ate recarregar a pagina.
let sessaoEmMemoria: string | null = null;

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function sessao(): string | null {
  try {
    return localStorage.getItem(SESSAO_KEY) ?? sessaoEmMemoria;
  } catch {
    return sessaoEmMemoria;
  }
}

export function salvarSessao(token: string) {
  sessaoEmMemoria = token;
  try {
    localStorage.setItem(SESSAO_KEY, token);
  } catch {
    // Fica so na memoria.
  }
}

export function limparSessao() {
  sessaoEmMemoria = null;
  try {
    localStorage.removeItem(SESSAO_KEY);
  } catch {
    // Nada guardado.
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  const t = sessao();
  if (t) headers.authorization = `Bearer ${t}`;
  if (body !== undefined) headers["content-type"] = "application/json";
  const res = await fetch(`/api${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  // So redireciona quando havia sessao e ela venceu; sem sessao, quem decide e a guarda do roteador.
  if (res.status === 401 && t && !path.startsWith("/auth/")) {
    limparSessao();
    if (location.pathname !== "/entrar") location.assign(`/entrar?volta=${encodeURIComponent(location.pathname + location.search)}`);
  }
  if (!res.ok) throw new ApiError(res.status, (data as { erro?: string }).erro ?? `Erro ${res.status}`);
  return data as T;
}

export type Perfil = "titular" | "completo" | "so_gastos" | "agenda_tarefas";
export type PerfilMembro = Exclude<Perfil, "titular">;
export type Capacidade = "despesas" | "receitas" | "agenda" | "tarefas" | "documentos" | "acessos";

export const PERFIS: Record<Perfil, { nome: string; detalhe: string }> = {
  titular: { nome: "Titular", detalhe: "dono da conta, vê tudo e gerencia quem tem acesso" },
  completo: { nome: "Acesso completo", detalhe: "vê e lança gastos, receitas, agenda, tarefas e documentos" },
  so_gastos: { nome: "Só gastos", detalhe: "registra e vê só as despesas, sem receitas nem saldo" },
  agenda_tarefas: { nome: "Agenda e tarefas", detalhe: "só lembretes e tarefas, sem nada de dinheiro" },
};

export interface SessaoAberta {
  token: string;
  conta: { nome: string | null; email: string | null; plano: string | null; testeAte: string | null; titular: string | null; perfil: Perfil };
  aviso?: string;
}

export interface Me {
  telefone: string;
  nome: string | null;
  email: string | null;
  plano: string | null;
  testeAte: string | null;
  ia: string;
  hoje: string;
  whatsapp: string | null;
  conta: { titular: string | null; perfil: Perfil; capacidades: Capacidade[]; compartilhada: boolean };
}

export interface ConviteValidado {
  titular: string | null;
  perfil: PerfilMembro;
  temDadosProprios: boolean;
}

export interface Acessos {
  titular: { nome: string | null; telefoneMascarado: string };
  membros: { telefone: string | null; telefoneMascarado: string; nome: string | null; perfil: PerfilMembro; desde: string; voce: boolean }[];
  podeGerir: boolean;
}

export interface Convite {
  id: number;
  final: string;
  perfil: PerfilMembro;
  rotulo: string | null;
  estado: "pendente" | "aceito" | "cancelado" | "expirado";
  validoAte: string;
  aceitoPor: string | null;
}

export interface ConviteCriado {
  id: number;
  codigo: string;
  perfil: PerfilMembro;
  validoAte: string;
  mensagemWhatsapp: string;
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
  /** Quem lancou, quando nao foi o titular; so vem na lista de Transacoes. */
  criadoPor?: string | null;
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

/** Campos opcionais nao vem para quem so ve gastos. */
export interface Financas {
  mes: string;
  inicioDoMes?: number;
  receitas?: number;
  despesas: number;
  saldoDoMes?: number;
  saldoAtual?: number;
  diario?: { dia: number; saldo: number }[];
  ultimos: Transacao[];
  maioresSaidas: Transacao[];
  porCategoria: Grupo[];
  projecao: { despesas: number; saldoFinal?: number; ritmoDiario: number } | null;
  mesAnterior: { mes: string; despesas: number };
  renda?: { meses: { mes: string; receitas: number }[]; media: number; menor: number; maior: number; variacao: number };
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
  resumo: { receitas?: number; despesas: number; lancamentos: number };
  fluxo: { mes: string; receitas?: number; despesas: number }[];
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
