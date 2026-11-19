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
