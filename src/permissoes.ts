export type Perfil = "titular" | "completo" | "so_gastos" | "agenda_tarefas";
export type PerfilMembro = Exclude<Perfil, "titular">;
export type Capacidade = "despesas" | "receitas" | "agenda" | "tarefas" | "documentos" | "acessos";

export const PERFIS_CONVIDAVEIS = ["completo", "so_gastos", "agenda_tarefas"] as const satisfies readonly PerfilMembro[];

export const CAPACIDADES: Record<Perfil, readonly Capacidade[]> = {
  titular: ["despesas", "receitas", "agenda", "tarefas", "documentos", "acessos"],
  completo: ["despesas", "receitas", "agenda", "tarefas", "documentos"],
  so_gastos: ["despesas"],
  agenda_tarefas: ["agenda", "tarefas"],
};

export const NOME_PERFIL: Record<Perfil, string> = {
  titular: "titular",
  completo: "acesso completo",
  so_gastos: "so gastos",
  agenda_tarefas: "agenda e tarefas",
};

const NOME_AREA: Record<Capacidade, string> = {
  despesas: "os gastos",
  receitas: "as receitas",
  agenda: "a agenda",
  tarefas: "as tarefas",
  documentos: "os documentos",
  acessos: "gerenciar quem tem acesso",
};

/** Quem fala (membro), de quem sao os dados (conta) e o que o perfil libera. */
export interface Contexto {
  membro: string;
  conta: string;
  perfil: Perfil;
  nome: string | null;
  titular: string | null;
  /** A conta tem pelo menos um membro ativo alem do titular. */
  compartilhada: boolean;
}

export const contextoTitular = (phone: string, nome: string | null = null): Contexto => ({
  membro: phone,
  conta: phone,
  perfil: "titular",
  nome,
  titular: nome,
  compartilhada: false,
});

export const pode = (ctx: Contexto, cap: Capacidade) => CAPACIDADES[ctx.perfil].includes(cap);

export class SemPermissao extends Error {
  constructor(ctx: Contexto, cap: Capacidade) {
    super(`Sem permissao: o acesso de ${ctx.nome ?? "quem fala"} nesta conta nao inclui ${NOME_AREA[cap]}.`);
  }
}

export function exigir(ctx: Contexto, cap: Capacidade) {
  if (!pode(ctx, cap)) throw new SemPermissao(ctx, cap);
}
