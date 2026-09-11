import assert from "node:assert/strict";
import test from "node:test";
import { removeConversationEvent, restoreConversationEvent, conversationEventId } from "./conversationEvents";
import { formatConversationLog } from "../aiEngine";

const event = (id: string, text: string, ts: string, direction: "inbound" | "outbound" = "outbound") => ({ id, ts, type: direction === "outbound" ? "dm" as const : "reply" as const, direction, label: "Thread", text, by: "Amina", outboundId: direction === "outbound" ? `out-${id}` : undefined });
const anchors = { dmText: "Original DM", initial: "Initial response" };

test("removes exactly one thread event and restores its exact original position", () => {
  const a = event("a", "A", "2026-09-11T08:05:00.000Z");
  const b = event("b", "B", "2026-09-11T08:20:00.000Z", "inbound");
  const c = event("c", "C", "2026-09-11T08:45:00.000Z");
  const removed = removeConversationEvent([a, b, c], "b", anchors.dmText, anchors.initial, "2026-09-11T09:00:00.000Z");
  assert.deepEqual(removed.log.map(item => item.id), ["a", "c"]);
  assert.deepEqual(removed.removed.event, { ...b });
  const restored = restoreConversationEvent(removed.log, removed.removed);
  assert.deepEqual(restored.map(item => item.id), ["a", "b", "c"]);
  assert.deepEqual(restoreConversationEvent(restored, removed.removed).map(item => item.id), ["a", "b", "c"]);
});

test("a new event appended while one is removed is retained and the undo is not duplicated", () => {
  const a = event("a", "A", "2026-09-11T08:05:00.000Z");
  const b = event("b", "B", "2026-09-11T08:20:00.000Z", "inbound");
  const c = event("c", "C", "2026-09-11T08:45:00.000Z");
  const removed = removeConversationEvent([a, b, c], "b", anchors.dmText, anchors.initial, "now");
  const d = event("d", "D", "2026-09-11T09:00:00.000Z");
  const restored = restoreConversationEvent([...removed.log, d], removed.removed);
  assert.deepEqual(restored.map(item => item.id), ["a", "b", "c", "d"]);
  assert.deepEqual(restoreConversationEvent(restored, removed.removed).map(item => item.id), ["a", "b", "c", "d"]);
});

test("protected anchors cannot be removed and deleted events disappear from AI context", () => {
  const opening = event("opening", anchors.dmText, "2026-09-11T08:00:00.000Z");
  const initial = event("initial", anchors.initial, "2026-09-11T08:01:00.000Z", "inbound");
  const testMessage = event("test", "Delete me", "2026-09-11T08:20:00.000Z");
  assert.throws(() => removeConversationEvent([opening, initial, testMessage], "opening", anchors.dmText, anchors.initial, "now"), /anchors/);
  assert.throws(() => removeConversationEvent([opening, initial, testMessage], "initial", anchors.dmText, anchors.initial, "now"), /anchors/);
  const removed = removeConversationEvent([opening, initial, testMessage], "test", anchors.dmText, anchors.initial, "now");
  const lead: any = { id: "lead", ...anchors, prospectInitialResponse: anchors.initial, conversationLog: removed.log, outboundMessages: [], notes: "", name: "", company: "", clientType: "", service: "", status: "New", priority: "", assignedTo: "", source: "", lastContacted: "", awaitingReplySince: "", lastMeaningfulTouchpoint: "", betaCandidate: false, autoFollowUpReason: "", autoFollowUpDate: null };
  assert.doesNotMatch(formatConversationLog(lead), /Delete me/);
  assert.match(formatConversationLog({ ...lead, conversationLog: restoreConversationEvent(removed.log, removed.removed) }), /Delete me/);
});

test("legacy events receive deterministic identities without using their array position", () => {
  const legacy = { ts: "2026-09-11T08:20:00.000Z", type: "reply" as const, direction: "inbound" as const, label: "Thread", text: "A reply", by: "Sarah" };
  assert.equal(conversationEventId(legacy), conversationEventId({ ...legacy }));
});
