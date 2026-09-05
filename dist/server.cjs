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

// prompts.ts
var BUSINESS_CONTEXT = `You are the Chief Revenue Intelligence Officer and Elite Copywriting Strategist for DFQ Labs. 
DFQ Labs is a boutique client acquisition agency. We specialize in helping real estate companies, property developers, and construction firms build a complete client acquisition system \u2014 using proprietary Abuja buyer psychology research, content positioning, and trust strategies. Our core process: audit a brand's content and outreach gaps, then build a done-for-you system that attracts high-intent buyers and converts them through a structured trust-building sequence. We operate in Abuja, Nigeria and our primary niche is real estate.

SERVICE OFFERINGS:
- Starter (\u20A6200K/mo): Core lead intelligence and list qualification.
- Growth (\u20A6500K/mo): Complete done-for-you WhatsApp outbound campaign with custom video audits.
- Advanced (\u20A61M/mo): Full-funnel systems integration, personal branding for founders, and custom JVs.
- Beta Partnership Program: 60 days of fully managed campaign at no monthly retainer cost, requiring only a \u20A6100,000 commitment fee to verify absolute partner alignment and cover basic setup costs.

TARGET ARCHETYPES & CORE PAIN POINTS:
1. Real Estate Developers (e.g., in Guzape, Maitama, Katampe, Katampe Extension):
   - Off-plan sales pressure: They have immense cash flow pressure to sell units before foundation/completion to fund construction.
   - Leak: They waste millions on generic flyers, untargeted unboxing videos, or expensive billboards that don't build trust or capture high-intent buyers.
   - Leverage: Focus on trust-building construction progress reports, structured buyer psychology, and direct-response lead qualifying.

2. Luxury Realtors & Agencies:
   - Personal brand differentiation: The Abuja market is crowded with realtors doing identical house unboxings of listings they don't even own.
   - Leak: High views but zero inbound buyer conversion because high-net-worth individuals (HNWIs) find them amateurish rather than trusted advisors.
   - Leverage: Positioning as a real estate investment advisor/consultant rather than a listing-tour guide.

3. Architecture & Construction Firms:
   - High-ticket briefs: Securing \u20A650M+ design-and-build briefs requires intense institutional authority and JVs.
   - Leak: No public proof of technical delivery, lack of structural storytelling, and bad project-acquisition loops.
   - Leverage: Case studies showcasing design-to-delivery precision.

STRICT COPYWRITING RULES (ELIMINATE THE AI SIGNATURE):
1. ZERO Clich\xE9s: Never start with "Hope you are doing well", "I came across your profile...", "Great page!", or "As a real estate brand...".
2. ZERO AI Buzzwords: Do not use "synergy", "revolutionize", "delve", "supercharge", "leverage" (as a verb), "holistic", "unleash", "elevate", "delighted", "testament", "beacon".
3. Low Friction, High Status: Speak as an expert peer, not a hungry salesperson. Your tone is dry, knowledgeable, direct, and matter-of-fact.
4. WhatsApp Format: Keep WhatsApp messages strictly to 2-3 short, highly conversational sentences. No emojis. It must feel like a text sent on the go from a phone, but containing sharp, undeniable buyer-psychology insights.
5. Move, Don't Pitch: Always focus on the next natural step in the buyer journey:
   - Outbound to Replied: Get them to agree to receive a brief, custom 2-minute "Content-to-Inbox Conversion Audit".
   - Replied to Audit Requested: Confirm their biggest bottleneck and get permission to run the audit.
   - Audit Requested to Delivered: Deliver the audit with a clear, specific bottleneck diagnosis.
   - Audit Delivered to Meeting Booked: Transition them to a 10-minute discovery call to discuss the solution.
   - Meeting Booked to Proposal Sent: Clarify partnership terms, pricing, or the Beta program.
   - Proposal Sent to Closed: Address final objections, clear up contract terms, and close the deal.`;
var AI_MODEL_KEY = "dfqlabs-ai-model";
var getActiveModel = () => {
  try {
    return localStorage.getItem(AI_MODEL_KEY) || void 0;
  } catch {
    return void 0;
  }
};
var AI_ERROR_KEY = "dfqlabs-ai-errors";
var getAIErrors = () => {
  try {
    return JSON.parse(localStorage.getItem(AI_ERROR_KEY) || "[]");
  } catch {
    return [];
  }
};
var logAIError = (message, model) => {
  try {
    const errors = getAIErrors();
    errors.unshift({ ts: (/* @__PURE__ */ new Date()).toISOString(), message, model });
    localStorage.setItem(AI_ERROR_KEY, JSON.stringify(errors.slice(0, 50)));
  } catch {
  }
};
async function callClaude(systemInstruction, prompt, maxTokens) {
  const model = getActiveModel();
  const response = await fetch("/api/ai", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ systemPrompt: systemInstruction, userPrompt: prompt, maxTokens, model })
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: "AI service temporarily unavailable." }));
    const message = err.error || "Unable to generate recommendation.";
    logAIError(message, model);
    throw new Error(message);
  }
  const data = await response.json();
  return data.text;
}

