import type { TipoCompromisso } from "../../api";

export const ROTULO: Record<TipoCompromisso | "aniversario", string> = {
  escola: "Escola",
  aniversario_amigo: "Aniversário de amigo",
  vacina: "Vacina",
  consulta: "Consulta",
  outro: "Outro",
  aniversario: "Aniversário",
};

export const TIPOS: TipoCompromisso[] = ["escola", "aniversario_amigo", "vacina", "consulta", "outro"];

/** Meses até a próxima ocorrência da consulta de rotina e até a próxima dose de vacina (a API aceita de 1 a 24). */
export const MESES_DE_REPETICAO = [1, 2, 3, 4, 6, 12, 24];

/** Valor vazio usa o padrão do tipo: 1 dia antes, e 3 dias mais 1 dia no aniversário de amigo. */
export const ANTECEDENCIAS = [
  { valor: "", texto: "Padrão do tipo" },
  { valor: "0", texto: "No dia" },
  { valor: "1", texto: "1 dia antes" },
  { valor: "2", texto: "2 dias antes" },
  { valor: "3", texto: "3 dias antes" },
  { valor: "7", texto: "1 semana antes" },
  { valor: "14", texto: "2 semanas antes" },
];
