import test from "node:test";
import assert from "node:assert/strict";
import { getLagosClock, isManagerReportWindowOpen } from "./managerSchedule.js";

test("Lagos clock conversion is stable at the morning schedule boundary", () => {
  assert.deepEqual(getLagosClock(new Date("2026-11-27T06:00:00.000Z")), {
    date: "2026-11-27", hour: 7, minute: 0,
  });
  assert.equal(isManagerReportWindowOpen("manager_morning_briefing", new Date("2026-11-27T06:00:00.000Z")), true);
  assert.equal(isManagerReportWindowOpen("manager_morning_briefing", new Date("2026-11-27T08:59:00.000Z")), true);
  assert.equal(isManagerReportWindowOpen("manager_morning_briefing", new Date("2026-11-27T09:00:00.000Z")), false);
});

test("evening report opens at 18:00 Lagos and closes at 20:00", () => {
  assert.equal(isManagerReportWindowOpen("manager_evening_report", new Date("2026-11-27T17:00:00.000Z")), true);
  assert.equal(isManagerReportWindowOpen("manager_evening_report", new Date("2026-11-27T18:59:00.000Z")), true);
  assert.equal(isManagerReportWindowOpen("manager_evening_report", new Date("2026-11-27T19:00:00.000Z")), false);
});

test("morning and evening schedules do not overlap or run outside their windows", () => {
  const beforeMorning = new Date("2026-11-27T05:59:00.000Z");
  const between = new Date("2026-11-27T12:00:00.000Z");
  const beforeEvening = new Date("2026-11-27T16:59:00.000Z");
  const afterEvening = new Date("2026-11-27T19:00:00.000Z");
  assert.equal(isManagerReportWindowOpen("manager_morning_briefing", beforeMorning), false);
  assert.equal(isManagerReportWindowOpen("manager_evening_report", beforeMorning), false);
  assert.equal(isManagerReportWindowOpen("manager_morning_briefing", between), false);
  assert.equal(isManagerReportWindowOpen("manager_evening_report", between), false);
  assert.equal(isManagerReportWindowOpen("manager_evening_report", beforeEvening), false);
  assert.equal(isManagerReportWindowOpen("manager_evening_report", afterEvening), false);
});

import { createHash } from "node:crypto";
import { validateApprovedLinkedInDraft } from "./linkedin.js";

function contentHash(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

test("LinkedIn approval integrity preserves exact Unicode content", () => {
  const draft = "Abuja real estate: reduce risk, build trust.\\n\\nA ₦200M+ decision needs evidence. 🏡";
  const result = validateApprovedLinkedInDraft(draft, contentHash(draft), Array.from(draft).length);
  assert.equal(result.contentHash, contentHash(draft));
  assert.equal(result.characterCount, Array.from(draft).length);
  assert.equal(result.wordCount, draft.trim().split(/\\s+/).filter(Boolean).length);
});

test("LinkedIn publisher rejects content changed after founder approval", () => {
  const approved = "Original complete LinkedIn post.";
  assert.throws(() => validateApprovedLinkedInDraft(approved + " changed", contentHash(approved), Array.from(approved).length), /content hash does not match/);
});

test("LinkedIn publisher rejects incorrect approved character count", () => {
  const draft = "A complete post.";
  assert.throws(() => validateApprovedLinkedInDraft(draft, contentHash(draft), Array.from(draft).length + 1), /character count does not match/);
});

test("LinkedIn publisher rejects posts exceeding 3,000 characters", () => {
  const draft = "x".repeat(3001);
  assert.throws(() => validateApprovedLinkedInDraft(draft, contentHash(draft), Array.from(draft).length), /exceeds the 3,000-character limit/);
});

test("LinkedIn publisher rejects empty content", () => {
  assert.throws(() => validateApprovedLinkedInDraft("", contentHash(""), 0), /draft is empty/);
});
