import {
  addDias,
  categoriasAcima,
  contasAVencer,
  entregar,
  enfileirar,
  lancarDevidas,
  limparRegistros,
  marcarEnvio,
  preferencias,
  resumoManha,
  resumoNoite,
  semanaIso,
  textoCategoria,
  textoRecorrente,
  textoVencimento,
  type Envio,
} from "./avisos.js";
import { repoDoContexto, resolverContexto } from "./conta.js";
import type { Repo } from "./db.js";
import { documentos } from "./documentos.js";
import { estado as estadoGoogle, eventosDoDia, limparAutorizacoes, type Evento } from "./google.js";
import { contextoTitular } from "./permissoes.js";
import { localDate, localHour } from "./time.js";
import { nextOccurrence } from "./tools.js";

export async function runRemindersOnce(repo: Repo, send: Envio, now = new Date()) {
  for (const r of repo.dueReminders(now)) {
    const para = r.notify_phone ?? r.phone;
    const texto = `⏰ Lembrete: ${r.text}`;
    try {
      await send(para, texto);
    } catch (err) {
      // Fora da janela de 24 h a Meta recusa; o lembrete sai na proxima conversa em vez de tentar a cada tick.
      console.error(`[lembrete #${r.id}] guardado para a proxima conversa`, err);
      enfileirar(repo.db, para, texto, now);
    }
    // Se o servidor ficou parado, pula as ocorrencias que ja passaram em vez de disparar todas.
    let next = nextOccurrence(new Date(r.next_run_at), r.recurrence);
    while (next && next <= now) next = nextOccurrence(next, r.recurrence);
    repo.advanceReminder(r, next);
  }
}

export function buildDailySummary(repo: Repo, phone: string, now = new Date()): string | null {
  return resumoManha(repo, contextoTitular(phone), now);
}

/**
 * Avisos de todas as pessoas. Cada tipo sai quando a hora escolhida ja chegou no dia, e a chave
 * em notice_log impede repetir; calculos mais pesados rodam uma vez por dia por pessoa.
 */
export async function rodarAvisos(repo: Repo, send: Envio, now = new Date()) {
  const db = repo.db;
  const hoje = localDate(now);
  const hora = localHour(now);
  const amanha = addDias(hoje, 1);
  lancarDevidas(repo, hoje);

  const pessoas = (db.prepare(`SELECT phone FROM users`).all() as { phone: string }[]).map((u) => u.phone);
  for (const phone of pessoas) {
    const ctx = resolverContexto(db, phone);
    const r = repoDoContexto(repo, ctx);
    const uma = (tipo: string) => marcarEnvio(db, phone, tipo, `verificado:${hoje}`, now);
    for (const p of preferencias(db, ctx)) {
      if (!p.ligado || !p.disponivel || hora < p.hora) continue;
      switch (p.tipo) {
        case "vencimentos":
          for (const c of contasAVencer(db, ctx.conta, amanha, amanha)) {
            await entregar(db, send, phone, p.tipo, `vencimento:${c.id}:${c.due_on}`, textoVencimento(c), now);
          }
          break;
        case "recorrentes":
          for (const t of r.listTransactions(ctx.conta, hoje, hoje).filter((x) => x.recurring_id)) {
            await entregar(db, send, phone, p.tipo, `recorrente:${t.recurring_id}:${hoje}`, textoRecorrente(t), now);
          }
          break;
        case "categoria": {
          if (!uma(p.tipo)) break;
          const semana = semanaIso(hoje);
          for (const c of categoriasAcima(r, ctx.conta, hoje)) {
            await entregar(db, send, phone, p.tipo, `categoria:${c.categoria}:${semana}`, textoCategoria(c), now);
          }
          break;
        }
        case "resumo_manha":
        case "resumo_noite": {
          if (!uma(p.tipo)) break;
          const texto = p.tipo === "resumo_manha" ? resumoManha(repo, ctx, now, await eventosDoResumo(repo, phone, hoje)) : resumoNoite(repo, ctx, now);
          if (texto) await entregar(db, send, phone, p.tipo, hoje, texto, now);
          break;
        }
      }
    }
  }
}

/** Resumo nao depende do Google: falha vira uma linha de aviso, sem conta conectada nao aparece. */
async function eventosDoResumo(repo: Repo, phone: string, hoje: string): Promise<Evento[] | "falhou" | undefined> {
  if (!estadoGoogle(repo.db, phone).conectada) return undefined;
  try {
    return await eventosDoDia(repo.db, phone, hoje);
  } catch {
    return "falhou";
  }
}

export function startScheduler(repo: Repo, send: Envio) {
  let running = false;
  let ultimaLimpeza = 0;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await runRemindersOnce(repo, send);
      await rodarAvisos(repo, send);
      if (Date.now() - ultimaLimpeza > 3_600_000) {
        ultimaLimpeza = Date.now();
        documentos(repo.db).limparPendentes();
        limparRegistros(repo.db, new Date());
        limparAutorizacoes(repo.db);
      }
    } catch (err) {
      console.error("[agendador] falha no tick", err);
    } finally {
      running = false;
    }
  };
  const timer = setInterval(tick, 30_000);
  void tick();
  return () => clearInterval(timer);
}
