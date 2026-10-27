import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { AuthError } from "./auth.js";
import { config } from "./config.js";
import { repoDoContexto } from "./conta.js";
import type { Db, Repo } from "./db.js";
import { pode, type Contexto } from "./permissoes.js";

export const PASTAS = [
  { id: "boletos", nome: "Boletos" },
  { id: "notas_fiscais", nome: "Notas fiscais" },
  { id: "comprovantes", nome: "Comprovantes" },
  { id: "contratos", nome: "Contratos" },
  { id: "casa", nome: "Casa" },
  { id: "carro", nome: "Carro" },
  { id: "saude", nome: "Saúde" },
  { id: "trabalho", nome: "Trabalho" },
  { id: "pessoais", nome: "Pessoais" },
  { id: "outros", nome: "Outros" },
] as const;

export type PastaId = (typeof PASTAS)[number]["id"];
export const PASTA_IDS = PASTAS.map((p) => p.id) as [PastaId, ...PastaId[]];
export const nomePasta = (id: string | null) => PASTAS.find((p) => p.id === id)?.nome ?? "Sem pasta";

export interface Documento {
  id: number;
  phone: string;
  created_by: string;
  status: "pendente" | "guardado";
  folder: PastaId | null;
  title: string | null;
  description: string | null;
  original_name: string;
  mime_type: string;
  size_bytes: number;
  storage_path: string;
  document_date: string | null;
  transaction_id: number | null;
  created_at: string;
  saved_at: string | null;
}

export function prepararTabelasDocumentos(db: Db) {
  const pastas = PASTA_IDS.map((p) => `'${p}'`).join(", ");
  db.exec(`
    CREATE TABLE IF NOT EXISTS documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      phone TEXT NOT NULL,
      created_by TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('pendente', 'guardado')),
      folder TEXT CHECK (folder IS NULL OR folder IN (${pastas})),
      title TEXT CHECK (title IS NULL OR length(title) <= 120),
      description TEXT CHECK (description IS NULL OR length(description) <= 600),
      original_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size_bytes INTEGER NOT NULL CHECK (size_bytes BETWEEN 1 AND ${config.arquivos.maxBytes}),
      storage_path TEXT NOT NULL UNIQUE,
      document_date TEXT,
      transaction_id INTEGER,
      created_at TEXT NOT NULL,
      saved_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_docs_pasta ON documents (phone, status, folder);
    CREATE INDEX IF NOT EXISTS idx_docs_tx ON documents (phone, transaction_id);
    CREATE INDEX IF NOT EXISTS idx_docs_pendente ON documents (created_by, status, created_at);
    CREATE VIRTUAL TABLE IF NOT EXISTS documents_fts USING fts5(
      title, description, original_name, folder,
      content='documents', content_rowid='id', tokenize='unicode61 remove_diacritics 2'
    );
    CREATE TRIGGER IF NOT EXISTS documents_ai AFTER INSERT ON documents BEGIN
      INSERT INTO documents_fts (rowid, title, description, original_name, folder)
      VALUES (new.id, new.title, new.description, new.original_name, new.folder);
    END;
    CREATE TRIGGER IF NOT EXISTS documents_ad AFTER DELETE ON documents BEGIN
      INSERT INTO documents_fts (documents_fts, rowid, title, description, original_name, folder)
      VALUES ('delete', old.id, old.title, old.description, old.original_name, old.folder);
    END;
    CREATE TRIGGER IF NOT EXISTS documents_au AFTER UPDATE ON documents BEGIN
      INSERT INTO documents_fts (documents_fts, rowid, title, description, original_name, folder)
      VALUES ('delete', old.id, old.title, old.description, old.original_name, old.folder);
      INSERT INTO documents_fts (rowid, title, description, original_name, folder)
      VALUES (new.id, new.title, new.description, new.original_name, new.folder);
    END;
  `);
}

/** Arquivos ao lado do banco: data/assessor.db guarda em data/assessor-arquivos, o demo em data/demo-arquivos. */
export function pastaDeArquivos(db: Db): string {
  return !db.name || db.name === ":memory:"
    ? path.join(os.tmpdir(), `assessor-arquivos-${process.pid}`)
    : db.name.replace(/\.db$/i, "") + "-arquivos";
}

const EXTENSOES: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

export function extensao(mimeType: string, nome?: string | null) {
  const pelaMime = EXTENSOES[mimeType.split(";")[0].trim()];
  const peloNome = nome?.match(/\.([a-z0-9]{1,5})$/i)?.[1]?.toLowerCase();
  return pelaMime ?? peloNome ?? "bin";
}

