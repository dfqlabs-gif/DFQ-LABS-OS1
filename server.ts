import express from "express";
import path from "path";
import dotenv from "dotenv";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import { Pool } from "pg";
import { runSalesPipeline } from "./aiEngine";
import { stripAttachmentContent } from "./lib/attachments";
import { describeDbError, runSnapshotReplaceTransaction, summarizeImportBatch, summarizeSnapshotImport } from "./lib/imports";

dotenv.config();

const app = express();

// ── PostgreSQL connection pool ─────────────────────────────────────────────────
const db = new Pool({ connectionString: process.env.DATABASE_URL });

// ── Sequential database initialization ─────────────────────────────────────────
async function initializeDatabase() {
  // 1. Verify DATABASE_URL is configured
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL environment variable is not configured. Cannot connect to PostgreSQL.");
  }

  // 2. Create the leads table
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS leads (
        id TEXT PRIMARY KEY,
        data JSONB NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log("✓ leads table initialized");
  } catch (err) {
    throw new Error(`Failed to create leads table: ${err}`);
  }

  // 3. Create the knowledge_sources table
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS knowledge_sources (
        id TEXT PRIMARY KEY,
        data JSONB NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log("✓ knowledge_sources table initialized");
  } catch (err) {
    throw new Error(`Failed to create knowledge_sources table: ${err}`);
  }

  // 4. Create the lead_attachments table
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS lead_attachments (
        id TEXT PRIMARY KEY,
        lead_id TEXT NOT NULL,
        data JSONB NOT NULL,
        uploaded_at TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log("✓ lead_attachments table initialized");
  } catch (err) {
    throw new Error(`Failed to create lead_attachments table: ${err}`);
  }

  // 5. Run attachment migration (only after all tables exist)
  try {
    const { rows } = await db.query(
      "SELECT id, data FROM leads WHERE data ? 'attachments'"
    );
    for (const row of rows) {
      const lead = row.data;
      const atts = Array.isArray(lead.attachments) ? lead.attachments : [];
      if (atts.length === 0) continue;
      let changed = false;
      for (const att of atts) {
        if (att && att.content) {
          await db.query(
            `INSERT INTO lead_attachments (id, lead_id, data, uploaded_at) VALUES ($1, $2, $3::jsonb, NOW())
             ON CONFLICT (id) DO UPDATE SET data = $3::jsonb`,
            [att.id, lead.id, JSON.stringify(att)]
          );
          changed = true;
        }
      }
      if (changed) {
        const stripped = stripAttachmentContent(lead);
        await db.query("UPDATE leads SET data = $1::jsonb WHERE id = $2", [
          JSON.stringify(stripped), lead.id,
        ]);
      }
    }
    if (rows.length > 0) {
      console.log(`✓ Attachment migration processed ${rows.length} lead(s)`);
    } else {
      console.log(`✓ Attachment migration complete (no attachments to migrate)`);
    }
  } catch (err) {
    throw new Error(`Attachment migration error: ${err}`);
  }

  console.log("✓ Database initialization successful");
}

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 5000;

// ── AI Provider configuration — change GEMINI_MODEL env var to swap models ──
// gemini-3.1-flash-lite: fastest confirmed working model for high-volume free-tier
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.1-flash-lite";

function getGeminiApiKey(): string | undefined {
  const value = process.env.GEMINI_API_KEY?.trim();
  return value || undefined;
}

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

// 25mb limit — bulk lead imports/exports can be large JSON payloads
app.use(express.json({ limit: "25mb" }));

