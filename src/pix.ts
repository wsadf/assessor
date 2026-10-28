export type TipoChave = "cpf" | "cnpj" | "email" | "telefone" | "aleatoria";

/** CRC16-CCITT exigido no campo 63 do BR Code (polinomio 0x1021, inicial 0xFFFF). */
export function crc16(texto: string) {
  let crc = 0xffff;
  for (const byte of Buffer.from(texto, "utf8")) {
    crc ^= byte << 8;
    for (let i = 0; i < 8; i++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

const digitos = (s: string) => s.replace(/\D/g, "");

function cpfValido(c: string) {
  if (c.length !== 11 || /^(\d)\1+$/.test(c)) return false;
  const dv = (n: number) => {
    let soma = 0;
    for (let i = 0; i < n; i++) soma += Number(c[i]) * (n + 1 - i);
    const r = (soma * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return dv(9) === Number(c[9]) && dv(10) === Number(c[10]);
}

function cnpjValido(c: string) {
  if (c.length !== 14 || /^(\d)\1+$/.test(c)) return false;
  const dv = (n: number) => {
    const pesos = n === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const soma = pesos.reduce((s, p, i) => s + p * Number(c[i]), 0);
    const r = soma % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return dv(12) === Number(c[12]) && dv(13) === Number(c[13]);
}

/** Do jeito que o banco espera ler: o pagador ve exatamente o que vai no codigo. */
export function normalizarChave(tipo: TipoChave, chave: string) {
  const s = chave.trim();
  switch (tipo) {
    case "cpf":
      if (!cpfValido(digitos(s))) throw new Error("CPF inválido.");
      return digitos(s);
    case "cnpj":
      if (!cnpjValido(digitos(s))) throw new Error("CNPJ inválido.");
      return digitos(s);
    case "email":
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) || s.length > 77) throw new Error("E-mail inválido.");
      return s.toLowerCase();
    case "telefone": {
      let d = digitos(s);
      if (d.length === 10 || d.length === 11) d = `55${d}`;
      if (!/^55\d{10,11}$/.test(d)) throw new Error("Telefone inválido: use o celular com DDD.");
      return `+${d}`;
    }
    case "aleatoria":
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)) throw new Error("Chave aleatória inválida.");
      return s.toLowerCase();
  }
}

/** Nome e cidade no codigo: sem acento e no limite do padrao. */
export const textoPix = (s: string, max: number) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max)
    .trim();

/** Descricao vai como texto livre no codigo: sem acento para nao estourar o tamanho em bytes. */
const descricaoPix = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\x20-\x7E]/g, "")
    .trim()
    .slice(0, 72);

const campo = (id: string, valor: string) => `${id}${String(valor.length).padStart(2, "0")}${valor}`;

/** BR Code estatico (Manual de Padroes para Iniciacao do Pix, Banco Central). */
export function payloadPix(d: { chave: string; nome: string; cidade: string; valorCentavos?: number | null; descricao?: string | null; txid: string }) {
  const descricao = d.descricao ? descricaoPix(d.descricao) : "";
  const conta = campo("00", "br.gov.bcb.pix") + campo("01", d.chave) + (descricao ? campo("02", descricao) : "");
  const corpo =
    campo("00", "01") +
    campo("26", conta) +
    campo("52", "0000") +
    campo("53", "986") +
    (d.valorCentavos ? campo("54", (d.valorCentavos / 100).toFixed(2)) : "") +
    campo("58", "BR") +
    campo("59", textoPix(d.nome, 25)) +
    campo("60", textoPix(d.cidade, 15)) +
    campo("62", campo("05", d.txid)) +
    "6304";
  return corpo + crc16(corpo);
}
