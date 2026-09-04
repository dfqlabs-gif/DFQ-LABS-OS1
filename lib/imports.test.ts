import test from "node:test";
import assert from "node:assert/strict";

import { getImportStageMeta, normalizeImportedLead, runSnapshotReplaceTransaction, summarizeImportBatch, summarizeSnapshotImport } from "./imports.js";
import { buildSalesIntelligenceContext, validateValueDM } from "../aiEngine";
import { applySentMessage, applyWhatsAppOpened } from "./execution";
import { newOutboundMessage } from "./outbound";

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

test("snapshot imports preserve a named lead with blank company using the established fallback", () => {
  const summary = summarizeSnapshotImport([{ id: "lead-blank-company", name: "Known Contact", company: "   " }]);

  assert.equal(summary.validCount, 1);
  assert.equal(summary.rejectedCount, 0);
  assert.equal(summary.valid[0].name, "Known Contact");
  assert.equal(summary.valid[0].company, "Unknown Company");
});

test("snapshot imports recover an unambiguous Team at Company contact label without changing the contact", () => {
  const summary = summarizeSnapshotImport([{ id: "lead-team", name: "Team at Acme Homes", company: "" }]);

  assert.equal(summary.validCount, 1);
  assert.equal(summary.rejectedCount, 0);
  assert.equal(summary.valid[0].name, "Team at Acme Homes");
  assert.equal(summary.valid[0].company, "Acme Homes");
});

test("snapshot imports still reject a missing required name", () => {
  const summary = summarizeSnapshotImport([{ id: "lead-no-name", name: "  ", company: "Acme Homes" }]);

  assert.equal(summary.validCount, 0);
  assert.equal(summary.rejectedCount, 1);
  assert.equal(summary.rejected[0].reason, "missing required name");
});

test("runSnapshotReplaceTransaction uses one DB client for the whole snapshot transaction", async () => {
  const calls: string[] = [];
  const client = {
    query: async (sql: string, params?: any[]) => {
      calls.push(sql);
      if (sql === "BEGIN") return { rows: [] };
      if (sql.startsWith("DELETE FROM leads")) return { rows: [] };
      if (sql.startsWith("INSERT INTO leads")) return { rows: [] };
      if (sql.startsWith("DELETE FROM lead_attachments")) return { rows: [] };
      if (sql === "COMMIT") return { rows: [] };
      if (sql === "ROLLBACK") return { rows: [] };
      return { rows: [] };
    },
    release: () => { calls.push("release"); },
  };

  const pool = {
    connect: async () => client,
    query: async () => {
      throw new Error("pool.query must not be used inside snapshot transaction");
    },
  };

  await runSnapshotReplaceTransaction(pool as any, [{ id: "lead-1", name: "A", company: "Co", status: "New" }]);

  assert.deepEqual(calls, [
    "BEGIN",
    "DELETE FROM leads",
    "INSERT INTO leads (id, data, updated_at) VALUES ($1, $2::jsonb, NOW())",
    "DELETE FROM lead_attachments WHERE lead_id != ALL($1::text[])",
    "COMMIT",
    "release",
  ]);
});

test("import stage metadata follows the expected glacier-blue progress sequence", () => {
  assert.equal(getImportStageMeta("reading").progress, 10);
  assert.equal(getImportStageMeta("validating").progress, 25);
  assert.equal(getImportStageMeta("deduplicating").progress, 40);
  assert.equal(getImportStageMeta("preparing").progress, 55);
  assert.equal(getImportStageMeta("importing").progress, 75);
  assert.equal(getImportStageMeta("verifying").progress, 90);
  assert.equal(getImportStageMeta("success").progress, 100);
  assert.equal(getImportStageMeta("error").title, "Import failed");
  assert.equal(getImportStageMeta("idle").progress, 0);
});

