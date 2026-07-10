// Connection test endpoint for the AI Gateway settings page.
// GET  → returns whether the API key is configured + default model
// POST → runs a live test prompt and returns latency + result

import { DEFAULT_MODEL } from "./ai";

const OPENROUTER_BASE = "https://openrouter.ai/api/v1";

export default async function handler(req: any, res: any) {
  res.setHeader("Content-Type", "application/json");

  const apiKey = process.env.OPENROUTER_API_KEY;

  // ── GET: config status ──────────────────────────────────────────────────
  if (req.method === "GET") {
    return res.status(200).json({
      configured: !!apiKey,
      defaultModel: DEFAULT_MODEL
    });
  }

  // ── POST: live connection test ──────────────────────────────────────────
  if (req.method === "POST") {
    if (!apiKey) {
      return res.status(200).json({
        ok: false,
        error: "OPENROUTER_API_KEY is not configured on the server."
      });
    }

    const { model } = (req.body || {}) as { model?: string };
    const testModel = model || DEFAULT_MODEL;
    const start = Date.now();

    try {
      const response = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://dfqlabs.vercel.app",
          "X-Title": "DFQ Labs OS"
        },
        body: JSON.stringify({
          model: testModel,
          messages: [{ role: "user", content: 'Reply with exactly the word: CONNECTED' }],
          max_tokens: 10,
          temperature: 0
        })
      });

      const latencyMs = Date.now() - start;

      if (!response.ok) {
        const errBody = await response.json().catch(() => ({})) as any;
        const msg = errBody?.error?.message || `HTTP ${response.status}`;
        return res.status(200).json({ ok: false, model: testModel, latencyMs, error: msg });
      }

      const data = await response.json() as any;
      const text: string = data?.choices?.[0]?.message?.content ?? "";
      return res.status(200).json({ ok: true, model: testModel, latencyMs, response: text.trim() });
    } catch (error: any) {
      return res.status(200).json({
        ok: false,
        model: testModel,
        latencyMs: Date.now() - start,
        error: error.message || "Network error"
      });
    }
  }

  return res.status(405).json({ error: "Method not allowed" });
}
