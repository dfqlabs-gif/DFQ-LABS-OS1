import assert from "node:assert/strict";
import test from "node:test";
import { getTelegramConfig, registerTelegramWebhook, sendTelegramMessage, verifyTelegramWebhookSecret } from "./telegram.js";

test("Telegram config requires all secrets and allowed chat ID", () => {
  assert.equal(getTelegramConfig({ TELEGRAM_BOT_TOKEN: "x", TELEGRAM_WEBHOOK_SECRET: "y" }), null);
  assert.deepEqual(getTelegramConfig({ TELEGRAM_BOT_TOKEN: "x", TELEGRAM_WEBHOOK_SECRET: "y", TELEGRAM_ALLOWED_CHAT_ID: "123" }), {
    botToken: "x", webhookSecret: "y", allowedChatId: "123",
  });
});

test("Telegram webhook secret comparison rejects missing and mismatched values", () => {
  assert.equal(verifyTelegramWebhookSecret("abc", "abc"), true);
  assert.equal(verifyTelegramWebhookSecret("abd", "abc"), false);
  assert.equal(verifyTelegramWebhookSecret(undefined, "abc"), false);
});

test("Telegram webhook registers only message updates and retains pending updates", async () => {
  let sent: any;
  await registerTelegramWebhook({
    botToken: "bot-token", webhookSecret: "secret", allowedChatId: "123",
  }, "https://staging.example.com/", async (_input, init) => {
    sent = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  });
  assert.equal(sent.url, "https://staging.example.com/api/telegram/webhook");
  assert.deepEqual(sent.allowed_updates, ["message"]);
  assert.equal(sent.drop_pending_updates, false);
});

test("Telegram message delivery uses the configured chat and chunks long messages", async () => {
  const sent: any[] = [];
  await sendTelegramMessage({
    botToken: "bot-token", webhookSecret: "secret", allowedChatId: "123",
  }, "123", "x".repeat(4000), async (_input, init) => {
    sent.push(JSON.parse(String(init?.body)));
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  });
  assert.equal(sent.length, 2);
  assert.equal(sent[0].chat_id, "123");
  assert.equal(sent[0].text.length, 3900);
});
