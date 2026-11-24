import test from "node:test";
import assert from "node:assert/strict";

import { containsExplicitOptOut, isExplicitOptOut } from "./agentSafety.js";

test("detects explicit opt-out phrases", () => {
  for (const message of ["STOP", "unsubscribe", "remove me", "do not contact me", "Please stop contacting me.", "not interested"]) {
    assert.equal(isExplicitOptOut(message), true, message);
  }
});

test("detects clear stop-sending instructions in longer messages", () => {
  assert.equal(isExplicitOptOut("Please stop sending me WhatsApp messages."), true);
  assert.equal(isExplicitOptOut("Remove me from your contact list"), true);
});

test("does not confuse property disinterest or incidental wording with an opt-out", () => {
  assert.equal(isExplicitOptOut("I'm not interested in the property."), false);
  assert.equal(isExplicitOptOut("Please stop by our office tomorrow."), false);
  assert.equal(isExplicitOptOut("Not interested in this particular development, thanks."), false);
});

test("checks a saved conversation collection", () => {
  assert.equal(containsExplicitOptOut(["Can you send details?", "Stop messaging me"]), true);
  assert.equal(containsExplicitOptOut(["Not interested in the property", "Maybe later"]), false);
});
