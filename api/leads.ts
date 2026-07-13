// Vercel serverless handler for /api/leads
// Handles GET (list), POST (upsert single / bulk), DELETE (by id)
import { Pool } from "pg";

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
      const leads = result.rows.map((r: any) => r.data);
      return res.status(200).json({ leads });
    } catch (err: any) {
      console.error("GET /api/leads error:", err);
      return res.status(500).json({ error: "Failed to load leads." });
    }
  }

  // ── POST — upsert single { lead } or bulk { leads } ─────────────────────
  if (req.method === "POST") {
    const body = req.body || {};

    // Bulk upsert
    if (Array.isArray(body.leads)) {
      const leads = body.leads.filter((l: any) => l?.id);
      if (leads.length === 0) return res.status(200).json({ ok: true, count: 0 });
      try {
        const values = leads.map((_: any, i: number) => `($${i * 2 + 1}, $${i * 2 + 2}::jsonb)`).join(", ");
        const params = leads.flatMap((l: any) => [l.id, JSON.stringify(l)]);
        await db.query(
          `INSERT INTO leads (id, data, updated_at) VALUES ${values}
           ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()`,
          params
        );
        return res.status(200).json({ ok: true, count: leads.length });
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
