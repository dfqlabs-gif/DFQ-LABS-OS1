var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
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
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// server.ts
var server_exports = {};
__export(server_exports, {
  callGemini: () => callGemini
});
module.exports = __toCommonJS(server_exports);
var import_express = __toESM(require("express"), 1);
var import_path = __toESM(require("path"), 1);
var import_dotenv = __toESM(require("dotenv"), 1);
var import_vite = require("vite");
var import_genai = require("@google/genai");
var import_pg = require("pg");
var import_crypto = require("crypto");

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
var addDays = (n) => {
  const d = /* @__PURE__ */ new Date();
  const tz = d.getTimezoneOffset() * 6e4;
  const local = new Date(d.getTime() - tz);
  local.setDate(local.getDate() + n);
  return local.toISOString().split("T")[0];
};
var nowISO = () => (/* @__PURE__ */ new Date()).toISOString();
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
- Never confuse who said what. Ground every claim strictly in the CRM context and conversation history you are given \u2014 never invent facts about the lead.
- FACTUAL GROUNDING MANDATE: Use ONLY facts explicitly provided in the prospect context. Never invent specific projects, developments, transactions, or locations (e.g. "your project in Guzape", "listing in Maitama") unless strictly present in the raw lead notes/data.`;
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
function formatConversationLog(lead) {
  const parts = [];
  if (lead.dmText) parts.push(`=== ORIGINAL YOUR DM ===
${lead.dmText}`);
  if (lead.prospectInitialResponse) parts.push(`=== THEIR INITIAL RESPONSE ===
${lead.prospectInitialResponse}`);
  const anchorTexts = new Set([lead.dmText, lead.prospectInitialResponse].filter(Boolean));
  const recordedMessages = (lead.conversationLog || []).filter((entry) => entry.type === "dm" || entry.type === "reply").filter((entry) => !anchorTexts.has(entry.text)).sort((a, b) => a.ts.localeCompare(b.ts)).slice(-60).map((entry) => `[${entry.ts} \u2014 ${entry.direction || (entry.type === "reply" ? "inbound / LEAD" : "outbound / DFQ LABS")} \u2014 ${entry.label || "Recorded message"}]: ${entry.text}`);
  if (recordedMessages.length > 0) {
    parts.push(`=== LATEST THREAD: SUBSEQUENT MESSAGES (oldest to newest) ===
${recordedMessages.join("\n")}`);
  } else if (!lead.prospectInitialResponse && lead.prospectLatestResponse) {
    parts.push(`=== LATEST THREAD: LEGACY MESSAGE ===
${lead.prospectLatestResponse}`);
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
Lead ID: ${lead.id}
Contact name: ${lead.name || "Unknown"}
Company: ${lead.company || "Unknown company"}
Phone: ${lead.phone || "not recorded"}
WhatsApp: ${lead.whatsapp || "not recorded"}
Instagram: ${lead.instagram || "not recorded"}
Email: ${lead.email || "not recorded"}
Client archetype: ${lead.clientType || "Real Estate Developer"}
Service under discussion: ${lead.service} (value ${value ? "\u20A6" + value.toLocaleString() : "unknown"}/mo)
Assigned specialist: ${lead.assignedTo || "Unassigned"}
Lead source: ${lead.source || "not recorded"}
Priority: ${lead.priority || "not recorded"}
Meeting scheduled: ${lead.meetingScheduledAt || "none"}
Meeting preparation: ${lead.meetingPrepNote || "none"}
Last meaningful touchpoint: ${lead.lastMeaningfulTouchpoint || "none"}
Beta candidate: ${lead.betaCandidate ? "yes" : "no"}
AI classification: ${lead.aiBucket || "unclassified"}${lead.aiReason ? ` \u2014 ${lead.aiReason}` : ""}
AI next action / schedule: ${lead.aiNextAction || lead.autoFollowUpReason || "none"}${lead.autoFollowUpDate ? ` (date: ${lead.autoFollowUpDate})` : ""}
Days since we last contacted them: ${daysSinceContact ?? "n/a"}
Hours currently awaiting their reply: ${hoursAwaitingReply !== null && !Number.isNaN(hoursAwaitingReply) ? Math.round(hoursAwaitingReply) : "n/a"}
Internal notes: ${lead.notes || "none"}

=== CONVERSATION THREAD ===
${formatConversationLog(lead)}
=== PREVIOUS OUTBOUND RECORDS ===
${(lead.outboundMessages || []).length ? lead.outboundMessages.map((message) => `[${message.status}] ${message.sentAt || message.generatedAt} \u2014 ${message.messageType} via ${message.source}: ${message.messageText}`).join("\n") : "No persisted outbound records."}
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

// lib/messageTypes.ts
var ALL_MESSAGE_TYPES = [
  "VALUE_DM",
  "SALES_DM",
  "FOLLOW_UP",
  "REACTIVATION_DM",
  "NURTURE_DM",
  "INTRODUCTION_DM",
  "RESPONSE_DM"
];
var VALUE_DM_DEFINITION = `A VALUE_DM is a short message whose sole objective is to provide genuinely useful, immediately applicable insight to the recipient WITHOUT asking for a sale, call, meeting, registration, reply, consultation, beta participation, purchase, or any other conversion action.`;
var VALUE_DM_PROHIBITIONS = `ABSOLUTE PROHIBITIONS \u2014 a VALUE_DM must NOT:
- Sell, pitch, or ask for a call, meeting, reply, booking, registration, beta join, purchase, follow, or website visit.
- Mention DFQ Labs services unless genuinely necessary for the insight itself.
- Manufacture urgency or manufacture a problem.
- Continue a sales sequence disguised as value.
- End with "let me know if...", "would you like me to...", "I can help you...", or ANY call-to-action.
- Attempt to continue the interaction in any way.

The objective is simply: leave the prospect better off than they were before receiving the message.`;
var VALUE_DM_QUALITY_CHECK = `Before finalizing, silently evaluate against these questions and regenerate internally if any answer is NO:
1. Is this genuinely useful?
2. Is this specific to this prospect?
3. Could this prospect implement something from this message today?
4. Is the advice supported by the prospect's context or relevant knowledge?
5. Does it avoid selling?
6. Does it avoid asking for anything?
7. Does it contain a concrete insight rather than generic advice?
8. Would the message still be valuable if the prospect never became a DFQ Labs client?
9. Is it short enough to naturally send through WhatsApp?
10. Does it sound like a knowledgeable human rather than an AI?`;
var MESSAGE_TYPE_RULES = {
  VALUE_DM: `${VALUE_DM_DEFINITION}

${VALUE_DM_PROHIBITIONS}

Structure: Problem \u2192 Insight \u2192 Specific action. Avoid generic advice ("post consistently", "know your audience", "use better hooks", "build trust") unless the message explains a specific implementation that makes the advice actionable. Prefer one specific, actionable insight the prospect could implement today.

${VALUE_DM_QUALITY_CHECK}

