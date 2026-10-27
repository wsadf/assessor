import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Variavel de ambiente ${name} nao definida (veja .env.example)`);
  return value;
}

function list(name: string): string[] {
  return (process.env[name] ?? "")
    .split(",")
    .map((s) => s.replace(/\D/g, ""))
    .filter(Boolean);
}

function provider(): "claude" | "gemini" {
  const chosen = (process.env.AI_PROVIDER ?? "").toLowerCase();
  if (chosen === "claude" || chosen === "gemini") return chosen;
  if (chosen) throw new Error(`AI_PROVIDER invalido: ${chosen}. Use claude ou gemini.`);
  return process.env.GEMINI_API_KEY && !process.env.ANTHROPIC_API_KEY ? "gemini" : "claude";
}

export const config = {
  port: Number(process.env.PORT ?? 3000),
  aiProvider: provider(),
  timezone: process.env.TIMEZONE ?? "America/Sao_Paulo",
  dbPath: process.env.DB_PATH ?? "data/assessor.db",

  claudeModel: process.env.CLAUDE_MODEL ?? "claude-opus-5-5",
  // Conversa curta de registro nao ganha com mais raciocinio; "low" reduz custo e latencia.
  claudeEffort: (process.env.CLAUDE_EFFORT ?? "low") as "low" | "medium" | "high",

  gemini: {
    apiKey: process.env.GEMINI_API_KEY ?? "",
    model: process.env.GEMINI_MODEL ?? "gemini-3.5-flash-lite",
    // Usado quando o principal continua sobrecarregado depois das novas tentativas.
    fallbackModel: process.env.GEMINI_FALLBACK_MODEL ?? "gemini-3.8-flash",
  },

  whatsapp: {
    get token() { return required("WHATSAPP_TOKEN"); },
    get phoneNumberId() { return required("WHATSAPP_PHONE_NUMBER_ID"); },
    get verifyToken() { return required("WHATSAPP_VERIFY_TOKEN"); },
    appSecret: process.env.WHATSAPP_APP_SECRET ?? "",
    apiVersion: process.env.WHATSAPP_API_VERSION ?? "v23.0",
    noticeTemplate: process.env.WHATSAPP_NOTICE_TEMPLATE ?? "",
    noticeTemplateLanguage: process.env.WHATSAPP_NOTICE_TEMPLATE_LANG ?? "pt_BR",
    // Numero publico do assessor, usado no botao "Conversar no WhatsApp" do painel.
    displayNumber: (process.env.WHATSAPP_NUMERO ?? "").replace(/\D/g, ""),
  },

  // Numero de teste da Meta so entrega para numeros cadastrados; a lista evita que
  // qualquer pessoa que descubra o numero gaste creditos da API.
  allowedNumbers: list("ALLOWED_NUMBERS"),

  transcription: {
    apiKey: process.env.TRANSCRIPTION_API_KEY ?? "",
    baseUrl: process.env.TRANSCRIPTION_BASE_URL ?? "https://api.openai.com/v1",
    model: process.env.TRANSCRIPTION_MODEL ?? "whisper-1",
  },

  dailySummaryHour: Number(process.env.DAILY_SUMMARY_HOUR ?? 7),

  arquivos: {
    maxBytes: 20 * 1024 * 1024,
    contaBytes: 1024 * 1024 * 1024,
    // Acima disso o arquivo e guardado, mas nao vai ao modelo: o custo do turno dispararia.
    modeloBytes: 5 * 1024 * 1024,
    pendenteHoras: 24,
  },

  panel: {
    token: process.env.PAINEL_TOKEN ?? "",
    // Por padrao o mesmo telefone ficticio do chat do terminal, onde costumam estar os testes.
    phone: (process.env.PAINEL_TELEFONE || process.env.CLI_PHONE || "5500000000000").replace(/\D/g, ""),
    port: Number(process.env.PAINEL_PORT || 3001),
  },
};

export const DEMO_DB_PATH = "data/demo.db";

/** Variavel com a chave do provedor de IA escolhido. */
export const aiKeyName = () => (config.aiProvider === "gemini" ? "GEMINI_API_KEY" : "ANTHROPIC_API_KEY");
