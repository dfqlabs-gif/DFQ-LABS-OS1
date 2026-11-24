import { Router, type Request } from "express";
import type { Pool } from "pg";
import { randomUUID } from "node:crypto";

type AuthUser = { userId: string; role: string; username: string; displayName: string; seatId?: string };
type AuthResolver = (req: Request) => AuthUser | null;

export async function initializeAgentTables(db: Pool): Promise<void> {
  await db.query(`
    CREATE TABLE IF NOT EXISTS agent_config (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      automation_mode TEXT NOT NULL DEFAULT 'queue_only' CHECK (automation_mode IN ('queue_only','autopilot')),
      daily_outreach_cap INTEGER NOT NULL DEFAULT 30 CHECK (daily_outreach_cap BETWEEN 1 AND 100),
      daily_value_dm_cap INTEGER NOT NULL DEFAULT 30 CHECK (daily_value_dm_cap BETWEEN 1 AND 100),
      brand_voice TEXT NOT NULL DEFAULT 'Sharp, consultative, peer-to-peer buyer psychology authority for real-estate brands. Never needy, hype-heavy or aggressively salesy.',
      buyer_psychology_pillars JSONB NOT NULL DEFAULT '["hesitation triggers","trust architecture in high-ticket real estate","perceived risk reduction","status and identity signaling"]'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS agent_queue (
      id UUID PRIMARY KEY,
      lead_id TEXT NULL REFERENCES leads(id) ON DELETE SET NULL,
      agent_name TEXT NOT NULL CHECK (agent_name IN ('scout','inbox_sync','writer','closer','dispatcher')),
      action_type TEXT NOT NULL CHECK (action_type IN ('new_lead','log_inbound','outreach_dm','value_dm','follow_up','linkedin_article')),
      draft_content TEXT NOT NULL DEFAULT '',
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      reasoning TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending_approval' CHECK (status IN ('pending_approval','approved','sent','rejected','failed')),
      error_log TEXT NULL,
      idempotency_key TEXT UNIQUE,
      scheduled_for TIMESTAMPTZ NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      reviewed_by TEXT NULL,
      reviewed_at TIMESTAMPTZ NULL
    )
  `);
  await db.query("CREATE INDEX IF NOT EXISTS agent_queue_status_created_idx ON agent_queue(status, created_at DESC)");
  await db.query("CREATE INDEX IF NOT EXISTS agent_queue_lead_created_idx ON agent_queue(lead_id, created_at DESC)");
  await db.query("CREATE INDEX IF NOT EXISTS agent_queue_action_status_idx ON agent_queue(action_type, status, created_at DESC)");
  await db.query(`
    CREATE TABLE IF NOT EXISTS agent_logs (
      id UUID PRIMARY KEY,
      agent_name TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('success','halted_circuit_breaker','error','info')),
      summary TEXT NOT NULL,
      items_processed INTEGER NOT NULL DEFAULT 0,
      consecutive_failures INTEGER NOT NULL DEFAULT 0,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await db.query("CREATE INDEX IF NOT EXISTS agent_logs_created_idx ON agent_logs(created_at DESC)");
  await db.query(`
    CREATE TABLE IF NOT EXISTS agent_audit_log (
      id UUID PRIMARY KEY,
      actor_id TEXT NOT NULL,
      action TEXT NOT NULL,
      queue_item_id UUID NULL REFERENCES agent_queue(id) ON DELETE SET NULL,
      details JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await db.query("CREATE INDEX IF NOT EXISTS agent_audit_created_idx ON agent_audit_log(created_at DESC)");
  await db.query(`
    CREATE TABLE IF NOT EXISTS agent_contact_controls (
      lead_id TEXT PRIMARY KEY REFERENCES leads(id) ON DELETE CASCADE,
      do_not_contact BOOLEAN NOT NULL DEFAULT FALSE,
      reason TEXT NOT NULL DEFAULT '',
      source TEXT NOT NULL DEFAULT 'founder',
      updated_by TEXT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await db.query("CREATE INDEX IF NOT EXISTS agent_contact_controls_dnc_idx ON agent_contact_controls(do_not_contact) WHERE do_not_contact = TRUE");
  await db.query("INSERT INTO agent_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING");
}

export function createAgentRouter(db: Pool, resolveUser: AuthResolver): Router {
  const router = Router();
  const founder = (req: Request, res: any): AuthUser | null => {
    const user = resolveUser(req);
    if (!user || user.role !== "FOUNDER") {
      res.status(user ? 403 : 401).json({ error: user ? "Founder access required" : "Unauthorized" });
      return null;
    }
    return user;
  };
  const audit = async (actor: AuthUser, action: string, itemId: string | null, details: Record<string, unknown> = {}) => {
    await db.query(
      "INSERT INTO agent_audit_log (id, actor_id, action, queue_item_id, details) VALUES ($1,$2,$3,$4,$5::jsonb)",
      [randomUUID(), actor.userId, action, itemId, JSON.stringify(details)]
    );
  };

  router.get("/config", async (req, res) => {
    if (!founder(req, res)) return;
    try {
      const result = await db.query("SELECT * FROM agent_config WHERE id = 1");
      res.json({ config: result.rows[0] });
    } catch (error) { console.error("Agent config read failed", error); res.status(500).json({ error: "Could not load agent settings" }); }
  });

  router.patch("/config", async (req, res) => {
    const actor = founder(req, res); if (!actor) return;
    const { automation_mode, daily_outreach_cap, daily_value_dm_cap, brand_voice, buyer_psychology_pillars } = req.body || {};
    if (automation_mode !== undefined && automation_mode !== "queue_only") return res.status(409).json({ error: "Autopilot is locked until the dispatcher and WhatsApp bridge pass end-to-end verification." });
    for (const [key, value] of [["daily_outreach_cap",daily_outreach_cap],["daily_value_dm_cap",daily_value_dm_cap]] as const) {
      if (value !== undefined && (!Number.isInteger(value) || value < 1 || value > 100)) return res.status(400).json({ error: key + " must be an integer from 1 to 100" });
    }
    if (brand_voice !== undefined && (typeof brand_voice !== "string" || brand_voice.length > 3000)) return res.status(400).json({ error: "Invalid brand voice" });
    if (buyer_psychology_pillars !== undefined && (!Array.isArray(buyer_psychology_pillars) || buyer_psychology_pillars.length > 20 || buyer_psychology_pillars.some((v: unknown) => typeof v !== "string" || v.length > 300))) return res.status(400).json({ error: "Invalid buyer psychology pillars" });
    try {
      const result = await db.query(`
        UPDATE agent_config SET
          automation_mode = COALESCE($1, automation_mode),
          daily_outreach_cap = COALESCE($2, daily_outreach_cap),
          daily_value_dm_cap = COALESCE($3, daily_value_dm_cap),
          brand_voice = COALESCE($4, brand_voice),
          buyer_psychology_pillars = COALESCE($5::jsonb, buyer_psychology_pillars),
          updated_at = NOW()
        WHERE id = 1 RETURNING *
      `, [automation_mode ?? null, daily_outreach_cap ?? null, daily_value_dm_cap ?? null, brand_voice ?? null, buyer_psychology_pillars === undefined ? null : JSON.stringify(buyer_psychology_pillars)]);
      await audit(actor, "config_updated", null, { fields: Object.keys(req.body || {}) });
      res.json({ config: result.rows[0] });
    } catch (error) { console.error("Agent config update failed", error); res.status(500).json({ error: "Could not update agent settings" }); }
  });

  router.get("/queue", async (req, res) => {
    if (!founder(req, res)) return;
    const status = typeof req.query.status === "string" && req.query.status ? req.query.status : null;
    const actionType = typeof req.query.action_type === "string" ? req.query.action_type : null;
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
    try {
      const result = await db.query(`
        SELECT q.*, l.data->>'name' AS lead_name, l.data->>'company' AS lead_company,
               COALESCE(l.data->>'whatsapp', l.data->>'phone') AS lead_phone
        FROM agent_queue q LEFT JOIN leads l ON l.id = q.lead_id
        WHERE ($1::text IS NULL OR q.status = $1) AND ($2::text IS NULL OR q.action_type = $2)
        ORDER BY q.created_at DESC LIMIT $3
      `, [status, actionType, limit]);
      res.json({ items: result.rows });
    } catch (error) { console.error("Agent queue read failed", error); res.status(500).json({ error: "Could not load review queue" }); }
  });

  router.post("/queue", async (req, res) => {
    const actor = founder(req, res); if (!actor) return;
    const { lead_id, agent_name, action_type, draft_content, metadata, reasoning, idempotency_key } = req.body || {};
    const agents = ["scout","inbox_sync","writer","closer","dispatcher"];
    const actions = ["new_lead","log_inbound","outreach_dm","value_dm","follow_up","linkedin_article"];
    if (!agents.includes(agent_name) || !actions.includes(action_type) || typeof draft_content !== "string" || draft_content.length > 30000) return res.status(400).json({ error: "Invalid queue item" });
    const id = randomUUID();
    try {
      const result = await db.query(`
        INSERT INTO agent_queue (id, lead_id, agent_name, action_type, draft_content, metadata, reasoning, idempotency_key)
        VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8)
        ON CONFLICT (idempotency_key) DO UPDATE SET idempotency_key = EXCLUDED.idempotency_key
        RETURNING *
      `, [id, lead_id || null, agent_name, action_type, draft_content, JSON.stringify(metadata || {}), String(reasoning || "").slice(0,5000), idempotency_key || null]);
      await audit(actor, "queue_item_created", result.rows[0].id, { agent_name, action_type });
      res.status(201).json({ item: result.rows[0] });
    } catch (error) { console.error("Agent queue create failed", error); res.status(500).json({ error: "Could not stage item" }); }
  });

  router.patch("/queue/:id", async (req, res) => {
    const actor = founder(req, res); if (!actor) return;
    const { draft_content } = req.body || {};
    if (typeof draft_content !== "string" || !draft_content.trim() || draft_content.length > 30000) return res.status(400).json({ error: "Draft must contain 1–30000 characters" });
    try {
      const result = await db.query("UPDATE agent_queue SET draft_content=$1, updated_at=NOW() WHERE id=$2 AND status='pending_approval' RETURNING *", [draft_content, req.params.id]);
      if (!result.rowCount) return res.status(404).json({ error: "Pending queue item not found" });
      await audit(actor, "draft_edited", req.params.id, {});
      res.json({ item: result.rows[0] });
    } catch (error) { console.error("Agent draft update failed", error); res.status(500).json({ error: "Could not save draft" }); }
  });

  router.post("/queue/:id/review", async (req, res) => {
    const actor = founder(req, res); if (!actor) return;
    const decision = req.body?.decision;
    if (!["approve","reject"].includes(decision)) return res.status(400).json({ error: "Decision must be approve or reject" });
    try {
      const status = decision === "approve" ? "approved" : "rejected";
      const result = await db.query(`
        UPDATE agent_queue SET status=$1, reviewed_by=$2, reviewed_at=NOW(), updated_at=NOW()
        WHERE id=$3 AND status='pending_approval' RETURNING *
      `, [status, actor.userId, req.params.id]);
      if (!result.rowCount) return res.status(409).json({ error: "Item is no longer awaiting review" });
      await audit(actor, "queue_item_" + decision + "d", req.params.id, {});
      res.json({ item: result.rows[0] });
    } catch (error) { console.error("Agent review failed", error); res.status(500).json({ error: "Could not review queue item" }); }
  });

  router.get("/contact-controls", async (req, res) => {
    if (!founder(req, res)) return;
    try {
      const result = await db.query(`
        SELECT c.*, l.data->>'name' AS lead_name, l.data->>'company' AS lead_company
        FROM agent_contact_controls c LEFT JOIN leads l ON l.id = c.lead_id
        WHERE c.do_not_contact = TRUE ORDER BY c.updated_at DESC LIMIT 200
      `);
      res.json({ controls: result.rows });
    } catch (error) { console.error("Contact control read failed", error); res.status(500).json({ error: "Could not load contact controls" }); }
  });

  router.post("/leads/:leadId/do-not-contact", async (req, res) => {
    const actor = founder(req, res); if (!actor) return;
    const reason = typeof req.body?.reason === "string" ? req.body.reason.slice(0,500) : "Founder marked do-not-contact";
    try {
      const result = await db.query("SELECT id FROM leads WHERE id=$1", [req.params.leadId]);
      if (!result.rowCount) return res.status(404).json({ error: "Lead not found" });
      await db.query(`
        INSERT INTO agent_contact_controls (lead_id, do_not_contact, reason, source, updated_by, updated_at)
        VALUES ($1, TRUE, $2, 'founder', $3, NOW())
        ON CONFLICT (lead_id) DO UPDATE SET do_not_contact=TRUE, reason=EXCLUDED.reason, source='founder', updated_by=EXCLUDED.updated_by, updated_at=NOW()
      `, [req.params.leadId, reason, actor.userId]);
      await db.query("UPDATE agent_queue SET status='rejected', error_log='Cancelled: lead is on the do-not-contact list', updated_at=NOW() WHERE lead_id=$1 AND status IN ('pending_approval','approved')", [req.params.leadId]);
      await audit(actor, "lead_marked_do_not_contact", null, { leadId: req.params.leadId, reason });
      res.json({ ok: true, leadId: req.params.leadId, doNotContact: true });
    } catch (error) { console.error("Do-not-contact update failed", error); res.status(500).json({ error: "Could not update contact control" }); }
  });

  router.delete("/leads/:leadId/do-not-contact", async (req, res) => {
    const actor = founder(req, res); if (!actor) return;
    try {
      await db.query("DELETE FROM agent_contact_controls WHERE lead_id=$1", [req.params.leadId]);
      await audit(actor, "lead_removed_from_do_not_contact", null, { leadId: req.params.leadId });
      res.json({ ok: true, leadId: req.params.leadId, doNotContact: false });
    } catch (error) { console.error("Do-not-contact removal failed", error); res.status(500).json({ error: "Could not update contact control" }); }
  });

  router.get("/logs", async (req, res) => {
    if (!founder(req, res)) return;
    try {
      const result = await db.query("SELECT * FROM agent_logs ORDER BY created_at DESC LIMIT 50");
      res.json({ logs: result.rows });
    } catch (error) { console.error("Agent logs read failed", error); res.status(500).json({ error: "Could not load agent activity" }); }
  });

  return router;
}
