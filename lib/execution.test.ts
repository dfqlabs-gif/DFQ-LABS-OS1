import test from "node:test";
import assert from "node:assert/strict";
import { commitOutboundSent } from "./execution";
import { newOutboundMessage } from "./outbound";

function leadWithHistory(history: any[] = []) {
  const outbound = newOutboundMessage({
    leadId: "lead-1", userId: "Amina", messageType: "FOLLOW_UP",
    messageText: "Exact generated message", source: "ask_ai",
  });
  return {
    id: "lead-1", name: "Sarah", company: "Acme", status: "DM Sent", assignedTo: "Amina",
    dmText: "", conversationLog: history, outboundMessages: [outbound],
    followUpCount: 0, completedFollowUps: [], awaitingReplySince: "2026-09-01T00:00:00.000Z",
    lastContacted: "", lastMeaningfulTouchpoint: "", autoFollowUpDate: null, autoFollowUpReason: "",
  } as any;
}

test("committing a sent outbound appends the authoritative text without replacing history", () => {
  const old = [
    { id: "initial", ts: "2026-01-01T00:00:00.000Z", type: "dm", label: "Initial", text: "Initial DM", by: "Amina" },
    { id: "reply", ts: "2026-01-02T00:00:00.000Z", type: "reply", label: "Reply", text: "Interested", by: "Sarah" },
  ];
  const lead = leadWithHistory(old);
  const sentAt = "2026-09-09T12:00:00.000Z";
  const committed = commitOutboundSent(lead, lead.outboundMessages[0].id, sentAt);

  assert.deepEqual(committed.conversationLog.slice(0, 2), old);
  assert.equal(committed.conversationLog.length, 3);
  assert.equal(committed.conversationLog[2].text, "Exact generated message");
  assert.equal(committed.conversationLog[2].outboundId, lead.outboundMessages[0].id);
  assert.equal(committed.conversationLog[2].ts, sentAt);
  assert.equal(committed.outboundMessages[0].status, "SENT");
  assert.equal(committed.followUpCount, 1);
});

test("committing the same outbound twice is idempotent", () => {
  const lead = leadWithHistory();
  const once = commitOutboundSent(lead, lead.outboundMessages[0].id, "2026-09-09T12:00:00.000Z");
  const twice = commitOutboundSent(once, lead.outboundMessages[0].id, "2026-09-09T12:01:00.000Z");

  assert.equal(twice.conversationLog.length, 1);
  assert.equal(twice.completedFollowUps.length, 1);
  assert.equal(twice.followUpCount, 1);
  assert.equal(twice.conversationLog[0].text, "Exact generated message");
});

test("a sent confirmation uses the outbound record, never browser-supplied text", () => {
  const lead = leadWithHistory();
  const committed = commitOutboundSent(lead, lead.outboundMessages[0].id, "2026-09-09T12:00:00.000Z");

  assert.equal(committed.dmText, lead.outboundMessages[0].messageText);
  assert.equal(committed.conversationLog[0].text, lead.outboundMessages[0].messageText);
});

test("a confirmation preserves a long persisted thread and keeps server sentAt separate from generatedAt", () => {
  const history = Array.from({ length: 25 }, (_, index) => ({
    id: `history-${index}`,
    ts: `2026-09-${String(index + 1).padStart(2, "0")}T09:00:00.000Z`,
    type: index % 2 ? "reply" : "dm",
    label: "Existing conversation",
    text: `Existing message ${index + 1}`,
    by: index % 2 ? "Prospect" : "Amina",
  }));
  const lead = leadWithHistory(history);
  lead.outboundMessages[0].messageText = "TEST FOLLOW-UP MESSAGE";
  lead.outboundMessages[0].generatedAt = "2026-09-10T08:00:00.000Z";
  const sentAt = "2026-09-10T10:10:00.000Z";

  const committed = commitOutboundSent(lead, lead.outboundMessages[0].id, sentAt);

  assert.deepEqual(committed.conversationLog.slice(0, 25), history);
  assert.equal(committed.conversationLog.length, 26);
  assert.equal(committed.conversationLog[25].text, "TEST FOLLOW-UP MESSAGE");
  assert.equal(committed.conversationLog[25].ts, sentAt);
  assert.notEqual(committed.outboundMessages[0].generatedAt, committed.outboundMessages[0].sentAt);
  assert.equal(commitOutboundSent(committed, lead.outboundMessages[0].id, "2026-09-10T12:00:00.000Z").conversationLog.length, 26);
});
