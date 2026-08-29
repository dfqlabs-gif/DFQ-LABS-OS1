import test from "node:test";
import assert from "node:assert/strict";

import { normalizeImportedLead, summarizeImportBatch } from "./imports.js";

test("normalizeImportedLead fills safe defaults and preserves valid field data", () => {
  const lead = normalizeImportedLead({
    name: "Jane Doe",
    company: "Acme Homes",
    phone: "08012345678",
    email: "jane@example.com"
  }, 0);

  assert.equal(lead.id.startsWith("imp-"), true);
  assert.equal(lead.source, "Imported");
  assert.equal(lead.status, "New");
  assert.equal(lead.assignedTo, "Unassigned");
  assert.equal(lead.clientType, "Real Estate");
  assert.equal(lead.service, "Lead Generation");
  assert.equal(lead.priority, "Medium");
});

test("summarizeImportBatch counts invalid duplicates and valid imports distinctly", () => {
  const summary = summarizeImportBatch([
    { id: "dup-1", name: "A", company: "Co", source: "Imported", assignedTo: "Sa'adatu Mohammed", status: "New" },
    { id: "dup-1", name: "A", company: "Co", source: "Imported", assignedTo: "Sa'adatu Mohammed", status: "New" },
    { id: "dup-2", name: "", company: "Co", source: "Imported", assignedTo: "Sa'adatu Mohammed", status: "New" },
    { id: "dup-3", name: "B", company: "Co", source: "Imported", assignedTo: "Sa'adatu Mohammed", status: "New" },
  ], new Set(["dup-3"]));

  assert.equal(summary.valid.length, 1);
  assert.equal(summary.rejected.length, 1);
  assert.equal(summary.duplicates.length, 2);
  assert.equal(summary.importable.length, 1);
});