// constants.tsx
var import_lucide_react = require("lucide-react");
var import_react = __toESM(require("react"), 1);
var import_jsx_runtime = require("react/jsx-runtime");
var RELATIONSHIP_RENEWAL_DAYS = 90;
var RESPONSE_GUARD_HOURS = 24;
var MEETING_WINDOW_HOURS = 24;
var SESSION_IDLE_MS = 4 * 60 * 60 * 1e3;
var SERVICE_VALUE = {
  "Starter \u2014 \u20A6200K/mo": 2e5,
  "Growth \u2014 \u20A6500K/mo": 5e5,
  "Advanced \u2014 \u20A61M/mo": 1e6,
  "Team Training \u2014 \u20A6350K": 35e4,
  "Custom": 0
};
var today = () => {
  const d = /* @__PURE__ */ new Date();
  const tz = d.getTimezoneOffset() * 6e4;
  return new Date(d.getTime() - tz).toISOString().split("T")[0];
};
var daysSince = (d) => {
  if (!d) return 999;
  return Math.floor((Date.now() - new Date(d).getTime()) / 864e5);
};
var hoursSince = (d) => {
  if (!d) return Infinity;
  return (Date.now() - new Date(d).getTime()) / 36e5;
};
var hoursUntil = (d) => {
  if (!d) return -Infinity;
  return (new Date(d).getTime() - Date.now()) / 36e5;
};
var touchpointDate = (l) => {
  return l.lastMeaningfulTouchpoint || l.lastContacted || l.dateAdded;
};
function scoreBreakdown(l) {
  const reasons = [];
  const ds = daysSince(l.lastContacted);
  if (ds <= 1) {
    reasons.push({ label: "Contacted very recently", pts: 25 });
  } else if (ds <= 3) {
    reasons.push({ label: "Contacted within 3 days", pts: 15 });
  } else if (ds <= 7) {
    reasons.push({ label: "Contacted within a week", pts: 8 });
  }
  const sp = {
    "Discovery Call Booked": 25,
    "Discovery Call Done": 25,
    "Replied": 20,
    "Audit Requested": 20,
    "Audit Delivered": 20,
    "Value Given": 20,
    "Proposal Sent": 18,
    "DM Sent": 10,
    "New": 5
  };
  reasons.push({ label: `Pipeline stage: ${l.status}`, pts: sp[l.status] || 5 });
  const pp = { High: 25, Medium: 15, Low: 5 };
  reasons.push({ label: `Priority: ${l.priority}`, pts: pp[l.priority] || 15 });
  const due = l.nextActionDate || l.autoFollowUpDate;
  const overdue = due && due < today();
  const dueToday = due === today();
  if (overdue) reasons.push({ label: "Follow-up overdue", pts: 25 });
  else if (dueToday) reasons.push({ label: "Follow-up due today", pts: 20 });
  else if (!due && (l.prospectInitialResponse || l.prospectLatestResponse)) {
    reasons.push({ label: "Has unscheduled reply thread", pts: 15 });
  } else if (!due && l.dmText) {
    reasons.push({ label: "Outreach sent, no schedule", pts: 8 });
  }
  const bb = { Hot: 30, Warm: 18, Nurture: 0, Cold: -10, Dead: -30 };
  if (l.aiBucket) reasons.push({ label: `AI bucket: ${l.aiBucket}`, pts: bb[l.aiBucket] || 0 });
  if (l.betaCandidate) reasons.push({ label: "Beta candidate", pts: 10 });
  const val = SERVICE_VALUE[l.service] || 0;
  if (val >= 1e6) reasons.push({ label: "High revenue potential (\u20A61M+ tier)", pts: 14 });
  else if (val >= 5e5) reasons.push({ label: "Mid-high revenue potential", pts: 8 });
  if (l.awaitingReplySince && hoursSince(l.awaitingReplySince) >= RESPONSE_GUARD_HOURS) {
    reasons.push({ label: `Awaiting our reply ${Math.floor(hoursSince(l.awaitingReplySince))}h`, pts: 22 });
  }
  if (l.meetingScheduledAt && hoursUntil(l.meetingScheduledAt) >= 0 && hoursUntil(l.meetingScheduledAt) <= MEETING_WINDOW_HOURS) {
    reasons.push({ label: "Meeting within 24h", pts: 20 });
  }
  const tp = daysSince(touchpointDate(l));
  if (tp >= RELATIONSHIP_RENEWAL_DAYS) reasons.push({ label: `${tp}d since meaningful touchpoint`, pts: -10 });
  return reasons;
}
function scoreLead(l) {
  const total = scoreBreakdown(l).reduce((s, r) => s + r.pts, 0);
  return Math.max(0, Math.min(total, 180));
}

