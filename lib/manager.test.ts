import assert from "node:assert/strict";
import test from "node:test";
import { buildManagerDailyReport } from "./manager.js";

test("manager report separates confirmed outreach target from Scout sourcing and drafts", async () => {
  const db = {
    query: async (sql: string) => {
      if (sql.includes("AS total") && sql.includes("FROM leads")) return { rows: [{ total: 531, active: 518, won: 2 }] };
      if (sql.includes("FROM agent_queue")) return { rows: [{
        pending: 22, sent_today: 2, first_touch: 1, value_dm: 1, follow_ups: 0,
        inbound_replies_sent: 0, failed_today: 0, unique_prospects_contacted: 2,
        outreach_pending: 1, value_pending: 20, linkedin_pending: 1, rejected_value_today: 11,
      }] };
      if (sql.includes("agent_name='scout'")) return { rows: [{ status: "halted_circuit_breaker", summary: "Search provider quota limit." }] };
      if (sql.includes("FROM agent_logs")) return { rows: [] };
      if (sql.includes("FROM sales_learning_events")) return { rows: [{ events: 0, positive: 0, meetings: 0, conversions: 0 }] };
      if (sql.includes("FROM agent_whatsapp_events")) return { rows: [{ received: 0 }] };
      if (sql.includes("AS new_leads FROM leads")) return { rows: [{ new_leads: 0 }] };
      throw new Error("Unexpected manager report query: " + sql);
    },
  };
  const report = await buildManagerDailyReport(db as any);
  assert.match(report, /Distinct prospects with confirmed outreach: 2\/30/);
  assert.match(report, /Remaining to target: 28/);
  assert.match(report, /Outreach drafts awaiting approval: 1/);
  assert.match(report, /Value DM drafts awaiting approval: 20/);
  assert.match(report, /LinkedIn articles awaiting approval: 1/);
  assert.match(report, /Rejected value DMs today: 11/);
  assert.match(report, /This is a lead-sourcing status; it does not automatically stop outreach to eligible leads already in the CRM/);
  assert.match(report, /531 total · 518 active/);
});
