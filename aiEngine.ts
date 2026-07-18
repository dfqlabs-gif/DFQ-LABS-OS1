// ────────────────────────────────────────────────────────────────────────────
// DFQ Labs — Shared AI Intelligence Engine
// Every AI feature (DM Generator, AI Coach, CEO Advisor, Pipeline Analysis,
// Executive Strategy, Follow-ups, Lead Playbooks) routes prompt construction
// through this module so the reasoning framework, speaker rules, and CRM
// context-gathering logic live in exactly one place. Do not duplicate prompt
// strings in components — add a builder here instead.
// ────────────────────────────────────────────────────────────────────────────
import { Lead } from "./types";
import { BUSINESS_CONTEXT, callClaude } from "./prompts";
import { scoreLead, daysSince, hoursSince, SERVICE_VALUE, STAGE_PROBABILITY, today } from "./constants";

// ─── Reasoning framework applied to every AI call ──────────────────────────
export const REASONING_ENGINE_IDENTITY = `You are NOT an AI copywriter.
You are the Head of Sales at DFQ Labs.
Your primary responsibility is NOT writing messages — it is moving leads through the DFQ Labs sales pipeline.
Never generate a message until you have reasoned through the CRM data.`;

export const SPEAKER_RULES = `CONVERSATION RULES:
- "ALEX (us)" / the assigned specialist is DFQ Labs. "LEAD" is the prospect on the other end of the conversation. Never confuse the sender with the prospect.
- If Alex or the assigned specialist has already been introduced earlier in the thread, never reintroduce them ("Hi, I'm Alex...") again — continue the relationship naturally, as a real ongoing conversation would.
- Never confuse who said what. Ground every claim strictly in the CRM context and conversation history you are given — never invent facts about the lead.`;

// One objective per pipeline stage — never pursue more than one goal in a single response.
export const STAGE_OBJECTIVES: Record<string, string> = {
  "New": "Cold Outreach — earn permission to send the free audit. Do NOT sell services. Do NOT ask for a meeting.",
  "DM Sent": "Cold Outreach — earn permission to send the free audit. Do NOT sell services. Do NOT ask for a meeting.",
  "Replied": "Cold Outreach (warming) — use their reply to earn permission to send the audit. Do NOT sell services yet.",
  "Audit Requested": "Audit Requested — deliver the audit, explain the observations, build trust. Do not pitch yet.",
  "Audit Delivered": "Audit Delivered — book a discovery call. Do NOT offer another audit. Do NOT reintroduce yourself. Do NOT restart the sales process.",
  "Value Given": "Audit Delivered — book a discovery call. Do NOT offer another audit or restart the process.",
  "Discovery Call Booked": "Discovery Call Scheduled — increase attendance, reduce no-shows, answer pre-call concerns.",
  "Discovery Call Done": "Post-Discovery Call — reinforce the value delivered and move directly toward the proposal.",
  "Proposal Sent": "Proposal Sent — handle objections, increase confidence, help them decide. Never restart the sales cycle.",
  "Closed": "Client — retention, results, referrals, testimonials, upsells.",
  "Lost": "Lost — only re-engage with a genuinely new angle; otherwise do not contact."
};

export function stageObjective(status: string): string {
  return STAGE_OBJECTIVES[status] || "Objective not mapped for this stage — infer the single correct next step from context, and never restart a stage the lead has already passed.";
}