Output ONLY the actual message. 3-4 sentences max. No emojis. No exclamation marks. No markdown. Plain WhatsApp-friendly text.`,
  SALES_DM: `A sales outreach DM. Pursue exactly one pipeline-stage objective (provided in the briefing). One low-friction ask per message. Reference something specific to this prospect. 2-4 sentences. No emojis, no buzzwords. Output ONLY the message.`,
  FOLLOW_UP: `A follow-up in an active conversation. Pick up exactly where the last exchange left off. Pursue ONLY the single correct next objective. Refer to something specific from conversation history. 2-4 sentences. No emojis. Output ONLY the message.`,
  REACTIVATION_DM: `A re-engagement message for a lead that has gone cold. Bring a genuinely new angle or reference something concrete from the prior conversation. Do not guilt-trip. Do not re-pitch the same thing. 2-3 sentences. Output ONLY the message.`,
  NURTURE_DM: `A nurture message for a lead in the Nurture bucket. Evaluate what the prospect currently needs and what information would help them. If the best action is to provide value without asking for anything, generate a VALUE_DM-style message (no CTA). Do NOT automatically interpret this as a sales opportunity. 3-4 sentences. Output ONLY the message.`,
  INTRODUCTION_DM: `A first-touch cold outreach DM. Hook on a positioning gap or specific observation about their brand. Ask only for permission to send a breakdown. Do NOT pitch services or pricing. 2-3 sentences. Output ONLY the message.`,
  RESPONSE_DM: `A reply to a prospect who just messaged us. Continue the dialog naturally. Pursue ONLY the objective in the briefing. Match their energy. 2-3 sentences. No emojis. Output ONLY the message.`
};

// salesBrain.ts
var jsonFromModel = (raw) => {
  const clean = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const start = clean.indexOf("{");
  const end = clean.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("Sales Brain returned an invalid structured response.");
  return JSON.parse(clean.slice(start, end + 1));
};
var messageType = (value, fallback) => typeof value === "string" && ALL_MESSAGE_TYPES.includes(value) ? value : fallback || "FOLLOW_UP";
var cleanMessage = (value) => stripMarkdown(String(value || "")).replace(/^['"]|['"]$/g, "").trim();
function validateSalesBrainMessage(message, type) {
  if (!message || message.length < 12) return "message is empty or too short";
  if (message.length > 1100) return "message is too long for WhatsApp";
  if (/\b(just checking in|are you still interested|touching base|circle back)\b/i.test(message)) return "message is a generic follow-up";
  if (type === "VALUE_DM" && /(would you like|let me know if|book a call|schedule a call|reply if|interested in|let'?s talk|happy to chat)/i.test(message)) return "a Value DM contains a CTA";
  return null;
}
function prompt(lead, options, rewriteReason) {
  const requested = options.requestedMessageType || "FOLLOW_UP";
  const timeline = buildTimeline(lead).map((event) => `${event.occurred ? "done" : "not done"}: ${event.label}`).join("; ");
  const learningBlock = options.learningInsights?.length ? `
