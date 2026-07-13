// Connection test endpoint for the AI Gateway settings page.
// GET  → returns whether GEMINI_API_KEY is configured + default model
// POST → runs a live test prompt and returns latency + result

import { GoogleGenAI } from "@google/genai";
import { DEFAULT_MODEL } from "./ai";

export default async function handler(req: any, res: any) {
  res.setHeader("Content-Type", "application/json");

  const apiKey = process.env.GEMINI_API_KEY;

  // ── GET: config status ────────────────────────────────────────────────────
  if (req.method === "GET") {
    return res.status(200).json({
      configured: !!apiKey,
      provider: "gemini",
      defaultModel: DEFAULT_MODEL,
    });
  }

  // ── POST: live connection test ────────────────────────────────────────────
  if (req.method === "POST") {
    if (!apiKey) {
      return res.status(200).json({
        ok: false,
        error: "GEMINI_API_KEY is not configured on the server.",
      });
    }

    const { model } = (req.body || {}) as { model?: string };
    const testModel = model || DEFAULT_MODEL;
    const start = Date.now();

    try {
      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent({
        model: testModel,
        contents: "Reply with exactly the word: CONNECTED",
        config: { maxOutputTokens: 10, temperature: 0 },
      });
      const text = response.text ?? "";
      const latencyMs = Date.now() - start;
      return res.status(200).json({ ok: true, model: testModel, latencyMs, response: text.trim() });
    } catch (error: any) {
      return res.status(200).json({
        ok: false,
        model: testModel,
        latencyMs: Date.now() - start,
        error: error.message || "Network error",
      });
    }
  }

  return res.status(405).json({ error: "Method not allowed" });
}
