// Canonical DFQ Labs sales intelligence.  This module owns strategic analysis,
// message generation, and its internal quality/rewrite pass.  UI consumers get
// one approved, structured result rather than a draft plus a separate QA flow.
import type { Lead } from "./types";
import type { MessageType } from "./lib/messageTypes";
import { ALL_MESSAGE_TYPES, MESSAGE_TYPE_RULES } from "./lib/messageTypes";
import { addDays } from "./constants";
import { buildLeadContext, buildTimeline, runAI, stageObjective, stripMarkdown } from "./aiEngine";
import { ABUJA_BUYER_INTELLIGENCE } from "./lib/abujaBuyerIntelligence";
import { buildOutreachChronology, ensureProspectGreeting } from "./lib/outreachPolicy";

export interface SalesBrainResult {
  leadId: string;
  salesStage: string;
  buyerIntent: string;
  confidence: number;
  primaryObjective: string;
  strategicReason: string;
  detectedFriction: string;
  recommendedAction: string;
  messageType: MessageType;
  message: string;
  cta: string;
  recommendedFollowUpDate: string;
  recommendedChannel: "WhatsApp" | "Instagram" | "Email" | "None";
  riskLevel: "low" | "medium" | "high";
  reasoningSummary: string;
  qualityChecked: true;
  rewritten: boolean;
  learningInsights?: SalesBrainLearningInsight[];
}

export interface SalesBrainLearningInsight { insightId: string; pattern: string; relevance: string; confidence: number; evidenceSummary: string; }
export interface SalesBrainOptions { requestedMessageType?: MessageType; task?: string; learningInsights?: SalesBrainLearningInsight[]; }
export const VALUE_DM_NURTURE_GUIDANCE = [
  "RELATIONSHIP NURTURE STYLE: act as a trusted real-estate content-intelligence partner, not a salesperson.",
  "Share one specific, evidence-grounded insight, research finding, content opportunity, buyer-psychology observation, or useful industry pattern the prospect can apply.",
  "Use relevant DFQLABS Knowledge Base material when available. Never invent DFQLABS packages, pricing, client results, statistics, or prospect-specific facts.",
  "Do not pitch, sell, ask a question, request a reply, or invite a call in a routine Value DM.",
  "Close naturally and softly, for example: Just thought this was worth sharing in case it is useful.",
  "Keep it concise and conversational for WhatsApp. Avoid generic check-ins and repeated insights."
].join("\\n");

export type SalesBrainGenerator = (prompt: string, maxTokens: number) => Promise<string>;

const jsonFromModel = (raw: string): Record<string, unknown> => {
  const clean = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const start = clean.indexOf("{");
  const end = clean.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("Sales Brain returned an invalid structured response.");
  return JSON.parse(clean.slice(start, end + 1));
};

const messageType = (value: unknown, fallback?: MessageType): MessageType =>
  typeof value === "string" && ALL_MESSAGE_TYPES.includes(value as MessageType) ? value as MessageType : fallback || "FOLLOW_UP";

