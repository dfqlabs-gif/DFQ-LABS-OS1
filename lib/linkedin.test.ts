import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { validateApprovedLinkedInDraft } from "./linkedin.js";

test("accepts exact approved LinkedIn content and counts Unicode code points", () => {
  const content = "Hello 👋\n\nA complete founder-approved post.";
  const hash = createHash("sha256").update(content, "utf8").digest("hex");
  const result = validateApprovedLinkedInDraft(content, hash, Array.from(content).length);
  assert.equal(result.contentHash, hash);
  assert.equal(result.characterCount, Array.from(content).length);
  assert.equal(result.wordCount, 6);
});

test("rejects content changed after founder approval", () => {
  const approved = "Original complete post.";
  const hash = createHash("sha256").update(approved, "utf8").digest("hex");
  assert.throws(
    () => validateApprovedLinkedInDraft(approved + " changed", hash, Array.from(approved).length),
    /hash does not match|character count does not match/,
  );
});

test("rejects empty content and posts beyond the feed character limit", () => {
  assert.throws(() => validateApprovedLinkedInDraft("", "", 0), /empty/);
  const long = "x".repeat(3001);
  const hash = createHash("sha256").update(long, "utf8").digest("hex");
  assert.throws(() => validateApprovedLinkedInDraft(long, hash, long.length), /3,000-character limit/);
});
