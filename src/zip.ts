import zlib from "node:zlib";

/** Hora e data no formato do MS-DOS que o ZIP guarda em cada entrada. */
function dataDos(d: Date) {
  const hora = (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2);
  const data = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return { hora, data };
}

/**
 * ZIP sem senha e sem ZIP64: o pacote do contador fica abaixo de 200 MB, longe do teto de 4 GB.
 * Nome em UTF-8 (bit 11) para os acentos abrirem certos no Windows e no macOS.
 */
export function criarZip(arquivos: { nome: string; dados: Buffer }[], agora = new Date()): Buffer {
  const { hora, data } = dataDos(agora);
  const locais: Buffer[] = [];
  const centrais: Buffer[] = [];
  let offset = 0;
  for (const a of arquivos) {
    const nome = Buffer.from(a.nome, "utf8");
    const comprimido = zlib.deflateRawSync(a.dados);
    const guardar = comprimido.length >= a.dados.length;
    const corpo = guardar ? a.dados : comprimido;
    const metodo = guardar ? 0 : 8;
    const crc = zlib.crc32(a.dados);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(metodo, 8);
    local.writeUInt16LE(hora, 10);
    local.writeUInt16LE(data, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(corpo.length, 18);
    local.writeUInt32LE(a.dados.length, 22);
    local.writeUInt16LE(nome.length, 26);
    local.writeUInt16LE(0, 28);
    locais.push(local, nome, corpo);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(metodo, 10);
    central.writeUInt16LE(hora, 12);
    central.writeUInt16LE(data, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(corpo.length, 20);
    central.writeUInt32LE(a.dados.length, 24);
    central.writeUInt16LE(nome.length, 28);
    central.writeUInt32LE(offset, 42);
    centrais.push(central, nome);

    offset += local.length + nome.length + corpo.length;
  }
  const diretorio = Buffer.concat(centrais);
  const fim = Buffer.alloc(22);
  fim.writeUInt32LE(0x06054b50, 0);
  fim.writeUInt16LE(arquivos.length, 8);
  fim.writeUInt16LE(arquivos.length, 10);
  fim.writeUInt32LE(diretorio.length, 12);
  fim.writeUInt32LE(offset, 16);
  return Buffer.concat([...locais, diretorio, fim]);
}

/** Leitura do proprio formato acima; serve aos testes para conferir o pacote. */
export function lerZip(zip: Buffer): { nome: string; dados: Buffer }[] {
  const fim = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const total = zip.readUInt16LE(fim + 10);
  let p = zip.readUInt32LE(fim + 16);
  const out: { nome: string; dados: Buffer }[] = [];
  for (let i = 0; i < total; i++) {
    const metodo = zip.readUInt16LE(p + 10);
    const crc = zip.readUInt32LE(p + 16);
    const tamanho = zip.readUInt32LE(p + 20);
    const nomeLen = zip.readUInt16LE(p + 28);
    const extra = zip.readUInt16LE(p + 30);
    const comentario = zip.readUInt16LE(p + 32);
    const local = zip.readUInt32LE(p + 42);
    const nome = zip.subarray(p + 46, p + 46 + nomeLen).toString("utf8");
    const inicio = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
    const corpo = zip.subarray(inicio, inicio + tamanho);
    const dados = metodo === 8 ? zlib.inflateRawSync(corpo) : Buffer.from(corpo);
    if (zlib.crc32(dados) !== crc) throw new Error(`CRC diferente em ${nome}`);
    out.push({ nome, dados });
    p += 46 + nomeLen + extra + comentario;
  }
  return out;
}
