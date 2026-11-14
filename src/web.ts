import fs from "node:fs";
import path from "node:path";
import fastifyStatic from "@fastify/static";
import type { FastifyInstance } from "fastify";

/** Serve o painel compilado (web/dist) no mesmo servidor da API. Devolve false se ainda nao houver build. */
export async function servirPainelWeb(app: FastifyInstance) {
  const dist = path.resolve("web/dist");
  if (!fs.existsSync(dist)) return false;
  await app.register(fastifyStatic, { root: dist });
  // Rotas do Vue Router sao do lado do cliente; qualquer caminho fora da API devolve o index.
  app.setNotFoundHandler((req, reply) =>
    req.url.startsWith("/api") ? reply.code(404).send({ erro: "rota nao encontrada" }) : reply.sendFile("index.html"),
  );
  return true;
}
