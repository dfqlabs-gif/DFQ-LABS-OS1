import assert from "node:assert/strict";
import test from "node:test";
import { getTelegramConfig, normalizeTelegramText, registerTelegramWebhook, sendTelegramMessage, transcribeTelegramVoice, verifyTelegramWebhookSecret } from "./telegram.js";

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
  assert.deepEqual(sent.allowed_updates, ["message", "callback_query"]);
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

test("Telegram voice transcription rejects oversized voice notes before network access", async () => {
  await assert.rejects(
    () => transcribeTelegramVoice({ botToken: "x", webhookSecret: "y", allowedChatId: "1" }, "file-id", 21 * 1024 * 1024, {}),
    /too large/i,
  );
});


test("Telegram OGG voice notes upload with normalized MIME type and useful Groq diagnostics", async () => {
  const calls: Array<{ url: string; body?: BodyInit | null; headers?: HeadersInit }> = [];
  const fetchMock: typeof fetch = async (input, init) => {
    const url = String(input);
    calls.push({ url, body: init?.body, headers: init?.headers });
    if (url.includes("getFile")) {
      return new Response(JSON.stringify({ ok: true, result: { file_path: "voice/file.oga" } }), { status: 200 });
    }
    if (url.includes("/file/bot")) {
      return new Response(new Uint8Array([79, 103, 103, 83]), {
        status: 200, headers: { "content-type": "application/octet-stream" },
      });
    }
    return new Response(JSON.stringify({ error: { message: "Invalid file format" } }), { status: 400 });
  };
  await assert.rejects(
    () => transcribeTelegramVoice(
      { botToken: "x", webhookSecret: "y", allowedChatId: "1" },
      "file-id", 4, { GROQ_API_KEY: "test-key" }, fetchMock,
    ),
    /Groq transcription HTTP 400: Invalid file format/i,
  );
  const form = calls[2].body as FormData;
  const audio = form.get("file") as File;
  assert.equal(audio.name, "telegram-voice.ogg");
  assert.equal(audio.type, "audio/ogg");
  assert.equal(form.get("model"), "whisper-large-v3-turbo");
});

test("Telegram voice transcription falls back to Gemini after Groq rejects the audio", async () => {
  const calls: string[] = [];
  const fetchMock: typeof fetch = async (input, init) => {
    const url = String(input);
    calls.push(url);
    if (url.includes("getFile")) return new Response(JSON.stringify({ ok: true, result: { file_path: "voice/file.oga" } }), { status: 200 });
    if (url.includes("/file/bot")) return new Response(new Uint8Array([79, 103, 103, 83]), { status: 200, headers: { "content-type": "application/octet-stream" } });
    if (url.includes("groq.com")) return new Response(JSON.stringify({ error: { message: "Invalid file format" } }), { status: 400 });
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "Run the nurture workflow for eligible leads." }] } }] }), { status: 200 });
  };
  const transcript = await transcribeTelegramVoice(
    { botToken: "x", webhookSecret: "y", allowedChatId: "1" }, "file-id", 4,
    { GROQ_API_KEY: "test-groq", GEMINI_API_KEY: "test-gemini" }, fetchMock,
  );
  assert.equal(transcript, "Run the nurture workflow for eligible leads.");
  assert.equal(calls.some(url => url.includes("generativelanguage.googleapis.com")), true);
});

test("Telegram voice transcription supports Gemini as the only configured provider", async () => {
  const fetchMock: typeof fetch = async (input) => {
    const url = String(input);
    if (url.includes("getFile")) return new Response(JSON.stringify({ ok: true, result: { file_path: "voice/file.oga" } }), { status: 200 });
    if (url.includes("/file/bot")) return new Response(new Uint8Array([79, 103, 103, 83]), { status: 200, headers: { "content-type": "application/octet-stream" } });
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "Run the nurture workflow." }] } }] }), { status: 200 });
  };
  const transcript = await transcribeTelegramVoice(
    { botToken: "x", webhookSecret: "y", allowedChatId: "1" }, "file-id", 4,
    { GEMINI_API_KEY: "test-gemini" }, fetchMock,
  );
  assert.equal(transcript, "Run the nurture workflow.");
});

test("Telegram text normalization removes Markdown markers and preserves readable structure", () => {
  const result = normalizeTelegramText("### **Operational Overview**\n\n1. **Active leads:** 518\n* Scout needs review\n- Follow up with warm leads");
  assert.equal(result.includes("#"), false);
  assert.equal(result.includes("**"), false);
  assert.match(result, /Operational Overview/);
  assert.match(result, /Active leads: 518/);
  assert.match(result, /• Scout needs review/);
  assert.match(result, /• Follow up with warm leads/);
});

