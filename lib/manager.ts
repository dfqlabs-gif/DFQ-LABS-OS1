import type { Pool } from "pg";

const STOP_WORDS = new Set(["about","after","again","agent","also","and","are","can","could","from","have","help","into","just","more","need","please","that","them","then","there","this","with","would","your","what","when","where","which","who"]);

function terms(value: string): string[] {
  return [...new Set(value.toLowerCase().replace(/[^a-z0-9\s-]/g, " ").split(/\s+/).filter(word => word.length > 2 && !STOP_WORDS.has(word)))].slice(0,40);
}

export async function buildManagerKnowledgeContext(db: Pool, query = ""): Promise<string> {
  const [leadCounts, queueCounts, knowledge, insights, logs, leads] = await Promise.all([
    db.query("SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE LOWER(COALESCE(data->>'status','')) NOT IN ('closed','lost','converted','not interested','dnc'))::int AS active FROM leads"),
    db.query("SELECT status, action_type, COUNT(*)::int AS count FROM agent_queue GROUP BY status, action_type ORDER BY status, action_type"),
    db.query("SELECT data FROM knowledge_sources ORDER BY created_at DESC"),
    db.query("SELECT data FROM sales_learning_insights WHERE data->>'status'='VALIDATED' ORDER BY COALESCE((data->>'confidence')::numeric,0) DESC LIMIT 20"),
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
  ).join("\n");
  const patterns = insights.rows.map((row: any) => {
    const data = row.data || {};
    return `- ${data.pattern} Confidence ${data.confidence}; sample ${data.evidenceCount}.`;
  }).join("\n");
  const activity = logs.rows.slice(0,12).map((row: any) => `- ${row.agent_name} ${row.status}: ${row.summary}`).join("\n");
  const relevantLeads = leads.rows.map((row: any) => row.data || {}).map((lead: any) => {
    const thread = Array.isArray(lead.conversationLog) ? lead.conversationLog.slice(-4).map((entry: any) => `${entry.direction || entry.type || "message"}: ${String(entry.text || "").slice(0,260)}`).join("\n") : "";
    const text = [lead.company, lead.name, lead.status, lead.clientType, lead.notes, lead.nextAction, lead.prospectLatestResponse, thread].filter(Boolean).join(" ");
    return { lead, thread, relevance: score(text) };
  }).filter((item: any) => item.relevance > 0).sort((a: any,b: any) => b.relevance - a.relevance).slice(0,8);
  const crmContext = relevantLeads.map(({lead,thread}: any) =>
    `- ${lead.company || lead.name || lead.id} | status: ${lead.status || "unknown"} | segment: ${lead.clientType || "unknown"} | next action: ${lead.nextAction || "not recorded"} | notes: ${String(lead.notes || "").slice(0,400)}\nRecent thread:\n${thread || "No conversation events recorded"}`
  ).join("\n\n");
  return [
    `CRM: ${leadCounts.rows[0]?.total || 0} total leads; ${leadCounts.rows[0]?.active || 0} active.`,
    `Review queue: ${queue}.`,
    "Relevant CRM records and recent conversation history:", crmContext || "No matching CRM records for this request.",
    "Validated learning insights:", patterns || "No validated insights yet.",
    "Relevant Knowledge Base excerpts:", sources || "No indexed knowledge sources found.",
    "Recent agent activity:", activity || "No agent activity recorded.",
  ].join("\n\n").slice(0,22000);
}

export async function buildManagerDailyReport(db: Pool): Promise<string> {
  const dayStart = "(date_trunc('day', NOW() AT TIME ZONE 'Africa/Lagos') AT TIME ZONE 'Africa/Lagos')";
  const [leads, queue, agents, learning, inbound, pipeline, scoutState] = await Promise.all([
    db.query(`SELECT COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE LOWER(COALESCE(data->>'status','')) NOT IN ('closed','lost','converted','not interested','dnc'))::int AS active,
      COUNT(*) FILTER (WHERE LOWER(COALESCE(data->>'status','')) IN ('closed','converted','client closed'))::int AS won
      FROM leads`),
    db.query(`SELECT
      COUNT(*) FILTER (WHERE status='pending_approval')::int AS pending,
      COUNT(*) FILTER (WHERE status='sent' AND sent_at >= ${dayStart})::int AS sent_today,
      COUNT(*) FILTER (WHERE status='sent' AND sent_at >= ${dayStart} AND action_type='outreach_dm')::int AS first_touch,
      COUNT(*) FILTER (WHERE status='sent' AND sent_at >= ${dayStart} AND action_type='value_dm')::int AS value_dm,
      COUNT(*) FILTER (WHERE status='sent' AND sent_at >= ${dayStart} AND action_type='follow_up' AND COALESCE(metadata->>'messageType','') <> 'RESPONSE_DM')::int AS follow_ups,
      COUNT(*) FILTER (WHERE status='sent' AND sent_at >= ${dayStart} AND COALESCE(metadata->>'messageType','')='RESPONSE_DM')::int AS inbound_replies_sent,
      COUNT(*) FILTER (WHERE status='failed' AND updated_at >= ${dayStart})::int AS failed_today,
      COUNT(DISTINCT lead_id) FILTER (WHERE status='sent' AND sent_at >= ${dayStart} AND action_type IN ('outreach_dm','value_dm','follow_up') AND COALESCE(metadata->>'messageType','') <> 'RESPONSE_DM' AND lead_id IS NOT NULL)::int AS unique_prospects_contacted,
      COUNT(*) FILTER (WHERE status='pending_approval' AND action_type='outreach_dm')::int AS outreach_pending,
      COUNT(*) FILTER (WHERE status='pending_approval' AND action_type='value_dm')::int AS value_pending,
      COUNT(*) FILTER (WHERE status='pending_approval' AND action_type='linkedin_article')::int AS linkedin_pending,
      COUNT(*) FILTER (WHERE status='rejected' AND action_type='value_dm' AND updated_at >= ${dayStart})::int AS rejected_value_today
      FROM agent_queue`),
    db.query(`SELECT agent_name, status, summary, items_processed, created_at
      FROM agent_logs WHERE created_at >= ${dayStart}
      ORDER BY created_at DESC LIMIT 20`),
    db.query(`SELECT COUNT(*)::int AS events,
      COUNT(*) FILTER (WHERE data->>'outcome' IN ('POSITIVE_REPLY','QUESTION','INTERESTED','PRICING_REQUEST','MEETING_REQUEST','MEETING_BOOKED','QUALIFIED','CONVERTED'))::int AS positive,
      COUNT(*) FILTER (WHERE data->>'outcome'='MEETING_BOOKED')::int AS meetings,
      COUNT(*) FILTER (WHERE data->>'outcome'='CONVERTED')::int AS conversions
      FROM sales_learning_events WHERE updated_at >= ${dayStart}`),
    db.query(`SELECT COUNT(*)::int AS received FROM agent_whatsapp_events WHERE received_at >= ${dayStart}`),
    db.query(`SELECT COUNT(*)::int AS new_leads FROM leads WHERE NULLIF(data->>'dateAdded','')::timestamptz >= ${dayStart}`),
    db.query("SELECT status, summary, created_at FROM agent_logs WHERE agent_name='scout' ORDER BY created_at DESC LIMIT 1"),
  ]);
  const recent = agents.rows.slice(0,6).map((row: any) =>
    `• ${row.agent_name}: ${row.status} — ${row.summary} (${row.items_processed} items)`
  ).join("\n") || "• No agent runs recorded today.";
  const q = queue.rows[0] || {};
  const l = learning.rows[0] || {};
  const dailyTarget = 30;
  const uniqueProspectsContacted = Number(q.unique_prospects_contacted || 0);
  const remainingTarget = Math.max(0, dailyTarget - uniqueProspectsContacted);
  const scout = scoutState.rows[0];
  const scoutStatus = scout
    ? `• Latest Scout run: ${scout.status} — ${String(scout.summary || "No summary recorded").slice(0,220)}. This is a lead-sourcing status; it does not automatically stop outreach to eligible leads already in the CRM.`
    : "• No Scout run is recorded yet.";
  const day = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Lagos", dateStyle: "full" }).format(new Date());
  return [
    "DFQLABS OS1 — DAILY EXECUTIVE REPORT",
    day,
    "",
    "DAILY OUTREACH TARGET",
    `• Distinct prospects with confirmed outreach: ${uniqueProspectsContacted}/${dailyTarget}`,
    `• Remaining to target: ${remainingTarget}`,
    "Only confirmed sends to distinct CRM leads count toward this target; drafts, approvals and inbound replies do not.",
    "",
    "OUTREACH",
    `• First-touch DMs sent: ${q.first_touch || 0}`,
    `• Value DMs sent: ${q.value_dm || 0}`,
    `• Follow-ups sent: ${q.follow_ups || 0}`,
    `• Inbound replies sent: ${q.inbound_replies_sent || 0}`,
    `• Total confirmed WhatsApp sends: ${q.sent_today || 0}`,
    `• Failed sends: ${q.failed_today || 0}`,
    "",
    "PIPELINE & REVIEW QUEUE",
    `• New leads added today: ${pipeline.rows[0]?.new_leads || 0}`,
    `• Inbound messages received: ${inbound.rows[0]?.received || 0}`,
    `• CRM: ${leads.rows[0]?.total || 0} total · ${leads.rows[0]?.active || 0} active · ${leads.rows[0]?.won || 0} recorded won`,
    `• Outreach drafts awaiting approval: ${q.outreach_pending || 0}`,
    `• Value DM drafts awaiting approval: ${q.value_pending || 0}`,
    `• LinkedIn articles awaiting approval: ${q.linkedin_pending || 0}`,
    `• Rejected value DMs today: ${q.rejected_value_today || 0}`,
    `• Total items awaiting approval: ${q.pending || 0}`,
    "",
    "SCOUT / SOURCING",
    scoutStatus,
    "",
    "LEARNING & CONVERSION",
    `• Learning events: ${l.events || 0} · positive signals: ${l.positive || 0} · meetings: ${l.meetings || 0} · conversions: ${l.conversions || 0}`,
    "",
    "AGENT ACTIVITY",
    recent,
    "",
    "Governance: only confirmed dispatcher sends count as sent. Drafts, approvals, attempts and failures are reported separately. Inbound routine replies are sent only within the approved FAQ policy; sensitive or uncertain messages remain in founder review.",
  ].join("\n");
}

export async function buildManagerMorningBriefing(db: Pool): Promise<string> {
  const yesterdayStart = "((date_trunc('day', NOW() AT TIME ZONE 'Africa/Lagos') - INTERVAL '1 day') AT TIME ZONE 'Africa/Lagos')";
  const todayStart = "(date_trunc('day', NOW() AT TIME ZONE 'Africa/Lagos') AT TIME ZONE 'Africa/Lagos')";
  const [outreach, pipeline, signals, queue, blockers, dateLabel] = await Promise.all([
    db.query(`SELECT
      COUNT(*) FILTER (WHERE action_type='outreach_dm')::int AS first_touch,
      COUNT(*) FILTER (WHERE action_type='value_dm')::int AS value_dm,
      COUNT(*) FILTER (WHERE action_type='follow_up' AND COALESCE(metadata->>'messageType','') <> 'RESPONSE_DM')::int AS follow_ups,
      COUNT(*) FILTER (WHERE COALESCE(metadata->>'messageType','')='RESPONSE_DM')::int AS replies_sent,
      COUNT(*)::int AS total_sent
      FROM agent_queue WHERE status='sent' AND sent_at >= ${yesterdayStart} AND sent_at < ${todayStart}`),
    db.query(`SELECT COUNT(*)::int AS new_leads FROM leads
      WHERE NULLIF(data->>'dateAdded','')::timestamptz >= ${yesterdayStart}
        AND NULLIF(data->>'dateAdded','')::timestamptz < ${todayStart}`),
    db.query(`SELECT
      COUNT(*) FILTER (WHERE data->>'outcome' IN ('POSITIVE_REPLY','QUESTION','INTERESTED','PRICING_REQUEST','MEETING_REQUEST','MEETING_BOOKED','QUALIFIED','CONVERTED'))::int AS positive,
      COUNT(*) FILTER (WHERE data->>'outcome'='MEETING_BOOKED')::int AS meetings,
      COUNT(*) FILTER (WHERE data->>'outcome'='CONVERTED')::int AS conversions
      FROM sales_learning_events WHERE updated_at >= ${yesterdayStart} AND updated_at < ${todayStart}`),
    db.query(`SELECT
      COUNT(*) FILTER (WHERE status='pending_approval')::int AS pending,
      COUNT(*) FILTER (WHERE status='approved')::int AS approved,
      COUNT(*) FILTER (WHERE status='failed')::int AS failed
      FROM agent_queue`),
    db.query(`SELECT agent_name, status, summary FROM agent_logs
      WHERE created_at >= ${yesterdayStart} AND created_at < ${todayStart}
        AND status IN ('error','halted_circuit_breaker')
      ORDER BY created_at DESC LIMIT 5`),
    db.query(`SELECT to_char(NOW() AT TIME ZONE 'Africa/Lagos','FMDay, DD FMMonth YYYY') AS today`),
  ]);
  const o = outreach.rows[0] || {};
  const s = signals.rows[0] || {};
  const q = queue.rows[0] || {};
  const issueLines = blockers.rows.map((row: any) => `• ${row.agent_name}: ${row.status} — ${row.summary}`).join("\n") || "• No agent errors or circuit-breaker halts recorded yesterday.";
  return [
    "DFQLABS OS1 — MORNING OPERATING BRIEFING",
    String(dateLabel.rows[0]?.today || ""),
    "",
    "YESTERDAY'S CONFIRMED OUTCOMES",
    `• First-touch DMs sent: ${o.first_touch || 0}`,
    `• Value DMs sent: ${o.value_dm || 0}`,
    `• Follow-ups sent: ${o.follow_ups || 0}`,
    `• Inbound replies sent: ${o.replies_sent || 0}`,
    `• Total confirmed sends: ${o.total_sent || 0}`,
    `• New CRM leads: ${pipeline.rows[0]?.new_leads || 0}`,
    `• Positive signals: ${s.positive || 0} · meetings booked: ${s.meetings || 0} · recorded conversions: ${s.conversions || 0}`,
    "",
    "TODAY'S OPERATING QUEUE",
    `• Drafts awaiting founder approval: ${q.pending || 0}`,
    `• Approved and awaiting dispatch: ${q.approved || 0}`,
    `• Failed queue items requiring review: ${q.failed || 0}`,
    "",
    "SYSTEM HEALTH / BLOCKERS",
    issueLines,
    "",
    "Today's priorities: review pending approvals, verify failed or uncertain deliveries against WhatsApp and CRM history, then progress qualified conversations. No drafts or attempted sends are counted as completed outreach.",
  ].join("\n");
}
