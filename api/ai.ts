// ─── Centralized AI Service ────────────────────────────────────────────────
// Single entry point for ALL AI calls in DFQ Labs OS.
// To switch models app-wide, change DEFAULT_MODEL here — no other code changes needed.

// Verified against OpenRouter's live free-tier catalog on 2026-07-11 — many
// previously-listed free slugs (DeepSeek R1, Llama 3.3 70B, Gemini 2.0 Flash,
// Qwen 2.5 72B, Mistral 7B, Phi-3 Mini) now 404, are rate-limited upstream, or
// are reasoning models that return empty content. If entries here start
// failing via /api/ai-status, re-verify against https://openrouter.ai/api/v1/models
// and swap in a working `:free` slug — do not silently leave a broken default.
export const DEFAULT_MODEL = "nvidia/nemotron-nano-9b-v2:free";
const OPENROUTER_BASE = "https://openrouter.ai/api/v1";

// ─── Available models (used by AI Gateway UI) ──────────────────────────────
export const AVAILABLE_MODELS = [
  { id: "nvidia/nemotron-nano-9b-v2:free",     label: "Nemotron Nano 9B",   note: "Recommended · Balanced" },
  { id: "openai/gpt-oss-20b:free",             label: "GPT-OSS 20B",        note: "Fast · Concise" },
  { id: "nvidia/nemotron-3-nano-30b-a3b:free", label: "Nemotron 3 Nano 30B", note: "Detailed" },
  { id: "google/gemma-4-26b-a4b-it:free",      label: "Gemma 4 26B",        note: "Creative" },
];

// In-memory health tracking. On Vercel serverless this only persists across
// warm invocations of the same instance (best-effort), which is fine for a
// health *indicator* — it is not meant to be a durable audit log.
const aiHealth = {
  lastSuccessAt: null as string | null,
  lastModelUsed: null as string | null,
  successCount: 0,
  failureCount: 0,
  totalLatencyMs: 0,
  recentErrors: [] as { ts: string; message: string; model: string }[],
};

async function callOpenRouterRaw(systemPrompt: string | undefined, userPrompt: string, model: string, maxTokens: number, apiKey: string): Promise<string> {
  const messages: { role: string; content: string }[] = [];
  if (systemPrompt) messages.push({ role: "system", content: systemPrompt });
  messages.push({ role: "user", content: userPrompt });

  const response = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://dfqlabs.vercel.app",
      "X-Title": "DFQ Labs OS"
    },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: maxTokens || 1200,
      temperature: 0.7,
      reasoning: { exclude: true, effort: "low" }
    })
  });

  if (!response.ok) {
    const errBody = await response.json().catch(() => ({})) as any;
    throw new Error(errBody?.error?.message || errBody?.message || `HTTP ${response.status}`);
  }
  const data = await response.json() as any;
  return data?.choices?.[0]?.message?.content ?? "";
}

// Tries the preferred model, then falls through AVAILABLE_MODELS in order
// until one returns non-empty content.
async function callWithFallback(systemPrompt: string | undefined, userPrompt: string, preferredModel: string, maxTokens: number, apiKey: string): Promise<{ text: string; model: string }> {
  const chain = [preferredModel, ...AVAILABLE_MODELS.map(m => m.id).filter(id => id !== preferredModel)];
  let lastError: any = null;
  for (const model of chain) {
    const start = Date.now();
    try {
      const text = await callOpenRouterRaw(systemPrompt, userPrompt, model, maxTokens, apiKey);
      if (text && text.trim()) {
        aiHealth.lastSuccessAt = new Date().toISOString();
        aiHealth.lastModelUsed = model;
        aiHealth.successCount++;
        aiHealth.totalLatencyMs += Date.now() - start;
        return { text, model };
      }
      lastError = new Error(`Model ${model} returned empty content.`);
      aiHealth.failureCount++;
    } catch (error: any) {
      lastError = error;
      aiHealth.failureCount++;
      aiHealth.recentErrors.unshift({ ts: new Date().toISOString(), message: String(error?.message || error).slice(0, 200), model });
      aiHealth.recentErrors = aiHealth.recentErrors.slice(0, 20);
    }
  }
  throw lastError || new Error("All AI models failed.");
}

export function getAIHealth() {
  const avgLatencyMs = aiHealth.successCount > 0 ? Math.round(aiHealth.totalLatencyMs / aiHealth.successCount) : null;
  return { ...aiHealth, avgLatencyMs, fallbackModels: AVAILABLE_MODELS.map(m => m.id) };
}

function friendlyError(error: any): { status: number; message: string } {
  const raw = String(error?.message ?? error ?? "");
  if (raw.includes("RESOURCE_EXHAUSTED") || raw.includes("quota") || raw.includes("429") || raw.toLowerCase().includes("rate limit")) {
    return { status: 429, message: "AI quota exceeded. Try switching to a different model in AI Gateway settings." };
  }
  if (raw.includes("401") || raw.includes("403") || raw.toLowerCase().includes("api key") || raw.toLowerCase().includes("unauthorized")) {
    return { status: 401, message: "Invalid OPENROUTER_API_KEY. Check your Vercel environment variables." };
  }
  if (raw.includes("404") || raw.toLowerCase().includes("not found")) {
    return { status: 404, message: "AI model not found. Select a different model in AI Gateway settings." };
  }
  const clean = raw.replace(/\{[\s\S]*?\}/g, "").trim().slice(0, 240);
  return { status: 500, message: clean || "AI service temporarily unavailable. Please try again." };
}

export default async function handler(req: any, res: any) {
  res.setHeader("Content-Type", "application/json");

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: "OPENROUTER_API_KEY is not configured. Add it to Vercel → Project → Settings → Environment Variables."
    });
  }

  const { systemPrompt, userPrompt, model, maxTokens } = req.body || {};
  if (!userPrompt) {
    return res.status(400).json({ error: "userPrompt is required" });
  }

  const activeModel = model || DEFAULT_MODEL;

  try {
    const { text, model: usedModel } = await callWithFallback(systemPrompt, userPrompt, activeModel, maxTokens || 1200, apiKey);
    return res.status(200).json({ text, model: usedModel, fellBack: usedModel !== activeModel });
  } catch (error: any) {
    console.error("OpenRouter /api/ai error:", error);
    const { status, message } = friendlyError(error);
    return res.status(status).json({ error: message });
  }
}
