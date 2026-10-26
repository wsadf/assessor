// Redes com inspecao SSL trocam o certificado das APIs externas.
// O Node so le NODE_EXTRA_CA_CERTS na partida, entao o processo e iniciado ja com ele.
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

// O better-sqlite3 e compilado para uma versao do Node; com outra ativa ele nao carrega.
const major = Number(process.versions.node.split(".")[0]);
if (major < 22) {
  console.error(`Este projeto usa Node 22 ou mais novo, mas o ativo e o ${process.version}. Rode: nvm use 22`);
  process.exit(1);
}

const ca = path.resolve("certs/ca-extra.pem");
const env = { ...process.env };
if (!env.NODE_EXTRA_CA_CERTS && fs.existsSync(ca)) env.NODE_EXTRA_CA_CERTS = ca;

const tsx = path.resolve("node_modules/tsx/dist/cli.mjs");
const child = spawn(process.execPath, [tsx, ...process.argv.slice(2)], { stdio: "inherit", env });
child.on("exit", (code) => process.exit(code ?? 0));