test("summarizeSnapshotImport replaces the authoritative dataset and rejects empty snapshots", () => {
  const summary = summarizeSnapshotImport([
    { id: "dup-1", name: "A", company: "Co", source: "Imported", assignedTo: "Sa'adatu Mohammed", status: "New" },
    { id: "dup-1", name: "A", company: "Co", source: "Imported", assignedTo: "Sa'adatu Mohammed", status: "New" },
    { id: "dup-2", name: "", company: "Co", source: "Imported", assignedTo: "Sa'adatu Mohammed", status: "New" },
    { id: "dup-3", name: "B", company: "Co", source: "Imported", assignedTo: "Sa'adatu Mohammed", status: "New" },
  ]);

  assert.equal(summary.sourceCount, 4);
  assert.equal(summary.validCount, 2);
  assert.equal(summary.rejectedCount, 1);
  assert.equal(summary.duplicateSourceCount, 1);
  assert.equal(summary.newCount, 2);
  assert.equal(summary.updatedCount, 0);
  assert.equal(summary.failedCount, 2);
  assert.equal(summary.finalDatabaseCount, 2);
  assert.equal(summary.valid.length, 2);
  assert.equal(summary.rejected.length, 1);
  assert.equal(summary.duplicates.length, 1);
  assert.equal(summary.importable.length, 2);
  assert.equal(summary.replaceMode, true);

  const empty = summarizeSnapshotImport([]);
  assert.equal(empty.validCount, 0);
  assert.equal(empty.rejectedCount, 0);
  assert.equal(empty.canReplace, false);
});

test("summarizeSnapshotImport keeps the latest row for duplicates within a file and counts replacement size correctly", () => {
  const summary = summarizeSnapshotImport([
    { id: "lead-9", name: "Ada", company: "Ada Realty", status: "New" },
    { id: "lead-9", name: "Ada", company: "Ada Realty", status: "DM Sent" },
  ]);

  assert.equal(summary.validCount, 1);
  assert.equal(summary.duplicateSourceCount, 1);
  assert.equal(summary.updatedCount, 0);
  assert.equal(summary.newCount, 1);
  assert.equal(summary.valid[0].status, "DM Sent");
  assert.equal(summary.duplicates[0].id, "lead-9");
  assert.equal(summary.finalDatabaseCount, 1);
});

test("summarizeImportBatch preserves the legacy incremental sync behavior for non-snapshot import paths", () => {
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

test("applyWhatsAppOpened records the human-approved handoff without marking it sent", () => {
  const lead = {
    id: "lead-1",
    name: "Jane",
    company: "Vale Realty",
    status: "New",
    dmText: "",
    prospectInitialResponse: "",
    prospectLatestResponse: "",
    conversationLog: [],
    completedFollowUps: [],
    outboundMessages: [
      newOutboundMessage({ leadId: "lead-1", userId: "user-1", messageType: "VALUE_DM", messageText: "Test message", source: "mission_control" }),
    ],
  } as any;

  const next = applyWhatsAppOpened(lead, lead.outboundMessages[0].id);
  assert.equal(next.outboundMessages[0].status, "WHATSAPP_OPENED");
  assert.ok(next.outboundMessages[0].whatsappOpenedAt);
  assert.equal(next.outboundMessages[0].sentAt, undefined);
});

test("applySentMessage logs the outbound message and marks the follow-up as completed", () => {
  const lead = {
    id: "lead-2",
    name: "Ada",
    company: "Ada Holdings",
    status: "New",
    dmText: "",
    prospectInitialResponse: "",
    prospectLatestResponse: "",
    conversationLog: [],
    completedFollowUps: [],
    followUpCount: 0,
    outboundMessages: [
      newOutboundMessage({ leadId: "lead-2", userId: "user-1", messageType: "VALUE_DM", messageText: "A concrete insight", source: "ask_ai" }),
    ],
  } as any;

  const next = applySentMessage(lead, "A concrete insight", "VALUE_DM", "user-1", lead.outboundMessages[0].id, "Value-first message");

  assert.equal(next.outboundMessages[0].status, "SENT");
  assert.equal(next.dmText, "A concrete insight");
  assert.equal(next.followUpCount, 1);
  assert.equal(next.conversationLog.length, 1);
  assert.equal(next.conversationLog[0].type, "dm");
  assert.match(next.conversationLog[0].label, /VALUE_DM/i);
});
