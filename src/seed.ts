import { config, DEMO_DB_PATH } from "./config.js";
import { openDb, repo as makeRepo } from "./db.js";
import { fromLocal, localDate } from "./time.js";

// Dados ficticios para ver o painel cheio. Grava em data/demo.db, nunca no banco real.
const file = DEMO_DB_PATH;
const db = openDb(file);
const repo = makeRepo(db);
const phone = config.panel.phone;

for (const table of ["transactions", "reminders", "tasks", "history", "research", "users"]) {
  db.prepare(`DELETE FROM ${table} WHERE phone = ?`).run(phone);
}
repo.ensureUser(phone, "Demonstração");

// Gerador deterministico: a demonstracao sai igual a cada execucao.
let seed = 42;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const pick = <T>(xs: T[]) => xs[Math.floor(rand() * xs.length)];

const today = localDate();
const addDays = (date: string, n: number) => {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

const gastos: [string, string, number, number, string[]][] = [
  ["Mercado", "Compra no mercado", 80, 420, ["debito", "credito Nubank"]],
  ["Alimentação", "Almoço", 25, 70, ["credito Nubank", "pix", "VR"]],
  ["Alimentação", "iFood", 35, 95, ["credito Nubank"]],
  ["Transporte", "Uber", 15, 48, ["credito Itau"]],
  ["Transporte", "Combustível", 150, 280, ["debito"]],
  ["Saúde", "Farmácia", 20, 160, ["debito", "pix"]],
  ["Lazer", "Cinema", 40, 90, ["credito Itau"]],
  ["Padaria", "Padaria café da manhã", 12, 45, ["pix", "debito"]],
  ["Compras", "Loja online", 60, 600, ["credito Nubank", "credito Itau"]],
];
const fixos: [string, string, number, number, string][] = [
  ["Moradia", "Aluguel", 1650, 5, "boleto"],
  ["Moradia", "Condomínio", 480, 8, "boleto"],
  ["Contas", "Energia", 210, 12, "debito automatico"],
  ["Contas", "Internet", 119.9, 15, "credito Nubank"],
  ["Saúde", "Academia", 89.9, 2, "credito Itau"],
  ["Assinaturas", "Streaming", 55.9, 18, "credito Nubank"],
];
const receitas: [string, string, number, number][] = [
  ["Salário", "Salário", 7800, 5],
  ["Freela", "Projeto de site", 1200, 20],
];

const startMonth = (() => {
  const d = new Date(`${today.slice(0, 7)}-01T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() - 5);
  return d.toISOString().slice(0, 7);
})();

let total = 0;
for (let m = 0; m < 6; m++) {
  const d = new Date(`${startMonth}-01T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + m);
  const mes = d.toISOString().slice(0, 7);
  const dia = (n: number) => `${mes}-${String(n).padStart(2, "0")}`;
  const ok = (date: string) => date <= today;
  const add = (kind: "despesa" | "receita", category: string, description: string, valor: number, date: string, pay: string | null) => {
    if (!ok(date)) return;
    repo.addTransaction({ phone, kind, amount_cents: Math.round(valor * 100), category, description, payment_method: pay, occurred_on: date });
    total++;
  };
  for (const [cat, desc, valor, d1] of receitas) {
    if (cat === "Freela" && rand() < 0.4) continue;
    add("receita", cat, desc, valor * (cat === "Freela" ? 0.6 + rand() : 1), dia(d1), "pix");
  }
  for (const [cat, desc, valor, d1, pay] of fixos) add("despesa", cat, desc, valor, dia(d1), pay);
  const qtd = 22 + Math.floor(rand() * 14);
  for (let i = 0; i < qtd; i++) {
    const [cat, desc, min, max, pays] = pick(gastos);
    add("despesa", cat, desc, min + rand() * (max - min), dia(1 + Math.floor(rand() * 28)), pick(pays));
  }
}

const at = (days: number, hhmm: string) => fromLocal(`${addDays(today, days)}T${hhmm}`);
repo.addReminder(phone, "Dentista", at(1, "15:00"), null);
repo.addReminder(phone, "Reunião semanal do time", at(2, "09:00"), "semanal");
repo.addReminder(phone, "Pagar o condomínio", at(4, "09:00"), "mensal");
repo.addReminder(phone, "Tomar o remédio", at(0, "23:30"), "diario");
repo.addReminder(phone, "Aniversário da mãe", at(9, "08:00"), null);
repo.addReminder(phone, "Revisão do carro", at(13, "08:30"), null);

const tarefas: [string, number | null, "normal" | "alta" | "urgente", string | null, "pendente" | "andamento" | "concluida"][] = [
  ["Revisar o contrato do apartamento", -2, "urgente", null, "pendente"],
  ["Ligar para o contador", 1, "alta", null, "pendente"],
  ["Separar documentos do IR", 6, "normal", null, "andamento"],
  ["Orçamento da mudança", 3, "alta", "Mudança do escritório", "andamento"],
  ["Contratar a transportadora", 10, "normal", "Mudança do escritório", "pendente"],
  ["Trocar o plano de internet", null, "normal", "Mudança do escritório", "pendente"],
  ["Pagar o IPVA", -5, "alta", null, "concluida"],
  ["Renovar o seguro do carro", -10, "normal", null, "concluida"],
  ["Enviar a proposta ao cliente", -1, "alta", null, "concluida"],
];
for (const [title, days, priority, project, status] of tarefas) {
  const t = repo.addTask(phone, { title, due_on: days === null ? null : addDays(today, days), priority, project });
  if (status !== "pendente") repo.updateTask(phone, t.id, { status });
}

for (const [role, text] of [
  ["user", "gastei 62 na farmácia"],
  ["assistant", "Lancei R$ 62,00 em Saúde. No mês já são R$ 180,00."],
  ["user", "quanto gastei de mercado esse mes?"],
  ["assistant", "Mercado soma R$ 1.240,00 neste mês."],
] as const) {
  repo.addHistory(phone, role, text);
}

console.log(`Demonstracao gravada em ${file}: ${total} lancamentos, 6 lembretes, ${tarefas.length} tarefas (telefone ${phone}).`);
