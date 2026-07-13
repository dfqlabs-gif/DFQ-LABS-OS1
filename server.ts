import express from "express";
import path from "path";
import dotenv from "dotenv";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";

dotenv.config();

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 5000;

// ── AI Provider configuration — change GEMINI_MODEL env var to swap models ──
// gemini-2.5-flash: best for high-volume free-tier (15 RPM, 1M TPM on free plan)
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

// ── In-memory AI health tracking ─────────────────────────────────────────────
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

// ── Centralized Gemini client ─────────────────────────────────────────────────
async function callGeminiRaw(
  systemPrompt: string | undefined,
  userPrompt: string,
  model: string,
  maxTokens: number,
  temperature: number
): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not configured on the server.");

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

// Retry logic with exponential backoff for transient errors (429, 503, network)
async function callGemini(
  systemPrompt: string | undefined,
  userPrompt: string,
  model: string,
  maxTokens: number = 1200,
  temperature: number = 0.7,
  retries: number = 2
): Promise<string> {
  let lastError: any;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await callGeminiRaw(systemPrompt, userPrompt, model, maxTokens, temperature);
    } catch (err: any) {
      lastError = err;
      const msg = String(err?.message ?? "");
      const isRetryable = msg.includes("429") || msg.includes("503") || msg.includes("RESOURCE_EXHAUSTED") || msg.includes("UNAVAILABLE");
      if (!isRetryable || attempt === retries) break;
      // Exponential backoff: 1s, 2s
      await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
    }
  }
  throw lastError;
}

function friendlyError(error: any): string {
  const raw = String(error?.message ?? "");
  if (raw.includes("429") || raw.includes("RESOURCE_EXHAUSTED") || raw.toLowerCase().includes("quota") || raw.toLowerCase().includes("rate limit")) {
    return "Gemini API quota exceeded. Wait a moment and try again, or check your quota at console.cloud.google.com.";
  }
  if (raw.includes("401") || raw.includes("403") || raw.toLowerCase().includes("api key") || raw.toLowerCase().includes("invalid")) {
    return "Invalid GEMINI_API_KEY. Check your environment variables.";
  }
  if (!process.env.GEMINI_API_KEY) {
    return "GEMINI_API_KEY is not configured. Add it to your environment variables.";
  }
  return raw.replace(/\{[\s\S]*?\}/g, "").trim().slice(0, 200) || "AI service temporarily unavailable.";
}

// ── /api/ai — centralized AI endpoint (all features route here) ───────────────
app.post("/api/ai", async (req, res) => {
  res.setHeader("Content-Type", "application/json");
  const { systemPrompt, userPrompt, model, maxTokens } = req.body || {};

  if (!userPrompt) {
    res.status(400).json({ error: "userPrompt is required" });
    return;
  }
  if (!process.env.GEMINI_API_KEY) {
    res.status(500).json({ error: "GEMINI_API_KEY is not configured on the server." });
    return;
  }

  const activeModel = model || GEMINI_MODEL;
  const start = Date.now();
  try {
    const text = await callGemini(systemPrompt, userPrompt, activeModel, maxTokens || 1200);
    recordSuccess(activeModel, Date.now() - start);
    res.json({ text, model: activeModel, fellBack: false });
  } catch (error: any) {
    console.error("Gemini /api/ai error:", error);
    recordFailure(activeModel, error?.message || String(error));
    res.status(500).json({ error: friendlyError(error) });
  }
});

// ── /api/ai-status — health check & live connection test ─────────────────────
app.get("/api/ai-status", (req, res) => {
  res.setHeader("Content-Type", "application/json");
  const avgLatencyMs = aiHealth.successCount > 0 ? Math.round(aiHealth.totalLatencyMs / aiHealth.successCount) : null;
  res.json({
    configured: !!process.env.GEMINI_API_KEY,
    provider: "gemini",
    defaultModel: GEMINI_MODEL,
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
  if (!process.env.GEMINI_API_KEY) {
    res.json({ ok: false, error: "GEMINI_API_KEY is not configured on the server." });
    return;
  }
  const { model } = req.body || {};
  const testModel = model || GEMINI_MODEL;
  const start = Date.now();
  try {
    const text = await callGemini(undefined, "Reply with exactly the word: CONNECTED", testModel, 10, 0, 1);
    recordSuccess(testModel, Date.now() - start);
    res.json({ ok: true, model: testModel, latencyMs: Date.now() - start, response: text.trim() });
  } catch (error: any) {
    recordFailure(testModel, error.message);
    res.json({ ok: false, model: testModel, latencyMs: Date.now() - start, error: error.message });
  }
});

// ── /api/call-gemini — legacy compatibility endpoint ─────────────────────────
app.post("/api/call-gemini", async (req, res) => {
  res.setHeader("Content-Type", "application/json");
  const body = req.body || {};
  const userPrompt = body.userPrompt || body.prompt;
  const systemPrompt = body.systemPrompt || body.systemInstruction;
  const { model, maxTokens } = body;

  if (!userPrompt) {
    res.status(400).json({ error: "prompt is required" });
    return;
  }
  if (!process.env.GEMINI_API_KEY) {
    res.status(500).json({ error: "GEMINI_API_KEY is not configured on the server." });
    return;
  }

  const activeModel = model || GEMINI_MODEL;
  const start = Date.now();
  try {
    const text = await callGemini(systemPrompt, userPrompt, activeModel, maxTokens || 1200);
    recordSuccess(activeModel, Date.now() - start);
    res.json({ text, model: activeModel });
  } catch (error: any) {
    console.error("Gemini /api/call-gemini error:", error);
    recordFailure(activeModel, error?.message || String(error));
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
  if (!process.env.GEMINI_API_KEY) {
    res.status(500).json({ error: "GEMINI_API_KEY is not configured on the server." });
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

  const activeModel = model || GEMINI_MODEL;
  const start = Date.now();
  try {
    const draft = await callGemini(systemPrompt, userPrompt, activeModel, 900, 0.8);
    recordSuccess(activeModel, Date.now() - start);
    res.json({ draft: draft || "Failed to generate DM." });
  } catch (error: any) {
    console.error("Gemini /api/generate-dm error:", error);
    recordFailure(activeModel, error?.message || String(error));
    res.status(500).json({ error: friendlyError(error) });
  }
});

// ── Frontend serving ──────────────────────────────────────────────────────────
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
    console.log(`DFQ Labs OS — Gemini-powered server on port ${PORT} (model: ${GEMINI_MODEL})`);
  });
}

startServer();
