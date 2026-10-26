import fs from "node:fs";
import path from "node:path";
import fastifyStatic from "@fastify/static";
import { config, DEMO_DB_PATH } from "./config.js";
import { openDb, repo as makeRepo } from "./db.js";
import { buildServer } from "./server.js";

// Sobe so a API e o painel web, sem WhatsApp nem agendador: nao exige as chaves da Meta.
if (!config.panel.token) {
  console.error("Falta PAINEL_TOKEN no .env. Coloque qualquer texto longo, ex.: PAINEL_TOKEN=um-texto-secreto-qualquer");
  process.exit(1);
}

const demo = process.argv.includes("--demo");
const app = buildServer(makeRepo(openDb(demo ? DEMO_DB_PATH : config.dbPath)));
const dist = path.resolve("web/dist");
if (fs.existsSync(dist)) {
  await app.register(fastifyStatic, { root: dist });
  // Rotas do Vue Router sao do lado do cliente; qualquer caminho fora da API devolve o index.
  app.setNotFoundHandler((req, reply) =>
    req.url.startsWith("/api") ? reply.code(404).send({ erro: "rota nao encontrada" }) : reply.sendFile("index.html"),
  );
}

await app.listen({ port: config.panel.port, host: "127.0.0.1" });
console.log(
  `API do painel em http://localhost:${config.panel.port} (telefone ${config.panel.phone}${demo ? ", dados de demonstracao" : ""})`,
);
