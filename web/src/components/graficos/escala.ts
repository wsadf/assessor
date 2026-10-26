export interface Serie {
  nome: string;
  cor: string;
  valores: number[];
}

/** Teto "redondo" e marcas do eixo Y, para os graficos nao terem rotulos como 1.237. */
export function escala(max: number, marcas = 4) {
  if (max <= 0) return { teto: 1, ticks: [0, 1] };
  const bruto = max / marcas;
  const mag = 10 ** Math.floor(Math.log10(bruto));
  const passo = [1, 2, 2.5, 5, 10].map((f) => f * mag).find((p) => p >= bruto) ?? 10 * mag;
  const teto = Math.ceil(max / passo) * passo;
  const ticks = Array.from({ length: Math.round(teto / passo) + 1 }, (_, i) => i * passo);
  return { teto, ticks };
}

const compact = new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 });
export const rotuloEixo = (v: number) => (v === 0 ? "0" : compact.format(v));
