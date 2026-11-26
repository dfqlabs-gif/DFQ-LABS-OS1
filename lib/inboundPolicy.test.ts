import test from "node:test";
import assert from "node:assert/strict";
import { isRoutineInboundFaq } from "./inboundPolicy";

test("routine factual FAQ questions are eligible for knowledge-grounded auto-reply", () => {
  assert.equal(isRoutineInboundFaq("What services do you offer?"), true);
  assert.equal(isRoutineInboundFaq("What does the audit cover?"), true);
  assert.equal(isRoutineInboundFaq("Where are you based?"), true);
});

test("commercial, sensitive and ambiguous inbound messages require founder review", () => {
  assert.equal(isRoutineInboundFaq("How much does your audit cost?"), false);
  assert.equal(isRoutineInboundFaq("Can you send us a proposal?"), false);
  assert.equal(isRoutineInboundFaq("I want to book a meeting."), false);
  assert.equal(isRoutineInboundFaq("Stop messaging me."), false);
  assert.equal(isRoutineInboundFaq("We are interested."), false);
  assert.equal(isRoutineInboundFaq("Hi"), false);
});

test("FAQ classifier rejects oversized or empty messages", () => {
  assert.equal(isRoutineInboundFaq(""), false);
  assert.equal(isRoutineInboundFaq("x".repeat(701)), false);
});
