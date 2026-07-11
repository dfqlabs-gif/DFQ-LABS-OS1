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

export function formatConversationLog(lead: Lead): string {
  const events: { ts: string; speaker: string; text: string }[] = [];
  if (lead.dmText) events.push({ ts: lead.dateAdded || "0", speaker: "ALEX (us)", text: lead.dmText });
  if (lead.prospectInitialResponse) events.push({ ts: (lead.dateAdded || "0") + "a", speaker: "LEAD", text: lead.prospectInitialResponse });
  (lead.conversationLog || []).forEach(log => {
    const speaker = log.type === "reply" ? "LEAD" : (log.by && log.by !== "Lead" ? `${log.by} (us)` : "LEAD");
    events.push({ ts: log.ts || "0", speaker, text: log.text });
  });
  if (lead.prospectLatestResponse && lead.prospectLatestResponse !== lead.prospectInitialResponse) {
    events.push({ ts: "zzz", speaker: "LEAD", text: lead.prospectLatestResponse });
  }
  events.sort((a, b) => (a.ts || "").localeCompare(b.ts || ""));
  if (events.length === 0) return "No conversation yet — this is the first outbound touch to this lead.";
  return events.map(e => `[${e.speaker}]: ${e.text}`).join("\n");
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
Current stage: ${lead.status} (lead score: ${score}/100, historical win probability at this stage: ${Math.round((STAGE_PROBABILITY[lead.status] || 0) * 100)}%)
Stage objective (pursue this ONE goal only): ${stageObjective(lead.status)}
Assigned specialist: ${lead.assignedTo || "Unassigned"}
Priority: ${lead.priority}
Beta candidate: ${lead.betaCandidate ? "yes" : "no"}
Days since we last contacted them: ${daysSinceContact ?? "n/a"}
Hours currently awaiting their reply: ${hoursAwaitingReply !== null && !Number.isNaN(hoursAwaitingReply) ? Math.round(hoursAwaitingReply) : "n/a"}
Meeting scheduled: ${lead.meetingScheduledAt || "none"}
Next action on file: ${lead.nextAction || "none"} (due ${lead.nextActionDate || "n/a"})
Previous AI classification: ${lead.aiBucket || "none"} — ${lead.aiReason || "n/a"}
Likely objections/pain points detected: ${extractSignals(lead)}
Internal notes: ${lead.notes || "none"}

=== CONVERSATION HISTORY (chronological, speaker-labeled) ===
${formatConversationLog(lead)}
=== END CONTEXT ===`;
}

// ─── Two-phase reasoning: reason silently first, then write ───────────────
// Instead of generating an outward-facing message immediately, first produce an
// internal sales brief (never shown to the prospect or the strategy readout verbatim
// beyond its own labeled fields) that names the stage, objective, rationale, risks,
// and confidence. Only then generate the actual message, informed by that brief.
// This mirrors how an experienced closer actually works: plan, then write.
export function buildSalesBrief(lead: Lead, task: string): string {
  return `Produce ONLY an internal sales brief for this lead — this is never shown to the prospect, it exists purely to plan the next message. Do not write any outward-facing message yet.

TASK CONTEXT: ${task}

Output in exactly this format, nothing else, no extra commentary:
Current Stage: [the lead's actual current stage]
Next Objective: [the single correct objective for this stage, from the CRM context below]
Why This Step: [2-3 sentences explaining why this is the correct next action based on the CRM data below]
Risks: [any concerns — silence, objections, missing information, risk of moving the lead backwards]
Confidence: [percentage]

${buildLeadContext(lead)}`;
}

export async function runReasonedReply(lead: Lead, task: string, writeInstructions: string, maxTokens = 900): Promise<string> {
  const brief = await runAI(buildSalesBrief(lead, task), 350);

  const finalPrompt = `You already reasoned through this internal sales brief for this lead — use it silently to inform your message, do not restate it, reference it explicitly, or repeat its labels in your output:
${brief}

${writeInstructions}

${buildLeadContext(lead)}`;

  const message = await runAI(finalPrompt, maxTokens);
  return `${message}\n\n---STRATEGY---\n${brief}`;
}

export function followUpWriteInstructions(lead: Lead): string {
  return `Write an extremely personalized, high-converting outbound message that pursues ONLY this stage's single objective and moves this lead from their CURRENT stage ("${lead.status}") to the next natural step in our DFQ Labs buyer funnel.

${FUNNEL_PATH}

Requirements:
1. Sound like a sales strategist with 20+ years of experience closing high-ticket deals — composed, direct, zero fluff, zero desperation.
2. Target their exact Abuja client archetype (${lead.clientType}). Ground every line in something specific from the CRM context or conversation history — never generic.
3. Length: 120-250 words. Do not pad with filler, but do not truncate — write the complete message, fully formed, from an appropriate opener through the specific next-step ask.
4. No emojis. No clichés or AI buzzwords.
5. Output ONLY the message. Do not add a strategy explanation — that is appended separately.`;
}

export async function runFollowUpReply(lead: Lead): Promise<string> {
  return runReasonedReply(lead, "Draft the next outbound follow-up message to this lead, respecting this stage's single objective.", followUpWriteInstructions(lead), 900);
}

export function quickReplyWriteInstructions(lead: Lead, waitHours: number): string {
  return `This qualified prospect messaged us and has been waiting ${waitHours} hours for a reply. Write a warm, punchy, extremely natural response that continues the dialog and pursues ONLY this stage's single objective. Target their specific client type in Abuja (${lead.clientType}). Maximum 3 sentences. No emojis. Output ONLY the message — no strategy explanation, that is appended separately.`;
}

export async function runQuickReply(lead: Lead, waitHours: number): Promise<string> {
  return runReasonedReply(lead, "Reply to this waiting prospect right now, respecting this stage's single objective.", quickReplyWriteInstructions(lead, waitHours), 350);
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
