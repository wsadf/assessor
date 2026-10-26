import { config } from "./config.js";

export const transcriptionEnabled = () => Boolean(config.transcription.apiKey);

export async function transcribe(audio: Buffer, mimeType: string): Promise<string> {
  const ext = mimeType.includes("ogg") ? "ogg" : mimeType.split("/")[1]?.split(";")[0] || "ogg";
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(audio)],{ type: mimeType }), `audio.${ext}`);
  form.append("model", config.transcription.model);
  form.append("language", "pt");

  const res = await fetch(`${config.transcription.baseUrl}/audio/transcriptions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${config.transcription.apiKey}` },
    body: form,
  });
  if (!res.ok) throw new Error(`Transcricao ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as { text: string };
  return json.text.trim();
}
