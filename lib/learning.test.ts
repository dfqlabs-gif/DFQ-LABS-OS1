import assert from "node:assert/strict";
import test from "node:test";
import { analyzeLearningEvents, buildLearningEvent, classifyOutcome, deriveEditSignals, relevantInsights, responseTimeSeconds } from "./learning";
import { newOutboundMessage } from "./outbound";
import type { Lead } from "../types";

const lead: Lead = { id: "learning-lead", name: "Ada", company: "Ada Holdings", source: "Referral", clientType: "Developer", service: "Growth", status: "Replied", priority: "High", assignedTo: "Team", notes: "", dmText: "", prospectInitialResponse: "", prospectLatestResponse: "", conversationLog: [], nextAction: "", nextActionDate: "", dateAdded: "2026-09-01", lastContacted: "", lastMeaningfulTouchpoint: "", awaitingReplySince: "", meetingScheduledAt: "", meetingPrepNote: "", followUpCount: 0, weekAdded: "2026-W36", completedFollowUps: [], betaCandidate: false, autoFollowUpDate: null, autoFollowUpReason: "" };

test("learning event associates a sent outbound with a later CRM reply and response time", () => {
  const outbound = { ...newOutboundMessage({ leadId: lead.id, userId: "team", messageType: "FOLLOW_UP", messageText: "Original message", source: "ask_ai", strategy: "research-led" }), status: "SENT" as const, sentAt: "2026-09-02T10:00:00.000Z" };
  const event = buildLearningEvent({ ...lead, conversationLog: [{ ts: "2026-09-02T10:05:00.000Z", type: "reply", label: "Reply", text: "Yes, interested", by: "Ada" }] }, outbound);
  assert.equal(event.outcome, "INTERESTED"); assert.equal(event.responseTimeSeconds, 300); assert.equal(event.attribution, "last_touch");
});

test("human edit signals preserve original and final message evidence", () => {
  const edit = deriveEditSignals("Hello Ada, would you like a call?", "Ada, would a quick call help?");
  assert.equal(edit.edited, true); assert.ok(edit.types.includes("opening_changed"));
});

test("outcome taxonomy and timestamp validation are deterministic", () => {
  assert.equal(classifyOutcome("How much does this cost?"), "PRICING_REQUEST");
  assert.equal(responseTimeSeconds("2026-09-02T10:00:00Z", "2026-09-02T09:00:00Z"), undefined);
});

test("minimum sample threshold prevents emerging evidence from influencing Sales Brain", () => {
  const base = { id: "x", leadId: lead.id, outboundId: "o", teamMemberId: "team", createdAt: "2026-09-01T00:00:00Z", updatedAt: "2026-09-02T00:00:00Z", message: "m", originalGeneratedMessage: "m", finalMessage: "m", messageType: "FOLLOW_UP", strategyType: "research-led", funnelStage: "New", leadStatus: "New", leadPriority: "High", followUpNumber: 0, fingerprint: "f", humanEdited: false, editMagnitude: "none" as const, sentAt: "2026-09-01T00:00:00Z", outcome: "INTERESTED" as const, outcomeSource: "crm" as const, outcomeConfidence: 85, attribution: "last_touch" as const };
  const insights = analyzeLearningEvents(Array.from({ length: 9 }, (_, i) => ({ ...base, id: `x${i}`, outboundId: `o${i}` })));
  assert.equal(insights[0].status, "OBSERVING"); assert.equal(relevantInsights(insights, lead, "FOLLOW_UP").length, 0);
});
