var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// server.ts
var import_express = __toESM(require("express"), 1);
var import_path = __toESM(require("path"), 1);
var import_dotenv = __toESM(require("dotenv"), 1);
var import_vite = require("vite");
var import_genai = require("@google/genai");
var import_pg = require("pg");
import_dotenv.default.config();
var app = (0, import_express.default)();
var db = new import_pg.Pool({ connectionString: process.env.DATABASE_URL });
db.query(`
  CREATE TABLE IF NOT EXISTS leads (
    id TEXT PRIMARY KEY,
    data JSONB NOT NULL,
    updated_at TIMESTAMP DEFAULT NOW()
  )
`).catch((err) => console.error("DB table init error:", err));
var PORT = process.env.PORT ? parseInt(process.env.PORT) : 5e3;
var GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.1-flash-lite";
var aiHealth = {
  lastSuccessAt: null,
  lastModelUsed: null,
  successCount: 0,
  failureCount: 0,
  totalLatencyMs: 0,
  recentErrors: []
};
function recordSuccess(model, latencyMs) {
  aiHealth.lastSuccessAt = (/* @__PURE__ */ new Date()).toISOString();
  aiHealth.lastModelUsed = model;
  aiHealth.successCount++;
  aiHealth.totalLatencyMs += latencyMs;
}
function recordFailure(model, message) {
  aiHealth.failureCount++;
  aiHealth.recentErrors.unshift({ ts: (/* @__PURE__ */ new Date()).toISOString(), message: String(message).slice(0, 200), model });
  aiHealth.recentErrors = aiHealth.recentErrors.slice(0, 20);
}
app.use(import_express.default.json({ limit: "25mb" }));
async function callGeminiRaw(systemPrompt, userPrompt, model, maxTokens, temperature) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not configured on the server.");
  const ai = new import_genai.GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model,
    contents: userPrompt,
    config: {
      ...systemPrompt ? { systemInstruction: systemPrompt } : {},
      maxOutputTokens: maxTokens,
      temperature
    }
  });
  const text = response.text ?? "";
  if (!text.trim()) throw new Error(`Model ${model} returned empty content.`);
  return text;
}
async function callGemini(systemPrompt, userPrompt, model, maxTokens = 1200, temperature = 0.7, retries = 2) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await callGeminiRaw(systemPrompt, userPrompt, model, maxTokens, temperature);
    } catch (err) {
      lastError = err;
      const msg = String(err?.message ?? "");
      const isRetryable = msg.includes("429") || msg.includes("503") || msg.includes("RESOURCE_EXHAUSTED") || msg.includes("UNAVAILABLE");
      if (!isRetryable || attempt === retries) break;
      await new Promise((r) => setTimeout(r, 1e3 * (attempt + 1)));
    }
  }
  throw lastError;
}
function friendlyError(error) {
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
  } catch (error) {
    console.error("Gemini /api/ai error:", error);
    recordFailure(activeModel, error?.message || String(error));
    res.status(500).json({ error: friendlyError(error) });
  }
});
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
    recentErrors: aiHealth.recentErrors
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
    const text = await callGemini(void 0, "Reply with exactly the word: CONNECTED", testModel, 10, 0, 1);
    recordSuccess(testModel, Date.now() - start);
    res.json({ ok: true, model: testModel, latencyMs: Date.now() - start, response: text.trim() });
  } catch (error) {
    recordFailure(testModel, error.message);
    res.json({ ok: false, model: testModel, latencyMs: Date.now() - start, error: error.message });
  }
});
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
  } catch (error) {
    console.error("Gemini /api/call-gemini error:", error);
    recordFailure(activeModel, error?.message || String(error));
    res.status(500).json({ error: friendlyError(error) });
  }
});
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
  const stageMap = {
    "Outreach Sent": { nextStage: "Replied / Interested", objective: "Get them to respond. Follow up on the previous touchpoint or introduce a fresh, low-resistance angle." },
    "Replied / Interested": { nextStage: "Audit Requested", objective: "Offer a free custom audit. Transition their general interest into requesting a custom audit." },
    "Audit Requested": { nextStage: "Audit Delivered", objective: "Deliver an outstanding audit insight and invite a 10-minute walk-through call." },
    "Audit Delivered": { nextStage: "Meeting Booked", objective: "Move them to book a specific strategy session." },
    "Meeting Booked": { nextStage: "Proposal Sent", objective: "Follow up on the meeting and send a clear, tailored business proposal." },
    "Proposal Sent": { nextStage: "Client Closed", objective: "Follow up to address final concerns and close the deal." },
    "Client Closed": { nextStage: "Referrals / Account Growth", objective: "Express appreciation and request a warm referral." }
  };
  const { nextStage, objective } = stageMap[stage] || { nextStage: "Replied / Interested", objective: "Build rapport and offer value." };
  const systemPrompt = `You are an elite outreach strategist writing on behalf of DFQ Labs \u2014 a boutique sales consultancy for Abuja real estate brands.

TONE: You are a respectful, experienced consultant \u2014 not a hungry salesperson. The prospect is a busy professional. Their time is more valuable than yours. Write from that position of confidence and courtesy.

STRICT RULES:
1. NEVER open with: "Hope you're doing well", "I came across your profile", "Great page!", or any hollow warm-up.
2. ZERO AI buzzwords: no "synergy", "leverage" (as a verb), "revolutionize", "supercharge", "unleash", "delve", "holistic", "elevate", "disrupt".
3. ZERO exclamation marks. ZERO emojis. Write the way a senior consultant texts \u2014 dry, precise, on-point.
4. ONE ask per message. Low-friction. Never ask for a long meeting before trust is established.
5. Reference something specific to this prospect's niche, company, or prior conversation \u2014 never generic copy.
6. LENGTH: WhatsApp/Instagram/Twitter: 2-3 short sentences max. Email: 80-120 words, sharp subject line.
7. TIMING AWARENESS: If prior conversation history is provided and shows a gap (days or weeks), pick up that thread naturally. Never pretend it is a first contact when it isn't.
8. RESPECT THE SILENCE: If they haven't replied in a while, re-engage with value or a new angle \u2014 never guilt-trip.

OUTPUT: Write ONLY the final message. No preamble, no labels, no explanations.`;
  const userPrompt = `Write a hyper-personalized outreach message for:
- Name: ${name}, Company: ${company}, Role: ${role || "decision-maker"}
- Niche: ${niche || "their sector"}, Channel: ${channel}
- Pain Point: ${painPoint || "client acquisition"}, Stage: ${stage} \u2192 ${nextStage}
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
  } catch (error) {
    console.error("Gemini /api/generate-dm error:", error);
    recordFailure(activeModel, error?.message || String(error));
    res.status(500).json({ error: friendlyError(error) });
  }
});
app.get("/api/leads", async (_req, res) => {
  try {
    const result = await db.query("SELECT data FROM leads ORDER BY updated_at ASC");
    res.json({ leads: result.rows.map((r) => r.data) });
  } catch (err) {
    console.error("GET /api/leads:", err);
    res.status(500).json({ error: "Failed to load leads." });
  }
});
app.post("/api/leads", async (req, res) => {
  const body = req.body || {};
  if (Array.isArray(body.leads)) {
    const leads = body.leads.filter((l) => l?.id);
    if (leads.length === 0) return res.json({ ok: true, count: 0 });
    try {
      const values = leads.map((_, i) => `($${i * 2 + 1}, $${i * 2 + 2}::jsonb, NOW())`).join(", ");
      const params = leads.flatMap((l) => [l.id, JSON.stringify(l)]);
      await db.query(
        `INSERT INTO leads (id, data, updated_at) VALUES ${values}
         ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()`,
        params
      );
      return res.json({ ok: true, count: leads.length });
    } catch (err) {
      console.error("POST /api/leads bulk:", err);
      return res.status(500).json({ error: "Failed to bulk-import leads." });
    }
  }
  const lead = body.lead;
  if (!lead?.id) return res.status(400).json({ error: "lead.id is required." });
  try {
    await db.query(
      `INSERT INTO leads (id, data, updated_at) VALUES ($1, $2::jsonb, NOW())
       ON CONFLICT (id) DO UPDATE SET data = $2::jsonb, updated_at = NOW()`,
      [lead.id, JSON.stringify(lead)]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error("POST /api/leads single:", err);
    res.status(500).json({ error: "Failed to save lead." });
  }
});
app.delete("/api/leads", async (req, res) => {
  const id = req.body?.id;
  if (!id) return res.status(400).json({ error: "id is required." });
  try {
    await db.query("DELETE FROM leads WHERE id = $1", [id]);
    res.json({ ok: true });
  } catch (err) {
    console.error("DELETE /api/leads:", err);
    res.status(500).json({ error: "Failed to delete lead." });
  }
});
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await (0, import_vite.createServer)({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = import_path.default.join(process.cwd(), "dist");
    app.use(import_express.default.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(import_path.default.join(distPath, "index.html"));
    });
  }
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`DFQ Labs OS \u2014 Gemini-powered server on port ${PORT} (model: ${GEMINI_MODEL})`);
  });
}
startServer();
//# sourceMappingURL=server.cjs.map
