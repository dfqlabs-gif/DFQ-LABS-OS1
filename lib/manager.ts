import type { Pool } from "pg";

export async function buildManagerKnowledgeContext(db: Pool): Promise<string> {
  const [leadCounts, queueCounts, knowledge, insights, logs] = await Promise.all([
    db.query("SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE LOWER(COALESCE(data->>'status','')) NOT IN ('closed','lost','converted','not interested','dnc'))::int AS active FROM leads"),
    db.query("SELECT status, action_type, COUNT(*)::int AS count FROM agent_queue GROUP BY status, action_type ORDER BY status, action_type"),
    db.query("SELECT data FROM knowledge_sources ORDER BY created_at DESC LIMIT 12"),
    db.query("SELECT data FROM sales_learning_insights WHERE data->>'status'='VALIDATED' ORDER BY (data->>'confidence')::int DESC LIMIT 12"),
    db.query("SELECT agent_name, status, summary, created_at FROM agent_logs ORDER BY created_at DESC LIMIT 12"),
  ]);
  const queue = queueCounts.rows.map((row: any) => `${row.action_type}/${row.status}: ${row.count}`).join("; ") || "No queue records";
  const sources = knowledge.rows.map((row: any) => { const data = row.data || {}; return `[${data.category || "Knowledge"}] ${data.title || data.name || "Untitled source"}: ${String(data.content || data.extractedText || data.text || "").slice(0,900)} (source: ${data.sourceUrl || data.url || "internal"})`; }).join("\n");
  const patterns = insights.rows.map((row: any) => {
    const data = row.data || {};
    return `- ${data.pattern} Confidence ${data.confidence}; sample ${data.evidenceCount}.`;
  }).join("\n");
  const activity = logs.rows.map((row: any) => `- ${row.agent_name} ${row.status}: ${row.summary}`).join("\n");
  return [
    `CRM: ${leadCounts.rows[0]?.total || 0} total leads; ${leadCounts.rows[0]?.active || 0} active.`,
    `Review queue: ${queue}.`,
    "Validated learning insights:", patterns || "No validated insights yet.",
    "Knowledge Base excerpts:", sources || "No indexed knowledge sources found.",
    "Recent agent activity:", activity || "No agent activity recorded.",
  ].join("\n\n").slice(0,18000);
}

export async function buildManagerDailyReport(db: Pool): Promise<string> {
  const [leads, queue, agents, learning] = await Promise.all([
    db.query(`SELECT COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE LOWER(COALESCE(data->>'status','')) NOT IN ('closed','lost','converted','not interested','dnc'))::int AS active,
      COUNT(*) FILTER (WHERE LOWER(COALESCE(data->>'status','')) IN ('closed','converted','client closed'))::int AS won
      FROM leads`),
    db.query(`SELECT
      COUNT(*) FILTER (WHERE status='pending_approval')::int AS pending,
      COUNT(*) FILTER (WHERE status='sent' AND sent_at >= NOW() - INTERVAL '24 hours')::int AS sent_24h,
      COUNT(*) FILTER (WHERE status='failed' AND updated_at >= NOW() - INTERVAL '24 hours')::int AS failed_24h
      FROM agent_queue`),
    db.query(`SELECT agent_name, status, summary, items_processed, created_at
      FROM agent_logs WHERE created_at >= NOW() - INTERVAL '24 hours'
      ORDER BY created_at DESC LIMIT 30`),
    db.query(`SELECT COUNT(*)::int AS events,
      COUNT(*) FILTER (WHERE data->>'outcome' IN ('POSITIVE_REPLY','QUESTION','INTERESTED','PRICING_REQUEST','MEETING_REQUEST','MEETING_BOOKED','QUALIFIED','CONVERTED'))::int AS positive,
      COUNT(*) FILTER (WHERE data->>'outcome'='MEETING_BOOKED')::int AS meetings,
      COUNT(*) FILTER (WHERE data->>'outcome'='CONVERTED')::int AS conversions
      FROM sales_learning_events WHERE updated_at >= NOW() - INTERVAL '24 hours'`),
  ]);
  const recent = agents.rows.slice(0,8).map((row: any) =>
    `• ${row.agent_name}: ${row.status} — ${row.summary} (${row.items_processed} items)`
  ).join("\n") || "• No agent runs recorded in the last 24 hours.";
  const l = learning.rows[0] || {};
  const day = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Lagos", dateStyle: "full" }).format(new Date());
  return [
    `DFQLABS OS1 — Head of Business Daily Brief`,
    day,
    "",
    `CRM: ${leads.rows[0]?.total || 0} total leads · ${leads.rows[0]?.active || 0} active · ${leads.rows[0]?.won || 0} recorded won`,
    `Review queue: ${queue.rows[0]?.pending || 0} awaiting approval`,
    `Last 24h: ${queue.rows[0]?.sent_24h || 0} messages sent · ${queue.rows[0]?.failed_24h || 0} failed queue items`,
    `Learning: ${l.events || 0} updated events · ${l.positive || 0} positive outcomes · ${l.meetings || 0} meetings · ${l.conversions || 0} conversions`,
    "",
    "Agent activity (latest first):",
    recent,
    "",
    "Governance: outbound messaging remains founder-approval-only. Figures reflect recorded OS1 data; missing CRM events are not inferred.",
  ].join("\n");
}
