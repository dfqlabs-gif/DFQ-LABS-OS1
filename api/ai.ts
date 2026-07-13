// ─── Centralized AI Service (Vercel serverless handler) ───────────────────────
// Powered by Google Gemini. To swap models, change GEMINI_MODEL env var —
// no other code changes needed.

import { GoogleGenAI } from "@google/genai";

export const DEFAULT_MODEL = process.env.GEMINI_MODEL || "gemini-3.1-flash-lite";

// ─── Available Gemini models (used by AI Gateway UI) ──────────────────────────
// gemini-3.1-flash-lite: fastest confirmed working model for high-volume free-tier.
export const AVAILABLE_MODELS = [
  { id: "gemini-3.1-flash-lite",         label: "Gemini 3.1 Flash Lite",    note: "Recommended · Fastest" },
  { id: "gemini-3.1-flash-lite-preview", label: "Gemini 3.1 Flash Preview",  note: "Fast · High Volume" },
  { id: "gemini-flash-lite-latest",      label: "Gemini Flash Lite Latest",  note: "Always Latest Lite" },
];

// ─── Model fallback chain (tried in order when primary 404s) ─────────────────
const FALLBACK_MODELS = ["gemini-2.0-flash-lite", "gemini-1.5-flash-8b", "gemini-1.5-flash"];

// ── In-memory health tracking ─────────────────────────────────────────────────
const aiHealth = {
  lastSuccessAt: null as string | null,
  lastModelUsed: null as string | null,
  successCount: 0,
  failureCount: 0,
  totalLatencyMs: 0,
  recentErrors: [] as { ts: string; message: string; model: string }[],
};

async function callGeminiRaw(
  systemPrompt: string | undefined,
  userPrompt: string,
  model: string,
  maxTokens: number,
  temperature: number,
  apiKey: string
): Promise<string> {
  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model,
    contents: userPrompt,
    config: {
      ...(systemPrompt ? { systemInstruction: systemPrompt } : {}),
      maxOutputTokens: maxTokens,
      temperature,
    },
  });
  const text = response.text ?? "";
  if (!text.trim()) throw new Error(`Model ${model} returned empty content.`);
  return text;
}

async function callGeminiWithRetry(
  systemPrompt: string | undefined,
  userPrompt: string,
  model: string,
  maxTokens: number,
  apiKey: string,
  retries = 2
): Promise<{ text: string; model: string }> {
  const modelsToTry = [model, ...FALLBACK_MODELS.filter(m => m !== model)];
  let lastError: any;

  for (const tryModel of modelsToTry) {
    let is404 = false;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const text = await callGeminiRaw(systemPrompt, userPrompt, tryModel, maxTokens, 0.7, apiKey);
        return { text, model: tryModel };
      } catch (err: any) {
        lastError = err;
        const msg = String(err?.message ?? "");
        is404 = msg.includes("404") || msg.toLowerCase().includes("not found");
        if (is404) break; // this model doesn't exist — try next
        const isRetryable = msg.includes("429") || msg.includes("503") || msg.includes("RESOURCE_EXHAUSTED") || msg.includes("UNAVAILABLE");
        if (!isRetryable || attempt === retries) break;
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
      }
    }
    if (!is404) break; // non-404 error — don't try other models
  }
  throw lastError;
}

export function getAIHealth() {
  const avgLatencyMs = aiHealth.successCount > 0 ? Math.round(aiHealth.totalLatencyMs / aiHealth.successCount) : null;
  return { ...aiHealth, avgLatencyMs };
}

function friendlyError(error: any): { status: number; message: string } {
  const raw = String(error?.message ?? error ?? "");
  if (raw.includes("429") || raw.includes("RESOURCE_EXHAUSTED") || raw.includes("quota") || raw.toLowerCase().includes("rate limit")) {
    return { status: 429, message: "Gemini API quota exceeded. Wait a moment and try again." };
  }
  if (raw.includes("401") || raw.includes("403") || raw.toLowerCase().includes("api key") || raw.toLowerCase().includes("invalid")) {
    return { status: 401, message: "Invalid GEMINI_API_KEY. Check your environment variables." };
  }
  if (raw.includes("404") || raw.toLowerCase().includes("not found")) {
    return { status: 404, message: "Gemini model not found. Select a different model in AI Gateway settings." };
  }
  const clean = raw.replace(/\{[\s\S]*?\}/g, "").trim().slice(0, 240);
  return { status: 500, message: clean || "AI service temporarily unavailable. Please try again." };
}

export default async function handler(req: any, res: any) {
  res.setHeader("Content-Type", "application/json");

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: "GEMINI_API_KEY is not configured. Add it to your environment variables."
    });
  }

  const { systemPrompt, userPrompt, model, maxTokens } = req.body || {};
  if (!userPrompt) {
    return res.status(400).json({ error: "userPrompt is required" });
  }

  const activeModel = model || DEFAULT_MODEL;
  const start = Date.now();

  try {
    const { text, model: usedModel } = await callGeminiWithRetry(systemPrompt, userPrompt, activeModel, maxTokens || 1200, apiKey);
    aiHealth.lastSuccessAt = new Date().toISOString();
    aiHealth.lastModelUsed = usedModel;
    aiHealth.successCount++;
    aiHealth.totalLatencyMs += Date.now() - start;
    return res.status(200).json({ text, model: usedModel, fellBack: usedModel !== activeModel });
  } catch (error: any) {
    console.error("Gemini /api/ai error:", error);
    aiHealth.failureCount++;
    aiHealth.recentErrors.unshift({ ts: new Date().toISOString(), message: String(error?.message || error).slice(0, 200), model: activeModel });
    aiHealth.recentErrors = aiHealth.recentErrors.slice(0, 20);
    const { status, message } = friendlyError(error);
    return res.status(status).json({ error: message });
  }
}
