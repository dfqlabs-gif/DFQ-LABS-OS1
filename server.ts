import express from "express";
import path from "path";
import dotenv from "dotenv";
import { createServer as createViteServer } from "vite";

dotenv.config();

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 5000;
const OPENROUTER_BASE = "https://openrouter.ai/api/v1";
const DEFAULT_MODEL = "deepseek/deepseek-chat-v3-0324:free";

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
    body: JSON.stringify({ model, messages, max_tokens: maxTokens || 1200, temperature })
  });

  if (!response.ok) {
    const errBody = await response.json().catch(() => ({})) as any;
    throw new Error(errBody?.error?.message || `HTTP ${response.status}`);
  }

  const data = await response.json() as any;
  return data?.choices?.[0]?.message?.content ?? "";
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
    const text = await callOpenRouter(systemPrompt, userPrompt, activeModel, maxTokens);
    res.json({ text, model: activeModel });
  } catch (error: any) {
    console.error("OpenRouter /api/ai error:", error);
    res.status(500).json({ error: friendlyError(error) });
  }
});

// ── /api/ai-status — connection check / test (used by AI Gateway UI) ────────
app.get("/api/ai-status", (req, res) => {
  res.setHeader("Content-Type", "application/json");
  res.json({ configured: !!process.env.OPENROUTER_API_KEY, defaultModel: DEFAULT_MODEL });
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
    res.json({ ok: true, model: testModel, latencyMs: Date.now() - start, response: text.trim() });
  } catch (error: any) {
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
    const draft = await callOpenRouter(systemPrompt, userPrompt, activeModel, 400, 0.8);
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
