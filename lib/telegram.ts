import { timingSafeEqual } from "node:crypto";

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

export async function sendTelegramMessage(
  config: TelegramConfig,
  chatId: string,
  text: string,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const chunks = text.match(/[\\s\\S]{1,3900}/g) || [" "];
  for (const chunk of chunks) {
    const response = await fetchImpl(`https://api.telegram.org/bot${config.botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: chunk, disable_web_page_preview: true }),
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) {
      const payload: any = await response.json().catch(() => ({}));
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
      url: publicBaseUrl.replace(/\\/+$/, "") + "/api/telegram/webhook",
      secret_token: config.webhookSecret,
      allowed_updates: ["message"],
      drop_pending_updates: false,
    }),
    signal: AbortSignal.timeout(15000),
  });
  const payload: any = await response.json().catch(() => ({}));
  if (!response.ok || payload?.ok !== true) {
    throw new Error("Telegram webhook registration failed: " + String(payload?.description || response.statusText).slice(0,200));
  }
}
