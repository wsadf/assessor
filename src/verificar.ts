import "dotenv/config";
import crypto from "node:crypto";
import { pathToFileURL } from "node:url";

export type Nivel = "ok" | "aviso" | "erro";
export type Item = { nivel: Nivel; grupo: string; texto: string };
type Env = Record<string, string | undefined>;

const EXEMPLOS = new Set(["troque-por-um-texto-secreto", "5511999999999"]);
const preenchido = (v: string | undefined) => !!v?.trim() && !EXEMPLOS.has(v.trim());
const local = (url: string) => /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/i.test(url);

/** Confere so o .env, sem rede: o que falta para o teste real com WhatsApp. */
export function checarEnv(env: Env): Item[] {
  const itens: Item[] = [];
  const add = (nivel: Nivel, grupo: string, texto: string) => itens.push({ nivel, grupo, texto });

  const provedor = (env.AI_PROVIDER || "").toLowerCase() || (env.GEMINI_API_KEY && !env.ANTHROPIC_API_KEY ? "gemini" : "claude");
  if (provedor !== "gemini" && provedor !== "claude") add("erro", "IA", `AI_PROVIDER invalido: ${env.AI_PROVIDER}. Use gemini ou claude.`);
  else {
    const chave = provedor === "gemini" ? "GEMINI_API_KEY" : "ANTHROPIC_API_KEY";
    if (preenchido(env[chave])) add("ok", "IA", `${provedor} com ${chave} preenchida`);
    else add("erro", "IA", `AI_PROVIDER=${provedor}, mas ${chave} esta vazia`);
    // Os roteiros de validacao pedem os dois provedores (principio III).
    const outra = provedor === "gemini" ? "ANTHROPIC_API_KEY" : "GEMINI_API_KEY";
    if (!preenchido(env[outra])) add("aviso", "IA", `${outra} vazia: os roteiros pedem repetir o teste com o outro provedor`);
    if (provedor === "gemini") add("aviso", "IA", "Gemini com dados reais so no plano pago: a cota gratuita permite ao Google usar os dados");
    if (provedor === "claude" && !preenchido(env.TRANSCRIPTION_API_KEY)) add("aviso", "IA", "Claude sem TRANSCRIPTION_API_KEY: audio no WhatsApp recebe resposta de que nao da para ouvir");
  }

  for (const nome of ["WHATSAPP_TOKEN", "WHATSAPP_PHONE_NUMBER_ID", "WHATSAPP_VERIFY_TOKEN"]) {
    if (preenchido(env[nome])) add("ok", "WhatsApp", `${nome} preenchido`);
    else add("erro", "WhatsApp", `${nome} vazio ou com o valor de exemplo (developers.facebook.com > seu app > WhatsApp)`);
  }
  if (preenchido(env.WHATSAPP_APP_SECRET)) add("ok", "WhatsApp", "WHATSAPP_APP_SECRET preenchido: assinatura do webhook conferida");
  else add("erro", "WhatsApp", "WHATSAPP_APP_SECRET vazio: sem ele qualquer um que ache a URL manda mensagens falsas (Configuracoes do app > Basico)");

  const numeros = (env.ALLOWED_NUMBERS ?? "").split(",").map((s) => s.replace(/\D/g, "")).filter(Boolean);
  if (!numeros.length || numeros.every((n) => EXEMPLOS.has(n))) add("erro", "WhatsApp", "ALLOWED_NUMBERS vazio ou com o numero de exemplo: coloque o seu celular com DDI e DDD");
  else {
    const ruins = numeros.filter((n) => !/^55\d{10,11}$/.test(n));
    if (ruins.length) add("aviso", "WhatsApp", `ALLOWED_NUMBERS com numero fora do padrao 55 + DDD + numero: ${ruins.join(", ")}`);
    else add("ok", "WhatsApp", `${numeros.length} numero(s) liberado(s) em ALLOWED_NUMBERS`);
  }
  if (!preenchido(env.WHATSAPP_NOTICE_TEMPLATE)) add("aviso", "WhatsApp", "Sem WHATSAPP_NOTICE_TEMPLATE: lembretes e avisos so chegam se voce falou com o assessor nas ultimas 24 horas");

  const painelUrl = (env.PAINEL_URL ?? "").replace(/\/+$/, "");
  if (!painelUrl || local(painelUrl)) add("aviso", "Painel", "PAINEL_URL local: links de cobranca e de agendamento mandados no WhatsApp nao abrem no celular. Use o endereco do tunel");
  else if (!painelUrl.startsWith("https://")) add("aviso", "Painel", "PAINEL_URL sem https: o Google e a Meta recusam endereco publico sem https");
  else add("ok", "Painel", `PAINEL_URL publico: ${painelUrl}`);

  const google = ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_TOKEN_KEY"].filter((n) => preenchido(env[n]));
  if (google.length === 0) add("aviso", "Google", "Google Agenda desligado: as historias US4 e US5 ficam sem teste");
  else if (google.length < 3) add("erro", "Google", "Google pela metade: preencha GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET e GOOGLE_TOKEN_KEY juntos");
  else if (Buffer.from(env.GOOGLE_TOKEN_KEY!, "base64").length !== 32) add("erro", "Google", "GOOGLE_TOKEN_KEY precisa ter 32 bytes em base64 (veja o comando no .env.example)");
  else add("ok", "Google", `Google Agenda configurado; redirect: ${painelUrl || "PAINEL_URL"}/api/google/retorno`);

  if ((env.DB_PATH ?? "").includes("demo")) add("erro", "Banco", "DB_PATH aponta para o banco de demonstracao: o teste real grava em data/assessor.db");
  return itens;
}

async function pedir(url: string, init: RequestInit = {}) {
  return fetch(url, { ...init, signal: AbortSignal.timeout(10_000) });
}

