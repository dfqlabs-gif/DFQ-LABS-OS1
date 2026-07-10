// ─── Centralized AI Service ────────────────────────────────────────────────
// Single entry point for ALL AI calls in DFQ Labs OS.
// To switch models app-wide, change DEFAULT_MODEL here — no other code changes needed.

export const DEFAULT_MODEL = "deepseek/deepseek-chat-v3-0324:free";
const OPENROUTER_BASE = "https://openrouter.ai/api/v1";

// ─── Available models (used by AI Gateway UI) ──────────────────────────────
export const AVAILABLE_MODELS = [
  { id: "deepseek/deepseek-chat-v3-0324:free",     label: "DeepSeek V3",          note: "Recommended · Fast" },
  { id: "qwen/qwen3-235b-a22b:free",               label: "Qwen 3 235B",          note: "Powerful · Detailed" },
  { id: "meta-llama/llama-3.3-70b-instruct:free",  label: "Llama 3.3 70B",        note: "Fast · Balanced" },
  { id: "google/gemini-2.0-flash-exp:free",        label: "Gemini 2.0 Flash",     note: "Creative · Concise" },
  { id: "mistralai/mistral-7b-instruct:free",      label: "Mistral 7B",           note: "Lightweight · Quick" },
  { id: "microsoft/phi-3-mini-128k-instruct:free", label: "Phi-3 Mini",           note: "Compact · Efficient" },
];

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
        model: activeModel,
        messages,
        max_tokens: maxTokens || 1200,
        temperature: 0.7
      })
    });

    if (!response.ok) {
      const errBody = await response.json().catch(() => ({})) as any;
      const msg = errBody?.error?.message || errBody?.message || `HTTP ${response.status}`;
      const { status, message } = friendlyError({ message: msg });
      console.error(`OpenRouter error [${activeModel}]:`, msg);
      return res.status(status).json({ error: message });
    }

    const data = await response.json() as any;
    const text: string = data?.choices?.[0]?.message?.content ?? "";
    return res.status(200).json({ text, model: activeModel });
  } catch (error: any) {
    console.error("OpenRouter /api/ai error:", error);
    const { status, message } = friendlyError(error);
    return res.status(status).json({ error: message });
  }
}