// ── Centralized Gemini client ─────────────────────────────────────────────────
async function callGeminiRaw(
  systemPrompt: string | undefined,
  userPrompt: string,
  model: string,
  maxTokens: number,
  temperature: number
): Promise<string> {
  const apiKey = getGeminiApiKey();
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
  if (!getGeminiApiKey()) {
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
  if (!getGeminiApiKey()) {
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
    configured: !!getGeminiApiKey(),
    keySource: "server runtime environment",
    keyLength: getGeminiApiKey()?.length || 0,
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
  if (!getGeminiApiKey()) {
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
  if (!getGeminiApiKey()) {
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

// ── /api/infer-status — AI auto-status update from latest message ────────────
app.post("/api/infer-status", async (req, res) => {
  res.setHeader("Content-Type", "application/json");
  const { currentStatus, dmText, prospectInitialResponse, prospectLatestResponse, notes, name, company } = req.body || {};

  if (!getGeminiApiKey()) {
    res.status(500).json({ error: "GEMINI_API_KEY is not configured on the server." });
    return;
  }

  const VALID_STATUSES = ["New", "DM Sent", "Replied", "Audit Requested", "Audit Delivered", "Discovery Call Booked", "Discovery Call Done", "Proposal Sent", "Closed", "Lost"];
  const STAGE_ORDER: Record<string, number> = { "New": 0, "DM Sent": 1, "Replied": 2, "Audit Requested": 3, "Audit Delivered": 4, "Discovery Call Booked": 5, "Discovery Call Done": 6, "Proposal Sent": 7, "Closed": 8, "Lost": 9 };

  const systemPrompt = `You are a CRM intelligence engine. Your job is to read a DM conversation thread and determine the current correct pipeline stage for this lead. Respond with ONLY one of these exact stage names, nothing else:
New | DM Sent | Replied | Audit Requested | Audit Delivered | Discovery Call Booked | Discovery Call Done | Proposal Sent | Closed | Lost

Rules:
- "DM Sent" = we sent an outreach DM, no reply yet
- "Replied" = prospect replied (any positive/curious/neutral reply to our outreach)
- "Audit Requested" = they asked for the audit or agreed to receive it
- "Audit Delivered" = we sent them the audit
- "Discovery Call Booked" = a specific call date/time is agreed or they said "let's talk" and a call is being booked
- "Discovery Call Done" = the call already happened (transcript/summary pasted, or they mention after-call next steps)
- "Proposal Sent" = we sent them a proposal or pricing
- "Closed" = they agreed to pay / signed up
- "Lost" = they explicitly declined or went permanently cold

If uncertain, keep the current stage. Only advance if the evidence clearly supports it. Never move backward.`;

  const convo: string[] = [];
  if (dmText) convo.push(`[OUR DM]: ${dmText.slice(0, 600)}`);
  if (prospectInitialResponse) convo.push(`[THEIR REPLY]: ${prospectInitialResponse.slice(0, 600)}`);
  if (prospectLatestResponse && prospectLatestResponse !== prospectInitialResponse) convo.push(`[LATEST MESSAGE/THREAD]: ${prospectLatestResponse.slice(0, 800)}`);
  if (notes) convo.push(`[INTERNAL NOTES]: ${notes.slice(0, 300)}`);

  const userPrompt = `Lead: ${name || "Unknown"} at ${company || "Unknown company"}
Current stage: ${currentStatus}

Conversation:
${convo.join("\n\n")}

Based on the conversation above, what is the correct pipeline stage for this lead right now? Reply with ONLY the stage name.`;

  const activeModel = GEMINI_MODEL;
  const start = Date.now();
  try {
    const raw = await callGemini(systemPrompt, userPrompt, activeModel, 30, 0);
    recordSuccess(activeModel, Date.now() - start);
    // Clean up the response to extract just the status
    const inferred = VALID_STATUSES.find(s => raw.trim().toLowerCase().includes(s.toLowerCase())) || currentStatus;
    // Only return a new status if it's a forward progression or "Lost"
    const currentOrder = STAGE_ORDER[currentStatus] ?? 0;
    const inferredOrder = STAGE_ORDER[inferred] ?? 0;
    const changed = inferred !== currentStatus && (inferredOrder > currentOrder || inferred === "Lost");
    res.json({ status: changed ? inferred : currentStatus, changed });
  } catch (error: any) {
    console.error("Gemini /api/infer-status error:", error);
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
  if (!getGeminiApiKey()) {
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

  const systemPrompt = `You are an elite outreach strategist writing on behalf of DFQ Labs — a boutique sales consultancy for Abuja real estate brands.

TONE: You are a respectful, experienced consultant — not a hungry salesperson. The prospect is a busy professional. Their time is more valuable than yours. Write from that position of confidence and courtesy.

STRICT RULES:
1. NEVER open with: "Hope you're doing well", "I came across your profile", "Great page!", or any hollow warm-up.
2. ZERO AI buzzwords: no "synergy", "leverage" (as a verb), "revolutionize", "supercharge", "unleash", "delve", "holistic", "elevate", "disrupt".
3. ZERO exclamation marks. ZERO emojis. Write the way a senior consultant texts — dry, precise, on-point.
4. ONE ask per message. Low-friction. Never ask for a long meeting before trust is established.
5. Reference something specific to this prospect's niche, company, or prior conversation — never generic copy.
6. LENGTH: WhatsApp/Instagram/Twitter: 2-3 short sentences max. Email: 80-120 words, sharp subject line.
7. TIMING AWARENESS: If prior conversation history is provided and shows a gap (days or weeks), pick up that thread naturally. Never pretend it is a first contact when it isn't.
8. RESPECT THE SILENCE: If they haven't replied in a while, re-engage with value or a new angle — never guilt-trip.

OUTPUT: Write ONLY the final message. No preamble, no labels, no explanations.`;
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

// ── Attachment content enrichment (on-demand) ────────────────────────────────
// The lead JSON carries only attachment metadata. When the AI needs the actual
// file content (e.g. the value-DM drafting pipeline), fetch it from the
// dedicated lead_attachments table and merge it onto the lead object.
async function enrichLeadAttachments(lead: any): Promise<any> {
  const atts = lead?.attachments;
  if (!Array.isArray(atts) || atts.length === 0) return lead;
  const ids = atts.map((a: any) => a?.id).filter(Boolean);
  if (ids.length === 0) return lead;
  try {
    const result = await db.query(
      "SELECT id, data FROM lead_attachments WHERE id = ANY($1::text[])",
      [ids]
    );
    const byId = new Map(result.rows.map((r: any) => [r.id, r.data?.content ?? ""]));
    return {
      ...lead,
      attachments: atts.map((a: any) => ({ ...a, content: byId.get(a.id) ?? a.content ?? "" })),
    };
  } catch (err) {
    console.error("enrichLeadAttachments error:", err);
    return lead;
  }
}

// ── Knowledge retrieval (Part 2, 23) ─────────────────────────────────────────
// Keyword-based retrieval: derive keywords from the lead's context and match
// against enabled knowledge sources. Returns the most relevant snippets so
// the AI reasons with targeted knowledge instead of the entire knowledge base.
async function retrieveKnowledgeForLead(lead: any, messageType: string): Promise<{ title: string; snippet: string }[]> {
  try {
    const result = await db.query("SELECT data FROM knowledge_sources");
    const sources = (result.rows as any[])
      .map(r => r.data)
      .filter(s => s.enabled !== false && s.status === "ready" && s.content);

    if (sources.length === 0) return [];

    // Build a keyword set from the lead's context
    const contextText = [
      lead.clientType, lead.service, lead.company, lead.notes,
      lead.dmText, lead.prospectInitialResponse, lead.prospectLatestResponse,
      lead.aiBucket, lead.status, lead.nextAction,
    ].filter(Boolean).join(" ").toLowerCase();

    // Domain keywords relevant to DFQ Labs real estate outreach
    const domainKeywords = [
      "buyer", "psychology", "content", "strategy", "trust", "developer", "marketing",
      "lead generation", "real estate", "positioning", "conversion", "audit", "outbound",
      "whatsapp", "nurture", "reactivation", "objection", "pricing", "closing",
      "off-plan", "realtor", "agency", "construction", "architecture", "funnel",
      "follow-up", "value", "insight", "buyer inquiry", "brand", "positioning gap",
    ];

    // Score each source by keyword overlap with the lead context + message type
    const typeKeywords: Record<string, string[]> = {
      VALUE_DM: ["value", "insight", "buyer psychology", "content strategy", "trust", "education"],
      SALES_DM: ["outreach", "positioning", "hook", "audit", "conversion"],
      FOLLOW_UP: ["follow-up", "nurture", "trust", "objection"],
      REACTIVATION_DM: ["reactivation", "re-engagement", "nurture"],
      NURTURE_DM: ["nurture", "value", "trust", "education"],
      INTRODUCTION_DM: ["outreach", "positioning", "hook", "first touch"],
      RESPONSE_DM: ["objection", "trust", "response", "conversion"],
    };
    const typeKw = typeKeywords[messageType] || [];

    const scored = sources.map(s => {
      const contentLower = (s.content || "").toLowerCase();
      const titleLower = (s.title || "").toLowerCase();
      let score = 0;
      const matched: string[] = [];
      for (const kw of domainKeywords) {
        if (contextText.includes(kw) && (contentLower.includes(kw) || titleLower.includes(kw))) {
          score += 2;
          matched.push(kw);
        }
      }
      for (const kw of typeKw) {
        if (contentLower.includes(kw) || titleLower.includes(kw)) {
          score += 1;
          matched.push(kw);
        }
      }
      // Boost sources whose title keywords appear in the lead context
      const titleWords = (s.title || "").toLowerCase().split(/\s+/).filter(w => w.length > 4);
      for (const w of titleWords) {
        if (contextText.includes(w)) score += 1;
      }
      return { source: s, score, matched };
    }).filter(x => x.score > 0).sort((a, b) => b.score - a.score).slice(0, 3);

    return scored.map(x => {
      const content = x.source.content;
      // Return a focused snippet (first 1200 chars) — never the whole document
      const snippet = content.length > 1200 ? content.slice(0, 1200) + "\n[...]" : content;
      return { title: x.source.title, snippet };
    });
  } catch (err) {
    console.error("retrieveKnowledgeForLead error:", err);
    return [];
  }
}

// ── /api/value-dm — structured message generation with knowledge retrieval ─────
// Supports all message types (Part 18). VALUE_DM enforces strict no-CTA rules.
app.post("/api/value-dm", async (req, res) => {
  res.setHeader("Content-Type", "application/json");
  const { lead, task, messageType } = req.body || {};
  if (!lead) { res.status(400).json({ error: "lead is required" }); return; }

  const type: string = messageType || "VALUE_DM";

  // Enrich the lead with attachment content from the dedicated table so the AI
  // pipeline can reference attached documents (content is not in the lead JSON).
  const leadWithAttachments = await enrichLeadAttachments(lead);

  // Retrieve relevant knowledge for this lead + message type (Part 2)
  const knowledge = await retrieveKnowledgeForLead(leadWithAttachments, type);
  const knowledgeBlock = knowledge.length > 0
    ? `\n\n=== RELEVANT DFQ LABS KNOWLEDGE (use only what is genuinely relevant — do not force unrelated material) ===\n${knowledge.map(k => `--- ${k.title} ---\n${k.snippet}`).join("\n\n")}\n=== END KNOWLEDGE ===`
    : "";

  let styleInstructions: string;
  let pipelineTask: string;

  if (type === "VALUE_DM") {
    // STRICT VALUE DM — no CTA, no selling (Parts 3, 4, 5)
    styleInstructions = `You are Alex from DFQ Labs writing directly to ${lead.name || "this prospect"} at ${lead.company || "their company"} (${lead.clientType || "Real Estate"}).

This is a VALUE_DM. ${`A VALUE_DM is a short message whose sole objective is to provide genuinely useful, immediately applicable insight WITHOUT asking for a sale, call, meeting, reply, registration, consultation, beta participation, purchase, or any other conversion action.`}

ABSOLUTE PROHIBITIONS — the message must NOT:
- Sell, pitch, or ask for a call, meeting, reply, booking, registration, beta join, purchase, follow, or website visit.
- Mention DFQ Labs services unless genuinely necessary for the insight itself.
- Manufacture urgency or manufacture a problem.
- Continue a sales sequence disguised as value.
- End with "let me know if...", "would you like me to...", "I can help you...", or ANY call-to-action.
- Attempt to continue the interaction in any way.

The objective is simply: leave the prospect better off than they were before receiving the message.

STRUCTURE: Problem → Insight → Specific action. Include ONE specific, concrete observation grounded in their industry and what they are likely struggling with. Avoid generic advice ("post consistently", "know your audience", "use better hooks", "build trust") unless you explain a specific implementation that makes it actionable.

QUALITY CHECK (run silently before finalizing — regenerate internally if any answer is NO):
1. Is this genuinely useful? 2. Specific to this prospect? 3. Could they implement something today? 4. Supported by context/knowledge? 5. Avoids selling? 6. Avoids asking for anything? 7. Concrete insight not generic? 8. Valuable even if they never become a client? 9. Short enough for WhatsApp? 10. Sounds like a knowledgeable human?

FORMAT: 3-4 sentences maximum. Zero emojis. Zero exclamation marks. Zero buzzwords. Plain WhatsApp-friendly text — no markdown, no bullet points. NO call-to-action. NO next step. The message simply ends after delivering the insight.

FORBIDDEN words: "I hope", "I trust", "excited to", "leverage", "synergy", "holistic", "elevate", "game-changer", "value-add", "reach out", "touch base", "circle back", "let me know", "would you like", "I can help".

Output ONLY the actual message. No labels. No quotes. No explanation. No strategy in the message.`;

    pipelineTask = "Generate a VALUE_DM: one specific, genuinely useful, immediately actionable insight for this prospect. No selling. No CTA. No ask. Just value.";
  } else {
    // Other message types — use per-type rules (Part 18)
    const typeRules: Record<string, string> = {
      SALES_DM: "A sales outreach DM. Pursue exactly one pipeline-stage objective. One low-friction ask. Reference something specific. 2-4 sentences.",
      FOLLOW_UP: "A follow-up in an active conversation. Pick up where the last exchange left off. One objective. 2-4 sentences.",
      REACTIVATION_DM: "A re-engagement for a cold lead. New angle, no guilt-trip, no re-pitch. 2-3 sentences.",
      NURTURE_DM: "A nurture message. Provide value without asking for anything (VALUE_DM-style, no CTA) unless a sales step is clearly warranted. 3-4 sentences.",
      INTRODUCTION_DM: "A first-touch cold outreach DM. Hook on a positioning gap. Ask only for permission to send a breakdown. No pitching. 2-3 sentences.",
      RESPONSE_DM: "A reply to a prospect who just messaged. Continue the dialog. One objective. 2-3 sentences.",
    };
    styleInstructions = `You are Alex from DFQ Labs writing directly to ${lead.name || "this prospect"} at ${lead.company || "their company"} (${lead.clientType || "Real Estate"}).

Message type: ${type}. ${typeRules[type] || typeRules.SALES_DM}

FORMAT: Zero emojis. Zero exclamation marks. Zero buzzwords. Plain WhatsApp-friendly text. Output ONLY the actual message. No labels. No explanation.

FORBIDDEN words: "I hope", "I trust", "excited to", "leverage", "synergy", "holistic", "elevate", "game-changer", "value-add", "reach out", "touch base", "circle back".`;
    pipelineTask = task || `Generate a ${type} for this prospect following the message-type rules above.`;
  }

  // Conversation-aware: detect repetition (Part 7) — if recent messages repeat the same topic,
  // instruct the AI to introduce a new angle or recommend changing strategy.
  const recentLogs = (lead.conversationLog || []).slice(-5).filter((l: any) => l.type === "dm" || l.type === "reply");
  const repetitionNote = recentLogs.length >= 3
    ? `\n\nREPETITION CHECK: The last ${recentLogs.length} messages are provided in the conversation thread. If they already discuss the same topic, introduce a genuinely NEW angle or recommend changing the follow-up strategy. Do not generate a variation of the same message.`
    : "";

  try {
    const fullTask = pipelineTask + knowledgeBlock + repetitionNote;
    const result = await runSalesPipeline(leadWithAttachments, fullTask, styleInstructions, 600);
    const sepIdx = result.indexOf("---STRATEGY---");
    const message  = sepIdx !== -1 ? result.slice(0, sepIdx).trim() : result.trim();
    const strategy = sepIdx !== -1 ? result.slice(sepIdx + "---STRATEGY---".length).trim() : "";
    res.json({
      text: message,
      strategy,
      messageType: type,
      knowledgeUsed: knowledge.map(k => k.title),
    });
  } catch (err: any) {
    console.error("POST /api/value-dm error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ── Knowledge Base API (Parts 1, 2, 23) ──────────────────────────────────────

app.get("/api/knowledge", async (_req, res) => {
  try {
    const result = await db.query("SELECT data FROM knowledge_sources ORDER BY created_at DESC");
    res.json({ sources: result.rows.map((r: any) => r.data) });
  } catch (err: any) {
    console.error("GET /api/knowledge:", err);
    res.status(500).json({ error: "Failed to load knowledge sources." });
  }
});

app.post("/api/knowledge", async (req, res) => {
  const source = req.body?.source;
  if (!source?.id) return res.status(400).json({ error: "source.id is required." });
  try {
    await db.query(
      `INSERT INTO knowledge_sources (id, data, created_at) VALUES ($1, $2::jsonb, NOW())
       ON CONFLICT (id) DO UPDATE SET data = $2::jsonb`,
      [source.id, JSON.stringify(source)]
    );
    res.json({ ok: true });
  } catch (err: any) {
    console.error("POST /api/knowledge:", err);
    res.status(500).json({ error: "Failed to save knowledge source." });
  }
});

app.delete("/api/knowledge", async (req, res) => {
  const id = req.body?.id;
  if (!id) return res.status(400).json({ error: "id is required." });
  try {
    await db.query("DELETE FROM knowledge_sources WHERE id = $1", [id]);
    res.json({ ok: true });
  } catch (err: any) {
    console.error("DELETE /api/knowledge:", err);
    res.status(500).json({ error: "Failed to delete knowledge source." });
  }
});

// Fetch a website URL and extract readable text (Part 1 — Website URL source)
app.post("/api/knowledge/fetch-url", async (req, res) => {
  const { url } = req.body || {};
  if (!url) return res.status(400).json({ error: "url is required." });
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (DFQLabs-Knowledge-Bot)" },
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) return res.status(502).json({ error: `Fetch failed: HTTP ${response.status}` });
    const html = await response.text();
    // Strip scripts/styles/tags, collapse whitespace
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 50000);
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    res.json({ text, title: titleMatch ? titleMatch[1].trim() : url });
  } catch (err: any) {
    res.status(500).json({ error: "Could not fetch URL: " + (err.message || "unknown error") });
  }
});

// ── Attachment content API (on-demand) ──────────────────────────────────────
// Content lives in the lead_attachments table, separate from lead JSON. These
// endpoints let the UI/AI load a single attachment's content only when needed.

// GET a single attachment (with content) by id — used for viewing/downloading.
app.get("/api/attachments/:id", async (req, res) => {
  try {
    const result = await db.query("SELECT data FROM lead_attachments WHERE id = $1", [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: "Attachment not found." });
    res.json({ attachment: result.rows[0].data });
  } catch (err: any) {
    console.error("GET /api/attachments:", err);
    res.status(500).json({ error: "Failed to load attachment." });
  }
});

// POST a single attachment (with content) — stores the file content separately.
app.post("/api/attachments", async (req, res) => {
  const att = req.body?.attachment;
  if (!att?.id) return res.status(400).json({ error: "attachment.id is required." });
  try {
    await db.query(
      `INSERT INTO lead_attachments (id, lead_id, data, uploaded_at) VALUES ($1, $2, $3::jsonb, NOW())
       ON CONFLICT (id) DO UPDATE SET data = $3::jsonb`,
      [att.id, att.leadId || att.lead_id || "", JSON.stringify(att)]
    );
    res.json({ ok: true });
  } catch (err: any) {
    console.error("POST /api/attachments:", err);
    res.status(500).json({ error: "Failed to save attachment." });
  }
});

// DELETE an attachment's content by id.
app.delete("/api/attachments/:id", async (req, res) => {
  try {
    await db.query("DELETE FROM lead_attachments WHERE id = $1", [req.params.id]);
    res.json({ ok: true });
  } catch (err: any) {
    console.error("DELETE /api/attachments:", err);
    res.status(500).json({ error: "Failed to delete attachment." });
  }
});

// ── Leads API — unified (mirrors api/leads.ts for Vercel) ─────────────────────

app.get("/api/leads", async (_req, res) => {
  try {
    const result = await db.query("SELECT data FROM leads ORDER BY updated_at ASC");
    // Never return embedded attachment content in the list payload — only
    // lightweight metadata. This keeps the response small (prevents "Load failed").
    res.json({ leads: result.rows.map((r: any) => stripAttachmentContent(r.data)) });
  } catch (err: any) {
    console.error("GET /api/leads:", err);
    res.status(500).json({ error: "Failed to load leads." });
  }
});

// POST handles single { lead }, bulk { leads }, and authoritative snapshot replacement
app.post("/api/leads", async (req, res) => {
  const body = req.body || {};

  if (Array.isArray(body.leads)) {
    const rawLeads = Array.isArray(body.leads) ? body.leads : [];
    const isSnapshot = body.snapshot === true || body.replace === true || body.mode === "snapshot";

    if (isSnapshot) {
      const summary = summarizeSnapshotImport(rawLeads);
      const valid = summary.valid.map((lead: any) => stripAttachmentContent(lead));

      if (!summary.canReplace || valid.length === 0) {
        return res.status(400).json({
          ok: false,
          error: "Snapshot replacement requires at least one valid lead.",
          sourceCount: summary.sourceCount,
          validCount: summary.validCount,
          rejectedCount: summary.rejectedCount,
          duplicateSourceCount: summary.duplicateSourceCount,
          duplicates: summary.duplicates,
          rejected: summary.rejected,
          finalDatabaseCount: 0,
        });
      }

      try {
        const transactionResult = await runSnapshotReplaceTransaction(db, valid);

        return res.json({
          ok: true,
          count: transactionResult.count,
          importedIds: transactionResult.importedIds,
          duplicates: summary.duplicates,
          rejected: summary.rejected,
          sourceCount: summary.sourceCount,
          validCount: summary.validCount,
          rejectedCount: summary.rejectedCount,
          duplicateSourceCount: summary.duplicateSourceCount,
          duplicateCount: summary.duplicateSourceCount,
          newCount: summary.newCount,
          updatedCount: summary.updatedCount,
          failedCount: summary.failedCount,
          finalDatabaseCount: transactionResult.finalDatabaseCount,
        });
      } catch (err: any) {
        const safeDetails = describeDbError(err);
        console.error("POST /api/leads snapshot replace error:", safeDetails);
        return res.status(500).json({
          ok: false,
          error: "Snapshot replacement failed and was rolled back.",
          details: safeDetails,
        });
      }
    }

    const currentIds = new Set((await db.query("SELECT id FROM leads")).rows.map((r: any) => String(r.id)));
    const summary = summarizeImportBatch(rawLeads, currentIds);
    const valid = summary.valid.map((lead: any) => stripAttachmentContent(lead));
    const {
      duplicates, rejected, sourceCount, validCount, rejectedCount,
      duplicateSourceCount, failedCount, finalDatabaseCount, newCount, updatedCount,
    } = summary;

    if (valid.length === 0) {
      return res.json({
        ok: true,
        count: 0,
        importedIds: [],
        duplicates,
        rejected,
        sourceCount,
        validCount: 0,
        rejectedCount,
        duplicateSourceCount,
        duplicateCount: duplicateSourceCount,
        newCount: 0,
        updatedCount: 0,
        failedCount,
        finalDatabaseCount: currentIds.size,
      });
    }

    try {
      const values = valid.map((_: any, i: number) => `($${i * 2 + 1}, $${i * 2 + 2}::jsonb, NOW())`).join(", ");
      const params = valid.flatMap((l: any) => [String(l.id), JSON.stringify(l)]);
      const query = `INSERT INTO leads (id, data, updated_at) VALUES ${values}
        ON CONFLICT (id) DO UPDATE SET
        data = EXCLUDED.data,
        updated_at = NOW() RETURNING id`;
      const result = await db.query(query, params);
      const importedIds = result.rows.map((row: any) => row.id);
      return res.json({
        ok: true,
        count: importedIds.length,
        importedIds,
        duplicates,
        rejected,
        sourceCount,
        validCount,
        rejectedCount,
        duplicateSourceCount,
        duplicateCount: duplicateSourceCount,
        newCount,
        updatedCount,
        failedCount,
        finalDatabaseCount,
      });
    } catch (err: any) {
      console.error("POST /api/leads bulk:", err);
      return res.status(500).json({ error: "Failed to bulk-import leads." });
    }
  }

  const lead = stripAttachmentContent(body.lead);
  if (!lead?.id) return res.status(400).json({ error: "lead.id is required." });
  try {
    await db.query(
      `INSERT INTO leads (id, data, updated_at) VALUES ($1, $2::jsonb, NOW())
       ON CONFLICT (id) DO UPDATE SET data = $2::jsonb, updated_at = NOW()`,
      [lead.id, JSON.stringify(lead)]
    );
    res.json({ ok: true });
  } catch (err: any) {
    console.error("POST /api/leads single:", err);
    res.status(500).json({ error: "Failed to save lead." });
  }
});

// DELETE with id in body (works on both Express and Vercel)
app.delete("/api/leads", async (req, res) => {
  const id = req.body?.id;
  if (!id) return res.status(400).json({ error: "id is required." });
  try {
    await db.query("DELETE FROM leads WHERE id = $1", [id]);
    res.json({ ok: true });
  } catch (err: any) {
    console.error("DELETE /api/leads:", err);
    res.status(500).json({ error: "Failed to delete lead." });
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

// ── Initialize database and start server ────────────────────────────────────────
(async () => {
  try {
    await initializeDatabase();
    await startServer();
  } catch (err) {
    console.error("✗ Failed to start application:", err);
    process.exit(1);
  }
})();
