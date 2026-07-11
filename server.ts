import express from "express";
import path from "path";
import dotenv from "dotenv";
import { createServer as createViteServer } from "vite";

dotenv.config();

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 5000;
const OPENROUTER_BASE = "https://openrouter.ai/api/v1";
const DEFAULT_MODEL = "nvidia/nemotron-nano-9b-v2:free";
// Fallback chain — if the preferred model errors or returns empty content,
// the next model here is tried automatically. Keep in sync with
// AVAILABLE_MODELS in api/ai.ts and components/AIGateway.tsx.
const AVAILABLE_MODELS = [
  "nvidia/nemotron-nano-9b-v2:free",
  "openai/gpt-oss-20b:free",
  "nvidia/nemotron-3-nano-30b-a3b:free",
  "google/gemma-4-26b-a4b-it:free",
];

// ── In-memory AI health tracking (resets on restart; used by the AI Health
// Monitoring panel in the AI Gateway tab) ───────────────────────────────────
const aiHealth = {
  lastSuccessAt: null as string | null,
  lastModelUsed: null as string | null,
  successCount: 0,
  failureCount: 0,
  totalLatencyMs: 0,
  recentErrors: [] as { ts: string; message: string; model: string }[],
};

function recordSuccess(model: string, latencyMs: number) {
  aiHealth.lastSuccessAt = new Date().toISOString();
  aiHealth.lastModelUsed = model;
  aiHealth.successCount++;
  aiHealth.totalLatencyMs += latencyMs;
}

function recordFailure(model: string, message: string) {
  aiHealth.failureCount++;
  aiHealth.recentErrors.unshift({ ts: new Date().toISOString(), message: String(message).slice(0, 200), model });
  aiHealth.recentErrors = aiHealth.recentErrors.slice(0, 20);
}

app.use(express.json());

// ── Shared OpenRouter helper ────────────────────────────────────────────────
async function callOpenRouter(
  systemPrompt: string | undefined,
  userPrompt: string,
  model: string,
  maxTokens?: number,
  temperature = 0.7
): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is not configured on the server.");

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
    // Some free-tier models are reasoning models that spend the whole token
    // budget "thinking" and return empty content unless reasoning is
    // excluded from the completion and given a low effort level.
    body: JSON.stringify({
      model,
      messages,
      max_tokens: maxTokens || 1200,
      temperature,
      reasoning: { exclude: true, effort: "low" },
    })
  });

  if (!response.ok) {
    const errBody = await response.json().catch(() => ({})) as any;
    throw new Error(errBody?.error?.message || `HTTP ${response.status}`);
  }

  const data = await response.json() as any;
  return data?.choices?.[0]?.message?.content ?? "";
}

// Tries the preferred model first, then falls through the rest of
// AVAILABLE_MODELS in order until one returns non-empty content. Never
// throws until every model in the chain has failed.
async function callWithFallback(
  systemPrompt: string | undefined,
  userPrompt: string,
  preferredModel: string,
  maxTokens?: number,
  temperature = 0.7
): Promise<{ text: string; model: string; fellBack: boolean }> {
  const chain = [preferredModel, ...AVAILABLE_MODELS.filter(m => m !== preferredModel)];
  let lastError: any = null;
  for (const model of chain) {
    const start = Date.now();
    try {
      const text = await callOpenRouter(systemPrompt, userPrompt, model, maxTokens, temperature);
      if (text && text.trim()) {
        recordSuccess(model, Date.now() - start);
        return { text, model, fellBack: model !== preferredModel };
      }
      lastError = new Error(`Model ${model} returned empty content.`);
      recordFailure(model, lastError.message);
    } catch (error: any) {
      lastError = error;
      recordFailure(model, error?.message || String(error));
    }
  }
  throw lastError || new Error("All AI models failed.");
}

function friendlyError(error: any): string {
  const raw = String(error?.message ?? "");
  if (raw.includes("429") || raw.toLowerCase().includes("quota") || raw.toLowerCase().includes("rate limit")) {
    return "AI quota exceeded. Try switching to a different model in AI Gateway settings.";
  }
  if (raw.includes("401") || raw.includes("403")) {
    return "Invalid OPENROUTER_API_KEY. Check your environment variables.";
  }
  if (!process.env.OPENROUTER_API_KEY) {
    return "OPENROUTER_API_KEY is not configured. Add it to your environment variables.";
  }
  return raw.replace(/\{[\s\S]*?\}/g, "").trim().slice(0, 200) || "AI service temporarily unavailable.";
}

// ── /api/ai — centralized AI endpoint (all features route here) ─────────────
app.post("/api/ai", async (req, res) => {
  res.setHeader("Content-Type", "application/json");
  const { systemPrompt, userPrompt, model, maxTokens } = req.body || {};

  if (!userPrompt) {
    res.status(400).json({ error: "userPrompt is required" });
    return;
  }
  if (!process.env.OPENROUTER_API_KEY) {
    res.status(500).json({ error: "OPENROUTER_API_KEY is not configured on the server." });
    return;
  }

  const activeModel = model || DEFAULT_MODEL;
  try {
    const { text, model: usedModel, fellBack } = await callWithFallback(systemPrompt, userPrompt, activeModel, maxTokens);
    res.json({ text, model: usedModel, fellBack });
  } catch (error: any) {
    console.error("OpenRouter /api/ai error:", error);
    res.status(500).json({ error: friendlyError(error) });
  }
});

