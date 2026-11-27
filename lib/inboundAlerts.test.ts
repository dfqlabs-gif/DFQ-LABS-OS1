import test from "node:test";
import assert from "node:assert/strict";
import { classifyInboundCommercialSignal } from "./inboundAlerts.js";

test("detects meeting and viewing requests", () => {
  assert.equal(classifyInboundCommercialSignal("Can we schedule a call next week?")?.type, "meeting_request");
  assert.equal(classifyInboundCommercialSignal("We would like to arrange a property viewing.")?.type, "meeting_request");
});

test("detects pricing and commercial requests without suggesting a price", () => {
  const signal = classifyInboundCommercialSignal("How much do you charge for the audit?");
  assert.equal(signal?.type, "pricing_request");
  assert.match(signal?.nextAction || "", /Do not invent or commit to pricing/);
});

test("detects positive interest but not generic or negative replies", () => {
  assert.equal(classifyInboundCommercialSignal("We are interested in working with you.")?.type, "positive_interest");
  assert.equal(classifyInboundCommercialSignal("Not interested, please stop contacting us."), null);
  assert.equal(classifyInboundCommercialSignal("Thanks, noted."), null);
});

test("audit requests are left to the richer audit opportunity alert", () => {
  assert.equal(classifyInboundCommercialSignal("Please send the audit details."), null);
});
