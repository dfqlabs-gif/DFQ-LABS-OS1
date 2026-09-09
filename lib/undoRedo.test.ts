import test from "node:test";
import assert from "node:assert/strict";
import { actionCanApply, applyActionFields, createLeadAction } from "./undoRedo";

test("field action undoes and redoes without replacing conversation history", () => {
  const before = { id: "lead-1", status: "New", notes: "", conversationLog: [{ text: "Initial DM" }] };
  const after = { ...before, status: "Replied", notes: "Asked for details" };
  const action = createLeadAction({ id: "action-1", leadId: "lead-1", actorId: "Founder", source: "pipeline", before, after, now: "2026-09-09T10:00:00.000Z" });
  assert.ok(action);
  assert.equal(actionCanApply(action!, after, "undo"), true);
  const undone = applyActionFields(after, action!, "undo");
  assert.equal(undone.status, "New");
  assert.deepEqual(undone.conversationLog, before.conversationLog);
  assert.equal(actionCanApply(action!, undone, "redo"), true);
  assert.equal(applyActionFields(undone, action!, "redo").notes, "Asked for details");
});

test("field action refuses an undo after another user changes the same field", () => {
  const action = createLeadAction({ id: "action-2", leadId: "lead-1", actorId: "Founder", source: "pipeline", before: { status: "New" }, after: { status: "Replied" }, now: "2026-09-09T10:00:00.000Z" });
  assert.equal(actionCanApply(action!, { status: "Closed" }, "undo"), false);
});