export const THINKING_FRAMEWORK = `INTERNAL REASONING PROCESS (work through this silently — never show these steps, labels, or numbering in your output, only the final answer):
1. UNDERSTAND THE CRM: read the lead's name, company, industry, current stage, assigned specialist, conversation history, internal notes, audit/discovery-call/proposal status, previous follow-ups, last response date, lead value, and existing objections. Never ignore CRM data that exists in the context below.
2. IDENTIFY WHO IS SPEAKING: apply the CONVERSATION RULES above without exception.
3. DETERMINE THE CURRENT OBJECTIVE: every pipeline stage has exactly ONE objective (see the stage objective in the CRM context). Pursue that single objective only.
4. VALIDATE THE PLAN: ask yourself — is this response moving the lead FORWARD, or accidentally backwards (re-pitching, re-introducing, restarting a stage already passed)? If backwards, stop and form a better plan before writing anything.
5. NEVER INVENT INFORMATION: never assume budget, authority, pain points, goals, or business problems unless they were actually discussed or exist in the CRM context. If information is missing, ask a thoughtful question instead of assuming.
6. WRITE LIKE A REAL CONSULTANT: never sound like AI, never use generic marketing language, hype, or buzzwords. Write like an experienced consultant having a genuine, natural, professional, specific conversation — grounded in the actual conversation history, not invented details.
Only after all six steps produce the final output the user actually asked for.

FINAL SELF-CHECK before answering: would Alex, the founder of DFQ Labs, personally read this and say "Yes, that's exactly how I would speak to this prospect"? If not, silently rewrite it until it passes — never show this check in the output.`;

export const SYSTEM_PROMPT = `${BUSINESS_CONTEXT}\n\n${REASONING_ENGINE_IDENTITY}\n\n${SPEAKER_RULES}\n\n${THINKING_FRAMEWORK}`;

// ─── Central entry point — every AI feature should call this, not callClaude directly ───
export async function runAI(userPrompt: string, maxTokens = 900): Promise<string> {
  return callClaude(SYSTEM_PROMPT, userPrompt, maxTokens);
}