// ── /api/ai-status — connection check / test / health (used by AI Gateway UI) ─
app.get("/api/ai-status", (req, res) => {
  res.setHeader("Content-Type", "application/json");
  const avgLatencyMs = aiHealth.successCount > 0 ? Math.round(aiHealth.totalLatencyMs / aiHealth.successCount) : null;
  res.json({
    configured: !!process.env.OPENROUTER_API_KEY,
    defaultModel: DEFAULT_MODEL,
    fallbackModels: AVAILABLE_MODELS,
    lastSuccessAt: aiHealth.lastSuccessAt,
    lastModelUsed: aiHealth.lastModelUsed,
    successCount: aiHealth.successCount,
    failureCount: aiHealth.failureCount,
    avgLatencyMs,
    recentErrors: aiHealth.recentErrors,
  });
});

app.post("/api/ai-status", async (req, res) => {
  res.setHeader("Content-Type", "application/json");
  if (!process.env.OPENROUTER_API_KEY) {
    res.json({ ok: false, error: "OPENROUTER_API_KEY is not configured on the server." });
    return;
  }
  const { model } = req.body || {};
  const testModel = model || DEFAULT_MODEL;
  const start = Date.now();
  try {
    const text = await callOpenRouter(undefined, "Reply with exactly the word: CONNECTED", testModel, 10, 0);
    recordSuccess(testModel, Date.now() - start);
    res.json({ ok: true, model: testModel, latencyMs: Date.now() - start, response: text.trim() });
  } catch (error: any) {
    recordFailure(testModel, error.message);
    res.json({ ok: false, model: testModel, latencyMs: Date.now() - start, error: error.message });
  }
});

// ── /api/call-gemini — legacy endpoint, maps old field names to new contract ─
app.post("/api/call-gemini", async (req, res) => {
  res.setHeader("Content-Type", "application/json");
  // Accept both old fields (prompt/systemInstruction) and new fields (userPrompt/systemPrompt)
  const body = req.body || {};
  const userPrompt = body.userPrompt || body.prompt;
  const systemPrompt = body.systemPrompt || body.systemInstruction;
  const { model, maxTokens } = body;

  if (!userPrompt) {
    res.status(400).json({ error: "prompt is required" });
    return;
  }
  if (!process.env.OPENROUTER_API_KEY) {
    res.status(500).json({ error: "OPENROUTER_API_KEY is not configured on the server." });
    return;
  }

  const activeModel = model || DEFAULT_MODEL;
  try {
    const text = await callOpenRouter(systemPrompt, userPrompt, activeModel, maxTokens);
    res.json({ text, model: activeModel });
  } catch (error: any) {
    console.error("OpenRouter /api/call-gemini error:", error);
    res.status(500).json({ error: friendlyError(error) });
  }
});

// ── /api/generate-dm — DM generator ─────────────────────────────────────────
app.post("/api/generate-dm", async (req, res) => {
  res.setHeader("Content-Type", "application/json");
  const { name, company, role, niche, channel, painPoint, stage, lastConversation, notes, model } = req.body || {};

  if (!name || !company) {
    res.status(400).json({ error: "Prospect name and company are required." });
    return;
  }
  if (!process.env.OPENROUTER_API_KEY) {
    res.status(500).json({ error: "OPENROUTER_API_KEY is not configured on the server." });
    return;
  }

  const stageMap: Record<string, { nextStage: string; objective: string }> = {
    "Outreach Sent":       { nextStage: "Replied / Interested", objective: "Get them to respond. Follow up on the previous touchpoint or introduce a fresh, low-resistance angle." },
    "Replied / Interested":{ nextStage: "Audit Requested",       objective: "Offer a free custom audit. Transition their general interest into requesting a custom audit." },
    "Audit Requested":     { nextStage: "Audit Delivered",       objective: "Deliver an outstanding audit insight and invite a 10-minute walk-through call." },
    "Audit Delivered":     { nextStage: "Meeting Booked",        objective: "Move them to book a specific strategy session." },
    "Meeting Booked":      { nextStage: "Proposal Sent",         objective: "Follow up on the meeting and send a clear, tailored business proposal." },
    "Proposal Sent":       { nextStage: "Client Closed",         objective: "Follow up to address final concerns and close the deal." },
    "Client Closed":       { nextStage: "Referrals / Account Growth", objective: "Express appreciation and request a warm referral." },
  };

  const { nextStage, objective } = stageMap[stage] || { nextStage: "Replied / Interested", objective: "Build rapport and offer value." };

  const systemPrompt = `You are an elite cold outreach copywriter. Your copy sounds like an authentic professional human, never robotic or generic. NEVER use clichés, AI buzzwords, or fake excitement. Keep DMs to 2-3 sentences max. Focus on one natural next step.`;
  const userPrompt = `Write a hyper-personalized outreach message for:
- Name: ${name}, Company: ${company}, Role: ${role || "decision-maker"}
- Niche: ${niche || "their sector"}, Channel: ${channel}
- Pain Point: ${painPoint || "client acquisition"}, Stage: ${stage} → ${nextStage}
- Objective: ${objective}
${lastConversation ? `- Prior conversation: "${lastConversation}"` : ""}
${notes ? `- Notes: "${notes}"` : ""}
Output ONLY the final message text. No meta-commentary.`;

  const activeModel = model || DEFAULT_MODEL;
  try {
    const { text: draft } = await callWithFallback(systemPrompt, userPrompt, activeModel, 900, 0.8);
    res.json({ draft: draft || "Failed to generate DM." });
  } catch (error: any) {
    console.error("OpenRouter /api/generate-dm error:", error);
    res.status(500).json({ error: friendlyError(error) });
  }
});

// ── Frontend serving ─────────────────────────────────────────────────────────
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`DFQ Labs OS — OpenRouter-powered server on port ${PORT}`);
  });
}

startServer();
