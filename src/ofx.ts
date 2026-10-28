export interface MovimentoOfx {
  fitid: string;
  data: string;
  centavos: number;
  tipo: string;
  nome: string;
  memo: string;
}

export interface ExtratoOfx {
  banco: { org: string | null; bankId: string | null };
  conta: { tipo: "corrente" | "cartao"; acctId: string };
  periodo: { de: string | null; ate: string | null };
  saldo: { centavos: number; em: string | null } | null;
  movimentos: MovimentoOfx[];
}

const NAO_E_OFX = "Arquivo nao parece um extrato OFX.";

/** OFX 1.x declara a codigo de pagina no cabecalho; a maioria dos bancos brasileiros usa 1252. */
function decodificar(dados: Buffer) {
  const cabecalho = dados.subarray(0, 600).toString("latin1");
  const latin1 = /CHARSET:\s*(1252|ISO-?8859-?1)/i.test(cabecalho) || /encoding=["'](windows-1252|iso-8859-1)["']/i.test(cabecalho);
  return dados.toString(latin1 ? "latin1" : "utf8");
}

/** Vale para 1.x (tag sem fechamento, valor ate a quebra de linha) e 2.x (XML). */
const campo = (bloco: string, tag: string) => {
  const m = new RegExp(`<${tag}>([^<\\r\\n]*)`, "i").exec(bloco);
  return m ? m[1].trim().replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">") : null;
};

const bloco = (texto: string, tag: string) => {
  const m = new RegExp(`<${tag}>([\\s\\S]*?)(</${tag}>|$)`, "i").exec(texto);
  return m ? m[1] : null;
};

/** `AAAAMMDD[HHMMSS][.XXX][-3:BRT]`: so a data interessa ao lancamento. */
const data = (v: string | null) => (v && /^\d{8}/.test(v) ? `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}` : null);

function centavos(v: string | null) {
  if (!v) return null;
  const n = Number(v.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

export function lerOfx(dados: Buffer): ExtratoOfx {
  const texto = decodificar(dados);
  const inicio = texto.search(/<OFX>/i);
  if (inicio < 0) throw new Error(NAO_E_OFX);
  const ofx = texto.slice(inicio);

  const cartao = bloco(ofx, "CCACCTFROM");
  const corrente = bloco(ofx, "BANKACCTFROM");
  const acctId = campo(cartao ?? corrente ?? "", "ACCTID");
  if (!acctId) throw new Error(NAO_E_OFX);

  const lista = bloco(ofx, "BANKTRANLIST") ?? ofx;
  const movimentos: MovimentoOfx[] = [];
  for (const parte of lista.split(/<STMTTRN>/i).slice(1)) {
    const t = parte.split(/<\/STMTTRN>/i)[0];
    const d = data(campo(t, "DTPOSTED"));
    const valor = centavos(campo(t, "TRNAMT"));
    if (!d || valor === null || valor === 0) continue;
    const nome = campo(t, "NAME") ?? campo(t, "PAYEE") ?? "";
    const memo = campo(t, "MEMO") ?? "";
    movimentos.push({
      // Banco sem FITID estavel e raro; sem ele, data, valor e texto identificam a linha.
      fitid: campo(t, "FITID") || `${d}|${valor}|${nome}|${memo}`,
      data: d,
      centavos: valor,
      tipo: (campo(t, "TRNTYPE") ?? "").toUpperCase(),
      nome,
      memo,
    });
  }
  if (!movimentos.length) throw new Error(NAO_E_OFX);

  const saldo = bloco(ofx, "LEDGERBAL");
  const saldoCentavos = saldo ? centavos(campo(saldo, "BALAMT")) : null;
  return {
    banco: { org: campo(ofx, "ORG"), bankId: corrente ? campo(corrente, "BANKID") : null },
    conta: { tipo: cartao ? "cartao" : "corrente", acctId },
    periodo: { de: data(campo(lista, "DTSTART")), ate: data(campo(lista, "DTEND")) },
    saldo: saldoCentavos === null ? null : { centavos: saldoCentavos, em: data(campo(saldo!, "DTASOF")) },
    movimentos,
  };
}
