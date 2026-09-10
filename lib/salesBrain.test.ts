import assert from "node:assert/strict";
import test from "node:test";
import { runSalesBrainWithGenerator, validateSalesBrainMessage } from "../salesBrain";
import { buildLeadContext } from "../aiEngine";
import { applySentMessage, applyWhatsAppOpened } from "./execution";
import { newOutboundMessage } from "./outbound";
import type { Lead } from "../types";

const lead: Lead = {
  id: "resmo", name: "", company: "Resmo Properties", phone: "08000000000", source: "Instagram", clientType: "Real Estate Developer", service: "Growth — ₦500K/mo", status: "Audit Delivered", priority: "High", assignedTo: "Team", notes: "Audit delivered; no reply since.", dmText: "I have sent the audit.", prospectInitialResponse: "Please send it.", prospectLatestResponse: "Please send it.", conversationLog: [], nextAction: "", nextActionDate: "", dateAdded: "2026-09-01", lastContacted: "2026-09-01", lastMeaningfulTouchpoint: "2026-09-01", awaitingReplySince: "", meetingScheduledAt: "", meetingPrepNote: "", followUpCount: 0, weekAdded: "2026-W36", completedFollowUps: [], betaCandidate: false, autoFollowUpDate: null, autoFollowUpReason: "",
};

test("Resmo acceptance rejects a lazy follow-up and accepts a context-aware next step", () => {
  assert.equal(validateSalesBrainMessage("Hi, just checking in. Are you still interested?", "FOLLOW_UP"), "message is a generic follow-up");
  assert.equal(validateSalesBrainMessage("Resmo team, the audit I sent highlighted where the buyer journey loses momentum. It would be useful to compare the one change you would prioritise first against the enquiries you want to attract this quarter.", "FOLLOW_UP"), null);
});

test("Sales Brain returns structured output and rewrites an internally rejected message", async () => {
  let calls = 0;
  const result = await runSalesBrainWithGenerator(lead, { requestedMessageType: "VALUE_DM" }, async () => {
    calls++;
    return JSON.stringify({
      salesStage: "Audit Delivered", buyerIntent: "interested but quiet", confidence: 82,
      primaryObjective: "Provide a useful insight", strategicReason: "An audit was delivered.",
      detectedFriction: "Silence after the audit", recommendedAction: "Send a practical observation.",
      messageType: "VALUE_DM",
      message: calls === 1 ? "Would you like to book a call?" : "Resmo team, map each listing reel to one buyer question before publishing. The comment prompts can then answer that exact question rather than asking viewers to enquire broadly.",
      cta: "", recommendedFollowUpDate: "2026-09-08", recommendedChannel: "WhatsApp",
      riskLevel: "low", reasoningSummary: "A value-first message keeps the relationship warm.",
    });
  });
  assert.equal(calls, 2);
  assert.equal(result.qualityChecked, true);
  assert.equal(result.rewritten, true);
  assert.equal(result.cta, "");
  assert.equal(validateSalesBrainMessage(result.message, "VALUE_DM"), null);
});

test("execution preserves an exact outbound ID and is idempotent", () => {
  const outbound = newOutboundMessage({ leadId: lead.id, userId: "Team", messageType: "FOLLOW_UP", messageText: "Exact final message", source: "mission_control" });
  const opened = applyWhatsAppOpened({ ...lead, awaitingReplySince: "2026-09-07T08:00:00.000Z", outboundMessages: [outbound] }, outbound.id);
  assert.equal(opened.outboundMessages?.[0].status, "WHATSAPP_OPENED");
  const sent = applySentMessage(opened, outbound.messageText, outbound.messageType, "Team", outbound.id, undefined, "Wait for reply", "2026-09-08");
  const retried = applySentMessage(sent, outbound.messageText, outbound.messageType, "Team", outbound.id);
  assert.equal(sent.outboundMessages?.[0].status, "SENT");
  assert.equal(sent.conversationLog.length, 1);
  assert.equal(retried.conversationLog.length, 1);
  assert.equal(sent.nextActionDate, "2026-09-08");
  assert.equal(sent.awaitingReplySince, "");
  assert.equal(sent.completedFollowUps.length, 1);
});

test("prospect context keeps profile, anchors, chronology, and previous outbounds distinct", () => {
  const contextual = {
    ...lead,
    phone: "08000000000", whatsapp: "2348000000000", instagram: "48propertymarketing",
    email: "team@48.example", source: "Instagram", priority: "High", betaCandidate: true,
    meetingScheduledAt: "2026-09-12T10:00:00.000Z", meetingPrepNote: "Discuss website concept.",
    lastMeaningfulTouchpoint: "2026-09-10", aiBucket: "Warm", aiReason: "Engaged with concept.",
    aiNextAction: "Send the requested value DM.", autoFollowUpDate: "2026-09-14",
    conversationLog: [{ ts: "2026-09-10T09:00:00.000Z", type: "dm" as const, direction: "outbound" as const, label: "Follow-up", text: "Specific earlier outbound", by: "Team" }],
    outboundMessages: [{ ...newOutboundMessage({ leadId: lead.id, userId: "Team", messageType: "FOLLOW_UP", messageText: "Specific earlier outbound", source: "ask_ai" }), status: "SENT" as const, sentAt: "2026-09-10T09:00:00.000Z" }],
  };
  const context = buildLeadContext(contextual);

  assert.match(context, /Lead ID: resmo/);
  assert.match(context, /WhatsApp: 2348000000000/);
  assert.match(context, /=== ORIGINAL YOUR DM ===/);
  assert.match(context, /=== THEIR INITIAL RESPONSE ===/);
  assert.match(context, /=== LATEST THREAD: SUBSEQUENT MESSAGES/);
  assert.match(context, /=== PREVIOUS OUTBOUND RECORDS ===/);
  assert.match(context, /Specific earlier outbound/);
});
