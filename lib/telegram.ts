import { timingSafeEqual } from "node:crypto";

export type TelegramInlineButton = { text: string; callback_data: string };

export interface TelegramConfig {
  botToken: string;
  webhookSecret: string;
  allowedChatId: string;
}

export function getTelegramConfig(env: Record<string, string | undefined> = process.env): TelegramConfig | null {
  const botToken = env.TELEGRAM_BOT_TOKEN?.trim();
  const webhookSecret = env.TELEGRAM_WEBHOOK_SECRET?.trim();
  const allowedChatId = env.TELEGRAM_ALLOWED_CHAT_ID?.trim();
  if (!botToken || !webhookSecret || !allowedChatId) return null;
  return { botToken, webhookSecret, allowedChatId };
}

export function verifyTelegramWebhookSecret(received: string | undefined, expected: string): boolean {
  if (!received || !expected) return false;
  const left = Buffer.from(received);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function normalizeTelegramText(input: string): string {
  return String(input || "")
    .replace(/^\s{0,3}#{1,6}\s*/gm, "")
    .replace(/\*\*(.*?)\*\*/gs, "$1")
    .replace(/__(.*?)__/gs, "$1")
    .replace(/(^|\n)\s*\*\s+/g, "$1• ")
    .replace(/(^|\n)\s*[-+]\s+/g, "$1• ")
    .replace(/^\s*[-*_]{3,}\s*$/gm, "")
    .replace(/\s+([,.;!?])/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function sendTelegramMessage(
  config: TelegramConfig,
  chatId: string,
  text: string,
  fetchImpl: typeof fetch = fetch,
  replyMarkup?: { inline_keyboard: TelegramInlineButton[][] },
): Promise<void> {
  const normalized = normalizeTelegramText(text);
  const chunks: string[] = [];
  let current = "";
  for (const line of normalized.split("\n")) {
    let remaining = line;
    while (remaining.length > 3900) {
      if (current) { chunks.push(current); current = ""; }
      chunks.push(remaining.slice(0, 3900));
      remaining = remaining.slice(3900);
    }
    const next = current ? current + "\n" + remaining : remaining;
    if (next.length > 3900 && current) { chunks.push(current); current = remaining; }
    else current = next;
  }
  if (current || !chunks.length) chunks.push(current || " ");
  for (let index = 0; index < chunks.length; index++) {
    const response = await fetchImpl(`https://api.telegram.org/bot${config.botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: chunks[index],
        disable_web_page_preview: true,
        ...(replyMarkup && index === chunks.length - 1 ? { reply_markup: replyMarkup } : {}),
      }),
      signal: AbortSignal.timeout(15000),
    });
    const payload: any = await response.json().catch(() => ({}));
    if (!response.ok || payload?.ok !== true) {
      throw new Error("Telegram sendMessage failed: " + String(payload?.description || response.statusText).slice(0,200));
    }
  }
}

export async function registerTelegramWebhook(
  config: TelegramConfig,
  publicBaseUrl: string,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const response = await fetchImpl(`https://api.telegram.org/bot${config.botToken}/setWebhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url: publicBaseUrl.replace(/\/+$/, "") + "/api/telegram/webhook",
      secret_token: config.webhookSecret,
      allowed_updates: ["message", "callback_query"],
      drop_pending_updates: false,
    }),
    signal: AbortSignal.timeout(15000),
  });
  const payload: any = await response.json().catch(() => ({}));
  if (!response.ok || payload?.ok !== true) {
    throw new Error("Telegram webhook registration failed: " + String(payload?.description || response.statusText).slice(0,200));
  }
}


export async function answerTelegramCallback(config: TelegramConfig, callbackQueryId: string, text = "", fetchImpl: typeof fetch = fetch): Promise<void> {
  const response = await fetchImpl(`https://api.telegram.org/bot${config.botToken}/answerCallbackQuery`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ callback_query_id: callbackQueryId, ...(text ? { text: text.slice(0, 180) } : {}) }),
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error("Telegram callback acknowledgement failed.");
}

export async function transcribeTelegramVoice(config: TelegramConfig, fileId: string, fileSize?: number, env: Record<string, string | undefined> = process.env, fetchImpl: typeof fetch = fetch): Promise<string> {
  if (fileSize && fileSize > 20 * 1024 * 1024) throw new Error("Voice note is too large. Please send an audio clip under 20 MB.");
  const metaResponse = await fetchImpl(`https://api.telegram.org/bot${config.botToken}/getFile?file_id=${encodeURIComponent(fileId)}`, { signal: AbortSignal.timeout(15000) });
  const meta: any = await metaResponse.json().catch(() => ({}));
  const filePath = meta?.result?.file_path;
  if (!metaResponse.ok || meta?.ok !== true || typeof filePath !== "string") throw new Error("Telegram could not retrieve that voice note.");
  const audioResponse = await fetchImpl(`https://api.telegram.org/file/bot${config.botToken}/${filePath}`, { signal: AbortSignal.timeout(30000) });
  if (!audioResponse.ok) throw new Error("Could not download the Telegram voice note.");
  const bytes = await audioResponse.arrayBuffer();
  if (!bytes.byteLength || bytes.byteLength > 20 * 1024 * 1024) throw new Error("Voice note is empty or exceeds the 20 MB limit.");
  const rawContentType = (audioResponse.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  const rawExtension = filePath.split(".").pop()?.toLowerCase() || "oga";
  // Telegram voice notes are commonly OGG/Opus and may be named .oga or served
  // with application/octet-stream. Normalize these to Groq's supported .ogg upload.
  const extension = rawExtension === "oga" ? "ogg" : rawExtension;
  const mimeByExtension: Record<string, string> = {
    ogg: "audio/ogg", opus: "audio/ogg", mp3: "audio/mpeg", mpeg: "audio/mpeg",
    mpga: "audio/mpeg", m4a: "audio/mp4", mp4: "audio/mp4", wav: "audio/wav",
    webm: "audio/webm", flac: "audio/flac",
  };
  const contentType = (!rawContentType || rawContentType === "application/octet-stream" || rawContentType === "binary/octet-stream")
    ? (mimeByExtension[extension] || "audio/ogg")
    : rawContentType;
  const uploadExtension = mimeByExtension[extension] ? extension : "ogg";
  const uploadMime = mimeByExtension[uploadExtension];
  const providers = [
    env.GROQ_API_KEY ? { name: "Groq", url: "https://api.groq.com/openai/v1/audio/transcriptions", key: env.GROQ_API_KEY, model: env.GROQ_STT_MODEL || "whisper-large-v3-turbo" } : null,
    env.OPENAI_API_KEY ? { name: "OpenAI", url: "https://api.openai.com/v1/audio/transcriptions", key: env.OPENAI_API_KEY, model: env.OPENAI_STT_MODEL || "whisper-1" } : null,
  ].filter(Boolean) as Array<{name:string;url:string;key:string;model:string}>;
  const geminiKey = env.GEMINI_API_KEY?.trim();
  if (!providers.length && !geminiKey) throw new Error("Voice transcription is not configured. Add GROQ_API_KEY, OPENAI_API_KEY or GEMINI_API_KEY to staging.");
  const errors: string[] = [];
  for (const provider of providers) {
    try {
      const form = new FormData();
      form.append("file", new Blob([bytes], { type: uploadMime || contentType }), "telegram-voice." + uploadExtension);
      form.append("model", provider.model);
      form.append("response_format", "json");
      const response = await fetchImpl(provider.url, {
        method: "POST", headers: { Authorization: "Bearer " + provider.key }, body: form,
        signal: AbortSignal.timeout(60000),
      });
      const responseBody = await response.text();
      let payload: any = {};
      try { payload = responseBody ? JSON.parse(responseBody) : {}; } catch { /* provider may return plain text */ }
      if (!response.ok) {
        const detail = String(payload?.error?.message || payload?.message || response.statusText || "request rejected").slice(0, 180);
        throw new Error(provider.name + " transcription HTTP " + response.status + (detail ? ": " + detail : ""));
      }
      const transcript = String(payload?.text || "").trim();
      if (!transcript) throw new Error(provider.name + " returned an empty transcript.");
      return transcript.slice(0, 4000);
    } catch (error: any) { errors.push(String(error?.message || error).slice(0, 160)); }
  }
  if (geminiKey) {
    try {
      const base64 = Buffer.from(bytes).toString("base64");
      const model = env.GEMINI_STT_MODEL || "gemini-2.5-flash";
      const response = await fetchImpl("https://generativelanguage.googleapis.com/v1beta/models/" + encodeURIComponent(model) + ":generateContent?key=" + encodeURIComponent(geminiKey), {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [
          { inline_data: { mime_type: contentType === "application/octet-stream" ? "audio/ogg" : contentType, data: base64 } },
          { text: "Transcribe this voice note accurately. Return only the spoken words, without commentary, labels or explanations." },
        ] }], generationConfig: { temperature: 0 } }),
        signal: AbortSignal.timeout(60000),
      });
      const body = await response.text();
      let payload: any = {};
      try { payload = body ? JSON.parse(body) : {}; } catch {}
      if (!response.ok) throw new Error("Gemini transcription HTTP " + response.status + ": " + String(payload?.error?.message || response.statusText).slice(0, 160));
      const transcript = String(payload?.candidates?.[0]?.content?.parts?.map((part: any) => part.text || "").join(" ") || "").trim();
      if (!transcript) throw new Error("Gemini returned an empty transcript.");
      return transcript.slice(0, 4000);
    } catch (error: any) { errors.push(String(error?.message || error).slice(0, 160)); }
  }
  throw new Error("Voice transcription failed: " + (errors.join("; ") || "No configured transcription provider responded."));
}
