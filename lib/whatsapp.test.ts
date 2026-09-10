import test from "node:test";
import assert from "node:assert/strict";

import { buildWhatsAppLink, normalizePhone } from "./phone";

test("WhatsApp links use normalized digits and encode only the message once", () => {
  const phone = normalizePhone("0801 234 5678");
  assert.equal(phone.valid, true);
  assert.equal(phone.digits, "2348012345678");
  assert.equal(
    buildWhatsAppLink(phone.international, "A useful insight & next step"),
    "https://wa.me/2348012345678?text=A%20useful%20insight%20%26%20next%20step",
  );
});

test("WhatsApp number normalization rejects an empty number", () => {
  const phone = normalizePhone("");
  assert.equal(phone.valid, false);
  assert.match(phone.error || "", /no phone number/i);
});
