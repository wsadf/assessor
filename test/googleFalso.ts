export const ESCOPO = "https://www.googleapis.com/auth/calendar.events";
const idToken = (email: string) => `x.${Buffer.from(JSON.stringify({ email })).toString("base64url")}.y`;

const inicioDe = (e: any) => new Date(e.start.dateTime ?? `${e.start.date}T00:00:00Z`);
const fimDe = (e: any) => new Date(e.end.dateTime ?? `${e.end.date}T00:00:00Z`);

/** Google de mentira: troca `fetch` e guarda o que foi chamado. Tambem anota o WhatsApp e o Gemini. */
export function googleFalso() {
  const chamadas: { metodo: string; url: string; corpo: any }[] = [];
  const eventos = new Map<string, any>();
  const mensagens: { para: string; texto: string; modelo: boolean }[] = [];
  const estado = {
    refresh: "ok" as "ok" | "invalid_grant" | "fora",
    agenda: "ok" as "ok" | "fora",
    whatsapp: "ok" as "ok" | "fora",
    escopo: `openid email ${ESCOPO}`,
    n: 0,
    proximoId: 0,
    ia: 0,
    revogados: [] as string[],
  };
  const real = globalThis.fetch;
  globalThis.fetch = (async (url: string, init: RequestInit = {}) => {
    const u = new URL(String(url));
    const metodo = init.method ?? "GET";
    const texto = typeof init.body === "string" ? init.body : init.body ? String(init.body) : "";
    const corpo = texto.startsWith("{") ? JSON.parse(texto) : Object.fromEntries(new URLSearchParams(texto));
    chamadas.push({ metodo, url: String(url), corpo });
    const json = (status: number, dados: unknown) => new Response(JSON.stringify(dados), { status });
    if (u.host === "graph.facebook.com") {
      if (!corpo.to) return json(200, { success: true });
      if (estado.whatsapp === "fora") return json(400, { error: { message: "fora da janela" } });
      const modelo = corpo.type === "template";
      mensagens.push({ para: corpo.to, texto: modelo ? corpo.template.components[0].parameters[0].text : corpo.text?.body, modelo });
      return json(200, { messages: [{ id: `wamid.${mensagens.length}` }] });
    }
    if (u.host === "generativelanguage.googleapis.com") {
      estado.ia++;
      return json(500, {});
    }
    if (u.host === "oauth2.googleapis.com" && u.pathname === "/token") {
      if (corpo.grant_type === "authorization_code") {
        return json(200, { access_token: "at-0", expires_in: 3599, refresh_token: "rt-segredo", scope: estado.escopo, id_token: idToken("wesley@gmail.com") });
      }
      if (estado.refresh === "invalid_grant") return json(400, { error: "invalid_grant" });
      if (estado.refresh === "fora") return json(503, { error: "backend" });
      return json(200, { access_token: `at-${++estado.n}`, expires_in: 3599 });
    }
    if (u.host === "oauth2.googleapis.com" && u.pathname === "/revoke") {
      estado.revogados.push(corpo.token);
      return json(200, {});
    }
    if (u.host === "www.googleapis.com") {
      if (estado.agenda === "fora") return json(503, {});
      const id = decodeURIComponent(u.pathname.split("/events/")[1] ?? "");
      if (metodo === "GET" && !id) {
        const de = new Date(u.searchParams.get("timeMin")!);
        const ate = new Date(u.searchParams.get("timeMax")!);
        const q = u.searchParams.get("q")?.toLowerCase();
        const items = [...eventos.values()].filter(
          (e) => inicioDe(e) < ate && fimDe(e) > de && (!q || e.summary.toLowerCase().includes(q)),
        );
        return json(200, { items });
      }
      if (metodo === "POST") {
        const ev = { ...corpo, id: `ev${++estado.proximoId}`, htmlLink: "https://calendar.google.com/x" };
        if (corpo.conferenceData) ev.hangoutLink = "https://meet.google.com/abc-defg-hij";
        eventos.set(ev.id, ev);
        return json(200, ev);
      }
      const ev = eventos.get(id);
      if (!ev) return json(404, {});
      if (metodo === "GET") return json(200, ev);
      if (metodo === "PATCH") {
        Object.assign(ev, corpo);
        return json(200, ev);
      }
      if (metodo === "DELETE") {
        eventos.delete(id);
        return new Response(null, { status: 204 });
      }
    }
    return json(500, {});
  }) as typeof fetch;
  return { chamadas, eventos, mensagens, estado, restaurar: () => (globalThis.fetch = real) };
}