const cleanMessage = (value: unknown) => stripMarkdown(String(value || "")).replace(/^['"]|['"]$/g, "").trim();

export function validateSalesBrainMessage(message: string, type: MessageType): string | null {
  if (!message || message.length < 12) return "message is empty or too short";
  if (message.length > 1100) return "message is too long for WhatsApp";
  if (/\b(just checking in|are you still interested|touching base|circle back)\b/i.test(message)) return "message is a generic follow-up";
  if (type === "VALUE_DM" && /(would you like|let me know if|book a call|schedule a call|reply if|interested in|let'?s talk|happy to chat|reach out|send me|contact us|dm me|message me|give us a call|we can help|our services|our agency|work with us|partner with us|take this forward|set up a time|arrange a call|schedule a meeting|would you be open|are you open to|can we help|we'd love to|we would love to)/i.test(message)) return "a Value DM contains a CTA or disguised sales ask";
  return null;
}

function prompt(lead: Lead, options: SalesBrainOptions, rewriteReason?: string): string {
  const requested = options.requestedMessageType || "FOLLOW_UP";
  const timeline = buildTimeline(lead).map(event => `${event.occurred ? "done" : "not done"}: ${event.label}`).join("; ");
  const learningBlock = options.learningInsights?.length
    ? `\nOrganizational learning (historical advisory evidence, never rules):\n${options.learningInsights.map(insight => `- ${insight.pattern} Confidence ${insight.confidence}/100; ${insight.evidenceSummary}`).join("\n")}\nUse this only when genuinely relevant. Current lead history, research, and fact safety take precedence. Do not invent facts or force a historically successful strategy.\n`
    : "";
  const chronology = buildOutreachChronology(lead);
  return `You are the DFQ Labs AI SALES BRAIN. You are the only strategic authority for this lead. Analyze before writing, but do not reveal private chain-of-thought.

Use the following DFQLABS Abuja buyer-intelligence playbook as market-level strategic context. It is not evidence about this individual prospect. Apply only the buyer segment and content opportunity relevant to the prospect's verified business and audience. Never convert a market-level pattern into a prospect-specific claim.

${ABUJA_BUYER_INTELLIGENCE}

Use only verified CRM/conversation information below. Never fabricate a person name: if contact identity is unknown, address the company/team naturally. A company name is not automatically a person's name. Every prospect-facing message MUST begin with a courteous, natural greeting appropriate to Lagos time, addressed to the verified contact name or Team [Company] when no individual contact is known. Do not omit the greeting. A Value DM must provide contextual, actionable value with no CTA or disguised sales ask. Never jump directly into an observation: open with a courteous greeting to the verified person or company/team, followed by a natural bridge explaining why you are reaching out. For a follow-up, acknowledge the real prior interaction and elapsed time before introducing the new point. Do not use generic filler or pretend a prior contact happened recently. Do not write a lazy check-in. If an audit was delivered and the prospect is silent, acknowledge that specific prior interaction and choose a commercially useful, low-pressure next move. Read the full chronological history and explicitly respect elapsed time.

Chronology: ${chronology}
OUTREACH RELATIONSHIP RULES:
- DAILY COMMERCIAL TARGET: work toward at least 30 quality, distinct prospect-company outreach attempts per Lagos day. Count only unique companies and only confirmed sends as completed outreach. The target never overrides relevance, factual accuracy, opt-outs, or duplicate protection; if there are fewer than 30 qualified prospects, report the shortfall rather than lowering standards.
- Never contact the same prospect or company twice on the same Lagos calendar day. If a message was already sent today, recommend no second outbound; the system should skip it rather than generate another DM.
- For outreach 1–7 days after a prior message, acknowledge the exact recent interaction and continue naturally; do not restart the introduction.
- For 8–29 days of silence, use a gentle follow-up with a fresh useful angle and honest timing; do not say yesterday or recently unless the timestamp supports it.
- For 30+ days of silence, treat it as reactivation: acknowledge that some time has passed, briefly reconnect to the actual prior message/topic, and introduce a genuinely new reason to engage. Never pretend the previous message was sent yesterday.
- Never say an audit was completed or delivered unless CRM records confirm it.
- Do not invent profile observations, company projects, buyer objections, performance data, or prior promises. If evidence is thin, write a modest useful observation or skip the lead.
- Do not repeat the same message angle already used in this lead's history.
Current stage objective: ${stageObjective(lead.status || "New")}
If this stage objective conflicts with the verified sent-message chronology, the actual chronology and relationship rules take precedence. Never restart a completed or previously attempted stage.
Timeline: ${timeline}
Requested task: ${options.task || "Determine and prepare the best next outbound action."}
Requested type: ${requested}
${rewriteReason ? `The first internal self-check failed because: ${rewriteReason}. Rewrite the message and return a stronger result.` : "Perform an internal self-check before returning: stage fit, factual grounding, conversation continuity, repetition, generic language, premature CTA, unsupported claims, useful next move, and WhatsApp length."}

${buildLeadContext(lead)}
${learningBlock}

Return ONLY valid JSON with exactly these fields:
{"salesStage":"string","buyerIntent":"string","confidence":0,"primaryObjective":"string","strategicReason":"concise factual reason","detectedFriction":"string","recommendedAction":"string","messageType":"${requested}","message":"final approved WhatsApp message","cta":"string or empty for value DM","recommendedFollowUpDate":"YYYY-MM-DD","recommendedChannel":"WhatsApp","riskLevel":"low|medium|high","reasoningSummary":"one concise user-safe sentence"}

Message rules for the selected type:
${MESSAGE_TYPE_RULES[requested]}`;
}

function normalise(lead: Lead, data: Record<string, unknown>, requested?: MessageType, rewritten = false): SalesBrainResult {
  // A caller-specified type is authoritative. The model cannot downgrade a
  // VALUE_DM request to FOLLOW_UP and thereby bypass the no-CTA contract.
  const type = requested || messageType(data.messageType);
  const confidence = Math.max(0, Math.min(100, Number(data.confidence) || 60));
  const followUp = /^\d{4}-\d{2}-\d{2}$/.test(String(data.recommendedFollowUpDate || ""))
    ? String(data.recommendedFollowUpDate) : addDays(3);
  const channel = ["WhatsApp", "Instagram", "Email", "None"].includes(String(data.recommendedChannel))
    ? data.recommendedChannel as SalesBrainResult["recommendedChannel"] : "WhatsApp";
  const risk = ["low", "medium", "high"].includes(String(data.riskLevel)) ? data.riskLevel as SalesBrainResult["riskLevel"] : "medium";
  return {
    leadId: lead.id, salesStage: String(data.salesStage || lead.status || "New"), buyerIntent: String(data.buyerIntent || "unknown"),
    confidence, primaryObjective: String(data.primaryObjective || stageObjective(lead.status || "New")),
    strategicReason: String(data.strategicReason || "Based on the recorded lead and conversation context."),
    detectedFriction: String(data.detectedFriction || "No explicit friction recorded."),
    recommendedAction: String(data.recommendedAction || "Send the approved message and wait for a response."),
    messageType: type, message: cleanMessage(data.message), cta: type === "VALUE_DM" ? "" : String(data.cta || ""),
    recommendedFollowUpDate: followUp, recommendedChannel: channel, riskLevel: risk,
    reasoningSummary: String(data.reasoningSummary || "Context-aware next action selected."), qualityChecked: true, rewritten,
  };
}

/** Allows server routes to use Gemini directly instead of fetching their own HTTP API. */
export async function runSalesBrainWithGenerator(
  lead: Lead,
  options: SalesBrainOptions,
  generate: SalesBrainGenerator,
): Promise<SalesBrainResult> {
  const requested = options.requestedMessageType || "FOLLOW_UP";
  let result = normalise(lead, jsonFromModel(await generate(prompt(lead, options), 1200)), requested);
  result.message = ensureProspectGreeting(lead, result.message);
  const failure = validateSalesBrainMessage(result.message, result.messageType);
  if (failure) { result = normalise(lead, jsonFromModel(await generate(prompt(lead, options, failure), 1200)), requested, true); result.message = ensureProspectGreeting(lead, result.message); }
  const finalFailure = validateSalesBrainMessage(result.message, result.messageType);
  if (finalFailure) throw new Error(`Sales Brain could not approve a safe message: ${finalFailure}.`);
  return result;
}

export async function runSalesBrain(lead: Lead, options: SalesBrainOptions = {}): Promise<SalesBrainResult> {
  // In the browser, the server is responsible for reloading this lead before
  // context assembly.  A displayed Lead can be stale; it is never generation
  // authority.  The server also returns the same canonical implementation used
  // by every UI surface.
  if (typeof window !== "undefined") {
    const response = await fetch("/api/sales-brain", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leadId: lead.id, task: options.task, requestedMessageType: options.requestedMessageType }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.brain) throw new Error(payload.error || "Could not generate a Sales Brain recommendation.");
    return payload.brain as SalesBrainResult;
  }
  let learningInsights = options.learningInsights;
  // The read is intentionally best-effort: Sales Brain remains available if the
  // learning service is disabled, unavailable, or still collecting evidence.
  if (!learningInsights && typeof window !== "undefined") {
    try {
      const response = await fetch(`/api/learning/insights?leadId=${encodeURIComponent(lead.id)}&messageType=${encodeURIComponent(options.requestedMessageType || "")}`);
      if (response.ok) learningInsights = (await response.json()).insights || [];
    } catch { /* safe rollout: no learning context is better than a failed draft */ }
  }
  const result = await runSalesBrainWithGenerator(lead, { ...options, learningInsights }, runAI);
  return { ...result, learningInsights };
}
