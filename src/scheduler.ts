import { config } from "./config.js";
import type { Repo } from "./db.js";
import { brl, localDate, localHour } from "./time.js";
import { nextOccurrence } from "./tools.js";

type Send = (to: string, text: string) => Promise<void>;

export async function runRemindersOnce(repo: Repo, send: Send, now = new Date()) {
  for (const r of repo.dueReminders(now)) {
    try {
      await send(r.notify_phone ?? r.phone, `⏰ Lembrete: ${r.text}`);
    } catch (err) {
      console.error(`[lembrete #${r.id}] falha ao enviar`, err);
      continue;
    }
    // Se o servidor ficou parado, pula as ocorrencias que ja passaram em vez de disparar todas.
    let next = nextOccurrence(new Date(r.next_run_at), r.recurrence);
    while (next && next <= now) next = nextOccurrence(next, r.recurrence);
    repo.advanceReminder(r, next);
  }
}

export function buildDailySummary(repo: Repo, phone: string, now = new Date()): string | null {
  const today = localDate(now);
  const yesterday = localDate(new Date(now.getTime() - 86_400_000));
  const month = today.slice(0, 7);
  const spentYesterday = repo
    .listTransactions(phone, yesterday, yesterday, { kind: "despesa" })
    .reduce((s, t) => s + t.amount_cents, 0);
  const spentMonth = repo
    .listTransactions(phone, `${month}-01`, today, { kind: "despesa" })
    .reduce((s, t) => s + t.amount_cents, 0);
  const todays = repo.listReminders(phone).filter((r) => localDate(new Date(r.next_run_at)) === today);

  if (spentMonth === 0 && todays.length === 0) return null;
  const lines = ["Bom dia! Seu resumo:"];
  lines.push(`- Ontem: ${brl(spentYesterday)} em gastos`);
  lines.push(`- No mes: ${brl(spentMonth)}`);
  if (todays.length) lines.push(`- Lembretes de hoje: ${todays.map((r) => r.text).join("; ")}`);
  return lines.join("\n");
}

async function runSummaryOnce(repo: Repo, send: Send, now = new Date()) {
  if (localHour(now) < config.dailySummaryHour) return;
  const today = localDate(now);
  for (const phone of repo.usersForSummary(today)) {
    const text = buildDailySummary(repo, phone, now);
    try {
      if (text) await send(phone, text);
      repo.markSummarySent(phone, today);
    } catch (err) {
      console.error(`[resumo ${phone}] falha ao enviar`, err);
    }
  }
}

export function startScheduler(repo: Repo, send: Send) {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await runRemindersOnce(repo, send);
      await runSummaryOnce(repo, send);
    } finally {
      running = false;
    }
  };
  const timer = setInterval(tick, 30_000);
  void tick();
  return () => clearInterval(timer);
}
