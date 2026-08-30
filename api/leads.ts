// Vercel serverless handler for /api/leads
// Handles GET (list), POST (upsert single / bulk), DELETE (by id)
import { Pool } from "pg";
import { stripAttachmentContent } from "../lib/attachments";
import { summarizeSnapshotImport } from "../lib/imports";

let pool: Pool | null = null;

function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_URL?.includes("localhost") ? false : { rejectUnauthorized: false },
    });
    // Ensure table exists
    pool.query(`
      CREATE TABLE IF NOT EXISTS leads (
        id TEXT PRIMARY KEY,
        data JSONB NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `).catch(err => console.error("DB table init error:", err));
  }
  return pool;
}

export default async function handler(req: any, res: any) {
  res.setHeader("Content-Type", "application/json");

  const db = getPool();

  // ── GET — list all leads ─────────────────────────────────────────────────
  if (req.method === "GET") {
    try {
      const result = await db.query("SELECT data FROM leads ORDER BY updated_at ASC");
      // Never return embedded attachment content in the list payload — only
      // lightweight metadata (keeps the response small, prevents "Load failed").
      const leads = result.rows.map((r: any) => stripAttachmentContent(r.data));
      return res.status(200).json({ leads });
    } catch (err: any) {
      console.error("GET /api/leads error:", err);
      return res.status(500).json({ error: "Failed to load leads." });
    }
  }

  // ── POST — single upsert, bulk upsert, or authoritative snapshot replace ──
  if (req.method === "POST") {
    const body = req.body || {};

    if (Array.isArray(body.leads)) {
      const isSnapshot = body.snapshot === true || body.replace === true || body.mode === "snapshot";

      if (isSnapshot) {
        const summary = summarizeSnapshotImport(body.leads);
        const valid = summary.valid.map((lead: any) => stripAttachmentContent(lead));

        if (!summary.canReplace || valid.length === 0) {
          return res.status(400).json({
            ok: false,
            error: "Snapshot replacement requires at least one valid lead.",
            sourceCount: summary.sourceCount,
            validCount: summary.validCount,
            rejectedCount: summary.rejectedCount,
            duplicateSourceCount: summary.duplicateSourceCount,
            duplicates: summary.duplicates,
            rejected: summary.rejected,
          });
        }

        try {
          await db.query("BEGIN");
          await db.query("DELETE FROM leads");

          if (valid.length > 0) {
            const values = valid.map((_: any, i: number) => `($${i * 2 + 1}, $${i * 2 + 2}::jsonb, NOW())`).join(", ");
            const params = valid.flatMap((lead: any) => [String(lead.id), JSON.stringify(lead)]);
            await db.query(`INSERT INTO leads (id, data, updated_at) VALUES ${values}`, params);
          }

          const incomingIds = valid.map((lead: any) => String(lead.id));
          if (incomingIds.length > 0) {
            await db.query("DELETE FROM lead_attachments WHERE lead_id != ALL($1::text[])", [incomingIds]);
          } else {
            await db.query("DELETE FROM lead_attachments");
          }

          await db.query("COMMIT");
          return res.status(200).json({
            ok: true,
            count: valid.length,
            importedIds: incomingIds,
            duplicates: summary.duplicates,
            rejected: summary.rejected,
            sourceCount: summary.sourceCount,
            validCount: summary.validCount,
            rejectedCount: summary.rejectedCount,
            duplicateSourceCount: summary.duplicateSourceCount,
            duplicateCount: summary.duplicateSourceCount,
            newCount: summary.newCount,
            updatedCount: summary.updatedCount,
            failedCount: summary.failedCount,
            finalDatabaseCount: summary.finalDatabaseCount,
          });
        } catch (err: any) {
          await db.query("ROLLBACK").catch(() => {});
          console.error("POST /api/leads snapshot replace error:", err);
          return res.status(500).json({ error: "Snapshot replacement failed and was rolled back." });
        }
      }

      // Bulk upsert (legacy fallback)
      const deduped = new Map<string, any>();
      const duplicates: Array<{ id: string; reason: string }> = [];
      for (const lead of body.leads) {
        if (!lead || typeof lead !== "object" || Array.isArray(lead) || !lead.id) continue;
        const id = String(lead.id).trim();
        if (!id) continue;
        if (deduped.has(id)) duplicates.push({ id, reason: "duplicate within source file; latest row wins" });
        deduped.set(id, stripAttachmentContent(lead));
      }
      const leads = Array.from(deduped.values());
      if (leads.length === 0) return res.status(200).json({ ok: true, count: 0, duplicates, rejected: [] });
      try {
        const values = leads.map((_: any, i: number) => `($${i * 2 + 1}, $${i * 2 + 2}::jsonb)`).join(", ");
        const params = leads.flatMap((l: any) => [String(l.id), JSON.stringify(l)]);
        await db.query(
          `INSERT INTO leads (id, data, updated_at) VALUES ${values}
           ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()`,
          params
        );
        return res.status(200).json({ ok: true, count: leads.length, duplicates, rejected: [] });
      } catch (err: any) {
        console.error("POST /api/leads bulk error:", err);
        return res.status(500).json({ error: "Failed to bulk-import leads." });
      }
    }

    // Single upsert
    const lead = body.lead;
    if (!lead?.id) return res.status(400).json({ error: "lead.id is required." });
    try {
      await db.query(
        `INSERT INTO leads (id, data, updated_at) VALUES ($1, $2::jsonb, NOW())
         ON CONFLICT (id) DO UPDATE SET data = $2::jsonb, updated_at = NOW()`,
        [lead.id, JSON.stringify(lead)]
      );
      return res.status(200).json({ ok: true });
    } catch (err: any) {
      console.error("POST /api/leads single error:", err);
      return res.status(500).json({ error: "Failed to save lead." });
    }
  }

  // ── DELETE — remove lead by id (id in body) ─────────────────────────────
  if (req.method === "DELETE") {
    const id = req.body?.id;
    if (!id) return res.status(400).json({ error: "id is required." });
    try {
      await db.query("DELETE FROM leads WHERE id = $1", [id]);
      return res.status(200).json({ ok: true });
    } catch (err: any) {
      console.error("DELETE /api/leads error:", err);
      return res.status(500).json({ error: "Failed to delete lead." });
    }
  }

  return res.status(405).json({ error: "Method not allowed." });
}
