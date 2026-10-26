const brlFmt = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const compactFmt = new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 });

export const brl = (v: number) => brlFmt.format(v);
export const brlSinal = (v: number, tipo: "despesa" | "receita") => `${tipo === "despesa" ? "-" : "+"}${brl(v)}`;
export const compacto = (v: number) => `R$ ${compactFmt.format(v)}`;
export const pct = (v: number) => `${Math.round(v * 100)}%`;

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const SEMANA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

/** Datas YYYY-MM-DD sao locais; ler como UTC ao meio-dia evita cair no dia anterior. */
const asDate = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00Z`);

export const mesNome = (mes: string) => `${MESES[Number(mes.slice(5, 7)) - 1]} de ${mes.slice(0, 4)}`;
export const mesCurto = (mes: string) => `${MESES[Number(mes.slice(5, 7)) - 1].slice(0, 3)}/${mes.slice(2, 4)}`;
export const diaMes = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
export const diaSemana = (iso: string) => SEMANA[asDate(iso).getUTCDay()];
export const dataCurta = (iso: string) => `${diaSemana(iso)}, ${diaMes(iso)}`;

export function rotuloDia(iso: string, hoje: string) {
  const diff = Math.round((asDate(iso).getTime() - asDate(hoje).getTime()) / 86_400_000);
  if (diff === 0) return "hoje";
  if (diff === -1) return "ontem";
  if (diff === 1) return "amanhã";
  return dataCurta(iso);
}

export function horaLocal(isoUtc: string) {
  return new Date(isoUtc).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

export function dataLocal(isoUtc: string) {
  const d = new Date(isoUtc);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export const addDias = (iso: string, n: number) => {
  const d = asDate(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

export const pagamentoNome = (p: string | null) => (!p || p === "nao informado" ? "não informado" : p);
