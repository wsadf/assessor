import type { Capacidade } from "./api";

export interface Mesa {
  id: string;
  nome: string;
  assessor: string;
  cargo: string;
  cor: string;
  rota: string;
  /** Basta uma dessas capacidades para ver a mesa; sem a lista, todo perfil ve. */
  exige?: Capacidade[];
}

// Cada mesa tem um assessor com nome e cor proprios; a cor vira a --mesa da tela aberta.
export const MESAS: Mesa[] = [
  { id: "financas", nome: "Finanças", assessor: "Bento", cargo: "Gerente financeiro", cor: "#10b981", rota: "/financas", exige: ["despesas"] },
  { id: "fiscal", nome: "Fiscal", assessor: "Clara", cargo: "Assistente fiscal", cor: "#22b8cf", rota: "/fiscal", exige: ["receitas"] },
  { id: "agenda", nome: "Agenda", assessor: "Lia", cargo: "Secretária executiva", cor: "#5b9cf6", rota: "/agenda", exige: ["agenda"] },
  { id: "tarefas", nome: "Tarefas", assessor: "Davi", cargo: "Projetos e documentos", cor: "#f3b23c", rota: "/tarefas", exige: ["tarefas", "documentos"] },
  { id: "operacao", nome: "Operação", assessor: "Otto", cargo: "Diretor de operações", cor: "#a98bf5", rota: "/operacao" },
  { id: "pesquisas", nome: "Pesquisas", assessor: "Nina", cargo: "Estagiária de pesquisas", cor: "#ee7aa8", rota: "/pesquisas", exige: ["agenda", "tarefas"] },
];

export const mesaLiberada = (m: Mesa, pode: (c: Capacidade) => boolean) => !m.exige || m.exige.some(pode);

export const SUBMENU_FINANCAS = [
  { nome: "Painel", rota: "/financas", icone: "painel" },
  { nome: "Transações", rota: "/financas/transacoes", icone: "transacoes" },
  { nome: "Categorias", rota: "/financas/categorias", icone: "categorias" },
  { nome: "Pessoas e lojas", rota: "/financas/contrapartes", icone: "pessoas" },
  { nome: "Formas de pagamento", rota: "/financas/pagamentos", icone: "cartao" },
  { nome: "Análises", rota: "/financas/analises", icone: "analises" },
];

export const mesaPorId = (id: string) => MESAS.find((m) => m.id === id) ?? MESAS[0];

/** Paleta das series dos graficos, na ordem em que as categorias aparecem. */
export const PALETA = ["#a98bf5", "#f3b23c", "#ee7aa8", "#10b981", "#5b9cf6", "#22b8cf", "#f08a5d", "#9aa0a6"];
