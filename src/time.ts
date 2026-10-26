import { config } from "./config.js";

const tz = () => config.timezone;

function parts(date: Date) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz(),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const p = Object.fromEntries(fmt.formatToParts(date).map((x) => [x.type, x.value]));
  return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour, min: +p.minute, s: +p.second };
}

/** Data local (YYYY-MM-DD) no fuso configurado. */
export function localDate(date = new Date()): string {
  const p = parts(date);
  return `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
}

export function localHour(date = new Date()): number {
  return parts(date).h;
}

/** Converte "YYYY-MM-DDTHH:mm" no fuso configurado para um Date em UTC. */
export function fromLocal(local: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(local);
  if (!m) throw new Error(`Data/hora invalida: ${local}`);
  const asUtc = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  // Ajusta pelo deslocamento do fuso naquele instante (cobre horario de verao).
  const p = parts(new Date(asUtc));
  const offset = Date.UTC(p.y, p.m - 1, p.d, p.h, p.min) - asUtc;
  return new Date(asUtc - offset);
}

/** "dom, 25/10 21:05" no fuso configurado. */
export function formatLocal(date: Date): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: tz(),
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function nowContext(date = new Date()): string {
  const weekday = new Intl.DateTimeFormat("pt-BR", { timeZone: tz(), weekday: "long" }).format(date);
  const p = parts(date);
  const hhmm = `${String(p.h).padStart(2, "0")}:${String(p.min).padStart(2, "0")}`;
  return `${localDate(date)} ${hhmm}, ${weekday} (${tz()})`;
}

export function brl(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