Organizational learning (historical advisory evidence, never rules):
${options.learningInsights.map((insight) => `- ${insight.pattern} Confidence ${insight.confidence}/100; ${insight.evidenceSummary}`).join("\n")}
Use this only when genuinely relevant. Current lead history, research, and fact safety take precedence. Do not invent facts or force a historically successful strategy.
` : "";
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
function normalise(lead, data, requested, rewritten = false) {
  const type = messageType(data.messageType, requested);
  const confidence = Math.max(0, Math.min(100, Number(data.confidence) || 60));
  const followUp = /^\d{4}-\d{2}-\d{2}$/.test(String(data.recommendedFollowUpDate || "")) ? String(data.recommendedFollowUpDate) : addDays(3);
  const channel = ["WhatsApp", "Instagram", "Email", "None"].includes(String(data.recommendedChannel)) ? data.recommendedChannel : "WhatsApp";
  const risk = ["low", "medium", "high"].includes(String(data.riskLevel)) ? data.riskLevel : "medium";
  return {
    leadId: lead.id,
    salesStage: String(data.salesStage || lead.status || "New"),
    buyerIntent: String(data.buyerIntent || "unknown"),
    confidence,
    primaryObjective: String(data.primaryObjective || stageObjective(lead.status || "New")),
    strategicReason: String(data.strategicReason || "Based on the recorded lead and conversation context."),
    detectedFriction: String(data.detectedFriction || "No explicit friction recorded."),
    recommendedAction: String(data.recommendedAction || "Send the approved message and wait for a response."),
    messageType: type,
    message: cleanMessage(data.message),
    cta: String(data.cta || ""),
    recommendedFollowUpDate: followUp,
    recommendedChannel: channel,
    riskLevel: risk,
    reasoningSummary: String(data.reasoningSummary || "Context-aware next action selected."),
    qualityChecked: true,
    rewritten
  };
}
async function runSalesBrainWithGenerator(lead, options, generate) {
  const requested = options.requestedMessageType || "FOLLOW_UP";
  let result = normalise(lead, jsonFromModel(await generate(prompt(lead, options), 1200)), requested);
  const failure = validateSalesBrainMessage(result.message, result.messageType);
  if (failure) result = normalise(lead, jsonFromModel(await generate(prompt(lead, options, failure), 1200)), requested, true);
  const finalFailure = validateSalesBrainMessage(result.message, result.messageType);
  if (finalFailure) throw new Error(`Sales Brain could not approve a safe message: ${finalFailure}.`);
  return result;
}

// lib/learning.ts
var LEARNING_OUTCOMES = ["NO_RESPONSE", "POSITIVE_REPLY", "NEGATIVE_REPLY", "QUESTION", "INTERESTED", "PRICING_REQUEST", "MEETING_REQUEST", "MEETING_BOOKED", "QUALIFIED", "CONVERTED", "FOLLOW_UP_REQUIRED", "NOT_NOW", "REJECTION", "WRONG_CONTACT", "UNSUBSCRIBE", "INVALID_CONTACT", "UNKNOWN"];
var LEARNING_CONFIG = { minObservations: 10, validationObservations: 20, minInfluenceConfidence: 55, staleAfterDays: 180 };
var POSITIVE = /* @__PURE__ */ new Set(["POSITIVE_REPLY", "QUESTION", "INTERESTED", "PRICING_REQUEST", "MEETING_REQUEST", "MEETING_BOOKED", "QUALIFIED", "CONVERTED"]);
var NEGATIVE = /* @__PURE__ */ new Set(["NEGATIVE_REPLY", "REJECTION", "UNSUBSCRIBE", "WRONG_CONTACT", "INVALID_CONTACT", "NOT_NOW"]);
var RESPONSES = /* @__PURE__ */ new Set([...POSITIVE, ...NEGATIVE]);
var words = (value) => value.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean);
var dayAge = (date) => Math.max(0, (Date.now() - new Date(date).getTime()) / 864e5);
function classifyOutcome(reply, status) {
  const value = `${reply} ${status || ""}`.toLowerCase();
  if (/\b(closed|converted|signed|paid)\b/.test(value)) return "CONVERTED";
  if (/\b(meeting|discovery call booked|booked)\b/.test(value)) return "MEETING_BOOKED";
  if (/\b(qualified|qualification)\b/.test(value)) return "QUALIFIED";
  if (/\b(price|pricing|cost|how much)\b/.test(value)) return "PRICING_REQUEST";
  if (/\b(unsubscribe|stop messaging)\b/.test(value)) return "UNSUBSCRIBE";
  if (/\b(wrong (person|contact|number)|invalid)\b/.test(value)) return "WRONG_CONTACT";
  if (/\b(not interested|no thanks|decline|rejection)\b/.test(value)) return "REJECTION";
  if (/\b(not now|later|busy)\b/.test(value)) return "NOT_NOW";
  if (/\?|\b(how|what|when|can you)\b/.test(value)) return "QUESTION";
  if (/\b(yes|interested|let.?s talk|send it|sounds good|keen)\b/.test(value)) return "INTERESTED";
  return reply.trim() ? "POSITIVE_REPLY" : "UNKNOWN";
}
function responseTimeSeconds(sentAt, replyAt) {
  if (!sentAt || !replyAt) return void 0;
  const seconds = Math.round((new Date(replyAt).getTime() - new Date(sentAt).getTime()) / 1e3);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : void 0;
}
function deriveEditSignals(original, final) {
  if (original.trim() === final.trim()) return { edited: false, magnitude: "none", types: [] };
  const ratio = Math.abs(original.length - final.length) / Math.max(1, original.length);
  const types = [];
  if (original.length !== final.length) types.push(final.length < original.length ? "message_shortened" : "message_lengthened");
  if (words(original).slice(0, 6).join(" ") !== words(final).slice(0, 6).join(" ")) types.push("opening_changed");
  if (/\?/.test(original) !== /\?/.test(final)) types.push("cta_changed");
  if (ratio > 0.3) types.push("substantial_rewrite");
  return { edited: true, magnitude: ratio > 0.3 ? "substantial" : "light", types };
}
function messageFingerprint(message, outbound, lead) {
  const tokens = words(message);
  const opening = tokens.slice(0, 3).join("-") || "empty";
  const cta = /\?|would you|let me know|book|call|reply/.test(message.toLowerCase()) ? "cta" : "no-cta";
  const length = message.length < 180 ? "short" : message.length < 420 ? "medium" : "long";
  return [outbound.messageType, outbound.strategy || outbound.salesBrain?.recommendedAction || "default", lead.status, lead.clientType || "all", `fu${lead.followUpCount || 0}`, opening, cta, length].join("|");
}
function relatedReply(lead, outbound) {
  return !outbound.sentAt ? void 0 : (lead.conversationLog || []).filter((item) => item.type === "reply" && new Date(item.ts).getTime() >= new Date(outbound.sentAt).getTime()).sort((a, b) => a.ts.localeCompare(b.ts))[0];
}
function buildLearningEvent(lead, outbound, existing) {
  const reply = relatedReply(lead, outbound);
  const statusOutcome = ["Closed", "Discovery Call Booked"].includes(lead.status) ? classifyOutcome("", lead.status) : "UNKNOWN";
  const inferredOutcome = reply ? classifyOutcome(reply.text, lead.status) : outbound.status === "SENT" ? statusOutcome : "UNKNOWN";
  const outcome = existing?.outcomeSource === "manual" ? existing.outcome : inferredOutcome;
  const original = outbound.originalGeneratedMessage || existing?.originalGeneratedMessage || outbound.messageText;
  const final = outbound.messageText;
  const edit = deriveEditSignals(original, final);
  const now = (/* @__PURE__ */ new Date()).toISOString();
  return { id: `learning-${outbound.id}`, leadId: lead.id, outboundId: outbound.id, teamMemberId: outbound.userId, createdAt: existing?.createdAt || outbound.generatedAt || now, updatedAt: now, message: final, originalGeneratedMessage: original, finalMessage: final, messageType: outbound.messageType, strategyType: outbound.strategy || outbound.salesBrain?.recommendedAction || outbound.messageType, funnelStage: outbound.salesBrain?.salesStage || lead.status, leadStatus: lead.status, leadPriority: lead.priority, aiBucket: lead.aiBucket, industry: lead.clientType || "all", source: outbound.source, followUpNumber: lead.followUpCount || 0, fingerprint: messageFingerprint(final, outbound, lead), humanEdited: edit.edited, editType: edit.types, editMagnitude: edit.magnitude, generatedAt: outbound.generatedAt, sentAt: outbound.sentAt, whatsappOpenedAt: outbound.whatsappOpenedAt, outcome, outcomeSource: existing?.outcomeSource === "manual" ? "manual" : reply ? "crm" : outcome !== "UNKNOWN" ? "inferred" : "unknown", outcomeRecordedAt: existing?.outcomeSource === "manual" ? existing.outcomeRecordedAt : reply?.ts, responseTimeSeconds: existing?.outcomeSource === "manual" ? existing.responseTimeSeconds : responseTimeSeconds(outbound.sentAt, reply?.ts), responseMessage: existing?.outcomeSource === "manual" ? existing.responseMessage : reply?.text, outcomeConfidence: existing?.outcomeSource === "manual" ? existing.outcomeConfidence : reply ? 85 : outcome !== "UNKNOWN" ? 60 : 0, attribution: existing?.outcomeSource === "manual" ? existing.attribution : reply ? "last_touch" : outcome !== "UNKNOWN" ? "sequence_associated" : "unknown" };
}
function calculateConfidence(events, positive) {
  if (!events.length) return 0;
  const sample = Math.min(1, events.length / LEARNING_CONFIG.validationObservations);
  const consistency = 0.5 + Math.abs(positive / events.length - 0.5);
  const recency = events.reduce((sum, event) => sum + Math.max(0.25, 1 - dayAge(event.updatedAt) / 365), 0) / events.length;
  const quality = events.reduce((sum, event) => sum + (event.outcomeSource === "crm" || event.outcomeSource === "manual" ? 1 : 0.65), 0) / events.length;
  return Math.round(100 * sample * consistency * recency * quality);
}
function analyzeLearningEvents(events, priorInsights = []) {
  const prior = new Map(priorInsights.map((insight) => [insight.id, insight]));
  const groups = /* @__PURE__ */ new Map();
  for (const event of events.filter((event2) => !!event2.sentAt)) {
    const key = `${event.strategyType}|${event.industry || "all"}`;
    groups.set(key, [...groups.get(key) || [], event]);
  }
  return [...groups.entries()].map(([key, group]) => {
    const positive = group.filter((event) => POSITIVE.has(event.outcome)).length;
    const negative = group.filter((event) => NEGATIVE.has(event.outcome)).length;
    const responses = group.filter((event) => RESPONSES.has(event.outcome)).length;
    const meetings = group.filter((event) => event.outcome === "MEETING_BOOKED").length;
    const conversions = group.filter((event) => event.outcome === "CONVERTED").length;
    const confidence = calculateConfidence(group, positive);
    const [strategyType, segment] = key.split("|");
    const sorted = [...group].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const id = `insight-${key.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`;
    const old = prior.get(id);
    const stale = dayAge(sorted.at(-1).updatedAt) > LEARNING_CONFIG.staleAfterDays;
    const status = old?.status === "DISABLED" || old?.status === "REJECTED" ? old.status : stale ? "STALE" : group.length >= LEARNING_CONFIG.validationObservations && confidence >= LEARNING_CONFIG.minInfluenceConfidence ? "VALIDATED" : group.length >= LEARNING_CONFIG.minObservations ? "EMERGING" : "OBSERVING";
    return { id, pattern: `${strategyType} messages for ${segment} prospects have a ${Math.round(positive / group.length * 100)}% positive-outcome rate across ${group.length} sent messages.`, segment, strategyType, evidenceCount: group.length, positiveOutcomeCount: positive, negativeOutcomeCount: negative, responseCount: responses, meetingCount: meetings, conversionCount: conversions, responseRate: responses / group.length, positiveResponseRate: positive / group.length, meetingRate: meetings / group.length, conversionRate: conversions / group.length, confidence, status, firstObservedAt: old?.firstObservedAt || sorted[0].createdAt, lastObservedAt: sorted.at(-1).updatedAt, updatedAt: (/* @__PURE__ */ new Date()).toISOString() };
  });
}
function relevantInsights(insights, lead, messageType2) {
  return insights.filter((insight) => insight.status === "VALIDATED" && insight.confidence >= LEARNING_CONFIG.minInfluenceConfidence && (!messageType2 || insight.strategyType === messageType2 || insight.strategyType.includes(messageType2)) && (insight.segment === "all" || insight.segment === lead.clientType)).sort((a, b) => b.confidence - a.confidence).slice(0, 3);
}
function summarizeLearning(events, insights) {
  const sent = events.filter((event) => !!event.sentAt);
  const signals = /* @__PURE__ */ new Map();
  for (const event of events) for (const signal of event.editType || []) signals.set(signal, (signals.get(signal) || 0) + 1);
  return { totalEvents: events.length, generated: events.filter((event) => !!event.generatedAt).length, sent: sent.length, responses: sent.filter((event) => RESPONSES.has(event.outcome)).length, positiveResponses: sent.filter((event) => POSITIVE.has(event.outcome)).length, meetings: sent.filter((event) => event.outcome === "MEETING_BOOKED").length, conversions: sent.filter((event) => event.outcome === "CONVERTED").length, strategies: insights.map((insight) => ({ strategyType: insight.strategyType, sample: insight.evidenceCount, replyRate: insight.responseRate, meetingRate: insight.meetingRate, conversionRate: insight.conversionRate })).sort((a, b) => b.sample - a.sample), humanEdits: [...signals.entries()].map(([signal, count]) => ({ signal, count })).sort((a, b) => b.count - a.count) };
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
  let hash2 = 2166136261;
  for (let i = 0; i < value.length; i++) {
    const byte = value.charCodeAt(i);
    hash2 ^= byte;
    hash2 = Math.imul(hash2, 16777619);
  }
  return (hash2 >>> 0).toString(16).padStart(8, "0");
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

// lib/undoRedo.ts
var UNDOABLE_LEAD_FIELDS = [
  "name",
  "company",
  "phone",
  "instagram",
  "whatsapp",
  "email",
  "source",
  "clientType",
  "service",
  "status",
  "priority",
  "assignedTo",
  "notes",
  "nextAction",
  "nextActionDate",
  "meetingPrepNote",
  "deliveryStage",
  "deliveryNote",
  "betaCandidate",
  "aiBucket",
  "autoFollowUpDate",
  "autoFollowUpReason"
];
var equal = (left, right) => JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
function createLeadAction(params) {
  const fields = UNDOABLE_LEAD_FIELDS.filter((field) => !equal(params.before[field], params.after[field]));
  if (!fields.length) return null;
  const before = {};
  const after = {};
  for (const field of fields) {
    before[field] = params.before[field] ?? null;
    after[field] = params.after[field] ?? null;
  }
  return { id: params.id, leadId: params.leadId, actorId: params.actorId, source: params.source, actionType: "LEAD_FIELDS_UPDATED", createdAt: params.now, affectedFields: fields, before, after };
}
function actionCanApply(action, lead, direction) {
  const expected = direction === "undo" ? action.after : action.before;
  return action.affectedFields.every((field) => equal(lead[field], expected[field]));
}
function applyActionFields(lead, action, direction) {
  const values = direction === "undo" ? action.before : action.after;
  const patch = {};
  for (const field of action.affectedFields) patch[field] = values[field] ?? null;
  return { ...lead, ...patch };
}

// lib/execution.ts
function commitOutboundSent(lead, outboundId, sentAt = nowISO()) {
  const outboundMessages = Array.isArray(lead.outboundMessages) ? lead.outboundMessages : [];
  const outbound = outboundMessages.find((message) => message.id === outboundId);
  if (!outbound || outbound.leadId !== lead.id) throw new Error("Outbound message not found for this lead.");
  if (outbound.status === "SENT") return lead;
  const committedOutbound = { ...outbound, status: "SENT", sentAt };
  const existingLog = Array.isArray(lead.conversationLog) ? lead.conversationLog : [];
  const logEntry = {
    id: `outbound-${outbound.id}`,
    outboundId: outbound.id,
    direction: "outbound",
    messageType: outbound.messageType,
    status: "sent",
    ts: sentAt,
    type: "dm",
    label: `${outbound.messageType || "Outbound"} sent via WhatsApp`,
    text: outbound.messageText,
    by: outbound.userId || lead.assignedTo || "Unassigned"
  };
  const alreadyRecorded = existingLog.some((entry) => entry.outboundId === outbound.id || entry.id === logEntry.id);
  return {
    ...lead,
    conversationLog: alreadyRecorded ? existingLog : [...existingLog, logEntry],
    outboundMessages: outboundMessages.map((message) => message.id === outbound.id ? committedOutbound : message),
    lastContacted: sentAt.slice(0, 10),
    lastMeaningfulTouchpoint: sentAt.slice(0, 10),
    awaitingReplySince: "",
    followUpCount: alreadyRecorded ? lead.followUpCount || 0 : (lead.followUpCount || 0) + 1,
    completedFollowUps: alreadyRecorded ? lead.completedFollowUps || [] : [...lead.completedFollowUps || [], sentAt],
    autoFollowUpDate: ["Closed", "Lost"].includes(lead.status) ? null : addDays(3),
    autoFollowUpReason: "Recently contacted via WhatsApp outbound.",
    // dmText is the immutable opening outbound.  A confirmed outbound may
    // establish it only for a lead with no opening DM; every later outbound
    // lives exclusively in the append-only conversationLog above.
    dmText: lead.dmText || outbound.messageText
  };
}

// lib/conversationEvents.ts
function hash(value) {
  let valueHash = 2166136261;
  for (let i = 0; i < value.length; i++) valueHash = Math.imul(valueHash ^ value.charCodeAt(i), 16777619);
  return (valueHash >>> 0).toString(36);
}
function conversationEventId(event) {
  if (event.id) return event.id;
  return `legacy-${hash(JSON.stringify([
    event.outboundId || "",
    event.ts,
    event.type,
    event.direction || "",
    event.messageType || "",
    event.status || "",
    event.label,
    event.text,
    event.by
  ]))}`;
}
function isLatestThreadEvent(event) {
  return event.type === "dm" || event.type === "reply";
}
function isProtectedConversationAnchor(event, dmText, initialResponse) {
  return event.type === "dm" && !!dmText && event.text === dmText || event.type === "reply" && !!initialResponse && event.text === initialResponse;
}
function removeConversationEvent(log, eventId, dmText, initialResponse, removedAt) {
  const position = log.findIndex((event2) => conversationEventId(event2) === eventId);
  if (position < 0) throw new Error("Conversation event not found.");
  const event = log[position];
  if (!isLatestThreadEvent(event)) throw new Error("Only Latest Thread messages can be removed.");
  if (isProtectedConversationAnchor(event, dmText, initialResponse)) throw new Error("Historical conversation anchors cannot be removed.");
  return { log: [...log.slice(0, position), ...log.slice(position + 1)], removed: { eventId, event: { ...event, id: event.id || eventId }, position, removedAt } };
}
function restoreConversationEvent(log, removed) {
  if (log.some((event) => conversationEventId(event) === removed.eventId)) return log;
  const next = [...log];
  next.splice(Math.min(Math.max(removed.position, 0), next.length), 0, removed.event);
  return next;
}

// server.ts
import_dotenv.default.config();
var app = (0, import_express.default)();
var db = new import_pg.Pool({ connectionString: process.env.DATABASE_URL });
function hashPassword(password) {
  return (0, import_crypto.createHash)("sha256").update(password + (process.env.SESSION_SECRET || "dfqlabs-secret-salt")).digest("hex");
}
function generateTempPassword() {
  return "dfq-" + (0, import_crypto.randomBytes)(4).toString("hex");
}
var activeSessions = /* @__PURE__ */ new Map();
function getAuthUserFromReq(req) {
  const token = req.headers.authorization?.replace("Bearer ", "") || req.query.token;
  if (!token) return null;
  return activeSessions.get(token) || null;
}
function requestedActor(value) {
  return typeof value === "string" && UNDO_ACTORS.has(value) ? value : null;
}
async function getAuthoritativeLead(leadId) {
  const result = await db.query("SELECT data FROM leads WHERE id = $1", [leadId]);
  return result.rows[0]?.data || null;
}
function mergeSentOutboundUpdate(current, incoming) {
  if (!current) return incoming;
  const currentOutbound = Array.isArray(current.outboundMessages) ? current.outboundMessages : [];
  const incomingOutbound = Array.isArray(incoming.outboundMessages) ? incoming.outboundMessages : [];
  const currentById = new Map(currentOutbound.map((message) => [String(message.id), message]));
  const sentOutbound = incomingOutbound.filter((message) => message?.id && message.status === "SENT");
  const newlySent = sentOutbound.filter(
    (message) => message?.id && message.status === "SENT" && currentById.get(message.id)?.status !== "SENT"
  );
  const currentLog = Array.isArray(current.conversationLog) ? current.conversationLog : [];
  const incomingLog = Array.isArray(incoming.conversationLog) ? incoming.conversationLog : [];
  const removedConversationEvents = Array.isArray(current.removedConversationEvents) ? current.removedConversationEvents : [];
  const removedIds = new Set(removedConversationEvents.map((event) => event.eventId));
  const entryKey = (entry) => JSON.stringify([
    entry?.outboundId || entry?.id || "",
    entry?.type,
    entry?.label,
    entry?.text,
    entry?.by
  ]);
  const knownEntries = new Set(currentLog.map(entryKey));
  const openingDm = current.dmText || incoming.dmText || "";
  const initialResponse = current.prospectInitialResponse || incoming.prospectInitialResponse || "";
  const appendedEntries = incomingLog.filter((entry) => {
    if (removedIds.has(conversationEventId(entry))) return false;
    if (entry?.type === "dm" && entry?.text === openingDm || entry?.type === "reply" && entry?.text === initialResponse) return false;
    if (entry?.type === "dm") return false;
    const key = entryKey(entry);
    if (knownEntries.has(key)) return false;
    knownEntries.add(key);
    if (entry?.type === "dm" || entry?.type === "reply") {
      entry.ts = (/* @__PURE__ */ new Date()).toISOString();
      entry.direction = entry.direction || (entry.type === "reply" ? "inbound" : "outbound");
      entry.id = entry.id || (0, import_crypto.randomUUID)();
    }
    return true;
  });
  for (const outbound of newlySent) {
    if (appendedEntries.some((entry) => entry?.type === "dm" && entry?.text === outbound.messageText)) continue;
    appendedEntries.push({
      id: `outbound-${outbound.id}`,
      ts: outbound.sentAt || (/* @__PURE__ */ new Date()).toISOString(),
      type: "dm",
      label: `${outbound.messageType || "Outbound"} sent via WhatsApp`,
      text: outbound.messageText,
      by: outbound.userId || incoming.assignedTo || "Unassigned"
    });
  }
  const mergedOutbound = [...currentOutbound];
  for (const outbound of incomingOutbound) {
    const index = mergedOutbound.findIndex((message) => message.id === outbound.id);
    if (index >= 0) {
      if (mergedOutbound[index].status === "SENT" && outbound.status !== "SENT") continue;
      mergedOutbound[index] = outbound;
    } else mergedOutbound.push(outbound);
  }
  return {
    ...incoming,
    dmText: openingDm,
    prospectInitialResponse: initialResponse,
    conversationLog: [...currentLog, ...appendedEntries],
    outboundMessages: mergedOutbound,
    removedConversationEvents
  };
}
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
    await db.query(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        display_name TEXT NOT NULL,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'ACTIVE',
        seat_id TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await db.query(`
      CREATE TABLE IF NOT EXISTS outreach_seats (
        seat_id TEXT PRIMARY KEY,
        seat_name TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'VACANT',
        current_user_id TEXT
      )
    `);
    console.log("\u2713 users and outreach_seats tables initialized");
  } catch (err) {
    throw new Error(`Failed to create users/outreach_seats tables: ${err}`);
  }
  await db.query(`CREATE TABLE IF NOT EXISTS sales_learning_events (id TEXT PRIMARY KEY, lead_id TEXT NOT NULL, outbound_id TEXT UNIQUE NOT NULL, data JSONB NOT NULL, updated_at TIMESTAMP DEFAULT NOW())`);
  await db.query(`CREATE TABLE IF NOT EXISTS sales_learning_insights (id TEXT PRIMARY KEY, data JSONB NOT NULL, updated_at TIMESTAMP DEFAULT NOW())`);
  const userCountRes = await db.query("SELECT COUNT(*) FROM users");
  if (parseInt(userCountRes.rows[0].count) === 0) {
    const founderId = "user-founder";
    const specialistId = "user-blessing";
    const founderPass = hashPassword("dfq2026!");
    const specialistPass = hashPassword("specialist2026!");
    await db.query(
      `INSERT INTO outreach_seats (seat_id, seat_name, status, current_user_id) VALUES
       ('seat-outreach-a', 'Outreach Seat A', 'OCCUPIED', $1),
       ('seat-outreach-b', 'Outreach Seat B', 'VACANT', NULL),
       ('seat-outreach-c', 'Outreach Seat C', 'VACANT', NULL),
       ('seat-outreach-d', 'Outreach Seat D', 'VACANT', NULL)
       ON CONFLICT DO NOTHING`,
      [specialistId]
    );
    await db.query(
      `INSERT INTO users (id, display_name, username, password_hash, role, status, seat_id) VALUES
       ($1, 'Alex (Founder)', 'alex@dfqlabs.com', $2, 'FOUNDER', 'ACTIVE', NULL),
       ($3, 'Blessing Mudi', 'blessing@dfqlabs.com', $4, 'OUTREACH_SPECIALIST', 'ACTIVE', 'seat-outreach-a')
       ON CONFLICT DO NOTHING`,
      [founderId, founderPass, specialistId, specialistPass]
    );
    console.log("\u2713 Seeded default Founder and Outreach Specialist accounts");
  }
  await db.query(`CREATE TABLE IF NOT EXISTS crm_action_history (id TEXT PRIMARY KEY, lead_id TEXT NOT NULL, data JSONB NOT NULL, created_at TIMESTAMP DEFAULT NOW())`);
  await db.query(`CREATE INDEX IF NOT EXISTS crm_action_history_actor_created_idx ON crm_action_history ((data->>'actorId'), created_at DESC)`);
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
var LEARNING_ENABLED = process.env.SALES_BRAIN_LEARNING_ENABLED !== "false";
var LEARNING_INFLUENCE_ENABLED = process.env.SALES_BRAIN_LEARNING_INFLUENCE_ENABLED === "true";
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
async function syncLearningForLead(lead) {
  if (!LEARNING_ENABLED || !Array.isArray(lead.outboundMessages)) return;
  for (const outbound of lead.outboundMessages) {
    const prior = await db.query("SELECT data FROM sales_learning_events WHERE outbound_id = $1", [outbound.id]);
    const event = buildLearningEvent(lead, outbound, prior.rows[0]?.data);
    await db.query(`INSERT INTO sales_learning_events (id, lead_id, outbound_id, data, updated_at) VALUES ($1, $2, $3, $4::jsonb, NOW()) ON CONFLICT (outbound_id) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()`, [event.id, event.leadId, event.outboundId, JSON.stringify(event)]);
  }
  scheduleLearningAnalysis();
}
var learningAnalysisTimer;
function scheduleLearningAnalysis() {
  if (learningAnalysisTimer) return;
  learningAnalysisTimer = setTimeout(() => {
    learningAnalysisTimer = void 0;
    refreshLearningInsights().catch((error) => console.error("Learning analysis failed:", error));
  }, 500);
}
async function refreshLearningInsights() {
  if (!LEARNING_ENABLED) return;
  const events = (await db.query("SELECT data FROM sales_learning_events")).rows.map((row) => row.data);
  const prior = (await db.query("SELECT data FROM sales_learning_insights")).rows.map((row) => row.data);
  const insights = analyzeLearningEvents(events, prior);
  for (const insight of insights) await db.query(`INSERT INTO sales_learning_insights (id, data, updated_at) VALUES ($1, $2::jsonb, NOW()) ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()`, [insight.id, JSON.stringify(insight)]);
}
app.use(import_express.default.json({ limit: "25mb" }));
app.post("/api/auth/login", async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: "Username and password required" });
  try {
    const hashed = hashPassword(password);
    const result = await db.query(
      "SELECT id, display_name, username, role, status, seat_id FROM users WHERE username = $1 AND password_hash = $2",
      [username.trim().toLowerCase(), hashed]
    );
    if (result.rows.length === 0) {
      return res.status(401).json({ error: "Invalid credentials" });
    }
    const user = result.rows[0];
    if (user.status !== "ACTIVE") {
      return res.status(403).json({ error: "User account is inactive" });
    }
    const token = `session-${(0, import_crypto.randomUUID)()}`;
    const sessionData = {
      userId: user.id,
      role: user.role,
      username: user.username,
      displayName: user.display_name,
      seatId: user.seat_id
    };
    activeSessions.set(token, sessionData);
    res.json({ ok: true, token, user: sessionData });
  } catch (err) {
    console.error("POST /api/auth/login error:", err);
    res.status(500).json({ error: "Authentication failed" });
  }
});
app.get("/api/auth/me", (req, res) => {
  const user = getAuthUserFromReq(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });
  res.json({ user });
});
app.post("/api/auth/logout", (req, res) => {
  const token = req.headers.authorization?.replace("Bearer ", "") || req.query.token;
  if (token) activeSessions.delete(token);
  res.json({ ok: true });
});
app.get("/api/auth/users", async (req, res) => {
  const user = getAuthUserFromReq(req);
  if (!user || user.role !== "FOUNDER") return res.status(403).json({ error: "Forbidden" });
  try {
    const result = await db.query(
      "SELECT id, display_name, username, role, status, seat_id, created_at FROM users ORDER BY created_at DESC"
    );
    res.json({ users: result.rows });
  } catch (err) {
    console.error("GET /api/auth/users error:", err);
    res.status(500).json({ error: "Failed to fetch users" });
  }
});
app.post("/api/auth/users", async (req, res) => {
  const user = getAuthUserFromReq(req);
  if (!user || user.role !== "FOUNDER") return res.status(403).json({ error: "Forbidden" });
  const { displayName, username, role, seatId } = req.body || {};
  if (!displayName || !username || !role) return res.status(400).json({ error: "Required user fields missing" });
  const tempPass = generateTempPassword();
  const passHash = hashPassword(tempPass);
  const userId = `user-${(0, import_crypto.randomUUID)()}`;
  try {
    await db.query(
      "INSERT INTO users (id, display_name, username, password_hash, role, status, seat_id) VALUES ($1, $2, $3, $4, $5, 'ACTIVE', $6)",
      [userId, displayName, username.trim().toLowerCase(), passHash, role, seatId || null]
    );
    if (seatId) {
      await db.query("UPDATE outreach_seats SET current_user_id = $1, status = 'OCCUPIED' WHERE seat_id = $2", [userId, seatId]);
    }
    res.json({
      ok: true,
      user: { id: userId, displayName, username, role, status: "ACTIVE", seatId },
      tempPassword: tempPass
    });
  } catch (err) {
    console.error("POST /api/auth/users error:", err);
    res.status(500).json({ error: err.message?.includes("unique") ? "Username already exists" : "Failed to create user" });
  }
});
app.post("/api/auth/users/:id/status", async (req, res) => {
  const user = getAuthUserFromReq(req);
  if (!user || user.role !== "FOUNDER") return res.status(403).json({ error: "Forbidden" });
  const { status } = req.body || {};
  if (!["ACTIVE", "INACTIVE"].includes(status)) return res.status(400).json({ error: "Invalid status" });
  try {
    await db.query("UPDATE users SET status = $1 WHERE id = $2", [status, req.params.id]);
    if (status === "INACTIVE") {
      await db.query("UPDATE outreach_seats SET current_user_id = NULL, status = 'VACANT' WHERE current_user_id = $1", [req.params.id]);
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to update user status" });
  }
});
app.get("/api/auth/seats", async (req, res) => {
  try {
    const result = await db.query(
      `SELECT s.seat_id, s.seat_name, s.status, s.current_user_id, u.display_name, u.username
       FROM outreach_seats s
       LEFT JOIN users u ON s.current_user_id = u.id
       ORDER BY s.seat_id ASC`
    );
    res.json({ seats: result.rows });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch seats" });
  }
});
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
async function retrieveKnowledgeForLead(lead, messageType2) {
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
    const typeKw = typeKeywords[messageType2] || [];
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
  const { leadId, task, messageType: messageType2 } = req.body || {};
  if (!leadId || typeof leadId !== "string") {
    res.status(400).json({ error: "leadId is required" });
    return;
  }
  const lead = await getAuthoritativeLead(leadId);
  if (!lead) {
    res.status(404).json({ error: "Lead not found." });
    return;
  }
  const type = messageType2 || "VALUE_DM";
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
    pipelineTask = `CURRENT USER INSTRUCTION (highest-priority direction for this draft):
${typeof task === "string" && task.trim() ? task.trim() : "Write a useful, prospect-specific value DM."}

TASK:
Generate a VALUE_DM that follows the user's requested strategy while remaining factually grounded in this lead's CRM context, complete chronology, prior outbounds, notes, and available attachments. Do not repeat an earlier message. No selling, CTA, or ask unless the user explicitly selected a different message type.`;
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
    const storedInsights = LEARNING_INFLUENCE_ENABLED ? (await db.query("SELECT data FROM sales_learning_insights")).rows.map((row) => row.data) : [];
    const learningInsights = relevantInsights(storedInsights, leadWithAttachments, type).map((insight) => ({
      insightId: insight.id,
      pattern: insight.pattern,
      relevance: `${insight.segment} / ${insight.strategyType}`,
      confidence: insight.confidence,
      evidenceSummary: `${insight.evidenceCount} sent; ${Math.round(insight.positiveResponseRate * 100)}% positive; ${insight.meetingCount} meetings`
    }));
    const brain = await runSalesBrainWithGenerator(
      leadWithAttachments,
      { task: fullTask, requestedMessageType: type, learningInsights },
      (prompt2, maxTokens) => callGemini(SYSTEM_PROMPT, prompt2, GEMINI_MODEL, maxTokens)
    );
    res.json({
      text: brain.message,
      strategy: brain.reasoningSummary,
      messageType: brain.messageType,
      brain,
      knowledgeUsed: knowledge.map((k) => k.title),
      learningInsights
    });
  } catch (err) {
    console.error("POST /api/value-dm error:", err);
    res.status(500).json({ error: err.message });
  }
});
app.post("/api/sales-brain", async (req, res) => {
  const { leadId, task, requestedMessageType } = req.body || {};
  if (!leadId || typeof leadId !== "string") return res.status(400).json({ error: "leadId is required" });
  try {
    const stored = await getAuthoritativeLead(leadId);
    if (!stored) return res.status(404).json({ error: "Lead not found." });
    const lead = await enrichLeadAttachments(stored);
    const insights = LEARNING_INFLUENCE_ENABLED ? (await db.query("SELECT data FROM sales_learning_insights")).rows.map((row) => row.data) : [];
    const learningInsights = relevantInsights(insights, lead, requestedMessageType || "FOLLOW_UP").map((insight) => ({
      insightId: insight.id,
      pattern: insight.pattern,
      relevance: `${insight.segment} / ${insight.strategyType}`,
      confidence: insight.confidence,
      evidenceSummary: `${insight.evidenceCount} sent; ${Math.round(insight.positiveResponseRate * 100)}% positive; ${insight.meetingCount} meetings`
    }));
    const brain = await runSalesBrainWithGenerator(
      lead,
      { task: typeof task === "string" ? task : void 0, requestedMessageType, learningInsights },
      (prompt2, maxTokens) => callGemini(SYSTEM_PROMPT, prompt2, GEMINI_MODEL, maxTokens)
    );
    return res.json({ ok: true, lead, brain });
  } catch (error) {
    console.error("POST /api/sales-brain:", error);
    return res.status(500).json({ error: error?.message || "Could not generate the Sales Brain recommendation." });
  }
});
app.get("/api/runtime/version", (_req, res) => {
  res.json({
    service: "dfqlabs-os",
    commit: process.env.RENDER_GIT_COMMIT || process.env.GIT_COMMIT || "unknown"
  });
});
app.get("/api/learning/summary", async (_req, res) => {
  try {
    const events = (await db.query("SELECT data FROM sales_learning_events")).rows.map((row) => row.data);
    const insights = (await db.query("SELECT data FROM sales_learning_insights")).rows.map((row) => row.data);
    res.json({ enabled: LEARNING_ENABLED, influenceEnabled: LEARNING_INFLUENCE_ENABLED, summary: summarizeLearning(events, insights), insights: insights.sort((a, b) => b.confidence - a.confidence).slice(0, 20) });
  } catch (error) {
    console.error("GET /api/learning/summary:", error);
    res.status(500).json({ error: "Failed to load learning analytics." });
  }
});
app.get("/api/learning/insights", async (req, res) => {
  if (!LEARNING_INFLUENCE_ENABLED) return res.json({ insights: [] });
  try {
    const leadId = String(req.query.leadId || "");
    const leadResult = await db.query("SELECT data FROM leads WHERE id = $1", [leadId]);
    if (!leadResult.rows[0]) return res.json({ insights: [] });
    const insights = (await db.query("SELECT data FROM sales_learning_insights")).rows.map((row) => row.data);
    const selected = relevantInsights(insights, leadResult.rows[0].data, String(req.query.messageType || "")).map((insight) => ({ insightId: insight.id, pattern: insight.pattern, relevance: `${insight.segment} / ${insight.strategyType}`, confidence: insight.confidence, evidenceSummary: `${insight.evidenceCount} sent; ${Math.round(insight.positiveResponseRate * 100)}% positive; ${insight.meetingCount} meetings` }));
    res.json({ insights: selected });
  } catch (error) {
    console.error("GET /api/learning/insights:", error);
    res.status(500).json({ error: "Failed to retrieve learning insights." });
  }
});
app.post("/api/learning/insights/:id/disable", async (req, res) => {
  try {
    const result = await db.query("SELECT data FROM sales_learning_insights WHERE id = $1", [req.params.id]);
    if (!result.rows[0]) return res.status(404).json({ error: "Insight not found." });
    const insight = { ...result.rows[0].data, status: "DISABLED", updatedAt: (/* @__PURE__ */ new Date()).toISOString() };
    await db.query("UPDATE sales_learning_insights SET data = $1::jsonb, updated_at = NOW() WHERE id = $2", [JSON.stringify(insight), req.params.id]);
    res.json({ ok: true, insight });
  } catch (error) {
    console.error("POST /api/learning/insights disable:", error);
    res.status(500).json({ error: "Failed to disable learning insight." });
  }
});
app.post("/api/learning/outcomes", async (req, res) => {
  const { outboundId, outcome, responseMessage, outcomeRecordedAt } = req.body || {};
  if (!outboundId || !LEARNING_OUTCOMES.includes(outcome)) return res.status(400).json({ error: "A valid outboundId and controlled outcome are required." });
  try {
    const result = await db.query("SELECT data FROM sales_learning_events WHERE outbound_id = $1", [outboundId]);
    if (!result.rows[0]) return res.status(404).json({ error: "Learning event not found for outbound message." });
    const event = result.rows[0].data;
    const recordedAt = outcomeRecordedAt || (/* @__PURE__ */ new Date()).toISOString();
    if (event.sentAt && new Date(recordedAt).getTime() < new Date(event.sentAt).getTime()) return res.status(400).json({ error: "An outcome cannot precede the sent timestamp." });
    const updated = { ...event, outcome, outcomeSource: "manual", outcomeRecordedAt: recordedAt, responseMessage: responseMessage || event.responseMessage, outcomeConfidence: 100, responseTimeSeconds: event.sentAt ? Math.round((new Date(recordedAt).getTime() - new Date(event.sentAt).getTime()) / 1e3) : void 0, updatedAt: (/* @__PURE__ */ new Date()).toISOString() };
    await db.query("UPDATE sales_learning_events SET data = $1::jsonb, updated_at = NOW() WHERE outbound_id = $2", [JSON.stringify(updated), outboundId]);
    scheduleLearningAnalysis();
    res.json({ ok: true, event: updated });
  } catch (error) {
    console.error("POST /api/learning/outcomes:", error);
    res.status(500).json({ error: "Failed to record learning outcome." });
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
  const authUser = getAuthUserFromReq(req);
  if (Array.isArray(body.leads)) {
    if (authUser && authUser.role !== "FOUNDER") {
      return res.status(403).json({ error: "Forbidden: Specialists cannot import or bulk update leads" });
    }
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
        for (const imported of valid2) void syncLearningForLead(imported).catch((error) => console.error("Learning snapshot sync failed:", error));
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
      for (const imported of valid) void syncLearningForLead(imported).catch((error) => console.error("Learning bulk sync failed:", error));
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
  if (authUser) {
    if (!lead.assignedTo || lead.assignedTo === "Unassigned") {
      lead.assignedTo = authUser.displayName;
    }
    lead.ownerUserId = authUser.userId;
    lead.createdByUserId = authUser.userId;
  }
  const actorId = requestedActor(body.actorId);
  const source = typeof body.source === "string" ? body.source.slice(0, 80) : "crm";
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const existing = await client.query("SELECT data FROM leads WHERE id = $1 FOR UPDATE", [lead.id]);
    const mergedLead = mergeSentOutboundUpdate(existing.rows[0]?.data, lead);
    await client.query(
      `INSERT INTO leads (id, data, updated_at) VALUES ($1, $2::jsonb, NOW())
       ON CONFLICT (id) DO UPDATE SET data = $2::jsonb, updated_at = NOW()`,
      [lead.id, JSON.stringify(mergedLead)]
    );
    const action = actorId && existing.rows[0]?.data ? createLeadAction({
      id: `action-${(0, import_crypto.randomUUID)()}`,
      leadId: String(lead.id),
      actorId,
      source,
      before: existing.rows[0].data,
      after: mergedLead,
      now: (/* @__PURE__ */ new Date()).toISOString()
    }) : null;
    if (action) {
      await client.query(
        `UPDATE crm_action_history
         SET data = jsonb_set(data, '{redoInvalidatedAt}', to_jsonb(NOW()::text), true)
         WHERE data->>'actorId' = $1 AND data ? 'undoneAt' AND NOT (data ? 'redoInvalidatedAt')`,
        [actorId]
      );
      await client.query(
        "INSERT INTO crm_action_history (id, lead_id, data, created_at) VALUES ($1, $2, $3::jsonb, NOW())",
        [action.id, action.leadId, JSON.stringify(action)]
      );
    }
    await client.query("COMMIT");
    void syncLearningForLead(mergedLead).catch((error) => console.error("Learning lead sync failed:", error));
    res.json({ ok: true, lead: mergedLead, actionId: action?.id });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {
    });
    console.error("POST /api/leads single:", err);
    res.status(500).json({ error: "Failed to save lead." });
  } finally {
    client.release();
  }
});
app.get("/api/actions", async (req, res) => {
  const actorId = requestedActor(req.query.actorId);
  if (!actorId) return res.status(403).json({ error: "Unauthorized action history request." });
  try {
    const result = await db.query(
      `SELECT data FROM crm_action_history WHERE data->>'actorId' = $1 ORDER BY created_at DESC LIMIT 100`,
      [actorId]
    );
    res.json({ actions: result.rows.map((row) => row.data) });
  } catch (error) {
    console.error("GET /api/actions:", error);
    res.status(500).json({ error: "Could not load action history." });
  }
});
app.post("/api/actions/:id/:direction", async (req, res) => {
  const direction = req.params.direction === "undo" ? "undo" : req.params.direction === "redo" ? "redo" : null;
  const actorId = requestedActor(req.body?.actorId);
  if (!direction || !actorId) return res.status(403).json({ error: "Unauthorized action request." });
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const actionResult = await client.query("SELECT data FROM crm_action_history WHERE id = $1 FOR UPDATE", [req.params.id]);
    const action = actionResult.rows[0]?.data;
    if (!action || action.actorId !== actorId) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Action not found." });
    }
    if (direction === "undo" && (action.undoneAt || action.redoInvalidatedAt) || direction === "redo" && (!action.undoneAt || action.redoInvalidatedAt)) {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "This action is no longer eligible for that operation." });
    }
    const leadResult = await client.query("SELECT data FROM leads WHERE id = $1 FOR UPDATE", [action.leadId]);
    const current = leadResult.rows[0]?.data;
    if (!current) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "The lead no longer exists." });
    }
    if (!actionCanApply(action, current, direction)) {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "This change can no longer be safely undone because the lead has changed." });
    }
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const updated = applyActionFields(current, action, direction);
    updated.auditLog = [...Array.isArray(current.auditLog) ? current.auditLog : [], {
      ts: now,
      by: actorId,
      action: direction === "undo" ? "Undo lead field change" : "Redo lead field change",
      field: action.affectedFields.join(",")
    }];
    const nextAction = { ...action, ...direction === "undo" ? { undoneAt: now, redoneAt: void 0 } : { redoneAt: now, undoneAt: void 0 } };
    await client.query("UPDATE leads SET data = $1::jsonb, updated_at = NOW() WHERE id = $2", [JSON.stringify(updated), action.leadId]);
    await client.query("UPDATE crm_action_history SET data = $1::jsonb WHERE id = $2", [JSON.stringify(nextAction), action.id]);
    await client.query("COMMIT");
    void syncLearningForLead(updated).catch((error) => console.error("Learning undo/redo sync failed:", error));
    res.json({ ok: true, lead: updated, action: nextAction });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {
    });
    console.error("POST /api/actions:", error);
    res.status(500).json({ error: "Could not apply the action safely." });
  } finally {
    client.release();
  }
});
app.post("/api/leads/:leadId/outbound", async (req, res) => {
  const outbound = req.body?.outbound;
  if (!outbound?.id || !outbound?.messageText || outbound.leadId !== req.params.leadId) {
    return res.status(400).json({ error: "A valid outbound record for this lead is required." });
  }
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query("SELECT data FROM leads WHERE id = $1 FOR UPDATE", [req.params.leadId]);
    const lead = result.rows[0]?.data;
    if (!lead) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Lead not found." });
    }
    const existing = Array.isArray(lead.outboundMessages) ? lead.outboundMessages : [];
    const existingRecord = existing.find((item) => item.id === outbound.id);
    if (existingRecord && (existingRecord.leadId !== lead.id || existingRecord.messageText !== outbound.messageText)) {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "Outbound ID conflicts with an existing message." });
    }
    const updated = existingRecord ? lead : { ...lead, outboundMessages: [...existing, outbound] };
    if (!existingRecord) {
      await client.query("UPDATE leads SET data = $1::jsonb, updated_at = NOW() WHERE id = $2", [JSON.stringify(updated), lead.id]);
    }
    await client.query("COMMIT");
    return res.json({ ok: true, lead: updated, idempotent: !!existingRecord });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {
    });
    console.error("POST outbound record:", error);
    return res.status(500).json({ error: "Could not save the generated outbound message." });
  } finally {
    client.release();
  }
});
app.post("/api/leads/:leadId/outbound/:outboundId/sent", async (req, res) => {
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query("SELECT data FROM leads WHERE id = $1 FOR UPDATE", [req.params.leadId]);
    const lead = result.rows[0]?.data;
    if (!lead) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Lead not found." });
    }
    const outboundMessages = Array.isArray(lead.outboundMessages) ? lead.outboundMessages : [];
    const outbound = outboundMessages.find((item) => item.id === req.params.outboundId);
    if (!outbound || outbound.leadId !== lead.id) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Outbound message not found for this lead." });
    }
    if (outbound.status === "SENT") {
      await client.query("COMMIT");
      return res.json({ ok: true, lead, idempotent: true });
    }
    const updated = commitOutboundSent(lead, outbound.id, (/* @__PURE__ */ new Date()).toISOString());
    await client.query("UPDATE leads SET data = $1::jsonb, updated_at = NOW() WHERE id = $2", [JSON.stringify(updated), lead.id]);
    await client.query("COMMIT");
    void syncLearningForLead(updated).catch((error) => console.error("Learning sent-outbound sync failed:", error));
    res.json({ ok: true, lead: updated, idempotent: false });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {
    });
    console.error("POST sent outbound:", error);
    res.status(500).json({ error: "Could not confirm the outbound message." });
  } finally {
    client.release();
  }
});
app.delete("/api/leads/:leadId/conversation/:eventId", async (req, res) => {
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query("SELECT data FROM leads WHERE id = $1 FOR UPDATE", [req.params.leadId]);
    const lead = result.rows[0]?.data;
    if (!lead) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Lead not found." });
    }
    const existingRemoved = Array.isArray(lead.removedConversationEvents) ? lead.removedConversationEvents : [];
    if (existingRemoved.some((item) => item.eventId === req.params.eventId)) {
      await client.query("COMMIT");
      return res.json({ ok: true, lead, idempotent: true });
    }
    let changed;
    try {
      changed = removeConversationEvent(Array.isArray(lead.conversationLog) ? lead.conversationLog : [], req.params.eventId, lead.dmText || "", lead.prospectInitialResponse || "", (/* @__PURE__ */ new Date()).toISOString());
    } catch (error) {
      await client.query("ROLLBACK");
      return res.status(error?.message?.includes("anchors") || error?.message?.includes("Only Latest") ? 400 : 404).json({ error: error?.message || "Could not remove conversation event." });
    }
    const updated = { ...lead, conversationLog: changed.log, removedConversationEvents: [...existingRemoved, changed.removed] };
    await client.query("UPDATE leads SET data = $1::jsonb, updated_at = NOW() WHERE id = $2", [JSON.stringify(updated), lead.id]);
    await client.query("COMMIT");
    return res.json({ ok: true, lead: updated, removedEventId: changed.removed.eventId });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {
    });
    console.error("DELETE conversation event:", error);
    return res.status(500).json({ error: "Could not remove conversation event." });
  } finally {
    client.release();
  }
});
app.post("/api/leads/:leadId/conversation/:eventId/restore", async (req, res) => {
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query("SELECT data FROM leads WHERE id = $1 FOR UPDATE", [req.params.leadId]);
    const lead = result.rows[0]?.data;
    if (!lead) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Lead not found." });
    }
    const removed = Array.isArray(lead.removedConversationEvents) ? lead.removedConversationEvents : [];
    const target = removed.find((item) => item.eventId === req.params.eventId);
    if (!target) {
      const exists = (Array.isArray(lead.conversationLog) ? lead.conversationLog : []).some((event) => conversationEventId(event) === req.params.eventId);
      await client.query("COMMIT");
      return exists ? res.json({ ok: true, lead, idempotent: true }) : res.status(404).json({ error: "Removed conversation event not found." });
    }
    const updatedLog = restoreConversationEvent(Array.isArray(lead.conversationLog) ? lead.conversationLog : [], target);
    const updated = { ...lead, conversationLog: updatedLog, removedConversationEvents: removed.filter((item) => item.eventId !== target.eventId) };
    await client.query("UPDATE leads SET data = $1::jsonb, updated_at = NOW() WHERE id = $2", [JSON.stringify(updated), lead.id]);
    await client.query("COMMIT");
    return res.json({ ok: true, lead: updated, idempotent: updatedLog === lead.conversationLog });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {
    });
    console.error("POST restore conversation event:", error);
    return res.status(500).json({ error: "Could not restore conversation event." });
  } finally {
    client.release();
  }
});
app.post("/api/leads/check-duplicate", async (req, res) => {
  const { phone, instagram, email, company, website } = req.body || {};
  const normalizePhone = (p) => {
    if (!p) return "";
    let digits = p.replace(/\D/g, "");
    if (digits.startsWith("234")) digits = digits.slice(3);
    else if (digits.startsWith("0") && digits.length >= 11) digits = digits.slice(1);
    return digits.slice(-10);
  };
  const normalizeHandle = (h) => {
    if (!h) return "";
    return h.trim().toLowerCase().replace(/^@/, "").replace(/https?:\/\/(www\.)?instagram\.com\//, "").replace(/\/$/, "");
  };
  const normPhone = normalizePhone(phone);
  const normIg = normalizeHandle(instagram);
  const normEmail = email ? email.trim().toLowerCase() : "";
  const normCompany = company ? company.trim().toLowerCase() : "";
  if (!normPhone && !normIg && !normEmail && !normCompany) {
    return res.status(400).json({ error: "At least one search field (phone, instagram, email, company) is required." });
  }
  try {
    const result = await db.query("SELECT id, data FROM leads");
    const matches = [];
    for (const row of result.rows) {
      const lead = row.data;
      let matchedReason = "";
      let isExact = false;
      if (normPhone && normalizePhone(lead.phone || lead.whatsapp) === normPhone) {
        matchedReason = "Phone number matches existing lead";
        isExact = true;
      } else if (normIg && normalizeHandle(lead.instagram) === normIg) {
        matchedReason = "Instagram handle matches existing lead";
        isExact = true;
      } else if (normEmail && lead.email && lead.email.trim().toLowerCase() === normEmail) {
        matchedReason = "Email address matches existing lead";
        isExact = true;
      } else if (normCompany && lead.company && lead.company.trim().toLowerCase() === normCompany) {
        matchedReason = "Company/Brand name matches existing lead";
        isExact = false;
      }
      if (matchedReason) {
        matches.push({
          leadId: lead.id,
          company: lead.company || "Unknown Company",
          instagram: lead.instagram,
          status: lead.status || "New",
          assignedTo: lead.assignedTo || "Unassigned",
          lastContacted: lead.lastContacted,
          matchReason: matchedReason,
          confidence: isExact ? "Exact Match" : "Potential Match"
        });
      }
    }
    res.json({
      hasDuplicates: matches.length > 0,
      matchCount: matches.length,
      highestConfidence: matches.some((m) => m.confidence === "Exact Match") ? "Exact Match" : matches.length > 0 ? "Potential Match" : "No Match",
      matches
    });
  } catch (err) {
    console.error("POST /api/leads/check-duplicate error:", err);
    res.status(500).json({ error: "Failed to perform database duplicate check." });
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
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  callGemini
});