// aiEngine.ts
var REASONING_ENGINE_IDENTITY = `You are NOT an AI copywriter.
You are the Head of Sales at DFQ Labs.
Your primary responsibility is NOT writing messages \u2014 it is moving leads through the DFQ Labs sales pipeline.
Never generate a message until you have reasoned through the CRM data.`;
var SPEAKER_RULES = `CONVERSATION RULES:
- "ALEX (us)" / the assigned specialist is DFQ Labs. "LEAD" is the prospect on the other end of the conversation. Never confuse the sender with the prospect.
- If Alex or the assigned specialist has already been introduced earlier in the thread, never reintroduce them ("Hi, I'm Alex...") again \u2014 continue the relationship naturally, as a real ongoing conversation would.
- Never confuse who said what. Ground every claim strictly in the CRM context and conversation history you are given \u2014 never invent facts about the lead.`;
var STAGE_OBJECTIVES = {
  "New": "Send the cold outreach DM. Hook: you spotted a positioning gap on their Instagram/content that's limiting the quality of buyer inquiries they attract. Ask if they'd like you to send the breakdown. Do NOT pitch services. Do NOT mention pricing. Do NOT ask for a call.",
  "DM Sent": "Follow up on the initial DM. You already told them you spotted a positioning gap \u2014 now gently resurface it. Goal: get them to say 'yes, send it' or 'sure, why not'. Do NOT pitch services. Do NOT ask for a call.",
  "Replied": "They replied to your outreach. Use their response to earn permission to send the free video audit. If they said 'yes, send it' or similar \u2014 confirm you're sending it. If they're curious but guarded \u2014 warm them up one more step. Do NOT pitch services. Do NOT ask for a call yet.",
  "Audit Requested": "Send the recorded video audit you prepared for their brand. Tell them at the end of the video: if they want to go deeper, reply with 'let's talk'. Do not pitch pricing. Do not offer packages. Build trust through specificity.",
  "Audit Delivered": "They have the audit. Your one job: get them on a discovery call. The call is free, no pressure \u2014 you just want to go deeper into what you found. If they already said 'let's talk', book the call immediately. Do NOT re-send the audit. Do NOT offer another one.",
  "Value Given": "Same as Audit Delivered \u2014 get them on a discovery call. Do NOT restart the process.",
  "Discovery Call Booked": "Call is booked. Reduce no-shows: confirm attendance, answer any pre-call nerves, build anticipation. Keep it warm and brief.",
  "Discovery Call Done": "The call happened. Reinforce what was discussed, show you understood their situation, and move toward a proposal. This is where the real conversation begins.",
  "Proposal Sent": "Proposal is out. Handle objections calmly. If they're not financially ready, hold the relationship open \u2014 some come back when they're ready. Never pressure. Never restart the cycle.",
  "Closed": "They are a client. Focus on delivering results, building the relationship, earning referrals and testimonials.",
  "Lost": "Only re-engage if you have a genuinely new angle or they reach out. Never beg or re-pitch the same thing."
};
function stageObjective(status) {
  return STAGE_OBJECTIVES[status] || "Objective not mapped for this stage \u2014 infer the single correct next step from context, and never restart a stage the lead has already passed.";
}
var THINKING_FRAMEWORK = `INTERNAL REASONING PROCESS (work through this silently \u2014 never show these steps, labels, or numbering in your output, only the final answer):
1. UNDERSTAND THE CRM: read the lead's name, company, industry, current stage, assigned specialist, conversation history, internal notes, audit/discovery-call/proposal status, previous follow-ups, last response date, lead value, and existing objections. Never ignore CRM data that exists in the context below.
2. IDENTIFY WHO IS SPEAKING: apply the CONVERSATION RULES above without exception.
3. DETERMINE THE CURRENT OBJECTIVE: every pipeline stage has exactly ONE objective (see the stage objective in the CRM context). Pursue that single objective only.
4. VALIDATE THE PLAN: ask yourself \u2014 is this response moving the lead FORWARD, or accidentally backwards (re-pitching, re-introducing, restarting a stage already passed)? If backwards, stop and form a better plan before writing anything.
5. NEVER INVENT INFORMATION: never assume budget, authority, pain points, goals, or business problems unless they were actually discussed or exist in the CRM context. If information is missing, ask a thoughtful question instead of assuming.
6. WRITE LIKE A REAL CONSULTANT: never sound like AI, never use generic marketing language, hype, or buzzwords. Write like an experienced consultant having a genuine, natural, professional, specific conversation \u2014 grounded in the actual conversation history, not invented details.
Only after all six steps produce the final output the user actually asked for.

FINAL SELF-CHECK before answering: would Alex, the founder of DFQ Labs, personally read this and say "Yes, that's exactly how I would speak to this prospect"? If not, silently rewrite it until it passes \u2014 never show this check in the output.`;
var SYSTEM_PROMPT = `${BUSINESS_CONTEXT}

${REASONING_ENGINE_IDENTITY}

${SPEAKER_RULES}

${THINKING_FRAMEWORK}`;
function stripMarkdown(text) {
  if (!text) return text;
  return text.replace(/#{1,6} ?/g, "").replace(/\*\*(.+?)\*\*/gs, "$1").replace(/\*(.+?)\*/gs, "$1").replace(/_{2}(.+?)_{2}/gs, "$1").replace(/_(.+?)_/gs, "$1").replace(/~~(.+?)~~/gs, "$1").replace(/`{3}[\s\S]*?`{3}/g, "").replace(/`([^`]+)`/g, "$1").replace(/^\s*[-*+] /gm, "").replace(/^\s*\d+\. /gm, "").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").trim();
}
async function runAI(userPrompt, maxTokens = 900) {
  const raw = await callClaude(SYSTEM_PROMPT, userPrompt, maxTokens);
  return stripMarkdown(raw);
}
function formatConversationLog(lead) {
  const parts = [];
  if (lead.dmText) {
    parts.push(`[ALEX (us) \u2014 Initial DM]: ${lead.dmText}`);
  }
  if (lead.prospectInitialResponse) {
    parts.push(`[LEAD \u2014 Initial Reply]: ${lead.prospectInitialResponse}`);
  }
  if (lead.prospectLatestResponse && lead.prospectLatestResponse !== lead.prospectInitialResponse) {
    parts.push(`[LEAD \u2014 Latest Message]: ${lead.prospectLatestResponse}`);
  }
  if (parts.length === 0) return "No conversation yet \u2014 this is the first outbound touch to this lead.";
  return parts.join("\n");
}
function buildSalesIntelligenceContext(lead, research = []) {
  const value = SERVICE_VALUE[lead.service] || 0;
  const score = scoreLead(lead);
  const daysSinceContact = lead.lastContacted ? daysSince(lead.lastContacted) : null;
  const hoursAwaitingReply = lead.awaitingReplySince ? hoursSince(lead.awaitingReplySince) : null;
  const verified = research.filter((r) => r.status === "VERIFIED");
  const inferred = research.filter((r) => r.status === "INFERRED");
  const unknown = research.filter((r) => r.status === "UNKNOWN");
  const researchBlock = research.length > 0 ? `=== PUBLIC RESEARCH STATUS ===
${verified.map((r) => `VERIFIED: ${r.label} \u2014 ${r.detail}${r.source ? ` (${r.source})` : ""}`).join("\n") || "None"}
${inferred.length ? `
INFERRED: ${inferred.map((r) => `${r.label} \u2014 ${r.detail}`).join("; ")}` : ""}
${unknown.length ? `
UNKNOWN: ${unknown.map((r) => `${r.label} \u2014 ${r.detail}`).join("; ")}` : ""}
=== END RESEARCH ===` : "=== PUBLIC RESEARCH STATUS ===\nNo public research was verified in this session. The system is using CRM, conversation, and DFQ Labs knowledge only.\n=== END RESEARCH ===";
  return `=== SALES INTELLIGENCE CONTEXT ===
Lead: ${lead.name || "Unknown"} \u2014 ${lead.company || "Unknown company"}
Client archetype: ${lead.clientType || "Real Estate Developer"}
Service under discussion: ${lead.service} (value ${value ? "\u20A6" + value.toLocaleString() : "unknown"}/mo)
Assigned specialist: ${lead.assignedTo || "Unassigned"}
CRM quality score: ${score}
Days since we last contacted them: ${daysSinceContact ?? "n/a"}
Hours currently awaiting their reply: ${hoursAwaitingReply !== null && !Number.isNaN(hoursAwaitingReply) ? Math.round(hoursAwaitingReply) : "n/a"}
Current pipeline stage: ${lead.status || "New"}
Current objective: ${stageObjective(lead.status || "New")}
Internal notes: ${lead.notes || "none"}

${researchBlock}

=== FACT SAFETY ===
Use VERIFIED facts as the primary basis for any recommendation.
Use INFERRED observations only as clearly labeled hypotheses.
Treat UNKNOWN items as unverified and do not present them as fact.
=== END FACT SAFETY ===
=== END SALES INTELLIGENCE CONTEXT ===`;
}
function buildLeadContext(lead) {
  const value = SERVICE_VALUE[lead.service] || 0;
  const score = scoreLead(lead);
  const daysSinceContact = lead.lastContacted ? daysSince(lead.lastContacted) : null;
  const hoursAwaitingReply = lead.awaitingReplySince ? hoursSince(lead.awaitingReplySince) : null;
  const textAttachments = (lead.attachments || []).filter(
    (a) => (a.mimeType.startsWith("text/") || a.mimeType === "application/json") && a.content
  );
  const binaryAttachments = (lead.attachments || []).filter(
    (a) => !((a.mimeType.startsWith("text/") || a.mimeType === "application/json") && a.content)
  );
  const attachmentBlock = [
    textAttachments.length > 0 ? `=== ATTACHED FILES (readable) ===
` + textAttachments.map((a) => {
      const c = a.content || "";
      return `--- ${a.name} (${a.mimeType}) ---
${c.length > 4e3 ? c.slice(0, 4e3) + "\n[truncated]" : c}`;
    }).join("\n\n") : "",
    binaryAttachments.length > 0 ? `=== ATTACHED FILES (binary \u2014 not readable but on file) ===
` + binaryAttachments.map((a) => `- ${a.name} (${a.mimeType}, ${(a.size / 1024).toFixed(0)} KB)`).join("\n") : ""
  ].filter(Boolean).join("\n\n");
  const intelligenceContext = buildSalesIntelligenceContext(lead);
  return `${intelligenceContext}

=== CRM CONTEXT ===
Lead: ${lead.name || "Unknown"} \u2014 ${lead.company || "Unknown company"}
Client archetype: ${lead.clientType || "Real Estate Developer"}
Service under discussion: ${lead.service} (value ${value ? "\u20A6" + value.toLocaleString() : "unknown"}/mo)
Assigned specialist: ${lead.assignedTo || "Unassigned"}
Days since we last contacted them: ${daysSinceContact ?? "n/a"}
Hours currently awaiting their reply: ${hoursAwaitingReply !== null && !Number.isNaN(hoursAwaitingReply) ? Math.round(hoursAwaitingReply) : "n/a"}
Internal notes: ${lead.notes || "none"}

=== CONVERSATION THREAD ===
${formatConversationLog(lead)}
${attachmentBlock ? "\n" + attachmentBlock + "\n" : ""}=== END CONTEXT ===`;
}
function buildTimeline(lead) {
  const hasReplied = !!(lead.prospectInitialResponse || lead.prospectLatestResponse) || (lead.conversationLog || []).some((l) => l.type === "reply") || !["New", "DM Sent"].includes(lead.status);
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
    { key: "won", label: "Deal closed \u2014 now a client", occurred: lead.status === "Closed" },
    { key: "lost", label: "Lead marked lost", occurred: lead.status === "Lost" }
  ];
}
function formatTimeline(events) {
  return events.map((e) => `${e.occurred ? "\u2713" : "\u2717"} ${e.label}`).join("\n");
}
function neverMentionAgain(events) {
  const has = (k) => events.find((e) => e.key === k)?.occurred;
  const flags = [];
  if (has("auditDelivered")) flags.push("Do not offer or re-explain the audit \u2014 it has already been delivered.");
  if (has("appointmentBooked")) flags.push("Do not ask to book a discovery call again \u2014 one is already booked or has happened.");
  if (has("proposalSent")) flags.push("Do not re-introduce the offer from scratch \u2014 a proposal has already been sent.");
  if (has("outreach") && !has("replied")) flags.push("Do not reintroduce yourself or restate the opening pitch verbatim \u2014 this is a follow-up to an existing outreach.");
  return flags;
}
function buildStrategyPrompt(lead, task, events, neverMention) {
  return `You are the Head of Sales at DFQ Labs. Do NOT write any outward-facing message \u2014 produce ONLY the internal executive reasoning and strategy for this lead. This briefing will be handed to a separate DM Writer module that has no other access to this CRM data, so be precise and complete.

TASK CONTEXT: ${task}

=== VERIFIED TIMELINE (ground truth \u2014 never contradict this) ===
${formatTimeline(events)}
${neverMention.length ? `
NEVER MENTION AGAIN:
${neverMention.map((n) => `- ${n}`).join("\n")}` : ""}

Before answering, silently work through: what has happened, what has NOT happened, the biggest opportunity right now, the biggest risk, what should never be mentioned again, what emotion the prospect is likely feeling based on their actual language, and the single highest-probability next move.

Then output in EXACTLY this format, nothing else:
Current Stage: [the lead's actual current CRM stage]
Next Objective: [the single correct objective for this stage \u2014 never more than one]
Reasoning: [2-3 sentences explaining why this is the correct next action]
Risk: [the biggest concrete risk \u2014 silence, objection, re-pitching something already done, etc.]
Confidence: [percentage]
Emotion: [1 short phrase describing the prospect's likely current emotional state]
KeyFacts: [1-3 short, specific, real facts or quotes from the conversation history below worth grounding the message in, semicolon separated \u2014 never invent facts not present below]

${buildLeadContext(lead)}`;
}
function parseStrategy(raw, neverMention) {
  const grab = (label) => {
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
    neverMention: neverMention.join("; ")
  };
}
async function runStrategyGenerator(lead, task) {
  const events = buildTimeline(lead);
  const neverMention = neverMentionAgain(events);
  const raw = await runAI(buildStrategyPrompt(lead, task, events, neverMention), 800);
  return parseStrategy(raw, neverMention);
}
function buildDMWriterPrompt(lead, strategy, styleInstructions, priorContext) {
  let priorBlock = "";
  if (priorContext) {
    const parts = [];
    if (priorContext.summary) parts.push(`SPECIALIST-CONFIRMED SUMMARY OF PROSPECT'S POSITION:
${priorContext.summary}`);
    if (priorContext.originalDraft) parts.push(`ORIGINAL DRAFT (first attempt \u2014 do not repeat its mistakes):
${priorContext.originalDraft}`);
    if (priorContext.adjustedDraft) parts.push(`QA-ADJUSTED DRAFT (improved version \u2014 build on its strengths, fix remaining issues):
${priorContext.adjustedDraft}`);
    if (parts.length > 0) {
      priorBlock = `
=== IMPROVEMENT CONTEXT (use this to write a BETTER version) ===
${parts.join("\n\n")}
Write an improved draft that takes the strongest elements of the above and fixes any remaining problems. Do NOT repeat phrases verbatim from either draft.
=== END IMPROVEMENT CONTEXT ===
`;
    }
  }
  const conversationThread = formatConversationLog(lead);
  return `You are Alex, writing directly to this prospect. You have the strategy briefing from your sales strategist AND the actual conversation thread below. Write ONLY the outward-facing message. Do not restate, quote, or reference the briefing itself.

=== STRATEGY BRIEFING ===
Lead name: ${lead.name || lead.company || "the prospect"}
Company: ${lead.company || "n/a"}
Client archetype: ${lead.clientType || "Real Estate Developer"}
Current Stage: ${strategy.currentStage || lead.status}
Next Objective (pursue ONLY this): ${strategy.nextObjective || stageObjective(lead.status)}
Reasoning: ${strategy.reasoning || "n/a"}
Prospect's likely emotion: ${strategy.emotion || "n/a"}
Key facts to ground the message in: ${strategy.keyFacts || "none available \u2014 do not invent any"}
${strategy.neverMention ? `Never mention again: ${strategy.neverMention}` : ""}
=== END BRIEFING ===${priorBlock}

=== ACTUAL CONVERSATION THREAD (ground your message in this \u2014 never invent facts not present here) ===
${conversationThread}
=== END CONVERSATION ===

${styleInstructions}`;
}
function validateValueDM(message) {
  const text = message.replace(/\s+/g, " ").trim();
  if (!text) return { pass: false, reason: "empty value DM" };
  const noCtaPatterns = [
    /would you like/i,
    /let me know if/i,
    /could we/i,
    /book a call/i,
    /schedule a call/i,
    /reply if/i,
    /send me a message/i,
    /drop me a message/i,
    /visit .*website/i,
    /check out .*website/i,
    /i can help you/i,
    /would love to/i,
    /interested in/i,
    /let's talk/i,
    /happy to chat/i
  ];
  const hit = noCtaPatterns.find((pattern) => pattern.test(text));
  if (hit) {
    return { pass: false, reason: "value DM contains a call-to-action or sales ask" };
  }
  const salesyPatterns = [
    /we help .*real estate/i,
    /our service/i,
    /we specialize in/i,
    /we can help you grow/i,
    /book a free consult/i,
    /let's discuss/i
  ];
  if (salesyPatterns.some((pattern) => pattern.test(text))) {
    return { pass: false, reason: "value DM reads like a sales pitch" };
  }
  return { pass: true, reason: "" };
}
async function runQualityChecker(message, strategy) {
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
  const verdict = await runAI(prompt, 200);
  const fail = /^FAIL/i.test(verdict.trim());
  if (!fail && /value/i.test((strategy.nextObjective || "").toLowerCase()) || /value/i.test((strategy.currentStage || "").toLowerCase())) {
    const valueCheck = validateValueDM(message);
    if (!valueCheck.pass) {
      return { pass: false, reason: valueCheck.reason };
    }
  }
  return { pass: !fail, reason: fail ? verdict.replace(/^FAIL:?\s*/i, "").trim() : "" };
}
async function runSalesPipeline(lead, task, styleInstructions, maxTokens = 900, priorContext) {
  const strategy = await runStrategyGenerator(lead, task);
  const draft = (fix) => runAI(
    buildDMWriterPrompt(lead, strategy, fix ? `${styleInstructions}

IMPORTANT FIX (a quality check flagged the previous draft): ${fix}` : styleInstructions, priorContext),
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
  return `${message}

---STRATEGY---
${strategyBlock}`;
}

// lib/attachments.ts
function stripAttachmentContent(lead) {
  if (!lead || !Array.isArray(lead.attachments) || lead.attachments.length === 0) return lead;
  const cleaned = lead.attachments.map((a) => {
    if (a && typeof a === "object" && "content" in a) {
      const { content: _c, ...meta } = a;
      return meta;
    }
    return a;
  });
  return { ...lead, attachments: cleaned };
}

// lib/imports.ts
function describeDbError(error) {
  if (!error || typeof error !== "object") return { message: "Unknown database error." };
  const details = {
    code: typeof error.code === "string" ? error.code : void 0,
    message: typeof error.message === "string" ? error.message : void 0,
    detail: typeof error.detail === "string" ? error.detail : void 0,
    hint: typeof error.hint === "string" ? error.hint : void 0,
    constraint: typeof error.constraint === "string" ? error.constraint : void 0,
    column: typeof error.column === "string" ? error.column : void 0,
    table: typeof error.table === "string" ? error.table : void 0
  };
  const sanitized = Object.fromEntries(
    Object.entries(details).filter(([, value]) => typeof value === "string" && value.trim().length > 0)
  );
  return Object.keys(sanitized).length > 0 ? sanitized : { message: "Unknown database error." };
}
async function runSnapshotReplaceTransaction(pool, validLeads) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM leads");
    if (validLeads.length > 0) {
      const values = validLeads.map((_, i) => `($${i * 2 + 1}, $${i * 2 + 2}::jsonb, NOW())`).join(", ");
      const params = validLeads.flatMap((lead) => [String(lead.id), JSON.stringify(lead)]);
      await client.query(`INSERT INTO leads (id, data, updated_at) VALUES ${values}`, params);
    }
    const incomingIds = validLeads.map((lead) => String(lead.id));
    if (incomingIds.length > 0) {
      await client.query("DELETE FROM lead_attachments WHERE lead_id != ALL($1::text[])", [incomingIds]);
    } else {
      await client.query("DELETE FROM lead_attachments");
    }
    await client.query("COMMIT");
    return {
      count: validLeads.length,
      importedIds: incomingIds,
      finalDatabaseCount: validLeads.length
    };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {
    });
    throw error;
  } finally {
    client.release();
  }
}
function normalizeText(value) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}
function hasRequiredImportedName(raw) {
  return !!raw && typeof raw === "object" && !Array.isArray(raw) && normalizeText(raw.name).length > 0;
}
function deriveCompanyFromContactName(value) {
  const match = normalizeText(value).match(/^team\s+at\s+(.+)$/i);
  return match ? normalizeText(match[1]) : "";
}
function sdbHash(value) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    const byte = value.charCodeAt(i);
    hash ^= byte;
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
function normalizeImportedLead(raw, index) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("expected an object");
  }
  const base = { ...raw };
  const name = normalizeText(base.name) || `Lead ${index + 1}`;
  const company = normalizeText(base.company) || deriveCompanyFromContactName(base.name) || "Unknown Company";
  const idSeed = [base.id, base.name, base.company, base.phone, base.email, base.instagram, base.whatsapp].filter(Boolean).join("|");
  const generatedId = idSeed ? `imp-${sdbHash(idSeed)}` : `imp-${Date.now()}-${index}`;
  const lead = {
    ...base,
    id: normalizeText(base.id) || generatedId,
    name,
    company,
    source: normalizeText(base.source) || "Imported",
    clientType: normalizeText(base.clientType) || "Real Estate",
    service: normalizeText(base.service) || "Lead Generation",
    status: normalizeText(base.status) || "New",
    priority: normalizeText(base.priority) || "Medium",
    assignedTo: normalizeText(base.assignedTo) || "Unassigned",
    notes: normalizeText(base.notes) || "",
    dmText: normalizeText(base.dmText) || "",
    prospectInitialResponse: normalizeText(base.prospectInitialResponse) || "",
    prospectLatestResponse: normalizeText(base.prospectLatestResponse) || "",
    nextAction: normalizeText(base.nextAction) || "",
    nextActionDate: normalizeText(base.nextActionDate) || "",
    dateAdded: normalizeText(base.dateAdded) || (/* @__PURE__ */ new Date()).toISOString(),
    lastContacted: normalizeText(base.lastContacted) || "",
    lastMeaningfulTouchpoint: normalizeText(base.lastMeaningfulTouchpoint) || normalizeText(base.lastContacted) || normalizeText(base.dateAdded) || "",
    awaitingReplySince: normalizeText(base.awaitingReplySince) || "",
    meetingScheduledAt: normalizeText(base.meetingScheduledAt) || "",
    meetingPrepNote: normalizeText(base.meetingPrepNote) || "",
    followUpCount: Number.isFinite(Number(base.followUpCount)) ? Number(base.followUpCount) : 0,
    weekAdded: normalizeText(base.weekAdded) || (/* @__PURE__ */ new Date()).toISOString().slice(0, 10),
    completedFollowUps: Array.isArray(base.completedFollowUps) ? base.completedFollowUps : [],
    betaCandidate: Boolean(base.betaCandidate),
    autoFollowUpDate: base.autoFollowUpDate || null,
    autoFollowUpReason: normalizeText(base.autoFollowUpReason) || "",
    aiBucket: normalizeText(base.aiBucket) || void 0,
    aiReason: normalizeText(base.aiReason) || void 0,
    aiNextAction: normalizeText(base.aiNextAction) || void 0,
    aiClassifiedAt: normalizeText(base.aiClassifiedAt) || void 0,
    mergedInto: normalizeText(base.mergedInto) || void 0,
    mergedFrom: Array.isArray(base.mergedFrom) ? base.mergedFrom : void 0,
    auditLog: Array.isArray(base.auditLog) ? base.auditLog : [],
    attachments: Array.isArray(base.attachments) ? base.attachments.map((att) => {
      if (!att || typeof att !== "object") return att;
      const { content: _content, ...meta } = att;
      return meta;
    }) : [],
    outboundMessages: Array.isArray(base.outboundMessages) ? base.outboundMessages : [],
    conversationLog: Array.isArray(base.conversationLog) ? base.conversationLog : []
  };
  return lead;
}
function summarizeImportBatch(rawLeads, existingIds) {
  const validById = /* @__PURE__ */ new Map();
  const duplicates = [];
  const rejected = [];
  let newCount = 0;
  let updatedCount = 0;
  rawLeads.forEach((lead, index) => {
    if (!lead || typeof lead !== "object" || Array.isArray(lead)) {
      rejected.push({ index, reason: "expected an object" });
      return;
    }
    const idSeed = [lead.id, lead.name, lead.company, lead.phone, lead.email, lead.instagram, lead.whatsapp].filter((value) => typeof value === "string" && value.trim().length > 0).join("|");
    const normalizedId = normalizeText(lead.id) || (idSeed ? `imp-${sdbHash(idSeed)}` : void 0);
    const id = normalizedId || `imp-${Date.now()}-${index}`;
    if (!hasRequiredImportedName(lead)) {
      rejected.push({ index, id, reason: "missing required name" });
      return;
    }
    let normalized;
    try {
      normalized = normalizeImportedLead(lead, index);
    } catch (error) {
      rejected.push({ index, id, reason: error?.message || "invalid record" });
      return;
    }
    const existingEntry = validById.get(normalized.id);
    if (existingEntry) {
      duplicates.push({ id: normalized.id, reason: "duplicate within source file; latest row wins" });
    }
    validById.set(normalized.id, normalized);
  });
  const valid = Array.from(validById.values());
  valid.forEach((lead) => {
    if (existingIds.has(lead.id)) {
      updatedCount += 1;
    } else {
      newCount += 1;
    }
  });
  const validCount = valid.length;
  const rejectedCount = rejected.length;
  const duplicateSourceCount = duplicates.length;
  const failedCount = rejectedCount + duplicateSourceCount;
  const finalDatabaseCount = existingIds.size + newCount;
  return {
    sourceCount: rawLeads.length,
    validCount,
    rejectedCount,
    duplicateSourceCount,
    newCount,
    updatedCount,
    failedCount,
    finalDatabaseCount,
    valid,
    importable: valid,
    duplicates,
    rejected
  };
}
function summarizeSnapshotImport(rawLeads) {
  const validById = /* @__PURE__ */ new Map();
  const duplicates = [];
  const rejected = [];
  rawLeads.forEach((lead, index) => {
    if (!lead || typeof lead !== "object" || Array.isArray(lead)) {
      rejected.push({ index, reason: "expected an object" });
      return;
    }
    const idSeed = [lead.id, lead.name, lead.company, lead.phone, lead.email, lead.instagram, lead.whatsapp].filter((value) => typeof value === "string" && value.trim().length > 0).join("|");
    const normalizedId = normalizeText(lead.id) || (idSeed ? `imp-${sdbHash(idSeed)}` : void 0);
    const id = normalizedId || `imp-${Date.now()}-${index}`;
    if (!hasRequiredImportedName(lead)) {
      rejected.push({ index, id, reason: "missing required name" });
      return;
    }
    let normalized;
    try {
      normalized = normalizeImportedLead(lead, index);
    } catch (error) {
      rejected.push({ index, id, reason: error?.message || "invalid record" });
      return;
    }
    if (validById.has(normalized.id)) {
      duplicates.push({ id: normalized.id, reason: "duplicate within source file; latest row wins" });
    }
    validById.set(normalized.id, normalized);
  });
  const valid = Array.from(validById.values());
  const validCount = valid.length;
  const rejectedCount = rejected.length;
  const duplicateSourceCount = duplicates.length;
  const failedCount = rejectedCount + duplicateSourceCount;
  const finalDatabaseCount = validCount;
  const canReplace = validCount > 0;
  return {
    sourceCount: rawLeads.length,
    validCount,
    rejectedCount,
    duplicateSourceCount,
    newCount: validCount,
    updatedCount: 0,
    failedCount,
    finalDatabaseCount,
    valid,
    importable: valid,
    duplicates,
    rejected,
    replaceMode: true,
    canReplace
  };
}

