import { auth } from "./auth.js";
import { criarConta, criarRecorrencia, definirPreferencia } from "./avisos.js";
import { contextoTitular } from "./permissoes.js";
import { config, DEMO_DB_PATH } from "./config.js";
import { conta } from "./conta.js";
import { openDb, repo as makeRepo } from "./db.js";
import { documentos, pastaDeArquivos, type PastaId } from "./documentos.js";
import fs from "node:fs";
import path from "node:path";
import { fromLocal, localDate } from "./time.js";

// Dados ficticios para ver o painel cheio. Grava em data/demo.db, nunca no banco real.
const file = DEMO_DB_PATH;
const db = openDb(file);
const repo = makeRepo(db);
const phone = config.panel.phone;
// Pessoa de perfil so gastos na conta demo, para ver o painel como membro.
const BIA = { phone: "5500000000001", email: "bia@assessor.local" };

// auth() cria a tabela de sessoes; antes dele ela pode nao existir num banco novo.
const contas = auth(db);
for (const p of [phone, BIA.phone]) {
  for (const table of ["transactions", "reminders", "tasks", "history", "research", "users", "sessions"]) {
    db.prepare(`DELETE FROM ${table} WHERE phone = ?`).run(p);
  }
}
db.prepare(`DELETE FROM documents WHERE phone = ?`).run(phone);
for (const table of ["bills", "recurring"]) db.prepare(`DELETE FROM ${table} WHERE phone = ?`).run(phone);
for (const table of ["notice_prefs", "notice_log", "pending_notices"]) {
  for (const p of [phone, BIA.phone]) db.prepare(`DELETE FROM ${table} WHERE phone = ?`).run(p);
}
fs.rmSync(path.join(pastaDeArquivos(db), phone), { recursive: true, force: true });
db.prepare(`DELETE FROM account_members WHERE account_phone = ?`).run(phone);
db.prepare(`DELETE FROM account_invites WHERE account_phone = ?`).run(phone);
for (const p of [phone, BIA.phone]) {
  db.prepare(`DELETE FROM google_accounts WHERE phone = ?`).run(p);
  db.prepare(`DELETE FROM bookings WHERE owner_phone = ?`).run(p);
  db.prepare(`DELETE FROM booking_pages WHERE phone = ?`).run(p);
}
for (const table of ["contact_messages", "contact_sends", "contacts"]) db.prepare(`DELETE FROM ${table} WHERE conta = ?`).run(phone);
for (const table of ["accountant_access", "accountant_invites"]) db.prepare(`DELETE FROM ${table} WHERE account_phone = ?`).run(phone);
for (const table of ["bank_imports", "bank_accounts", "charges", "pix_keys"]) db.prepare(`DELETE FROM ${table} WHERE conta = ?`).run(phone);
repo.ensureUser(phone, "Demonstração");

// Conta de teste para entrar no painel de demonstracao; credenciais ficticias, so deste banco.
const DEMO_EMAIL = "demo@assessor.local";
const DEMO_SENHA = "demo1234";
contas.cadastrar({ nome: "Demonstração", telefone: phone, email: DEMO_EMAIL, senha: DEMO_SENHA, plano: "anual" });
contas.ativar(phone);

const acessos = conta(db);
contas.cadastrar({ nome: "Bia", telefone: BIA.phone, email: BIA.email, senha: DEMO_SENHA, plano: null });
contas.ativar(BIA.phone);
acessos.aceitarConvite(acessos.gerarConvite(phone, "so_gastos", "Bia").codigo, BIA.phone);
acessos.gerarConvite(phone, "completo", "Sócio");

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

