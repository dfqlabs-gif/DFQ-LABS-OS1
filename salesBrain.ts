// Canonical DFQ Labs sales intelligence.  This module owns strategic analysis,
// message generation, and its internal quality/rewrite pass.  UI consumers get
// one approved, structured result rather than a draft plus a separate QA flow.
import type { Lead } from "./types";
import type { MessageType } from "./lib/messageTypes";
import { ALL_MESSAGE_TYPES, MESSAGE_TYPE_RULES } from "./lib/messageTypes";
import { addDays } from "./constants";
import { buildLeadContext, buildTimeline, runAI, stageObjective, stripMarkdown } from "./aiEngine";

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
  if (type === "VALUE_DM" && /(would you like|let me know if|book a call|schedule a call|reply if|interested in|let'?s talk|happy to chat)/i.test(message)) return "a Value DM contains a CTA";
  return null;
}

function prompt(lead: Lead, options: SalesBrainOptions, rewriteReason?: string): string {
  const requested = options.requestedMessageType || "FOLLOW_UP";
  const timeline = buildTimeline(lead).map(event => `${event.occurred ? "done" : "not done"}: ${event.label}`).join("; ");
  const learningBlock = options.learningInsights?.length
    ? `\nOrganizational learning (historical advisory evidence, never rules):\n${options.learningInsights.map(insight => `- ${insight.pattern} Confidence ${insight.confidence}/100; ${insight.evidenceSummary}`).join("\n")}\nUse this only when genuinely relevant. Current lead history, research, and fact safety take precedence. Do not invent facts or force a historically successful strategy.\n`
    : "";
  return `You are the DFQ Labs AI SALES BRAIN. You are the only strategic authority for this lead. Analyze before writing, but do not reveal private chain-of-thought.

Use only verified CRM/conversation information below. Never fabricate a person name: if contact identity is unknown, address the company/team naturally. A company name is not automatically a person's name. A Value DM must provide contextual, actionable value with no CTA or disguised sales ask. Do not write a lazy check-in. If an audit was delivered and the prospect is silent, acknowledge that specific prior interaction and choose a commercially useful, low-pressure next move.

Current stage objective: ${stageObjective(lead.status || "New")}
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
  const type = messageType(data.messageType, requested);
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
    messageType: type, message: cleanMessage(data.message), cta: String(data.cta || ""),
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
  const failure = validateSalesBrainMessage(result.message, result.messageType);
  if (failure) result = normalise(lead, jsonFromModel(await generate(prompt(lead, options, failure), 1200)), requested, true);
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
