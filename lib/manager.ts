import type { Pool } from "pg";

const STOP_WORDS = new Set(["about","after","again","agent","also","and","are","can","could","from","have","help","into","just","more","need","please","that","them","then","there","this","with","would","your","what","when","where","which","who"]);

function terms(value: string): string[] {
  return [...new Set(value.toLowerCase().replace(/[^a-z0-9\\s-]/g, " ").split(/\\s+/).filter(word => word.length > 2 && !STOP_WORDS.has(word)))].slice(0,40);
}

export async function buildManagerKnowledgeContext(db: Pool, query = ""): Promise<string> {
  const [leadCounts, queueCounts, knowledge, insights, logs, leads] = await Promise.all([
    db.query("SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE LOWER(COALESCE(data->>'status','')) NOT IN ('closed','lost','converted','not interested','dnc'))::int AS active FROM leads"),
    db.query("SELECT status, action_type, COUNT(*)::int AS count FROM agent_queue GROUP BY status, action_type ORDER BY status, action_type"),
    db.query("SELECT data FROM knowledge_sources ORDER BY created_at DESC"),
    db.query("SELECT data FROM sales_learning_insights WHERE data->>'status'='VALIDATED' ORDER BY (data->>'confidence')::int DESC LIMIT 20"),
    db.query("SELECT agent_name, status, summary, created_at FROM agent_logs ORDER BY created_at DESC LIMIT 20"),
    db.query("SELECT id, data FROM leads"),
  ]);
  const keywords = terms(query);
  const score = (text: string) => keywords.reduce((total, word) => total + (text.toLowerCase().includes(word) ? 1 : 0), 0);
  const queue = queueCounts.rows.map((row: any) => `${row.action_type}/${row.status}: ${row.count}`).join("; ") || "No queue records";
  const rankedSources = knowledge.rows.map((row: any) => row.data || {}).filter((data: any) => data.enabled !== false && data.status !== "disabled").map((data: any) => {
    const text = [data.title, data.category, data.content, data.sourceUrl].filter(Boolean).join(" ");
    return { data, relevance: score(text) };
  }).sort((a: any, b: any) => b.relevance - a.relevance).slice(0,12);
  const sources = rankedSources.map(({data}: any) =>
    `[${data.category || "Knowledge"}] ${data.title || data.name || "Untitled source"}: ${String(data.content || data.extractedText || data.text || "").slice(0,900)} (source: ${data.sourceUrl || data.url || "internal"})`
  ).join("\\n");
  const patterns = insights.rows.map((row: any) => {
    const data = row.data || {};
    return `- ${data.pattern} Confidence ${data.confidence}; sample ${data.evidenceCount}.`;
  }).join("\\n");
  const activity = logs.rows.slice(0,12).map((row: any) => `- ${row.agent_name} ${row.status}: ${row.summary}`).join("\\n");
  const relevantLeads = leads.rows.map((row: any) => row.data || {}).map((lead: any) => {
    const thread = Array.isArray(lead.conversationLog) ? lead.conversationLog.slice(-4).map((entry: any) => `${entry.direction || entry.type || "message"}: ${String(entry.text || "").slice(0,260)}`).join("\\n") : "";
    const text = [lead.company, lead.name, lead.status, lead.clientType, lead.notes, lead.nextAction, lead.prospectLatestResponse, thread].filter(Boolean).join(" ");
    return { lead, thread, relevance: score(text) };
  }).filter((item: any) => item.relevance > 0).sort((a: any,b: any) => b.relevance - a.relevance).slice(0,8);
  const crmContext = relevantLeads.map(({lead,thread}: any) =>
    `- ${lead.company || lead.name || lead.id} | status: ${lead.status || "unknown"} | segment: ${lead.clientType || "unknown"} | next action: ${lead.nextAction || "not recorded"} | notes: ${String(lead.notes || "").slice(0,400)}\\nRecent thread:\\n${thread || "No conversation events recorded"}`
  ).join("\\n\\n");
  return [
    `CRM: ${leadCounts.rows[0]?.total || 0} total leads; ${leadCounts.rows[0]?.active || 0} active.`,
    `Review queue: ${queue}.`,
    "Relevant CRM records and recent conversation history:", crmContext || "No matching CRM records for this request.",
    "Validated learning insights:", patterns || "No validated insights yet.",
    "Relevant Knowledge Base excerpts:", sources || "No indexed knowledge sources found.",
    "Recent agent activity:", activity || "No agent activity recorded.",
  ].join("\\n\\n").slice(0,22000);
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
  ).join("\\n") || "• No agent runs recorded in the last 24 hours.";
  const l = learning.rows[0] || {};
  const day = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Lagos", dateStyle: "full" }).format(new Date());
  return [
    "DFQLABS OS1 — Head of Business Daily Brief",
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
  ].join("\\n");
}