const gastos: [string, string, number, number, string[], string[]][] = [
  ["Mercado", "Compra no mercado", 80, 420, ["debito", "credito Nubank"], ["Pão de Açúcar", "Assaí", "Carrefour"]],
  ["Alimentação", "Almoço", 25, 70, ["credito Nubank", "pix", "VR"], ["Restaurante Sabor", "Cantina da Praça"]],
  ["Alimentação", "iFood", 35, 95, ["credito Nubank"], ["iFood"]],
  ["Transporte", "Uber", 15, 48, ["credito Itau"], ["Uber"]],
  ["Transporte", "Combustível", 150, 280, ["debito"], ["Posto Shell", "Posto Ipiranga"]],
  ["Saúde", "Farmácia", 20, 160, ["debito", "pix"], ["Drogasil", "Pague Menos"]],
  ["Lazer", "Cinema", 40, 90, ["credito Itau"], ["Cinemark"]],
  ["Padaria", "Padaria café da manhã", 12, 45, ["pix", "debito"], ["Padaria Pão Quente"]],
  ["Compras", "Loja online", 60, 600, ["credito Nubank", "credito Itau"], ["Amazon", "Mercado Livre"]],
];
const pixPessoas: [string, string, number, number][] = [
  ["Família", "Pix para a mãe", 300, 300],
  ["Pessoal", "Pix para o João", 40, 180],
  ["Pessoal", "Pix para a Ana", 25, 120],
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
  const add = (
    kind: "despesa" | "receita",
    category: string,
    description: string,
    valor: number,
    date: string,
    pay: string | null,
    counterpart: string | null = null,
  ) => {
    if (!ok(date)) return;
    repo.addTransaction({ phone, kind, amount_cents: Math.round(valor * 100), category, description, payment_method: pay, occurred_on: date, counterpart });
    total++;
  };
  for (const [cat, desc, valor, d1] of receitas) {
    if (cat === "Freela" && rand() < 0.4) continue;
    const cliente = cat === "Freela" ? pick(["Ótica Vieira", "Studio Lume", "Café Aroma"]) : "Agência Norte";
    add("receita", cat, desc, valor * (cat === "Freela" ? 0.6 + rand() : 1), dia(d1), "pix", cliente);
  }
  for (const [cat, desc, valor, d1, pay] of fixos) add("despesa", cat, desc, valor, dia(d1), pay);
  const qtd = 22 + Math.floor(rand() * 14);
  for (let i = 0; i < qtd; i++) {
    const [cat, desc, min, max, pays, lojas] = pick(gastos);
    add("despesa", cat, desc, min + rand() * (max - min), dia(1 + Math.floor(rand() * 28)), pick(pays), pick(lojas));
  }
  for (const [cat, desc, min, max] of pixPessoas) {
    const quem = desc.replace("Pix para a ", "").replace("Pix para o ", "");
    const vezes = desc.includes("mãe") ? 1 : 1 + Math.floor(rand() * 3);
    for (let i = 0; i < vezes; i++) add("despesa", cat, desc, min + rand() * (max - min), dia(desc.includes("mãe") ? 10 : 1 + Math.floor(rand() * 28)), "pix", quem[0].toUpperCase() + quem.slice(1));
  }
}

