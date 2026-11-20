import test from "node:test";
import assert from "node:assert/strict";
import { relatedReply } from "../lib/learning";
import { commitOutboundSent } from "../lib/execution";
import type { Lead } from "../types";
import type { OutboundMessage } from "../lib/outbound";

const outbound = (id: string, sentAt: string): OutboundMessage => ({
  id, leadId: "lead-1", userId: "Blessing Mudi", messageType: "VALUE_DM",
  messageText: `Exact message ${id}`, originalGeneratedMessage: `Exact message ${id}`,
  status: "SENT", generatedAt: sentAt, sentAt, source: "test",
});

const leadFixture = (overrides: Partial<Lead> = {}) => ({
  id: "lead-1", name: "Test Contact", company: "Test Realty", assignedTo: "Blessing Mudi",
  status: "DM Sent", conversationLog: [], outboundMessages: [], completedFollowUps: [],
  followUpCount: 0, ...overrides,
}) as Lead;

test("reply attribution stops at the next confirmed outbound", () => {
  const first = outbound("out-1", "2026-11-01T10:00:00.000Z");
  const second = outbound("out-2", "2026-11-02T10:00:00.000Z");
  const lead = leadFixture({
    outboundMessages: [first, second],
    conversationLog: [
      { type: "reply", ts: "2026-11-01T12:00:00.000Z", text: "Reply to first" },
      { type: "reply", ts: "2026-11-02T11:00:00.000Z", text: "Reply to second" },
    ] as any,
  });
  assert.equal(relatedReply(lead, first)?.text, "Reply to first");
  assert.equal(relatedReply(lead, second)?.text, "Reply to second");
});

test("confirmed outbound appends the exact stored message once", () => {
  const draft = { ...outbound("out-3", "2026-11-03T10:00:00.000Z"), status: "GENERATED" as const, sentAt: undefined };
  const lead = leadFixture({ outboundMessages: [draft] });
  const committed = commitOutboundSent(lead, draft.id, "2026-11-03T11:00:00.000Z");
  assert.equal(committed.conversationLog?.length, 1);
  assert.equal(committed.conversationLog?.[0].text, draft.messageText);
  assert.equal(committed.outboundMessages?.find(item => item.id === draft.id)?.status, "SENT");
  assert.equal(commitOutboundSent(committed, draft.id), committed);
  assert.equal(committed.conversationLog?.length, 1);
});


test("nurture VALUE_DM is appended without changing sales follow-up state", () => {
  const draft = { ...outbound("out-nurture", "2026-11-20T10:00:00.000Z"), status: "GENERATED" as const, sentAt: undefined, source: "nurture_portal" };
  const lead = leadFixture({ followUpCount: 4, completedFollowUps: ["2026-11-18T10:00:00.000Z"], autoFollowUpDate: "2026-11-22", autoFollowUpReason: "Existing follow-up", lastContacted: "2026-11-18", lastMeaningfulTouchpoint: "2026-11-18", awaitingReplySince: "2026-11-18T12:00:00.000Z", outboundMessages: [draft] });
  const committed = commitOutboundSent(lead, draft.id, "2026-11-20T11:00:00.000Z");
  assert.equal(committed.conversationLog?.length, 1);
  assert.equal(committed.conversationLog?.[0].source, "nurture_portal");
  assert.equal(committed.followUpCount, 4);
  assert.deepEqual(committed.completedFollowUps, lead.completedFollowUps);
  assert.equal(committed.autoFollowUpDate, "2026-11-22");
  assert.equal(committed.autoFollowUpReason, "Existing follow-up");
  assert.equal(committed.lastContacted, "2026-11-18");
  assert.equal(committed.lastMeaningfulTouchpoint, "2026-11-18");
  assert.equal(committed.awaitingReplySince, "2026-11-18T12:00:00.000Z");
});
