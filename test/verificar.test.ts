import assert from "node:assert/strict";
import { test } from "node:test";

const { checarEnv } = await import("../src/verificar.js");

const completo = {
  AI_PROVIDER: "claude",
  ANTHROPIC_API_KEY: "sk-teste",
  GEMINI_API_KEY: "g-teste",
  TRANSCRIPTION_API_KEY: "t-teste",
  WHATSAPP_TOKEN: "tok",
  WHATSAPP_PHONE_NUMBER_ID: "123",
  WHATSAPP_VERIFY_TOKEN: "segredo",
  WHATSAPP_APP_SECRET: "app",
  WHATSAPP_NOTICE_TEMPLATE: "aviso",
  ALLOWED_NUMBERS: "5511912345678",
  PAINEL_URL: "https://algo.trycloudflare.com/",
  GOOGLE_CLIENT_ID: "id",
  GOOGLE_CLIENT_SECRET: "secret",
  GOOGLE_TOKEN_KEY: Buffer.alloc(32, 1).toString("base64"),
};
const de = (env: Record<string, string | undefined>, nivel: string) => checarEnv(env).filter((i) => i.nivel === nivel).map((i) => i.texto);

test("env completo fica pronto, sem erro nem aviso", () => {
  assert.deepEqual(de(completo, "erro"), []);
  assert.deepEqual(de(completo, "aviso"), []);
  assert.ok(de(completo, "ok").some((t) => t.includes("https://algo.trycloudflare.com/api/google/retorno")));
});

test(".env de exemplo aponta o que falta para o WhatsApp", () => {
  const erros = de({ AI_PROVIDER: "gemini", GEMINI_API_KEY: "g", WHATSAPP_VERIFY_TOKEN: "troque-por-um-texto-secreto", ALLOWED_NUMBERS: "5511999999999" }, "erro");
  for (const nome of ["WHATSAPP_TOKEN", "WHATSAPP_PHONE_NUMBER_ID", "WHATSAPP_VERIFY_TOKEN", "WHATSAPP_APP_SECRET", "ALLOWED_NUMBERS"]) {
    assert.ok(erros.some((t) => t.includes(nome)), nome);
  }
});

test("provedor sem chave, Google pela metade, chave curta e banco demo sao erros", () => {
  assert.ok(de({ ...completo, ANTHROPIC_API_KEY: "" }, "erro").some((t) => t.includes("ANTHROPIC_API_KEY esta vazia")));
  assert.ok(de({ ...completo, AI_PROVIDER: "openai" }, "erro").some((t) => t.includes("AI_PROVIDER invalido")));
  assert.ok(de({ ...completo, GOOGLE_CLIENT_SECRET: "" }, "erro").some((t) => t.includes("pela metade")));
  assert.ok(de({ ...completo, GOOGLE_TOKEN_KEY: "curta" }, "erro").some((t) => t.includes("32 bytes")));
  assert.ok(de({ ...completo, DB_PATH: "data/demo.db" }, "erro").some((t) => t.includes("demonstracao")));
});

test("avisos: Gemini gratuito, Claude sem transcricao, painel local, sem modelo e numero torto", () => {
  const avisos = de(
    { ...completo, AI_PROVIDER: "gemini", ANTHROPIC_API_KEY: "", PAINEL_URL: "http://localhost:3001", WHATSAPP_NOTICE_TEMPLATE: "", ALLOWED_NUMBERS: "11912345678" },
    "aviso",
  );
  for (const trecho of ["plano pago", "ANTHROPIC_API_KEY vazia", "PAINEL_URL local", "WHATSAPP_NOTICE_TEMPLATE", "fora do padrao"]) {
    assert.ok(avisos.some((t) => t.includes(trecho)), trecho);
  }
  assert.ok(de({ ...completo, TRANSCRIPTION_API_KEY: "" }, "aviso").some((t) => t.includes("TRANSCRIPTION_API_KEY")));
  assert.ok(de({ ...completo, PAINEL_URL: "http://meu.dominio.com" }, "aviso").some((t) => t.includes("sem https")));
});