/** Nome com que o arquivo chega a quem pediu: o titulo, que diz mais que o nome original. */
export function nomeParaDownload(d: Documento) {
  const base = (d.title ?? d.original_name.replace(/\.[^.]+$/, "")).replace(/[\\/:*?"<>|]+/g, " ").trim() || "documento";
  return `${base}.${extensao(d.mime_type, d.original_name)}`;
}

/** Formatos que a IA consegue ler; o resto e guardado so pelo nome. */
export const legivelPelaIA = (mimeType: string) => /^(application\/pdf|image\/(jpeg|png|webp|gif))/.test(mimeType);

const PALAVRAS_VAZIAS = new Set(
  "de do da dos das o a os as e em no na nos nas um uma uns umas que meu minha meus minhas pra para pro com por esse essa este esta aquele aquela isso me manda acha achar ache".split(" "),
);

/** Consulta em linguagem natural vira prefixos unidos por OR; o usuario nao escreve sintaxe do FTS5. */
export function termosDeBusca(consulta: string): string | null {
  const palavras = consulta
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((p) => p.length >= 2 && !PALAVRAS_VAZIAS.has(p));
  return palavras.length ? [...new Set(palavras)].map((p) => `"${p}"*`).join(" OR ") : null;
}

export function documentos(db: Db, limites = config.arquivos) {
  const dir = pastaDeArquivos(db);
  const agora = () => new Date();
  const caminho = (d: Documento) => path.join(dir, d.storage_path);
  const porId = (id: number) => db.prepare(`SELECT * FROM documents WHERE id = ?`).get(id) as Documento | undefined;
  const apagar = (d: Documento) => {
    fs.rmSync(caminho(d), { force: true });
    db.prepare(`DELETE FROM documents WHERE id = ?`).run(d.id);
  };

  const uso = (conta: string) =>
    (db.prepare(`SELECT COALESCE(SUM(size_bytes), 0) AS n FROM documents WHERE phone = ? AND status = 'guardado'`).get(conta) as { n: number }).n;

  return {
    porId,
    uso,
    limites,

    salvarPendente(conta: string, membro: string, arquivo: { data: Buffer; mimeType: string; nomeOriginal?: string | null }): Documento {
      if (arquivo.data.length > limites.maxBytes) throw new AuthError(413, "Esse arquivo passa de 20 MB. Mande uma versão menor.");
      if (arquivo.data.length === 0) throw new AuthError(400, "O arquivo chegou vazio. Pode mandar de novo?");
      const ext = extensao(arquivo.mimeType, arquivo.nomeOriginal);
      const quando = agora();
      const nome = arquivo.nomeOriginal?.trim() || `foto-${quando.toISOString().slice(0, 16).replace(/[-:T]/g, "").replace(/^(\d{8})/, "$1-")}.${ext}`;
      const provisorio = `pendente-${crypto.randomUUID()}`;
      const id = Number(
        db
          .prepare(
            `INSERT INTO documents (phone, created_by, status, original_name, mime_type, size_bytes, storage_path, created_at)
             VALUES (?, ?, 'pendente', ?, ?, ?, ?, ?)`,
          )
          .run(conta, membro, nome, arquivo.mimeType, arquivo.data.length, provisorio, quando.toISOString()).lastInsertRowid,
      );
      // Sufixo aleatorio: saber o id de um documento nao basta para achar o arquivo de outra conta.
      const relativo = path.join(conta, `${id}-${crypto.randomBytes(4).toString("hex")}.${ext}`);
      try {
        fs.mkdirSync(path.join(dir, conta), { recursive: true });
        fs.writeFileSync(path.join(dir, relativo), arquivo.data);
      } catch (err) {
        db.prepare(`DELETE FROM documents WHERE id = ?`).run(id);
        throw err;
      }
      db.prepare(`UPDATE documents SET storage_path = ? WHERE id = ?`).run(relativo, id);
      return porId(id)!;
    },

    ultimoPendente(membro: string): Documento | undefined {
      return db
        .prepare(`SELECT * FROM documents WHERE created_by = ? AND status = 'pendente' ORDER BY id DESC LIMIT 1`)
        .get(membro) as Documento | undefined;
    },

    guardar(id: number, d: { pasta: PastaId; titulo: string; descricao?: string | null; dataDocumento?: string | null; transacaoId?: number | null }) {
      const doc = porId(id);
      if (!doc) throw new AuthError(404, "Documento não encontrado.");
      const total = uso(doc.phone) + (doc.status === "pendente" ? doc.size_bytes : 0);
      if (total > limites.contaBytes) {
        throw new AuthError(507, "O espaço de 1 GB da conta acabou. Exclua documentos antigos para guardar novos.");
      }
      db.prepare(
        `UPDATE documents SET status = 'guardado', folder = ?, title = ?, description = ?, document_date = ?,
           transaction_id = COALESCE(?, transaction_id), saved_at = COALESCE(saved_at, ?) WHERE id = ?`,
      ).run(
        d.pasta,
        d.titulo.trim().slice(0, 120),
        d.descricao?.trim().slice(0, 600) || null,
        d.dataDocumento ?? null,
        d.transacaoId ?? null,
        agora().toISOString(),
        id,
      );
      return { documento: porId(id)!, uso: total, alerta: total >= limites.contaBytes * 0.8 };
    },

    buscar(conta: string, consulta: string, f: { pasta?: string | null; de?: string | null; ate?: string | null; limite?: number } = {}): Documento[] {
      const termos = termosDeBusca(consulta);
      if (!termos) return [];
      return db
        .prepare(
          `SELECT d.* FROM documents_fts JOIN documents d ON d.id = documents_fts.rowid
           WHERE documents_fts MATCH @termos AND d.phone = @conta AND d.status = 'guardado'
             AND (@pasta IS NULL OR d.folder = @pasta)
             AND (@de IS NULL OR COALESCE(d.document_date, substr(d.saved_at, 1, 10)) >= @de)
             AND (@ate IS NULL OR COALESCE(d.document_date, substr(d.saved_at, 1, 10)) <= @ate)
           ORDER BY bm25(documents_fts), d.created_at DESC LIMIT @limite`,
        )
        .all({ termos, conta, pasta: f.pasta ?? null, de: f.de ?? null, ate: f.ate ?? null, limite: f.limite ?? 8 }) as Documento[];
    },

    listar(conta: string, f: { pasta?: string | null; pagina?: number } = {}) {
      const pagina = Math.max(1, f.pagina ?? 1);
      const filtro = { conta, pasta: f.pasta ?? null };
      const onde = `phone = @conta AND status = 'guardado' AND (@pasta IS NULL OR folder = @pasta)`;
      return {
        documentos: db
          .prepare(`SELECT * FROM documents WHERE ${onde} ORDER BY saved_at DESC, id DESC LIMIT 30 OFFSET @offset`)
          .all({ ...filtro, offset: (pagina - 1) * 30 }) as Documento[],
        total: (db.prepare(`SELECT COUNT(*) AS n FROM documents WHERE ${onde}`).get(filtro) as { n: number }).n,
      };
    },

    pastasComUso(conta: string) {
      const linhas = db
        .prepare(`SELECT folder, COUNT(*) AS qtd, SUM(size_bytes) AS bytes FROM documents WHERE phone = ? AND status = 'guardado' GROUP BY folder`)
        .all(conta) as { folder: string; qtd: number; bytes: number }[];
      return PASTAS.map((p) => {
        const l = linhas.find((x) => x.folder === p.id);
        return { id: p.id, nome: p.nome, qtd: l?.qtd ?? 0, bytes: l?.bytes ?? 0 };
      });
    },

    ler(doc: Documento): Buffer {
      return fs.readFileSync(caminho(doc));
    },

    caminho,

    atualizar(id: number, d: { pasta?: PastaId; titulo?: string; descricao?: string | null }) {
      const doc = porId(id);
      if (!doc || doc.status !== "guardado") return undefined;
      db.prepare(`UPDATE documents SET folder = ?, title = ?, description = ? WHERE id = ?`).run(
        d.pasta ?? doc.folder,
        d.titulo?.trim().slice(0, 120) || doc.title,
        d.descricao === undefined ? doc.description : d.descricao?.trim().slice(0, 600) || null,
        id,
      );
      return porId(id);
    },

    excluir(id: number): boolean {
      const doc = porId(id);
      if (!doc) return false;
      apagar(doc);
      return true;
    },

    /** Documento guardado ligado a cada transacao, numa consulta so. */
    comprovantes(conta: string, transacoes: number[]): Map<number, number> {
      if (!transacoes.length) return new Map();
      const linhas = db
        .prepare(
          `SELECT transaction_id AS tx, MAX(id) AS id FROM documents
           WHERE phone = ? AND status = 'guardado' AND transaction_id IN (${transacoes.map(() => "?").join(",")})
           GROUP BY transaction_id`,
        )
        .all(conta, ...transacoes) as { tx: number; id: number }[];
      return new Map(linhas.map((l) => [l.tx, l.id]));
    },

    limparPendentes(quando = agora()): number {
      const limite = new Date(quando.getTime() - limites.pendenteHoras * 3_600_000).toISOString();
      const vencidos = db.prepare(`SELECT * FROM documents WHERE status = 'pendente' AND created_at < ?`).all(limite) as Documento[];
      for (const d of vencidos) apagar(d);
      return vencidos.length;
    },
  };
}

export type DocumentosService = ReturnType<typeof documentos>;

/**
 * Pendente e so de quem mandou. Guardado e da conta, e quem nao tem a capacidade de documentos
 * so ve o que estiver ligado a um lancamento que o perfil dele ja enxerga.
 */
export function podeVerDocumento(repo: Repo, ctx: Contexto, doc: Documento | undefined): doc is Documento {
  if (!doc || doc.phone !== ctx.conta) return false;
  if (doc.status === "pendente") return doc.created_by === ctx.membro;
  if (pode(ctx, "documentos")) return true;
  return doc.transaction_id !== null && !!repoDoContexto(repo, ctx).getTransaction(ctx.conta, doc.transaction_id);
}
