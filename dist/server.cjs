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
import_dotenv.default.config();
var app = (0, import_express.default)();
var PORT = process.env.PORT ? parseInt(process.env.PORT) : 5e3;
var OPENROUTER_BASE = "https://openrouter.ai/api/v1";
var DEFAULT_MODEL = "nvidia/nemotron-nano-9b-v2:free";
var AVAILABLE_MODELS = [
  "nvidia/nemotron-nano-9b-v2:free",
  "openai/gpt-oss-20b:free",
  "nvidia/nemotron-3-nano-30b-a3b:free",
  "google/gemma-4-26b-a4b-it:free"
];
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
app.use(import_express.default.json());
async function callOpenRouter(systemPrompt, userPrompt, model, maxTokens, temperature = 0.7) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is not configured on the server.");
  const messages = [];
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
      reasoning: { exclude: true, effort: "low" }
    })
  });
  if (!response.ok) {
    const errBody = await response.json().catch(() => ({}));
    throw new Error(errBody?.error?.message || `HTTP ${response.status}`);
  }
  const data = await response.json();
  return data?.choices?.[0]?.message?.content ?? "";
}
async function callWithFallback(systemPrompt, userPrompt, preferredModel, maxTokens, temperature = 0.7) {
  const chain = [preferredModel, ...AVAILABLE_MODELS.filter((m) => m !== preferredModel)];
  let lastError = null;
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
    } catch (error) {
      lastError = error;
      recordFailure(model, error?.message || String(error));
    }
  }
  throw lastError || new Error("All AI models failed.");
}
function friendlyError(error) {
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
  } catch (error) {
    console.error("OpenRouter /api/ai error:", error);
    res.status(500).json({ error: friendlyError(error) });
  }
});
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
    recentErrors: aiHealth.recentErrors
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
    const text = await callOpenRouter(void 0, "Reply with exactly the word: CONNECTED", testModel, 10, 0);
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
  if (!process.env.OPENROUTER_API_KEY) {
    res.status(500).json({ error: "OPENROUTER_API_KEY is not configured on the server." });
    return;
  }
  const activeModel = model || DEFAULT_MODEL;
  try {
    const text = await callOpenRouter(systemPrompt, userPrompt, activeModel, maxTokens);
    res.json({ text, model: activeModel });
  } catch (error) {
    console.error("OpenRouter /api/call-gemini error:", error);
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
  if (!process.env.OPENROUTER_API_KEY) {
    res.status(500).json({ error: "OPENROUTER_API_KEY is not configured on the server." });
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
  const systemPrompt = `You are an elite cold outreach copywriter. Your copy sounds like an authentic professional human, never robotic or generic. NEVER use clich\xE9s, AI buzzwords, or fake excitement. Keep DMs to 2-3 sentences max. Focus on one natural next step.`;
  const userPrompt = `Write a hyper-personalized outreach message for:
- Name: ${name}, Company: ${company}, Role: ${role || "decision-maker"}
- Niche: ${niche || "their sector"}, Channel: ${channel}
- Pain Point: ${painPoint || "client acquisition"}, Stage: ${stage} \u2192 ${nextStage}
- Objective: ${objective}
${lastConversation ? `- Prior conversation: "${lastConversation}"` : ""}
${notes ? `- Notes: "${notes}"` : ""}
Output ONLY the final message text. No meta-commentary.`;
  const activeModel = model || DEFAULT_MODEL;
  try {
    const { text: draft } = await callWithFallback(systemPrompt, userPrompt, activeModel, 900, 0.8);
    res.json({ draft: draft || "Failed to generate DM." });
  } catch (error) {
    console.error("OpenRouter /api/generate-dm error:", error);
    res.status(500).json({ error: friendlyError(error) });
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
    console.log(`DFQ Labs OS \u2014 OpenRouter-powered server on port ${PORT}`);
  });
}
startServer();
//# sourceMappingURL=server.cjs.map