// Parcelamentos com parcelas ja pagas e outras por vencer, para o bloco de dinheiro comprometido.
const mesesAtras = (n: number) => {
  const d = new Date(`${today.slice(0, 7)}-01T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() - n);
  return d.toISOString().slice(0, 7);
};
for (const [desc, cat, valor, parcelas, inicio, dia, loja, pay] of [
  ["Relógio", "Compras", 249.9, 10, 3, "12", "Relojoaria Central", "credito Nubank"],
  ["Parcela do carro", "Transporte", 1180, 24, 5, "15", "Banco Auto", "boleto"],
  ["Notebook", "Compras", 412.5, 8, 1, "07", "Amazon", "credito Itau"],
] as const) {
  const criadas = repo.addInstallments(
    { phone, kind: "despesa", amount_cents: Math.round(valor * 100), category: cat, description: desc, payment_method: pay, occurred_on: `${mesesAtras(inicio)}-${dia}`, counterpart: loja },
    parcelas,
  );
  total += criadas.length;
}

for (const [dias, valor, desc, cat, loja] of [
  [0, 46.9, "Almoço", "Alimentação", "Cantina da Praça"],
  [-2, 23.5, "Uber", "Transporte", "Uber"],
  [-5, 189.4, "Compra no mercado", "Mercado", "Assaí"],
] as const) {
  repo.addTransaction({
    phone, created_by: BIA.phone, kind: "despesa", amount_cents: Math.round(valor * 100), category: cat, description: desc,
    payment_method: "pix", occurred_on: addDays(today, dias), counterpart: loja,
  });
  total++;
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

/** PDF de uma pagina so com texto; as posicoes da tabela xref sao calculadas na hora. */
function pdfSimples(linhas: string[]): Buffer {
  const texto = linhas.map((l, i) => `BT /F1 ${i ? 12 : 16} Tf 56 ${780 - i * 22} Td (${l.replace(/[()\\]/g, "")}) Tj ET`).join("\n");
  const objetos = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${Buffer.byteLength(texto)} >>\nstream\n${texto}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let pdf = "%PDF-1.4\n";
  const posicoes = objetos.map((o, i) => {
    const pos = Buffer.byteLength(pdf);
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
    return pos;
  });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n${posicoes.map((p) => `${String(p).padStart(10, "0")} 00000 n \n`).join("")}`;
  pdf += `trailer\n<< /Size ${objetos.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, "latin1");
}

// PNG de 1 pixel, so para a foto de exemplo ter conteudo valido.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");

const docs = documentos(db);
const ultima = (busca: string) => repo.listTransactions(phone, "0000-01-01", today, { search: busca })[0];
const exemplos: { titulo: string; pasta: PastaId; descricao: string; data: string; arquivo: Buffer; tipo: string; nome: string; tx?: number }[] = [
  {
    titulo: "Contrato de aluguel do apartamento",
    pasta: "contratos",
    descricao: "Locação do apartamento da Rua das Flores, 120, com a Imobiliária Sol. Assinado em março de 2026, prazo de 30 meses, aluguel de R$ 1.650,00.",
    data: `${today.slice(0, 4)}-03-12`,
    arquivo: pdfSimples(["Contrato de locacao residencial", "Locador: Imobiliaria Sol", "Imovel: Rua das Flores, 120", "Prazo: 30 meses", "Aluguel: R$ 1.650,00"]),
    tipo: "application/pdf",
    nome: "contrato-locacao.pdf",
  },
  {
    titulo: "Boleto do condomínio",
    pasta: "boletos",
    descricao: "Boleto da taxa condominial do Edifício Aurora, vencimento no dia 8, R$ 480,00.",
    data: today,
    arquivo: pdfSimples(["Boleto de pagamento", "Condominio Edificio Aurora", "Valor: R$ 480,00"]),
    tipo: "application/pdf",
    nome: "boleto-condominio.pdf",
  },
  {
    titulo: "CRLV do carro",
    pasta: "carro",
    descricao: "Certificado de registro e licenciamento do veículo, placa ABC1D23, exercício atual.",
    data: `${today.slice(0, 4)}-01-20`,
    arquivo: pdfSimples(["CRLV digital", "Placa: ABC1D23"]),
    tipo: "application/pdf",
    nome: "crlv.pdf",
  },
  {
    titulo: "Nota fiscal do notebook",
    pasta: "notas_fiscais",
    descricao: "Nota fiscal eletrônica da compra do notebook na Amazon, parcelada em 8 vezes no cartão Itaú.",
    data: ultima("Notebook")?.occurred_on ?? today,
    arquivo: pdfSimples(["Nota fiscal eletronica", "Emitente: Amazon", "Produto: Notebook"]),
    tipo: "application/pdf",
    nome: "nfe-notebook.pdf",
    tx: ultima("Notebook")?.id,
  },
  {
    titulo: "Receita do dentista",
    pasta: "saude",
    descricao: "Receita da Dra. Paula Mendes para o tratamento de canal, com a lista de remédios.",
    data: today,
    arquivo: PNG,
    tipo: "image/png",
    nome: "receita.png",
  },
  {
    titulo: "Comprovante do aluguel",
    pasta: "comprovantes",
    descricao: "Comprovante do pagamento do aluguel do mês para a Imobiliária Sol.",
    data: ultima("Aluguel")?.occurred_on ?? today,
    arquivo: pdfSimples(["Comprovante de pagamento", "Favorecido: Imobiliaria Sol", "Valor: R$ 1.650,00"]),
    tipo: "application/pdf",
    nome: "comprovante-aluguel.pdf",
    tx: ultima("Aluguel")?.id,
  },
];
for (const e of exemplos) {
  const p = docs.salvarPendente(phone, phone, { data: e.arquivo, mimeType: e.tipo, nomeOriginal: e.nome });
  docs.guardar(p.id, { pasta: e.pasta, titulo: e.titulo, descricao: e.descricao, dataDocumento: e.data, transacaoId: e.tx ?? null });
}

// Contas e recorrencias comecam em datas futuras: no passado, o agendador lancaria tudo de uma vez.
const titularDemo = contextoTitular(phone, "Demonstração");
const proximoDia = (dia: number) => {
  const [y, m, d] = today.split("-").map(Number);
  const mes = d <= dia ? m - 1 : m;
  const ultimo = new Date(Date.UTC(y, mes + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, mes, Math.min(dia, ultimo))).toISOString().slice(0, 10);
};
const proximaSegunda = addDays(today, ((1 - new Date(`${today}T12:00:00Z`).getUTCDay() + 7) % 7) || 7);
criarConta(db, titularDemo, { descricao: "Condomínio", vencimento: proximoDia(8), valor: 480, categoria: "Moradia", mensal: true });
criarConta(db, titularDemo, { descricao: "Fatura Nubank", vencimento: proximoDia(15), categoria: "Cartão", mensal: true });
criarConta(db, titularDemo, { descricao: "IPVA", vencimento: addDays(today, 20), valor: 1240, categoria: "Transporte", mensal: false });
criarRecorrencia(db, titularDemo, { tipo: "despesa", valor: 89.9, categoria: "Saúde", descricao: "Academia", frequencia: "semanal", inicio: proximaSegunda, pagamento: "credito Itau" });
criarRecorrencia(db, titularDemo, { tipo: "despesa", valor: 55.9, categoria: "Assinaturas", descricao: "Streaming", frequencia: "mensal", inicio: proximoDia(18), pagamento: "credito Nubank" });
definirPreferencia(db, phone, "resumo_noite", { ligado: true });

for (const [role, text] of [
  ["user", "gastei 62 na farmácia"],
  ["assistant", "Lancei R$ 62,00 em Saúde. No mês já são R$ 180,00."],
  ["user", "quanto gastei de mercado esse mes?"],
  ["assistant", "Mercado soma R$ 1.240,00 neste mês."],
] as const) {
  repo.addHistory(phone, role, text);
}

console.log(`Demonstracao gravada em ${file}: ${total} lancamentos, 6 lembretes, ${tarefas.length} tarefas, ${exemplos.length} documentos, 3 contas a pagar e 2 recorrencias.`);
console.log(`Para entrar no painel de demonstracao: ${DEMO_EMAIL} / ${DEMO_SENHA}`);
console.log(`Como membro so gastos da mesma conta: ${BIA.email} / ${DEMO_SENHA}`);