/** Leituras nas APIs oficiais de cada servico; nada e enviado a terceiros nem a ninguem pelo WhatsApp. */
export async function checarServicos(env: Env, urlPublica?: string): Promise<Item[]> {
  const itens: Item[] = [];
  const add = (nivel: Nivel, grupo: string, texto: string) => itens.push({ nivel, grupo, texto });
  const tentar = async (grupo: string, f: () => Promise<void>) => {
    try {
      await f();
    } catch (err) {
      add("erro", grupo, `sem resposta: ${(err as Error).message}`);
    }
  };

  if (preenchido(env.GEMINI_API_KEY)) {
    const modelo = env.GEMINI_MODEL || "gemini-3.5-flash-lite";
    await tentar("IA", async () => {
      const r = await pedir(`https://generativelanguage.googleapis.com/v1beta/models/${modelo}`, { headers: { "x-goog-api-key": env.GEMINI_API_KEY! } });
      add(r.ok ? "ok" : "erro", "IA", r.ok ? `Gemini aceitou a chave e conhece ${modelo}` : `Gemini recusou (${r.status}): confira GEMINI_API_KEY e GEMINI_MODEL`);
    });
  }
  if (preenchido(env.ANTHROPIC_API_KEY)) {
    const modelo = env.CLAUDE_MODEL || "claude-opus-5-5";
    await tentar("IA", async () => {
      const r = await pedir(`https://api.anthropic.com/v1/models/${modelo}`, {
        headers: { "x-api-key": env.ANTHROPIC_API_KEY!, "anthropic-version": "2023-06-01" },
      });
      add(r.ok ? "ok" : "erro", "IA", r.ok ? `Claude aceitou a chave e conhece ${modelo}` : `Claude recusou (${r.status}): confira ANTHROPIC_API_KEY e CLAUDE_MODEL`);
    });
  }
  if (preenchido(env.WHATSAPP_TOKEN) && preenchido(env.WHATSAPP_PHONE_NUMBER_ID)) {
    const versao = env.WHATSAPP_API_VERSION || "v23.0";
    await tentar("WhatsApp", async () => {
      const r = await pedir(`https://graph.facebook.com/${versao}/${env.WHATSAPP_PHONE_NUMBER_ID}?fields=display_phone_number,verified_name`, {
        headers: { authorization: `Bearer ${env.WHATSAPP_TOKEN}` },
      });
      if (!r.ok) {
        const msg = ((await r.json().catch(() => ({}))) as { error?: { message?: string } }).error?.message ?? "";
        // Token temporario da Meta vence em 24 horas; e a causa mais comum.
        add("erro", "WhatsApp", `Meta recusou o token (${r.status}). ${msg} Token temporario vence em 24 horas: gere outro ou crie um permanente`);
        return;
      }
      const d = (await r.json()) as { display_phone_number?: string; verified_name?: string };
      add("ok", "WhatsApp", `Meta respondeu: numero do assessor ${d.display_phone_number ?? "?"} (${d.verified_name ?? "sem nome"})`);
    });
  }
  if (urlPublica) {
    const base = urlPublica.replace(/\/+$/, "");
    const desafio = crypto.randomInt(1e9).toString();
    await tentar("Tunel", async () => {
      const q = new URLSearchParams({ "hub.mode": "subscribe", "hub.verify_token": env.WHATSAPP_VERIFY_TOKEN ?? "", "hub.challenge": desafio });
      const r = await pedir(`${base}/webhook?${q}`);
      const corpo = await r.text();
      if (r.ok && corpo.trim() === desafio) add("ok", "Tunel", `webhook responde em ${base}/webhook: pode cadastrar na Meta`);
      else add("erro", "Tunel", `${base}/webhook nao devolveu o desafio (${r.status}): o servidor esta rodando com npm start e o tunel aponta para a porta ${env.PORT || 3000}?`);
    });
    await tentar("Tunel", async () => {
      const r = await pedir(`${base}/`);
      const html = r.ok && (r.headers.get("content-type") ?? "").includes("text/html");
      add(html ? "ok" : "aviso", "Tunel", html ? `painel abre em ${base}` : "o painel nao abriu pelo tunel: rode npm run build --prefix web antes do npm start");
    });
    if ((env.PAINEL_URL ?? "").replace(/\/+$/, "") !== base) add("aviso", "Tunel", `PAINEL_URL difere do tunel: troque para ${base} no .env e reinicie`);
  }
  return itens;
}

const MARCA: Record<Nivel, string> = { ok: "[ok]   ", aviso: "[aviso]", erro: "[erro] " };

async function main() {
  const args = process.argv.slice(2);
  const offline = args.includes("--offline");
  const urlPublica = args.find((a) => /^https?:\/\//.test(a));
  const itens = [...checarEnv(process.env), ...(offline ? [] : await checarServicos(process.env, urlPublica))];
  let grupo = "";
  for (const i of itens.sort((a, b) => a.grupo.localeCompare(b.grupo))) {
    if (i.grupo !== grupo) console.log(`\n${(grupo = i.grupo)}`);
    console.log(`  ${MARCA[i.nivel]} ${i.texto}`);
  }
  const erros = itens.filter((i) => i.nivel === "erro").length;
  const avisos = itens.filter((i) => i.nivel === "aviso").length;
  console.log(`\n${erros ? `${erros} erro(s) impedem o teste real` : "Pronto para o teste real"}${avisos ? `; ${avisos} aviso(s) limitam o que da para testar` : ""}.`);
  if (!urlPublica && !offline) console.log("Com o tunel aberto, rode de novo passando a URL: npm run verificar -- https://SUA-URL");
  process.exitCode = erros ? 1 : 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) await main();