// server.ts
import_dotenv.default.config();
var app = (0, import_express.default)();
var db = new import_pg.Pool({ connectionString: process.env.DATABASE_URL });
async function initializeDatabase() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL environment variable is not configured. Cannot connect to PostgreSQL.");
  }
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS leads (
        id TEXT PRIMARY KEY,
        data JSONB NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log("\u2713 leads table initialized");
  } catch (err) {
    throw new Error(`Failed to create leads table: ${err}`);
  }
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS knowledge_sources (
        id TEXT PRIMARY KEY,
        data JSONB NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log("\u2713 knowledge_sources table initialized");
  } catch (err) {
    throw new Error(`Failed to create knowledge_sources table: ${err}`);
  }
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS lead_attachments (
        id TEXT PRIMARY KEY,
        lead_id TEXT NOT NULL,
        data JSONB NOT NULL,
        uploaded_at TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log("\u2713 lead_attachments table initialized");
  } catch (err) {
    throw new Error(`Failed to create lead_attachments table: ${err}`);
  }
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
          JSON.stringify(stripped),
          lead.id
        ]);
      }
    }
    if (rows.length > 0) {
      console.log(`\u2713 Attachment migration processed ${rows.length} lead(s)`);
    } else {
      console.log(`\u2713 Attachment migration complete (no attachments to migrate)`);
    }
  } catch (err) {
    throw new Error(`Attachment migration error: ${err}`);
  }
  console.log("\u2713 Database initialization successful");
}
var PORT = process.env.PORT ? parseInt(process.env.PORT) : 5e3;
var GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.1-flash-lite";
function getGeminiApiKey() {
  const value = process.env.GEMINI_API_KEY?.trim();
  return value || void 0;
}
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
  const apiKey = getGeminiApiKey();
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
  if (!getGeminiApiKey()) {
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
    recentErrors: aiHealth.recentErrors
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
  } catch (error) {
    console.error("Gemini /api/call-gemini error:", error);
    recordFailure(activeModel, error?.message || String(error));
    res.status(500).json({ error: friendlyError(error) });
  }
});
app.post("/api/infer-status", async (req, res) => {
  res.setHeader("Content-Type", "application/json");
  const { currentStatus, dmText, prospectInitialResponse, prospectLatestResponse, notes, name, company } = req.body || {};
  if (!getGeminiApiKey()) {
    res.status(500).json({ error: "GEMINI_API_KEY is not configured on the server." });
    return;
  }
  const VALID_STATUSES = ["New", "DM Sent", "Replied", "Audit Requested", "Audit Delivered", "Discovery Call Booked", "Discovery Call Done", "Proposal Sent", "Closed", "Lost"];
  const STAGE_ORDER = { "New": 0, "DM Sent": 1, "Replied": 2, "Audit Requested": 3, "Audit Delivered": 4, "Discovery Call Booked": 5, "Discovery Call Done": 6, "Proposal Sent": 7, "Closed": 8, "Lost": 9 };
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
  const convo = [];
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
    const inferred = VALID_STATUSES.find((s) => raw.trim().toLowerCase().includes(s.toLowerCase())) || currentStatus;
    const currentOrder = STAGE_ORDER[currentStatus] ?? 0;
    const inferredOrder = STAGE_ORDER[inferred] ?? 0;
    const changed = inferred !== currentStatus && (inferredOrder > currentOrder || inferred === "Lost");
    res.json({ status: changed ? inferred : currentStatus, changed });
  } catch (error) {
    console.error("Gemini /api/infer-status error:", error);
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
  if (!getGeminiApiKey()) {
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
async function enrichLeadAttachments(lead) {
  const atts = lead?.attachments;
  if (!Array.isArray(atts) || atts.length === 0) return lead;
  const ids = atts.map((a) => a?.id).filter(Boolean);
  if (ids.length === 0) return lead;
  try {
    const result = await db.query(
      "SELECT id, data FROM lead_attachments WHERE id = ANY($1::text[])",
      [ids]
    );
    const byId = new Map(result.rows.map((r) => [r.id, r.data?.content ?? ""]));
    return {
      ...lead,
      attachments: atts.map((a) => ({ ...a, content: byId.get(a.id) ?? a.content ?? "" }))
    };
  } catch (err) {
    console.error("enrichLeadAttachments error:", err);
    return lead;
  }
}
async function retrieveKnowledgeForLead(lead, messageType) {
  try {
    const result = await db.query("SELECT data FROM knowledge_sources");
    const sources = result.rows.map((r) => r.data).filter((s) => s.enabled !== false && s.status === "ready" && s.content);
    if (sources.length === 0) return [];
    const contextText = [
      lead.clientType,
      lead.service,
      lead.company,
      lead.notes,
      lead.dmText,
      lead.prospectInitialResponse,
      lead.prospectLatestResponse,
      lead.aiBucket,
      lead.status,
      lead.nextAction
    ].filter(Boolean).join(" ").toLowerCase();
    const domainKeywords = [
      "buyer",
      "psychology",
      "content",
      "strategy",
      "trust",
      "developer",
      "marketing",
      "lead generation",
      "real estate",
      "positioning",
      "conversion",
      "audit",
      "outbound",
      "whatsapp",
      "nurture",
      "reactivation",
      "objection",
      "pricing",
      "closing",
      "off-plan",
      "realtor",
      "agency",
      "construction",
      "architecture",
      "funnel",
      "follow-up",
      "value",
      "insight",
      "buyer inquiry",
      "brand",
      "positioning gap"
    ];
    const typeKeywords = {
      VALUE_DM: ["value", "insight", "buyer psychology", "content strategy", "trust", "education"],
      SALES_DM: ["outreach", "positioning", "hook", "audit", "conversion"],
      FOLLOW_UP: ["follow-up", "nurture", "trust", "objection"],
      REACTIVATION_DM: ["reactivation", "re-engagement", "nurture"],
      NURTURE_DM: ["nurture", "value", "trust", "education"],
      INTRODUCTION_DM: ["outreach", "positioning", "hook", "first touch"],
      RESPONSE_DM: ["objection", "trust", "response", "conversion"]
    };
    const typeKw = typeKeywords[messageType] || [];
    const scored = sources.map((s) => {
      const contentLower = (s.content || "").toLowerCase();
      const titleLower = (s.title || "").toLowerCase();
      let score = 0;
      const matched = [];
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
      const titleWords = (s.title || "").toLowerCase().split(/\s+/).filter((w) => w.length > 4);
      for (const w of titleWords) {
        if (contextText.includes(w)) score += 1;
      }
      return { source: s, score, matched };
    }).filter((x) => x.score > 0).sort((a, b) => b.score - a.score).slice(0, 3);
    return scored.map((x) => {
      const content = x.source.content;
      const snippet = content.length > 1200 ? content.slice(0, 1200) + "\n[...]" : content;
      return { title: x.source.title, snippet };
    });
  } catch (err) {
    console.error("retrieveKnowledgeForLead error:", err);
    return [];
  }
}
app.post("/api/value-dm", async (req, res) => {
  res.setHeader("Content-Type", "application/json");
  const { lead, task, messageType } = req.body || {};
  if (!lead) {
    res.status(400).json({ error: "lead is required" });
    return;
  }
  const type = messageType || "VALUE_DM";
  const leadWithAttachments = await enrichLeadAttachments(lead);
  const knowledge = await retrieveKnowledgeForLead(leadWithAttachments, type);
  const knowledgeBlock = knowledge.length > 0 ? `

=== RELEVANT DFQ LABS KNOWLEDGE (use only what is genuinely relevant \u2014 do not force unrelated material) ===
${knowledge.map((k) => `--- ${k.title} ---
${k.snippet}`).join("\n\n")}
=== END KNOWLEDGE ===` : "";
  let styleInstructions;
  let pipelineTask;
  if (type === "VALUE_DM") {
    styleInstructions = `You are Alex from DFQ Labs writing directly to ${lead.name || "this prospect"} at ${lead.company || "their company"} (${lead.clientType || "Real Estate"}).

This is a VALUE_DM. ${`A VALUE_DM is a short message whose sole objective is to provide genuinely useful, immediately applicable insight WITHOUT asking for a sale, call, meeting, reply, registration, consultation, beta participation, purchase, or any other conversion action.`}

ABSOLUTE PROHIBITIONS \u2014 the message must NOT:
- Sell, pitch, or ask for a call, meeting, reply, booking, registration, beta join, purchase, follow, or website visit.
- Mention DFQ Labs services unless genuinely necessary for the insight itself.
- Manufacture urgency or manufacture a problem.
- Continue a sales sequence disguised as value.
- End with "let me know if...", "would you like me to...", "I can help you...", or ANY call-to-action.
- Attempt to continue the interaction in any way.

The objective is simply: leave the prospect better off than they were before receiving the message.

STRUCTURE: Problem \u2192 Insight \u2192 Specific action. Include ONE specific, concrete observation grounded in their industry and what they are likely struggling with. Avoid generic advice ("post consistently", "know your audience", "use better hooks", "build trust") unless you explain a specific implementation that makes it actionable.

QUALITY CHECK (run silently before finalizing \u2014 regenerate internally if any answer is NO):
1. Is this genuinely useful? 2. Specific to this prospect? 3. Could they implement something today? 4. Supported by context/knowledge? 5. Avoids selling? 6. Avoids asking for anything? 7. Concrete insight not generic? 8. Valuable even if they never become a client? 9. Short enough for WhatsApp? 10. Sounds like a knowledgeable human?

FORMAT: 3-4 sentences maximum. Zero emojis. Zero exclamation marks. Zero buzzwords. Plain WhatsApp-friendly text \u2014 no markdown, no bullet points. NO call-to-action. NO next step. The message simply ends after delivering the insight.

FORBIDDEN words: "I hope", "I trust", "excited to", "leverage", "synergy", "holistic", "elevate", "game-changer", "value-add", "reach out", "touch base", "circle back", "let me know", "would you like", "I can help".

Output ONLY the actual message. No labels. No quotes. No explanation. No strategy in the message.`;
    pipelineTask = "Generate a VALUE_DM: one specific, genuinely useful, immediately actionable insight for this prospect. No selling. No CTA. No ask. Just value.";
  } else {
    const typeRules = {
      SALES_DM: "A sales outreach DM. Pursue exactly one pipeline-stage objective. One low-friction ask. Reference something specific. 2-4 sentences.",
      FOLLOW_UP: "A follow-up in an active conversation. Pick up where the last exchange left off. One objective. 2-4 sentences.",
      REACTIVATION_DM: "A re-engagement for a cold lead. New angle, no guilt-trip, no re-pitch. 2-3 sentences.",
      NURTURE_DM: "A nurture message. Provide value without asking for anything (VALUE_DM-style, no CTA) unless a sales step is clearly warranted. 3-4 sentences.",
      INTRODUCTION_DM: "A first-touch cold outreach DM. Hook on a positioning gap. Ask only for permission to send a breakdown. No pitching. 2-3 sentences.",
      RESPONSE_DM: "A reply to a prospect who just messaged. Continue the dialog. One objective. 2-3 sentences."
    };
    styleInstructions = `You are Alex from DFQ Labs writing directly to ${lead.name || "this prospect"} at ${lead.company || "their company"} (${lead.clientType || "Real Estate"}).

Message type: ${type}. ${typeRules[type] || typeRules.SALES_DM}

FORMAT: Zero emojis. Zero exclamation marks. Zero buzzwords. Plain WhatsApp-friendly text. Output ONLY the actual message. No labels. No explanation.

FORBIDDEN words: "I hope", "I trust", "excited to", "leverage", "synergy", "holistic", "elevate", "game-changer", "value-add", "reach out", "touch base", "circle back".`;
    pipelineTask = task || `Generate a ${type} for this prospect following the message-type rules above.`;
  }
  const recentLogs = (lead.conversationLog || []).slice(-5).filter((l) => l.type === "dm" || l.type === "reply");
  const repetitionNote = recentLogs.length >= 3 ? `

REPETITION CHECK: The last ${recentLogs.length} messages are provided in the conversation thread. If they already discuss the same topic, introduce a genuinely NEW angle or recommend changing the follow-up strategy. Do not generate a variation of the same message.` : "";
  try {
    const fullTask = pipelineTask + knowledgeBlock + repetitionNote;
    const result = await runSalesPipeline(leadWithAttachments, fullTask, styleInstructions, 600);
    const sepIdx = result.indexOf("---STRATEGY---");
    const message = sepIdx !== -1 ? result.slice(0, sepIdx).trim() : result.trim();
    const strategy = sepIdx !== -1 ? result.slice(sepIdx + "---STRATEGY---".length).trim() : "";
    res.json({
      text: message,
      strategy,
      messageType: type,
      knowledgeUsed: knowledge.map((k) => k.title)
    });
  } catch (err) {
    console.error("POST /api/value-dm error:", err);
    res.status(500).json({ error: err.message });
  }
});
app.get("/api/knowledge", async (_req, res) => {
  try {
    const result = await db.query("SELECT data FROM knowledge_sources ORDER BY created_at DESC");
    res.json({ sources: result.rows.map((r) => r.data) });
  } catch (err) {
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
  } catch (err) {
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
  } catch (err) {
    console.error("DELETE /api/knowledge:", err);
    res.status(500).json({ error: "Failed to delete knowledge source." });
  }
});
app.post("/api/knowledge/fetch-url", async (req, res) => {
  const { url } = req.body || {};
  if (!url) return res.status(400).json({ error: "url is required." });
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (DFQLabs-Knowledge-Bot)" },
      signal: AbortSignal.timeout(15e3)
    });
    if (!response.ok) return res.status(502).json({ error: `Fetch failed: HTTP ${response.status}` });
    const html = await response.text();
    const text = html.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ").trim().slice(0, 5e4);
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    res.json({ text, title: titleMatch ? titleMatch[1].trim() : url });
  } catch (err) {
    res.status(500).json({ error: "Could not fetch URL: " + (err.message || "unknown error") });
  }
});
app.get("/api/attachments/:id", async (req, res) => {
  try {
    const result = await db.query("SELECT data FROM lead_attachments WHERE id = $1", [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: "Attachment not found." });
    res.json({ attachment: result.rows[0].data });
  } catch (err) {
    console.error("GET /api/attachments:", err);
    res.status(500).json({ error: "Failed to load attachment." });
  }
});
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
  } catch (err) {
    console.error("POST /api/attachments:", err);
    res.status(500).json({ error: "Failed to save attachment." });
  }
});
app.delete("/api/attachments/:id", async (req, res) => {
  try {
    await db.query("DELETE FROM lead_attachments WHERE id = $1", [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error("DELETE /api/attachments:", err);
    res.status(500).json({ error: "Failed to delete attachment." });
  }
});
app.get("/api/leads", async (_req, res) => {
  try {
    const result = await db.query("SELECT data FROM leads ORDER BY updated_at ASC");
    res.json({ leads: result.rows.map((r) => stripAttachmentContent(r.data)) });
  } catch (err) {
    console.error("GET /api/leads:", err);
    res.status(500).json({ error: "Failed to load leads." });
  }
});
app.post("/api/leads", async (req, res) => {
  const body = req.body || {};
  if (Array.isArray(body.leads)) {
    const rawLeads = Array.isArray(body.leads) ? body.leads : [];
    const isSnapshot = body.snapshot === true || body.replace === true || body.mode === "snapshot";
    if (isSnapshot) {
      const summary2 = summarizeSnapshotImport(rawLeads);
      const valid2 = summary2.valid.map((lead2) => stripAttachmentContent(lead2));
      if (!summary2.canReplace || valid2.length === 0) {
        return res.status(400).json({
          ok: false,
          error: "Snapshot replacement requires at least one valid lead.",
          sourceCount: summary2.sourceCount,
          validCount: summary2.validCount,
          rejectedCount: summary2.rejectedCount,
          duplicateSourceCount: summary2.duplicateSourceCount,
          duplicates: summary2.duplicates,
          rejected: summary2.rejected,
          finalDatabaseCount: 0
        });
      }
      try {
        const transactionResult = await runSnapshotReplaceTransaction(db, valid2);
        return res.json({
          ok: true,
          count: transactionResult.count,
          importedIds: transactionResult.importedIds,
          duplicates: summary2.duplicates,
          rejected: summary2.rejected,
          sourceCount: summary2.sourceCount,
          validCount: summary2.validCount,
          rejectedCount: summary2.rejectedCount,
          duplicateSourceCount: summary2.duplicateSourceCount,
          duplicateCount: summary2.duplicateSourceCount,
          newCount: summary2.newCount,
          updatedCount: summary2.updatedCount,
          failedCount: summary2.failedCount,
          finalDatabaseCount: transactionResult.finalDatabaseCount
        });
      } catch (err) {
        const safeDetails = describeDbError(err);
        console.error("POST /api/leads snapshot replace error:", safeDetails);
        return res.status(500).json({
          ok: false,
          error: "Snapshot replacement failed and was rolled back.",
          details: safeDetails
        });
      }
    }
    const currentIds = new Set((await db.query("SELECT id FROM leads")).rows.map((r) => String(r.id)));
    const summary = summarizeImportBatch(rawLeads, currentIds);
    const valid = summary.valid.map((lead2) => stripAttachmentContent(lead2));
    const {
      duplicates,
      rejected,
      sourceCount,
      validCount,
      rejectedCount,
      duplicateSourceCount,
      failedCount,
      finalDatabaseCount,
      newCount,
      updatedCount
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
        finalDatabaseCount: currentIds.size
      });
    }
    try {
      const values = valid.map((_, i) => `($${i * 2 + 1}, $${i * 2 + 2}::jsonb, NOW())`).join(", ");
      const params = valid.flatMap((l) => [String(l.id), JSON.stringify(l)]);
      const query = `INSERT INTO leads (id, data, updated_at) VALUES ${values}
        ON CONFLICT (id) DO UPDATE SET
        data = EXCLUDED.data,
        updated_at = NOW() RETURNING id`;
      const result = await db.query(query, params);
      const importedIds = result.rows.map((row) => row.id);
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
        finalDatabaseCount
      });
    } catch (err) {
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
(async () => {
  try {
    await initializeDatabase();
    await startServer();
  } catch (err) {
    console.error("\u2717 Failed to start application:", err);
    process.exit(1);
  }
})();
//# sourceMappingURL=server.cjs.map
