import assert from "node:assert/strict";
import test from "node:test";
import { validateSalesBrainMessage } from "../salesBrain";
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

test("execution preserves an exact outbound ID and is idempotent", () => {
  const outbound = newOutboundMessage({ leadId: lead.id, userId: "Team", messageType: "FOLLOW_UP", messageText: "Exact final message", source: "test" });
  const opened = applyWhatsAppOpened({ ...lead, outboundMessages: [outbound] }, outbound.id);
  assert.equal(opened.outboundMessages?.[0].status, "WHATSAPP_OPENED");
  const sent = applySentMessage(opened, outbound.messageText, outbound.messageType, "Team", outbound.id, undefined, "Wait for reply", "2026-09-08");
  const retried = applySentMessage(sent, outbound.messageText, outbound.messageType, "Team", outbound.id);
  assert.equal(sent.outboundMessages?.[0].status, "SENT");
  assert.equal(sent.conversationLog.length, 1);
  assert.equal(retried.conversationLog.length, 1);
  assert.equal(sent.nextActionDate, "2026-09-08");
});
