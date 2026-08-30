import test from "node:test";
import assert from "node:assert/strict";

import { normalizeImportedLead, summarizeImportBatch } from "./imports.js";
import { buildSalesIntelligenceContext, validateValueDM } from "../aiEngine";

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

  assert.equal(summary.sourceCount, 4);
  assert.equal(summary.validCount, 2);
  assert.equal(summary.rejectedCount, 1);
  assert.equal(summary.duplicateSourceCount, 1);
  assert.equal(summary.newCount, 1);
  assert.equal(summary.updatedCount, 1);
  assert.equal(summary.failedCount, 2);
  assert.equal(summary.finalDatabaseCount, 2);
  assert.equal(summary.valid.length, 2);
  assert.equal(summary.rejected.length, 1);
  assert.equal(summary.duplicates.length, 1);
  assert.equal(summary.importable.length, 2);
});

test("summarizeImportBatch treats existing IDs as updates and tracks exact CRM sync counts", () => {
  const summary = summarizeImportBatch([
    { id: "lead-1", name: "A", company: "Co One", status: "New" },
    { id: "lead-1", name: "A", company: "Co One Updated", status: "DM Sent" },
    { id: "lead-2", name: "B", company: "Co Two", status: "New" },
    { id: "lead-2", name: "B", company: "Co Two Duplicate", status: "New" },
    { id: "lead-3", name: "", company: "Missing Name", status: "New" },
  ], new Set(["lead-1"]));

  assert.equal(summary.sourceCount, 5);
  assert.equal(summary.validCount, 2);
  assert.equal(summary.rejectedCount, 1);
  assert.equal(summary.duplicateSourceCount, 2);
  assert.equal(summary.newCount, 1);
  assert.equal(summary.updatedCount, 1);
  assert.equal(summary.failedCount, 3);
  assert.equal(summary.finalDatabaseCount, 2);
  assert.equal(summary.importable.length, 2);
  assert.equal(summary.duplicates.length, 2);
  assert.equal(summary.rejected.length, 1);
});

test("summarizeImportBatch keeps the latest row for duplicates within a file", () => {
  const summary = summarizeImportBatch([
    { id: "lead-9", name: "Ada", company: "Ada Realty", status: "New" },
    { id: "lead-9", name: "Ada", company: "Ada Realty", status: "DM Sent" },
  ], new Set(["lead-9"]));

  assert.equal(summary.validCount, 1);
  assert.equal(summary.duplicateSourceCount, 1);
  assert.equal(summary.updatedCount, 1);
  assert.equal(summary.newCount, 0);
  assert.equal(summary.valid[0].status, "DM Sent");
  assert.equal(summary.duplicates[0].id, "lead-9");
});

test("validateValueDM rejects sales-style call to action and asks", () => {
  const result = validateValueDM("I noticed your page and would love to chat about a quick call to see if we can help with your marketing.");
  assert.equal(result.pass, false);
  assert.match(result.reason, /call-to-action|sales ask/i);
});

test("validateValueDM accepts a value-first message without CTA", () => {
  const result = validateValueDM("Your listing pages are likely pushing buyers into a comparison trap. A stronger section would explain why this property fits a specific buyer profile and what trade-offs are acceptable, so the decision feels clearer and less risky.");
  assert.equal(result.pass, true);
});

test("buildSalesIntelligenceContext labels unknown findings and fact safety rules", () => {
  const context = buildSalesIntelligenceContext({
    id: "lead-x",
    name: "Jane", company: "Vale Realty",
    status: "New",
    service: "Lead Generation",
    clientType: "Real Estate Developer",
    notes: "No notes",
    attachments: [],
    conversationLog: [],
    completedFollowUps: [],
    auditLog: [],
    outboundMessages: [],
    dmText: "",
    prospectInitialResponse: "",
    prospectLatestResponse: "",
  } as any, [
    { status: "VERIFIED", label: "Instagram activity", detail: "Property walkthrough reels are active." },
    { status: "UNKNOWN", label: "Conversion rate", detail: "Cannot verify from public data." },
  ]);

  assert.match(context, /VERIFIED: Instagram activity/i);
  assert.match(context, /UNKNOWN: Conversion rate/i);
  assert.match(context, /Use VERIFIED facts as the primary basis/i);
});