// ─── Context Builder ────────────────────────────────────────────────────────
function extractSignals(lead: Lead): string {
  const text = `${lead.notes || ""} ${lead.prospectInitialResponse || ""} ${lead.prospectLatestResponse || ""}`.toLowerCase();
  const flags: string[] = [];
  if (/price|expensive|cost|budget|afford|₦/.test(text)) flags.push("price/budget sensitivity");
  if (/already (have|working|with)|current agency|our agency|existing (agency|partner)/.test(text)) flags.push("already has an agency/partner");
  if (/not sure|does (this|it) (actually )?work|proof|results|guarantee/.test(text)) flags.push("skepticism about results");
  if (/busy|later|not (now|right now)|no time|swamped/.test(text)) flags.push("timing/availability objection");
  if (/meet in person|come (to|by)|office|in-person|physical meeting/.test(text)) flags.push("requested an in-person meeting");
  if (/who are you|don'?t know you|never heard/.test(text)) flags.push("trust/credibility objection");
  return flags.length ? flags.join("; ") : "none explicitly detected yet";
}

function relativeTime(ts: string): string {
  if (!ts || ts === "0" || ts === "zzz" || ts.endsWith("a")) return "";
  try {
    const diff = Date.now() - new Date(ts).getTime();
    if (isNaN(diff) || diff < 0) return "";
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    if (minutes < 2) return "just now";
    if (minutes < 60) return `${minutes}min ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days === 1) return "yesterday";
    return `${days} days ago`;
  } catch { return ""; }
}

export function formatConversationLog(lead: Lead): string {
  // Only the three key conversation fields — initial DM, initial reply, latest thread.
  // The full conversationLog is intentionally excluded so the AI focuses on
  // what was actually said rather than internal CRM status changes.
  const parts: string[] = [];
  if (lead.dmText) {
    parts.push(`[ALEX (us) — Initial DM]: ${lead.dmText}`);
  }
  if (lead.prospectInitialResponse) {
    parts.push(`[LEAD — Initial Reply]: ${lead.prospectInitialResponse}`);
  }
  if (lead.prospectLatestResponse && lead.prospectLatestResponse !== lead.prospectInitialResponse) {
    parts.push(`[LEAD — Latest Message]: ${lead.prospectLatestResponse}`);
  }
  if (parts.length === 0) return "No conversation yet — this is the first outbound touch to this lead.";
  return parts.join("\n");
}

export function buildLeadContext(lead: Lead): string {
  const value = SERVICE_VALUE[lead.service] || 0;
  const score = scoreLead(lead);
  const daysSinceContact = lead.lastContacted ? daysSince(lead.lastContacted) : null;
  const hoursAwaitingReply = lead.awaitingReplySince ? hoursSince(lead.awaitingReplySince) : null;

  return `=== CRM CONTEXT ===
Lead: ${lead.name || "Unknown"} — ${lead.company || "Unknown company"}
Client archetype: ${lead.clientType || "Real Estate Developer"}
Service under discussion: ${lead.service} (value ${value ? "₦" + value.toLocaleString() : "unknown"}/mo)
Assigned specialist: ${lead.assignedTo || "Unassigned"}
Days since we last contacted them: ${daysSinceContact ?? "n/a"}
Hours currently awaiting their reply: ${hoursAwaitingReply !== null && !Number.isNaN(hoursAwaitingReply) ? Math.round(hoursAwaitingReply) : "n/a"}
Internal notes: ${lead.notes || "none"}

=== CONVERSATION THREAD ===
${formatConversationLog(lead)}
=== END CONTEXT ===`;
}

// ─────────────────────────────────────────────────────────────────────────
// MULTI-STEP REASONING PIPELINE
// The AI is not a chatbot — it is DFQ Labs' Head of Sales deciding the single
// best next action for a lead. Every message-writing feature (Draft DM,
// Suggest Reply, AI Coach Follow-Up) runs through this pipeline instead of a
// single prompt:
//   1. Context Reader     — gather everything the CRM knows (buildLeadContext)
//   2. Timeline Builder    — deterministically reconstruct what has/hasn't happened
//   3. Stage Detector      — the lead's canonical CRM stage (never renamed)
//   4. Objective Planner   — exactly one objective per stage (stageObjective)
//   5. Strategy Generator  — one AI call producing structured executive reasoning
//   6. DM Writer           — a second AI call that receives ONLY the structured
//                            strategy (never raw notes/conversation dump) and writes
//   7. Quality Checker     — a third AI call that grades the draft against a
//                            checklist and triggers exactly one regeneration if it fails
// ─────────────────────────────────────────────────────────────────────────

// STEP 2 — Timeline Builder (deterministic, no AI call). Reconstructs what has
// and has not happened so the model can never claim something occurred (or
// didn't) that contradicts the CRM.
export interface TimelineEvent { key: string; label: string; occurred: boolean; }

export function buildTimeline(lead: Lead): TimelineEvent[] {
  const hasReplied = !!(lead.prospectInitialResponse || lead.prospectLatestResponse) ||
    (lead.conversationLog || []).some(l => l.type === "reply") ||
    !["New", "DM Sent"].includes(lead.status);
  const auditRequested = ["Audit Requested", "Audit Delivered", "Value Given", "Discovery Call Booked", "Discovery Call Done", "Proposal Sent", "Closed"].includes(lead.status);
  const auditDelivered = ["Audit Delivered", "Value Given", "Discovery Call Booked", "Discovery Call Done", "Proposal Sent", "Closed"].includes(lead.status);
  const appointmentBooked = !!lead.meetingScheduledAt || ["Discovery Call Booked", "Discovery Call Done", "Proposal Sent", "Closed"].includes(lead.status);
  const discoveryCallDone = ["Discovery Call Done", "Proposal Sent", "Closed"].includes(lead.status);
  const proposalSent = ["Proposal Sent", "Closed"].includes(lead.status);
  const priceObjectionRaised = /price|expensive|cost|budget|afford|₦/i.test(`${lead.notes || ""} ${lead.prospectLatestResponse || ""}`);

  return [
    { key: "outreach", label: "First outreach sent", occurred: !!lead.dmText || lead.status !== "New" },
    { key: "replied", label: "Prospect has replied at least once", occurred: hasReplied },
    { key: "auditRequested", label: "Audit was requested", occurred: auditRequested },
    { key: "auditDelivered", label: "Audit was delivered", occurred: auditDelivered },
    { key: "appointmentBooked", label: "Discovery call was booked", occurred: appointmentBooked },
    { key: "discoveryCallDone", label: "Discovery call has taken place", occurred: discoveryCallDone },
    { key: "proposalSent", label: "Proposal was sent", occurred: proposalSent },
    { key: "priceObjection", label: "A price/budget objection was raised", occurred: priceObjectionRaised },
    { key: "won", label: "Deal closed — now a client", occurred: lead.status === "Closed" },
    { key: "lost", label: "Lead marked lost", occurred: lead.status === "Lost" },
  ];
}

function formatTimeline(events: TimelineEvent[]): string {
  return events.map(e => `${e.occurred ? "✓" : "✗"} ${e.label}`).join("\n");
}

// Anything already completed that a re-pitch would embarrassingly repeat.
function neverMentionAgain(events: TimelineEvent[]): string[] {
  const has = (k: string) => events.find(e => e.key === k)?.occurred;
  const flags: string[] = [];
  if (has("auditDelivered")) flags.push("Do not offer or re-explain the audit — it has already been delivered.");
  if (has("appointmentBooked")) flags.push("Do not ask to book a discovery call again — one is already booked or has happened.");
  if (has("proposalSent")) flags.push("Do not re-introduce the offer from scratch — a proposal has already been sent.");
  if (has("outreach") && !has("replied")) flags.push("Do not reintroduce yourself or restate the opening pitch verbatim — this is a follow-up to an existing outreach.");
  return flags;
}

// STEP 3/4 — Stage Detector & Objective Planner: the CRM's stored `status` IS
// the canonical stage (never renamed), and stageObjective() above already
// enforces exactly one objective per stage.

// STEP 5 — Strategy Generator (AI call #1 of the pipeline).
export interface Strategy {
  currentStage: string;
  nextObjective: string;
  reasoning: string;
  risk: string;
  confidence: string;
  emotion: string;
  keyFacts: string;
  neverMention: string;
}

function buildStrategyPrompt(lead: Lead, task: string, events: TimelineEvent[], neverMention: string[]): string {
  return `You are the Head of Sales at DFQ Labs. Do NOT write any outward-facing message — produce ONLY the internal executive reasoning and strategy for this lead. This briefing will be handed to a separate DM Writer module that has no other access to this CRM data, so be precise and complete.

TASK CONTEXT: ${task}

=== VERIFIED TIMELINE (ground truth — never contradict this) ===
${formatTimeline(events)}
${neverMention.length ? `\nNEVER MENTION AGAIN:\n${neverMention.map(n => `- ${n}`).join("\n")}` : ""}

Before answering, silently work through: what has happened, what has NOT happened, the biggest opportunity right now, the biggest risk, what should never be mentioned again, what emotion the prospect is likely feeling based on their actual language, and the single highest-probability next move.

Then output in EXACTLY this format, nothing else:
Current Stage: [the lead's actual current CRM stage]
Next Objective: [the single correct objective for this stage — never more than one]
Reasoning: [2-3 sentences explaining why this is the correct next action]
Risk: [the biggest concrete risk — silence, objection, re-pitching something already done, etc.]
Confidence: [percentage]
Emotion: [1 short phrase describing the prospect's likely current emotional state]
KeyFacts: [1-3 short, specific, real facts or quotes from the conversation history below worth grounding the message in, semicolon separated — never invent facts not present below]

${buildLeadContext(lead)}`;
}

function parseStrategy(raw: string, neverMention: string[]): Strategy {
  const grab = (label: string) => {
    const m = raw.match(new RegExp(`${label}:\\s*(.+)`, "i"));
    return m ? m[1].trim() : "";
  };
  return {
    currentStage: grab("Current Stage"),
    nextObjective: grab("Next Objective"),
    reasoning: grab("Reasoning"),
    risk: grab("Risk"),
    confidence: grab("Confidence"),
    emotion: grab("Emotion"),
    keyFacts: grab("KeyFacts"),
    neverMention: neverMention.join("; "),
  };
}

export async function runStrategyGenerator(lead: Lead, task: string): Promise<Strategy> {
  const events = buildTimeline(lead);
  const neverMention = neverMentionAgain(events);
  // Free-tier OpenRouter reasoning models deduct hidden "thinking" tokens from
  // max_tokens before writing visible content — a low budget here cuts the
  // structured fields off mid-way (Risk/Confidence going blank). 800 leaves
  // real headroom; the server-side retry-on-truncation logic is a backstop.
  const raw = await runAI(buildStrategyPrompt(lead, task, events, neverMention), 800);
  return parseStrategy(raw, neverMention);
}

// STEP 6 — DM Writer (AI call #2). Receives ONLY the structured strategy —
// never the raw CRM notes or conversation dump — plus the minimal identity
// fields needed to address the prospect correctly.
function buildDMWriterPrompt(lead: Lead, strategy: Strategy, styleInstructions: string): string {
  return `You are Alex, writing directly to this prospect. You do NOT have access to the raw CRM — you only have this structured briefing from your sales strategist. Write ONLY the outward-facing message. Do not restate, quote, or reference the briefing itself.

=== STRATEGY BRIEFING ===
Lead name: ${lead.name || lead.company || "the prospect"}
Company: ${lead.company || "n/a"}
Client archetype: ${lead.clientType || "Real Estate Developer"}
Current Stage: ${strategy.currentStage || lead.status}
Next Objective (pursue ONLY this): ${strategy.nextObjective || stageObjective(lead.status)}
Reasoning: ${strategy.reasoning || "n/a"}
Prospect's likely emotion: ${strategy.emotion || "n/a"}
Key facts to ground the message in: ${strategy.keyFacts || "none available — do not invent any"}
${strategy.neverMention ? `Never mention again: ${strategy.neverMention}` : ""}
=== END BRIEFING ===

${styleInstructions}`;
}

// STEP 7 — Quality Checker (AI call #3). Grades the draft; on failure, the
// pipeline regenerates exactly once with the failure reason as a fix instruction.
export interface QualityResult { pass: boolean; reason: string; }

async function runQualityChecker(message: string, strategy: Strategy): Promise<QualityResult> {
  const prompt = `You are a strict sales quality checker. Answer with EXACTLY one line: "PASS" or "FAIL: <one short reason>".

The message FAILS if ANY of these are true:
- It mentions or offers something listed under "Never mention again" below.
- It confuses who is DFQ Labs vs. the prospect, or addresses the wrong person.
- It pursues a different or additional objective than "${strategy.nextObjective}".
- It sounds generic, robotic, or like AI marketing copy rather than an experienced consultant.
- It states a fact as true that is not present in "Key facts" below.

Never mention again: ${strategy.neverMention || "none"}
Key facts: ${strategy.keyFacts || "none"}
Objective: ${strategy.nextObjective || "none"}

MESSAGE:
"""
${message}
"""`;
  // A tiny budget here risks the same hidden-reasoning truncation as the
  // Strategy Generator — 200 leaves enough headroom for a one-line verdict.
  const verdict = await runAI(prompt, 200);
  const fail = /^FAIL/i.test(verdict.trim());
  return { pass: !fail, reason: fail ? verdict.replace(/^FAIL:?\s*/i, "").trim() : "" };
}

// Orchestrator — runs the full 7-step pipeline and returns the message with
// its strategy readout appended (matches the existing "---STRATEGY---" UI convention).
export async function runSalesPipeline(lead: Lead, task: string, styleInstructions: string, maxTokens = 900): Promise<string> {
  const strategy = await runStrategyGenerator(lead, task);

  const draft = (fix?: string) => runAI(
    buildDMWriterPrompt(lead, strategy, fix ? `${styleInstructions}\n\nIMPORTANT FIX (a quality check flagged the previous draft): ${fix}` : styleInstructions),
    maxTokens
  );

  let message = await draft();
  const check = await runQualityChecker(message, strategy);
  if (!check.pass) {
    message = await draft(check.reason);
  }

  const strategyBlock = `Current Stage: ${strategy.currentStage || lead.status}
Next Objective: ${strategy.nextObjective}
Reasoning: ${strategy.reasoning}
Risk: ${strategy.risk}
Confidence: ${strategy.confidence}`;

  return `${message}\n\n---STRATEGY---\n${strategyBlock}`;
}

export function followUpWriteInstructions(): string {
  return `You are Alex from DFQ Labs writing directly to this prospect. Read the conversation thread carefully — that thread is your source of truth for tone, context, and where the relationship is right now.

DFQ Labs context (use this to ground every message):
- We help real estate developers, construction firms, and property companies build a client acquisition system using biopsychology, content positioning, and trust strategies.
- Our process: we identify positioning gaps in their content/outreach, record a custom video audit showing exactly what we found and how we'd fix it, then offer to get on a call if they want to go deeper.
- We are not a generic marketing agency. We are specific, credible, and we do real research on every brand before reaching out.

HOW TO WRITE (sound like a real human, not an AI):
1. Read the thread first — every word we said, every word they said. Your message must feel like a natural next sentence in that specific conversation.
2. Write the way Alex actually texts: short, direct, calm, confident. No enthusiasm, no hype, no formal language. Like you're texting a respected peer you've met before.
3. NEVER use: "I hope", "I trust", "I came across", "excited to", "leverage", "synergy", "holistic", "elevate", "delve", "revolutionize". Never open with a compliment.
4. ONE ask only. Low friction. Match where they are in the conversation — don't jump stages.
5. If there's a gap since the last message (days or weeks), acknowledge the thread warmly and naturally — just pick up the conversation, don't apologize or explain.
6. Length: 2-4 sentences for WhatsApp/Instagram/DM. 80-120 words for email. Never pad.
7. Zero emojis. Zero exclamation marks. Output ONLY the message — nothing else.`;
}

export async function runFollowUpReply(lead: Lead): Promise<string> {
  return runSalesPipeline(lead, "Draft the next outbound follow-up message to this lead.", followUpWriteInstructions(), 900);
}

export function quickReplyWriteInstructions(waitHours: number): string {
  const timeContext = waitHours < 6
    ? `They sent this ${waitHours} hours ago — reply as if continuing an active, warm conversation.`
    : waitHours < 24
    ? `They sent this ${waitHours} hours ago. Pick up the thread naturally.`
    : waitHours < 72
    ? `They sent this ${Math.round(waitHours / 24)} days ago. Open with something that re-establishes warmth and picks up where you left off — not apologetic, not dramatic, just natural.`
    : `They sent this ${Math.round(waitHours / 24)} days ago. Re-engage warmly. Do not guilt-trip them for the gap. Bring a specific, new angle or reference something concrete from the prior conversation to make re-engagement feel natural and valuable.`;
  return `${timeContext}

Write a warm, punchy, extremely natural response that continues the dialog and pursues ONLY the objective in your briefing above.
- NEVER be pushy or desperate. Treat the prospect with complete respect — they owe you nothing.
- No emojis. No clichés. No AI buzzwords. Zero exclamation marks.
- Maximum 3 sentences.
- Output ONLY the message — no strategy explanation, that is appended separately.`;
}

export async function runQuickReply(lead: Lead, waitHours: number): Promise<string> {
  // Kept short in the prompt instructions ("max 3 sentences"), but the token
  // budget itself needs headroom for hidden reasoning tokens (see
  // runStrategyGenerator) or short replies truncate mid-sentence too.
  return runSalesPipeline(lead, `Reply to this waiting prospect who has been waiting ${waitHours} hours.`, quickReplyWriteInstructions(waitHours), 600);
}

// ─── Funnel path shared by every DM/follow-up prompt ───────────────────────
export const FUNNEL_PATH = `Funnel Path (move the lead from their CURRENT stage to the next):
- New -> DM Sent (high-relevance real estate acquisition hook)
- DM Sent -> Replied (warm nudge following up on the hook)
- Replied -> Audit Requested (pitch a free 2-minute content-to-inbox audit showing views vs inbound conversion bottleneck)
- Audit Requested -> Audit Delivered (present custom insights/audit deliverable with a bottleneck diagnosis)
- Audit Delivered -> Discovery Call Booked (propose a 10-minute discovery call)
- Discovery Call Booked/Done -> Proposal Sent (present partnership terms / Beta program)
- Proposal Sent -> Closed (close the deal, address commitment fee/terms)`;

// ─── Prompt builders — one per AI feature ──────────────────────────────────
export function buildFollowUpPrompt(lead: Lead): string {
  return `Determine the exact current stage of this prospect from the CRM context and conversation history, then write an extremely personalized, high-converting outbound message that moves them from their CURRENT stage ("${lead.status}") to the next natural step in our DFQ Labs buyer funnel.

${FUNNEL_PATH}

Requirements:
1. Sound like a sales strategist with 20+ years of experience closing high-ticket deals — composed, direct, zero fluff, zero desperation.
2. Target their exact Abuja client archetype (${lead.clientType}). Ground every line in something specific from the CRM context or conversation history below — never generic.
3. Length: 120-250 words. Do not pad with filler, but do not truncate — write the complete message, fully formed, from an appropriate opener through the specific next-step ask.
4. No emojis. No clichés or AI buzzwords.
5. Write the message first, then on a new line "---STRATEGY---" followed by 2-3 sentences explaining the buyer-psychology reasoning behind this message and why this is the correct next step.

${buildLeadContext(lead)}`;
}

export function buildAuditPrompt(lead: Lead): string {
  return `Write a compelling, hyper-targeted 120-220 word message offering a FREE visual Content Audit Breakdown of their social media vs their buyer inbox conversion. Target their archetype's exact pain point (developer off-plan pressure, realtor personal brand differentiation, architecture/construction delivery credibility). Sound like a 20+ year sales strategist — direct, conversational, zero fluff. No emojis. Output the message first, then "---STRATEGY---" and 2-3 sentences of reasoning.

${buildLeadContext(lead)}`;
}

export function buildObjectionsPrompt(lead: Lead): string {
  return `Predict the top 3 objections this Abuja real estate client is most likely to raise given the CRM context and conversation history (e.g. "we already have an agency", "pricing", "does this actually work"), and write exact, word-for-word, natural rebuttals for each — grounded in Abuja market dynamics and this specific lead's history. Keep each rebuttal sharp and powerful.

${buildLeadContext(lead)}`;
}

export function buildClosingPlanPrompt(lead: Lead): string {
  return `Write a sharp 60-day closing plan for this lead, tailored to their client archetype's typical decision cycle and grounded in their specific CRM history. Provide highly tactical recommendations for closing them into our Beta Partnership Program (60 days at no cost, ₦100,000 commitment fee). Provide actions at each stage.

${buildLeadContext(lead)}`;
}

// ─── Pipeline-wide context & prompts ────────────────────────────────────────
export function buildPipelineContext(leads: Lead[]): string {
  const active = leads.filter(l => !["Closed", "Lost"].includes(l.status));
  const byStage: Record<string, number> = {};
  active.forEach(l => { byStage[l.status] = (byStage[l.status] || 0) + 1; });
  const stageBreakdown = Object.entries(byStage).map(([s, c]) => `${s}: ${c}`).join(", ") || "no active leads";

  const stale = [...active].filter(l => l.lastContacted && daysSince(l.lastContacted) >= 5)
    .sort((a, b) => daysSince(b.lastContacted) - daysSince(a.lastContacted)).slice(0, 5);
  const highValueInactive = active.filter(l => (SERVICE_VALUE[l.service] || 0) >= 500000 && l.lastContacted && daysSince(l.lastContacted) >= 3);
  const awaitingReply = active.filter(l => l.awaitingReplySince && hoursSince(l.awaitingReplySince) >= 24);
  const atRisk = active.filter(l => l.aiBucket === "Cold" || (l.status === "Proposal Sent" && l.lastContacted && daysSince(l.lastContacted) >= 2));
  const totalWeighted = active.reduce((sum, l) => sum + (SERVICE_VALUE[l.service] || 0) * (STAGE_PROBABILITY[l.status] || 0), 0);
  const bySpecialist: Record<string, number> = {};
  active.forEach(l => { const k = l.assignedTo || "Unassigned"; bySpecialist[k] = (bySpecialist[k] || 0) + 1; });

  return `=== PIPELINE SNAPSHOT ===
Total active leads: ${active.length}. Closed: ${leads.filter(l => l.status === "Closed").length}. Lost: ${leads.filter(l => l.status === "Lost").length}.
Stage breakdown: ${stageBreakdown}
Load by specialist: ${Object.entries(bySpecialist).map(([s, c]) => `${s}: ${c}`).join(", ") || "none"}
Stale leads (5+ days no contact, top 5 shown): ${stale.length ? stale.map(l => `${l.name || l.company} (${l.status}, ${daysSince(l.lastContacted)}d silent)`).join("; ") : "none"}
High-value leads gone quiet (₦500K+/mo, 3+ days no contact): ${highValueInactive.length ? highValueInactive.map(l => `${l.name || l.company} (${l.status})`).join("; ") : "none"}
Leads awaiting our reply 24h+: ${awaitingReply.length ? awaitingReply.map(l => `${l.name || l.company}`).join(", ") : "none"}
At-risk leads (cold classification or stalled proposal): ${atRisk.length ? atRisk.map(l => `${l.name || l.company} (${l.status})`).join(", ") : "none"}
Weighted pipeline value: ₦${Math.round(totalWeighted).toLocaleString()}
=== END SNAPSHOT ===`;
}

export function buildPipelinePrompt(leads: Lead[], roleContext?: string): string {
  return `Analyze this pipeline like a Chief Revenue Intelligence Officer with 20+ years running B2B sales teams. Cover, in this exact order, with a short header for each:
1. BOTTLENECKS — which stage(s) are weakest and why, grounded in the data below.
2. FOLLOW-UP TIMING — leads overdue for contact and the cost of waiting.
3. INACTIVE HIGH-VALUE LEADS — named leads worth immediate attention.
4. AT-RISK LEADS — named leads likely to go cold or be lost, and why.
5. RECOMMENDED ACTIONS${roleContext ? ` for ${roleContext}` : ""} — concrete, role-specific next actions.
6. THIS WEEK'S TOP 3 PRIORITIES — ranked by revenue impact.
7. REVENUE OPPORTUNITY — the fastest path to closing more weighted pipeline value.

Be specific with lead names from the data. Do not invent leads that are not in the snapshot below.
${buildPipelineContext(leads)}`;
}

export function buildCEOAdvisorPrompt(leads: Lead[], revenue: any, question?: string): string {
  const snapshot = buildPipelineContext(leads);
  const revenueLine = `Revenue — guaranteed: ₦${Math.round(revenue?.guaranteed || 0).toLocaleString()}, likely: ₦${Math.round(revenue?.likely || 0).toLocaleString()}, weighted: ₦${Math.round(revenue?.weighted || 0).toLocaleString()}.`;

  if (question && question.trim()) {
    return `You are reasoning as the Head of Sales for DFQ Labs, answering the founder's direct strategic question. Ground your answer strictly in the CRM data below — cite specific leads, numbers, or stages where relevant. Be direct, concise, and actionable. No generic advice that ignores the data.

When you reference any individual lead's next step, apply the same discipline used across the whole OS: each stage has exactly one objective, never suggest re-pitching or repeating a step a lead has already passed, and never invent facts about a lead that aren't in the snapshot below.

FOUNDER'S QUESTION: "${question.trim()}"

${snapshot}
${revenueLine}`;
  }

  return `Generate today's Daily CEO briefing for Alex, reasoning as his Head of Sales. Today is ${today()}. Give a direct focus map: if Alex only has two focused hours today, what should he work on first to optimize for audits watched, discovery calls booked, or beta partnership spots closed? Include specific lead names from the snapshot below.

${snapshot}
${revenueLine}

Format the output exactly:
CURRENT STATE: [one honest sentence on where we stand]
STRATEGIC FOCUS FOR TODAY: [the single highest-leverage task to spend 2 hours on]
WHY IT WINS: [1 line explaining the psychology]
CONVERSION HAZARD: [specific risk that could cost revenue today if ignored]`;
}
