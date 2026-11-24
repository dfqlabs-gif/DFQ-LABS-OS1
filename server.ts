import express from "express";
import path from "path";
import dotenv from "dotenv";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import { Pool } from "pg";
import { randomBytes, createHash, randomUUID } from "crypto";
import { inflateRawSync, inflateSync } from "node:zlib";
import { SYSTEM_PROMPT } from "./aiEngine";
import { runSalesBrainWithGenerator } from "./salesBrain";
import type { Lead } from "./types";
import { LEARNING_OUTCOMES, analyzeLearningEvents, buildLearningEvent, relevantInsights, summarizeLearning, type LearningEvent, type LearningInsight } from "./lib/learning";
import { stripAttachmentContent } from "./lib/attachments";
import { describeDbError, runSnapshotReplaceTransaction, summarizeImportBatch, summarizeSnapshotImport } from "./lib/imports";
import { actionCanApply, applyActionFields, createLeadAction, type LeadAction } from "./lib/undoRedo";
import { commitOutboundSent } from "./lib/execution";
import { markWhatsAppOpened, newOutboundMessage } from "./lib/outbound";
import type { MessageType } from "./lib/messageTypes";
import { conversationEventId, removeConversationEvent, restoreConversationEvent, type ConversationEvent, type RemovedConversationEvent } from "./lib/conversationEvents";
import { createAgentRouter, initializeAgentTables } from "./lib/agents";
import { containsExplicitOptOut } from "./lib/agentSafety";
import { createWhatsAppBridge, type WhatsAppInbound } from "./lib/whatsappBridge";
import { getWhatsAppNumber, normalizePhone } from "./lib/phone";

dotenv.config();

const app = express();

// ── PostgreSQL connection pool ─────────────────────────────────────────────────
const db = new Pool({ connectionString: process.env.DATABASE_URL });

// ── Password & Session Utilities ────────────────────────────────────────────────
import { scryptSync } from "crypto";

function hashPassword(password: string, saltHex?: string): string {
  const salt = saltHex ? Buffer.from(saltHex, "hex") : randomBytes(16);
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt.toString("hex")}:${hash}`;
}

function verifyPassword(password: string, storedHash: string): boolean {
  if (!storedHash) return false;
  if (!storedHash.includes(":")) {
    // Legacy simple SHA256 fallback for initial transition
    const legacy = createHash("sha256").update(password + (process.env.SESSION_SECRET || "dfqlabs-secret-salt")).digest("hex");
    return legacy === storedHash;
  }
  const [saltHex, originalHash] = storedHash.split(":");
  const computedHash = hashPassword(password, saltHex).split(":")[1];
  return computedHash === originalHash;
}

function generateTempPassword(): string {
  return "dfq-" + randomBytes(4).toString("hex");
}

const activeSessions = new Map<string, { userId: string; role: string; username: string; displayName: string; seatId?: string }>();

function getAuthUserFromReq(req: express.Request) {
  const token = req.headers.authorization?.replace("Bearer ", "") || (req.query.token as string);
  if (!token) return null;
  return activeSessions.get(token) || null;
}

function requestedActor(value: unknown): string | null {
  return typeof value === "string" && /^[A-Za-z0-9:_-]{1,128}$/.test(value) ? value : null;
}

/** Read the only authoritative representation used for execution and AI work. */
async function getAuthoritativeLead(leadId: string): Promise<Lead | null> {
  const result = await db.query("SELECT data FROM leads WHERE id = $1", [leadId]);
  return (result.rows[0]?.data as Lead | undefined) || null;
}

/** Persist explicit opt-outs as a durable safety control as soon as CRM inbound history is saved. */
async function syncAgentDoNotContact(lead: Lead): Promise<void> {
  const inboundTexts = [
    lead.prospectInitialResponse || "",
    lead.prospectLatestResponse || "",
    ...(Array.isArray(lead.conversationLog) ? lead.conversationLog.filter((entry: any) => entry?.direction === "inbound" || entry?.type === "reply").map((entry: any) => entry.text || "") : []),
  ];
  const optedOut = containsExplicitOptOut(inboundTexts);
  const phone = normalizePhone(getWhatsAppNumber(lead));
  const phoneSuppression = phone.valid
    ? await db.query("SELECT reason FROM agent_phone_suppressions WHERE phone=$1", [phone.digits])
    : { rows: [] as any[] };
  if (!optedOut && !phoneSuppression.rows[0]) return;
  const reason = phoneSuppression.rows[0]?.reason || "Explicit opt-out detected in saved inbound CRM conversation";
  const source = phoneSuppression.rows[0] ? "phone_suppression" : "inbound_detection";
  await db.query(`
    INSERT INTO agent_contact_controls (lead_id, do_not_contact, reason, source, updated_by, updated_at)
    VALUES ($1, TRUE, $2, $3, 'system', NOW())
    ON CONFLICT (lead_id) DO UPDATE SET do_not_contact=TRUE, reason=EXCLUDED.reason, source=EXCLUDED.source, updated_by='system', updated_at=NOW()
  `, [lead.id, reason, source]);
  await db.query("UPDATE agent_queue SET status='rejected', error_log='Cancelled: lead is on the do-not-contact list', updated_at=NOW() WHERE lead_id=$1 AND status IN ('pending_approval','approved')", [lead.id]);
}

async function handleWhatsAppInbound(message: WhatsAppInbound): Promise<void> {
  const allLeads = await db.query("SELECT id, data FROM leads");
  const matched = allLeads.rows.find((row: any) => {
    const lead = row.data as Lead;
    const phone = normalizePhone(getWhatsAppNumber(lead));
    return phone.valid && phone.digits === message.phone;
  });

  if (!matched) {
    await db.query(`
      INSERT INTO agent_queue (id, agent_name, action_type, draft_content, metadata, reasoning, idempotency_key)
      VALUES ($1,'inbox_sync','log_inbound',$2,$3::jsonb,$4,$5)
      ON CONFLICT (idempotency_key) DO NOTHING
    `, [
      randomUUID(), message.text,
      JSON.stringify({ phone: message.phone, remoteJid: message.remoteJid, messageId: message.messageId, receivedAt: message.receivedAt, pushName: message.pushName || null }),
      "Inbound WhatsApp message received from a number that could not be matched to an existing CRM lead. Founder review is required to identify or create the contact.",
      `whatsapp-inbound:${message.messageId}`,
    ]);
    return;
  }

  const client = await db.connect();
  let updatedLead: Lead | null = null;
  try {
    await client.query("BEGIN");
    const currentResult = await client.query("SELECT data FROM leads WHERE id=$1 FOR UPDATE", [matched.id]);
    if (!currentResult.rows[0]?.data) throw new Error("Matched CRM lead disappeared before inbound persistence.");
    const lead = currentResult.rows[0].data as Lead;
    const log = Array.isArray(lead.conversationLog) ? lead.conversationLog : [];
    if (!log.some((event: any) => event.id === message.messageId)) {
      lead.conversationLog = [...log, {
        id: message.messageId,
        ts: message.receivedAt,
        type: "reply",
        direction: "inbound",
        label: "WhatsApp inbound",
        text: message.text,
        by: lead.name || lead.company || message.phone,
      }];
      lead.prospectLatestResponse = message.text;
      lead.awaitingReplySince = "";
      lead.lastMeaningfulTouchpoint = message.receivedAt;
      await client.query("UPDATE leads SET data=$1::jsonb, updated_at=NOW() WHERE id=$2", [JSON.stringify(lead), matched.id]);
    }
    await client.query("UPDATE agent_whatsapp_events SET lead_id=$1 WHERE id=$2", [matched.id, message.messageId]);
    await client.query("COMMIT");
    updatedLead = lead;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }

  if (!updatedLead) return;
  await syncAgentDoNotContact(updatedLead);
  const contactControl = await db.query("SELECT do_not_contact FROM agent_contact_controls WHERE lead_id=$1", [updatedLead.id]);
  if (contactControl.rows[0]?.do_not_contact || message.historical) return;
  const inboxState = await db.query("SELECT status FROM agent_logs WHERE agent_name='inbox_sync' ORDER BY created_at DESC LIMIT 1");
  if (inboxState.rows[0]?.status === "halted_circuit_breaker") return;

  try {
    const cfgResult = await db.query("SELECT brand_voice, buyer_psychology_pillars FROM agent_config WHERE id=1");
    const config = cfgResult.rows[0] || {};
    const lead = await enrichLeadAttachments(updatedLead);
    const brain = await runSalesBrainWithGenerator(
      lead,
      {
        requestedMessageType: "RESPONSE_DM" as any,
        task: `A new inbound WhatsApp reply has just arrived. Respond to the actual message in context, not with a generic follow-up. Match the prospect's tone, answer their question directly if they asked one, and pursue only the next appropriate conversational objective. Do not restart the pitch, repeat prior angles, invent facts, or send a CTA if the prospect has not invited one. DFQ Labs voice: ${config.brand_voice || "Sharp, consultative, peer-to-peer."}. Buyer psychology pillars: ${(config.buyer_psychology_pillars || []).join("; ")}.`,
      },
      (prompt, maxTokens) => callGemini(SYSTEM_PROMPT, prompt, GEMINI_MODEL, maxTokens),
    );
    const draft = String(brain.message || "").trim();
    if (!draft) throw new Error("Sales Brain returned an empty inbound response draft.");
    await db.query(`
      INSERT INTO agent_queue (id, lead_id, agent_name, action_type, draft_content, metadata, reasoning, idempotency_key)
      VALUES ($1,$2,'inbox_sync','follow_up',$3,$4::jsonb,$5,$6)
      ON CONFLICT (idempotency_key) DO NOTHING
    `, [
      randomUUID(), updatedLead.id, draft,
      JSON.stringify({ messageType: "RESPONSE_DM", inboundMessageId: message.messageId, channel: "whatsapp_web" }),
      String(brain.reasoningSummary || brain.recommendedAction || "Generated from the latest inbound reply and full CRM conversation.").slice(0,5000),
      `whatsapp-response:${message.messageId}`,
    ]);
    await db.query(
      "INSERT INTO agent_logs (id, agent_name, status, summary, items_processed, consecutive_failures, metadata) VALUES ($1,'inbox_sync','success',$2,1,0,$3::jsonb)",
      [randomUUID(), "Logged inbound WhatsApp reply and staged a contextual response.", JSON.stringify({ leadId: updatedLead.id, messageId: message.messageId })]
    );
  } catch (error: any) {
    const prior = await db.query("SELECT status, consecutive_failures FROM agent_logs WHERE agent_name='inbox_sync' ORDER BY created_at DESC LIMIT 1").catch(() => ({ rows: [] as any[] }));
    const failures = prior.rows[0]?.status === "error" ? Number(prior.rows[0].consecutive_failures || 0) + 1 : 1;
    const status = failures >= 2 ? "halted_circuit_breaker" : "error";
    await db.query(
      "INSERT INTO agent_logs (id, agent_name, status, summary, items_processed, consecutive_failures, metadata) VALUES ($1,'inbox_sync',$2,$3,0,$4,$5::jsonb)",
      [randomUUID(), status, "Inbound reply was saved, but response drafting failed: " + String(error?.message || error).slice(0,250), failures, JSON.stringify({ leadId: updatedLead.id, messageId: message.messageId })]
    );
  }
}

async function appendWhatsAppHistoricalOutbound(message: WhatsAppInbound, author: string): Promise<boolean> {
  const allLeads = await db.query("SELECT id, data FROM leads");
  const matched = allLeads.rows.find((row: any) => {
    const lead = row.data as Lead;
    const phone = normalizePhone(getWhatsAppNumber(lead));
    return phone.valid && phone.digits === message.phone;
  });
  if (!matched) return false;
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const current = await client.query("SELECT data FROM leads WHERE id=$1 FOR UPDATE", [matched.id]);
    if (!current.rows[0]?.data) { await client.query("ROLLBACK"); return false; }
    const lead = current.rows[0].data as Lead;
    const log = Array.isArray(lead.conversationLog) ? lead.conversationLog : [];
    if (!log.some((event: any) => event.id === message.messageId)) {
      lead.conversationLog = [...log, {
        id: message.messageId,
        ts: message.receivedAt,
        type: "dm",
        direction: "outbound",
        label: "WhatsApp export (historical)",
        text: message.text,
        by: author || "You",
      }];
      lead.awaitingReplySince = message.receivedAt;
      lead.lastContacted = message.receivedAt.slice(0,10);
      lead.lastMeaningfulTouchpoint = message.receivedAt.slice(0,10);
      await client.query("UPDATE leads SET data=$1::jsonb, updated_at=NOW() WHERE id=$2", [JSON.stringify(lead), matched.id]);
    }
    await client.query("COMMIT");
    return true;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally { client.release(); }
}

const whatsappBridge = createWhatsAppBridge(db, handleWhatsAppInbound);

// The regular lead form sends complete JSON documents. A Mark-as-Sent request
// is different: its document may have been composed from an older client copy.
// Preserve the database thread when an outbound crosses into SENT so a stale
// client cannot replace newer conversation entries.
function mergeSentOutboundUpdate(current: any, incoming: any) {
  if (!current) return incoming;

  const currentOutbound = Array.isArray(current.outboundMessages) ? current.outboundMessages : [];
  const incomingOutbound = Array.isArray(incoming.outboundMessages) ? incoming.outboundMessages : [];
  const currentById = new Map<string, any>(currentOutbound.map((message: any): [string, any] => [String(message.id), message]));
  const sentOutbound = incomingOutbound.filter((message: any) => message?.id && message.status === "SENT");
  const newlySent = sentOutbound.filter((message: any) =>
    message?.id && message.status === "SENT" && currentById.get(message.id)?.status !== "SENT"
  );
  // This merge is used for every ordinary CRM save, not just sent-outbound
  // retries.  That keeps the database, rather than a browser snapshot, the
  // authority for anchors and append-only chronology.

  const currentLog = Array.isArray(current.conversationLog) ? current.conversationLog : [];
  const incomingLog = Array.isArray(incoming.conversationLog) ? incoming.conversationLog : [];
  const removedConversationEvents = Array.isArray(current.removedConversationEvents) ? current.removedConversationEvents as RemovedConversationEvent[] : [];
  const removedIds = new Set(removedConversationEvents.map(event => event.eventId));
  const entryKey = (entry: any) => JSON.stringify([
    entry?.outboundId || entry?.id || "", entry?.type, entry?.label, entry?.text, entry?.by,
  ]);
  const knownEntries = new Set(currentLog.map(entryKey));
  const openingDm = current.dmText || incoming.dmText || "";
  const initialResponse = current.prospectInitialResponse || incoming.prospectInitialResponse || "";
  const appendedEntries = incomingLog.filter((entry: any) => {
    // A stale browser copy must never resurrect an event that the server has
    // already removed from Latest Thread.
    if (removedIds.has(conversationEventId(entry as ConversationEvent))) return false;
    // These two historical anchors are stored in their own fields, never as
    // part of Latest Thread.  Excluding them also prevents the first inbound
    // save from creating duplicate "initial" and "latest" entries.
    if ((entry?.type === "dm" && entry?.text === openingDm) ||
        (entry?.type === "reply" && entry?.text === initialResponse)) return false;
    // Subsequent outbound messages are admitted only by the durable outbound
    // confirmation transaction, where they have an outboundId and server
    // sentAt.  A browser's changed dmText must never smuggle a replacement in.
    if (entry?.type === "dm") return false;
    const key = entryKey(entry);
    if (knownEntries.has(key)) return false;
    knownEntries.add(key);
    // The database owns chronology: browser timestamps are never persisted
    // for newly received/sent thread messages submitted through this fallback.
    if (entry?.type === "dm" || entry?.type === "reply") {
      entry.ts = new Date().toISOString();
      entry.direction = entry.direction || (entry.type === "reply" ? "inbound" : "outbound");
      // New inbound thread events did not historically have an ID.  Assign one
      // only as they enter the authoritative log so future operations address
      // the exact event rather than text, timestamp, or browser position.
      entry.id = entry.id || randomUUID();
    }
    return true;
  });

  // A defensive fallback supports older clients that submit the SENT outbound
  // record without its corresponding conversation entry.
  for (const outbound of newlySent) {
    if (appendedEntries.some((entry: any) => entry?.type === "dm" && entry?.text === outbound.messageText)) continue;
    appendedEntries.push({
      id: `outbound-${outbound.id}`,
      ts: outbound.sentAt || new Date().toISOString(),
      type: "dm",
      label: `${outbound.messageType || "Outbound"} sent via WhatsApp`,
      text: outbound.messageText,
      by: outbound.userId || incoming.assignedTo || "Unassigned",
    });
  }

  const mergedOutbound = [...currentOutbound];
  for (const outbound of incomingOutbound) {
    const index = mergedOutbound.findIndex((message: any) => message.id === outbound.id);
    if (index >= 0) {
      if (mergedOutbound[index].status === "SENT" && outbound.status !== "SENT") continue;
      mergedOutbound[index] = outbound;
    }
    else mergedOutbound.push(outbound);
  }

  return {
    ...incoming,
    dmText: openingDm,
    prospectInitialResponse: initialResponse,
    conversationLog: [...currentLog, ...appendedEntries],
    outboundMessages: mergedOutbound,
    removedConversationEvents,
  };
}

// ── Sequential database initialization ─────────────────────────────────────────
async function initializeDatabase() {
  // 1. Verify DATABASE_URL is configured
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL environment variable is not configured. Cannot connect to PostgreSQL.");
  }

  // 2. Create the leads table
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS leads (
        id TEXT PRIMARY KEY,
        data JSONB NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log("✓ leads table initialized");
  } catch (err) {
    throw new Error(`Failed to create leads table: ${err}`);
  }

  // 3. Create the knowledge_sources table
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS knowledge_sources (
        id TEXT PRIMARY KEY,
        data JSONB NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log("✓ knowledge_sources table initialized");
  } catch (err) {
    throw new Error(`Failed to create knowledge_sources table: ${err}`);
  }

  // 4. Create the lead_attachments table
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS lead_attachments (
        id TEXT PRIMARY KEY,
        lead_id TEXT NOT NULL,
        data JSONB NOT NULL,
        uploaded_at TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log("✓ lead_attachments table initialized");
  } catch (err) {
    throw new Error(`Failed to create lead_attachments table: ${err}`);
  }

  // 5. Create users and outreach_seats tables
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        display_name TEXT NOT NULL,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'ACTIVE',
        seat_id TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await db.query(`
      CREATE TABLE IF NOT EXISTS outreach_seats (
        seat_id TEXT PRIMARY KEY,
        seat_name TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'VACANT',
        current_user_id TEXT
      )
    `);
    console.log("✓ users and outreach_seats tables initialized");
  } catch (err) {
    throw new Error(`Failed to create users/outreach_seats tables: ${err}`);
  }

  // Append-only-ish organizational learning evidence. Existing lead JSON stays
  // authoritative for CRM data; these tables make cross-lead learning durable.
  await db.query(`CREATE TABLE IF NOT EXISTS sales_learning_events (id TEXT PRIMARY KEY, lead_id TEXT NOT NULL, outbound_id TEXT UNIQUE NOT NULL, data JSONB NOT NULL, updated_at TIMESTAMP DEFAULT NOW())`);
  await db.query(`CREATE TABLE IF NOT EXISTS sales_learning_insights (id TEXT PRIMARY KEY, data JSONB NOT NULL, updated_at TIMESTAMP DEFAULT NOW())`);

  // Upgrade only the known one-time legacy seed credential to the current founder gate.
  // Never overwrite a founder password that has already been changed by an administrator.
  const founderAccount = await db.query("SELECT id, password_hash FROM users WHERE username = $1 AND role = 'FOUNDER'", ["alex@dfqlabs.com"]);
  if (founderAccount.rows[0] && verifyPassword("dfq2026!", founderAccount.rows[0].password_hash)) {
    await db.query("UPDATE users SET password_hash = $1 WHERE id = $2", [hashPassword("War_Machine26"), founderAccount.rows[0].id]);
    console.log("✓ Migrated legacy seeded founder credential to the current OS founder credential");
  }

  // Seed default seats and Founder user if empty
  const userCountRes = await db.query("SELECT COUNT(*) FROM users");
  if (parseInt(userCountRes.rows[0].count) === 0) {
    const founderId = "user-founder";
    const specialistId = "user-blessing";
    const founderPass = hashPassword("War_Machine26");
    const specialistPass = hashPassword("specialist2026!");

    await db.query(
      `INSERT INTO outreach_seats (seat_id, seat_name, status, current_user_id) VALUES
       ('seat-outreach-a', 'Outreach Seat A', 'OCCUPIED', $1),
       ('seat-outreach-b', 'Outreach Seat B', 'VACANT', NULL),
       ('seat-outreach-c', 'Outreach Seat C', 'VACANT', NULL),
       ('seat-outreach-d', 'Outreach Seat D', 'VACANT', NULL)
       ON CONFLICT DO NOTHING`,
      [specialistId]
    );

    await db.query(
      `INSERT INTO users (id, display_name, username, password_hash, role, status, seat_id) VALUES
       ($1, 'Alex (Founder)', 'alex@dfqlabs.com', $2, 'FOUNDER', 'ACTIVE', NULL),
       ($3, 'Blessing Mudi', 'blessing@dfqlabs.com', $4, 'OUTREACH_SPECIALIST', 'ACTIVE', 'seat-outreach-a')
       ON CONFLICT DO NOTHING`,
      [founderId, founderPass, specialistId, specialistPass]
    );
    console.log("✓ Seeded default Founder and Outreach Specialist accounts");
  }
  await db.query(`CREATE TABLE IF NOT EXISTS crm_action_history (id TEXT PRIMARY KEY, lead_id TEXT NOT NULL, data JSONB NOT NULL, created_at TIMESTAMP DEFAULT NOW())`);
  await db.query(`CREATE INDEX IF NOT EXISTS crm_action_history_actor_created_idx ON crm_action_history ((data->>'actorId'), created_at DESC)`);
  await db.query(`CREATE TABLE IF NOT EXISTS prospecting_activity_events (
    id TEXT PRIMARY KEY, actor_name TEXT NOT NULL, prospect_name TEXT NOT NULL,
    activity_date DATE NOT NULL, channel TEXT NOT NULL DEFAULT 'WhatsApp',
    outcome TEXT NOT NULL DEFAULT 'Contacted', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await db.query(`CREATE INDEX IF NOT EXISTS prospecting_activity_date_actor_idx ON prospecting_activity_events (activity_date DESC, actor_name)`);

  // 5. Run attachment migration (only after all tables exist)
  try {
    const { rows } = await db.query(
      "SELECT id, data FROM leads WHERE data ? 'attachments'"
    );
    for (const row of rows) {
      const lead = row.data;
      const atts = Array.isArray(lead.attachments) ? lead.attachments : [];
      if (atts.length === 0) continue;
      let changed = false;
      for (const att of atts) {
        if (att && att.content) {
          await db.query(
            `INSERT INTO lead_attachments (id, lead_id, data, uploaded_at) VALUES ($1, $2, $3::jsonb, NOW())
             ON CONFLICT (id) DO UPDATE SET data = $3::jsonb`,
            [att.id, lead.id, JSON.stringify(att)]
          );
          changed = true;
        }
      }
      if (changed) {
        const stripped = stripAttachmentContent(lead);
        await db.query("UPDATE leads SET data = $1::jsonb WHERE id = $2", [
          JSON.stringify(stripped), lead.id,
        ]);
      }
    }
    if (rows.length > 0) {
      console.log(`✓ Attachment migration processed ${rows.length} lead(s)`);
    } else {
      console.log(`✓ Attachment migration complete (no attachments to migrate)`);
    }
  } catch (err) {
    throw new Error(`Attachment migration error: ${err}`);
  }

  await initializeAgentTables(db);
  console.log("✓ AI agent review queue tables initialized (queue_only default)");

  console.log("✓ Database initialization successful");
}

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 5000;
const LEARNING_ENABLED = process.env.SALES_BRAIN_LEARNING_ENABLED !== "false";
const LEARNING_INFLUENCE_ENABLED = process.env.SALES_BRAIN_LEARNING_INFLUENCE_ENABLED === "true";

// ── AI Provider configuration — change GEMINI_MODEL env var to swap models ──
// gemini-3.1-flash-lite: fastest confirmed working model for high-volume free-tier
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.1-flash-lite";

function getGeminiApiKey(): string | undefined {
  const value = process.env.GEMINI_API_KEY?.trim();
  return value || undefined;
}

// ── In-memory AI health tracking ─────────────────────────────────────────────
const aiHealth = {
  lastSuccessAt: null as string | null,
  lastModelUsed: null as string | null,
  successCount: 0,
  failureCount: 0,
  totalLatencyMs: 0,
  recentErrors: [] as { ts: string; message: string; model: string }[],
};

function recordSuccess(model: string, latencyMs: number) {
  aiHealth.lastSuccessAt = new Date().toISOString();
  aiHealth.lastModelUsed = model;
  aiHealth.successCount++;
  aiHealth.totalLatencyMs += latencyMs;
}

function recordFailure(model: string, message: string) {
  aiHealth.failureCount++;
  aiHealth.recentErrors.unshift({ ts: new Date().toISOString(), message: String(message).slice(0, 200), model });
  aiHealth.recentErrors = aiHealth.recentErrors.slice(0, 20);
}

async function syncLearningForLead(lead: Lead): Promise<void> {
  if (!LEARNING_ENABLED || !Array.isArray(lead.outboundMessages)) return;
  for (const outbound of lead.outboundMessages) {
    const prior = await db.query("SELECT data FROM sales_learning_events WHERE outbound_id = $1", [outbound.id]);
    const event = buildLearningEvent(lead, outbound, prior.rows[0]?.data as LearningEvent | undefined);
    await db.query(`INSERT INTO sales_learning_events (id, lead_id, outbound_id, data, updated_at) VALUES ($1, $2, $3, $4::jsonb, NOW()) ON CONFLICT (outbound_id) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()`, [event.id, event.leadId, event.outboundId, JSON.stringify(event)]);
  }
  scheduleLearningAnalysis();
}

let learningAnalysisTimer: ReturnType<typeof setTimeout> | undefined;
function scheduleLearningAnalysis() {
  if (learningAnalysisTimer) return;
  learningAnalysisTimer = setTimeout(() => {
    learningAnalysisTimer = undefined;
    refreshLearningInsights().catch(error => console.error("Learning analysis failed:", error));
  }, 500);
}

async function refreshLearningInsights(): Promise<void> {
  if (!LEARNING_ENABLED) return;
  const events = (await db.query("SELECT data FROM sales_learning_events")).rows.map((row: any) => row.data as LearningEvent);
  const prior = (await db.query("SELECT data FROM sales_learning_insights")).rows.map((row: any) => row.data as LearningInsight);
  const insights = analyzeLearningEvents(events, prior);
  for (const insight of insights) await db.query(`INSERT INTO sales_learning_insights (id, data, updated_at) VALUES ($1, $2::jsonb, NOW()) ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()`, [insight.id, JSON.stringify(insight)]);
}

// 25mb limit — bulk lead imports/exports can be large JSON payloads
app.use(express.json({ limit: "25mb" }));
app.use("/api/agents", createAgentRouter(db, getAuthUserFromReq));

app.get("/api/agents/whatsapp/status", async (req, res) => {
  const user = getAuthUserFromReq(req);
  if (!user || user.role !== "FOUNDER") return res.status(user ? 403 : 401).json({ error: "Founder access required" });
  try { res.json({ status: await whatsappBridge.status() }); }
  catch (error) { console.error("WhatsApp status read failed:", error); res.status(500).json({ error: "Could not read WhatsApp bridge status." }); }
});

app.post("/api/agents/whatsapp/connect", async (req, res) => {
  const user = getAuthUserFromReq(req);
  if (!user || user.role !== "FOUNDER") return res.status(user ? 403 : 401).json({ error: "Founder access required" });
  try { res.json({ status: await whatsappBridge.connect() }); }
  catch (error: any) {
    console.error("WhatsApp connect failed:", String(error?.message || error).slice(0, 250));
    res.status(503).json({ error: String(error?.message || "Could not start WhatsApp bridge.") });
  }
});

app.post("/api/agents/whatsapp/disconnect", async (req, res) => {
  const user = getAuthUserFromReq(req);
  if (!user || user.role !== "FOUNDER") return res.status(user ? 403 : 401).json({ error: "Founder access required" });
  try { res.json({ status: await whatsappBridge.disconnect() }); }
  catch (error) { console.error("WhatsApp disconnect failed:", error); res.status(500).json({ error: "Could not disconnect WhatsApp." }); }
});

// ── Auth & User Management Endpoints ──────────────────────────────────────────
app.post("/api/auth/login", async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: "Username and password required" });

  try {
    const userRes = await db.query(
      "SELECT id, display_name, username, password_hash, role, status, seat_id FROM users WHERE username = $1",
      [username.trim().toLowerCase()]
    );

    if (userRes.rows.length === 0) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const user = userRes.rows[0];
    if (!verifyPassword(password, user.password_hash)) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    // Transparently upgrade legacy SHA-256 hashes to scrypt upon successful login
    if (!user.password_hash.includes(":")) {
      const newScryptHash = hashPassword(password);
      await db.query("UPDATE users SET password_hash = $1 WHERE id = $2", [newScryptHash, user.id]);
    }

    if (user.status !== "ACTIVE") {
      return res.status(403).json({ error: "User account is inactive" });
    }

    const token = `session-${randomUUID()}`;
    const sessionData = {
      userId: user.id,
      role: user.role,
      username: user.username,
      displayName: user.display_name,
      seatId: user.seat_id,
    };
    activeSessions.set(token, sessionData);

    res.json({ ok: true, token, user: sessionData });
  } catch (err: any) {
    console.error("POST /api/auth/login error:", err);
    res.status(500).json({ error: "Authentication failed" });
  }
});

app.get("/api/auth/me", (req, res) => {
  const user = getAuthUserFromReq(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });
  res.json({ user });
});

app.post("/api/auth/logout", (req, res) => {
  const token = req.headers.authorization?.replace("Bearer ", "") || (req.query.token as string);
  if (token) activeSessions.delete(token);
  res.json({ ok: true });
});

app.get("/api/auth/users", async (req, res) => {
  const user = getAuthUserFromReq(req);
  if (!user || user.role !== "FOUNDER") return res.status(403).json({ error: "Forbidden" });

  try {
    const result = await db.query(
      "SELECT id, display_name, username, role, status, seat_id, created_at FROM users ORDER BY created_at DESC"
    );
    res.json({ users: result.rows });
  } catch (err: any) {
    console.error("GET /api/auth/users error:", err);
    res.status(500).json({ error: "Failed to fetch users" });
  }
});

app.post("/api/auth/users", async (req, res) => {
  const user = getAuthUserFromReq(req);
  if (!user || user.role !== "FOUNDER") return res.status(403).json({ error: "Forbidden" });

  const { displayName, username, role, seatId } = req.body || {};
  if (!displayName || !username || !role) return res.status(400).json({ error: "Required user fields missing" });

  const tempPass = generateTempPassword();
  const passHash = hashPassword(tempPass);
  const userId = `user-${randomUUID()}`;

  try {
    await db.query(
      "INSERT INTO users (id, display_name, username, password_hash, role, status, seat_id) VALUES ($1, $2, $3, $4, $5, 'ACTIVE', $6)",
      [userId, displayName, username.trim().toLowerCase(), passHash, role, seatId || null]
    );

    if (seatId) {
      await db.query("UPDATE outreach_seats SET current_user_id = $1, status = 'OCCUPIED' WHERE seat_id = $2", [userId, seatId]);
    }

    res.json({
      ok: true,
      user: { id: userId, displayName, username, role, status: "ACTIVE", seatId },
      tempPassword: tempPass,
    });
  } catch (err: any) {
    console.error("POST /api/auth/users error:", err);
    res.status(500).json({ error: err.message?.includes("unique") ? "Username already exists" : "Failed to create user" });
  }
});

app.post("/api/auth/users/:id/status", async (req, res) => {
  const user = getAuthUserFromReq(req);
  if (!user || user.role !== "FOUNDER") return res.status(403).json({ error: "Forbidden" });

  const { status } = req.body || {};
  if (!["ACTIVE", "INACTIVE"].includes(status)) return res.status(400).json({ error: "Invalid status" });

  try {
    await db.query("UPDATE users SET status = $1 WHERE id = $2", [status, req.params.id]);
    if (status === "INACTIVE") {
      await db.query("UPDATE outreach_seats SET current_user_id = NULL, status = 'VACANT' WHERE current_user_id = $1", [req.params.id]);
    }
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to update user status" });
  }
});

app.get("/api/auth/seats", async (req, res) => {
  try {
    const result = await db.query(
      `SELECT s.seat_id, s.seat_name, s.status, s.current_user_id, u.display_name, u.username
       FROM outreach_seats s
       LEFT JOIN users u ON s.current_user_id = u.id
       ORDER BY s.seat_id ASC`
    );
    res.json({ seats: result.rows });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to fetch seats" });
  }
});

// ── Centralized Gemini client ─────────────────────────────────────────────────
async function callGeminiRaw(
  systemPrompt: string | undefined,
  userPrompt: string,
  model: string,
  maxTokens: number,
  temperature: number
): Promise<string> {
  const apiKey = getGeminiApiKey();
  if (!apiKey) throw new Error("GEMINI_API_KEY is not configured on the server.");

  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model,
    contents: userPrompt,
    config: {
      ...(systemPrompt ? { systemInstruction: systemPrompt } : {}),
      maxOutputTokens: maxTokens,
      temperature,
    },
  });
  const text = response.text ?? "";
  if (!text.trim()) throw new Error(`Model ${model} returned empty content.`);
  return text;
}

// Retry logic with exponential backoff for transient errors (429, 503, network)
export async function callGemini(
  systemPrompt: string | undefined,
  userPrompt: string,
  model: string,
  maxTokens: number = 1200,
  temperature: number = 0.7,
  retries: number = 2
): Promise<string> {
  let lastError: any;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await callGeminiRaw(systemPrompt, userPrompt, model, maxTokens, temperature);
    } catch (err: any) {
      lastError = err;
      const msg = String(err?.message ?? "");
      const isRetryable = msg.includes("429") || msg.includes("503") || msg.includes("RESOURCE_EXHAUSTED") || msg.includes("UNAVAILABLE");
      if (!isRetryable || attempt === retries) break;
      // Exponential backoff: 1s, 2s
      await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
    }
  }
  throw lastError;
}

function friendlyError(error: any): string {
  const raw = String(error?.message ?? "");
  if (raw.includes("429") || raw.includes("RESOURCE_EXHAUSTED") || raw.toLowerCase().includes("quota") || raw.toLowerCase().includes("rate limit")) {
    return "Gemini API quota exceeded. Wait a moment and try again, or check your quota at console.cloud.google.com.";
  }
  if (raw.includes("401") || raw.includes("403") || raw.toLowerCase().includes("api key") || raw.toLowerCase().includes("invalid")) {
    return "Invalid GEMINI_API_KEY. Check your environment variables.";
  }
  if (!getGeminiApiKey()) {
    return "GEMINI_API_KEY is not configured. Add it to your environment variables.";
  }
  return raw.replace(/\{[\s\S]*?\}/g, "").trim().slice(0, 200) || "AI service temporarily unavailable.";
}

// ── /api/ai — centralized AI endpoint (all features route here) ───────────────
app.post("/api/ai", async (req, res) => {
  res.setHeader("Content-Type", "application/json");
  const { systemPrompt, userPrompt, model, maxTokens } = req.body || {};

  if (!userPrompt) {
    res.status(400).json({ error: "userPrompt is required" });
    return;
  }
  if (!getGeminiApiKey()) {
    res.status(500).json({ error: "GEMINI_API_KEY is not configured on the server." });
    return;
  }

  const activeModel = model || GEMINI_MODEL;
  const start = Date.now();
  try {
    const text = await callGemini(systemPrompt, userPrompt, activeModel, maxTokens || 1200);
    recordSuccess(activeModel, Date.now() - start);
    res.json({ text, model: activeModel, fellBack: false });
  } catch (error: any) {
    console.error("Gemini /api/ai error:", error);
    recordFailure(activeModel, error?.message || String(error));
    res.status(500).json({ error: friendlyError(error) });
  }
});

// ── /api/ai-status — health check & live connection test ─────────────────────
app.get("/api/ai-status", (req, res) => {
  res.setHeader("Content-Type", "application/json");
  const avgLatencyMs = aiHealth.successCount > 0 ? Math.round(aiHealth.totalLatencyMs / aiHealth.successCount) : null;
  res.json({
    configured: !!getGeminiApiKey(),
    keySource: "server runtime environment",
    keyLength: getGeminiApiKey()?.length || 0,
    provider: "gemini",
    defaultModel: GEMINI_MODEL,
    lastSuccessAt: aiHealth.lastSuccessAt,
    lastModelUsed: aiHealth.lastModelUsed,
    successCount: aiHealth.successCount,
    failureCount: aiHealth.failureCount,
    avgLatencyMs,
    recentErrors: aiHealth.recentErrors,
  });
});

app.post("/api/ai-status", async (req, res) => {
  res.setHeader("Content-Type", "application/json");
  if (!getGeminiApiKey()) {
    res.json({ ok: false, error: "GEMINI_API_KEY is not configured on the server." });
    return;
  }
  const { model } = req.body || {};
  const testModel = model || GEMINI_MODEL;
  const start = Date.now();
  try {
    const text = await callGemini(undefined, "Reply with exactly the word: CONNECTED", testModel, 10, 0, 1);
    recordSuccess(testModel, Date.now() - start);
    res.json({ ok: true, model: testModel, latencyMs: Date.now() - start, response: text.trim() });
  } catch (error: any) {
    recordFailure(testModel, error.message);
    res.json({ ok: false, model: testModel, latencyMs: Date.now() - start, error: error.message });
  }
});

// ── /api/call-gemini — legacy compatibility endpoint ─────────────────────────
app.post("/api/call-gemini", async (req, res) => {
  res.setHeader("Content-Type", "application/json");
  const body = req.body || {};
  const userPrompt = body.userPrompt || body.prompt;
  const systemPrompt = body.systemPrompt || body.systemInstruction;
  const { model, maxTokens } = body;

  if (!userPrompt) {
    res.status(400).json({ error: "prompt is required" });
    return;
  }
  if (!getGeminiApiKey()) {
    res.status(500).json({ error: "GEMINI_API_KEY is not configured on the server." });
    return;
  }

  const activeModel = model || GEMINI_MODEL;
  const start = Date.now();
  try {
    const text = await callGemini(systemPrompt, userPrompt, activeModel, maxTokens || 1200);
    recordSuccess(activeModel, Date.now() - start);
    res.json({ text, model: activeModel });
  } catch (error: any) {
    console.error("Gemini /api/call-gemini error:", error);
    recordFailure(activeModel, error?.message || String(error));
    res.status(500).json({ error: friendlyError(error) });
  }
});

// ── /api/infer-status — AI auto-status update from latest message ────────────
app.post("/api/infer-status", async (req, res) => {
  res.setHeader("Content-Type", "application/json");
  const { currentStatus, dmText, prospectInitialResponse, prospectLatestResponse, notes, name, company } = req.body || {};

  if (!getGeminiApiKey()) {
    res.status(500).json({ error: "GEMINI_API_KEY is not configured on the server." });
    return;
  }

  const VALID_STATUSES = ["New", "DM Sent", "Replied", "Audit Requested", "Audit Delivered", "Discovery Call Booked", "Discovery Call Done", "Proposal Sent", "Closed", "Lost"];
  const STAGE_ORDER: Record<string, number> = { "New": 0, "DM Sent": 1, "Replied": 2, "Audit Requested": 3, "Audit Delivered": 4, "Discovery Call Booked": 5, "Discovery Call Done": 6, "Proposal Sent": 7, "Closed": 8, "Lost": 9 };

  const systemPrompt = `You are a CRM intelligence engine. Your job is to read a DM conversation thread and determine the current correct pipeline stage for this lead. Respond with ONLY one of these exact stage names, nothing else:
New | DM Sent | Replied | Audit Requested | Audit Delivered | Discovery Call Booked | Discovery Call Done | Proposal Sent | Closed | Lost

Rules:
- "DM Sent" = we sent an outreach DM, no reply yet
- "Replied" = prospect replied (any positive/curious/neutral reply to our outreach)
- "Audit Requested" = they asked for the audit or agreed to receive it
- "Audit Delivered" = we sent them the audit
- "Discovery Call Booked" = a specific call date/time is agreed or they said "let's talk" and a call is being booked
- "Discovery Call Done" = the call already happened (transcript/summary pasted, or they mention after-call next steps)
- "Proposal Sent" = we sent them a proposal or pricing
- "Closed" = they agreed to pay / signed up
- "Lost" = they explicitly declined or went permanently cold

If uncertain, keep the current stage. Only advance if the evidence clearly supports it. Never move backward.`;

  const convo: string[] = [];
  if (dmText) convo.push(`[OUR DM]: ${dmText.slice(0, 600)}`);
  if (prospectInitialResponse) convo.push(`[THEIR REPLY]: ${prospectInitialResponse.slice(0, 600)}`);
  if (prospectLatestResponse && prospectLatestResponse !== prospectInitialResponse) convo.push(`[LATEST MESSAGE/THREAD]: ${prospectLatestResponse.slice(0, 800)}`);
  if (notes) convo.push(`[INTERNAL NOTES]: ${notes.slice(0, 300)}`);

  const userPrompt = `Lead: ${name || "Unknown"} at ${company || "Unknown company"}
Current stage: ${currentStatus}

Conversation:
${convo.join("\n\n")}

Based on the conversation above, what is the correct pipeline stage for this lead right now? Reply with ONLY the stage name.`;

  const activeModel = GEMINI_MODEL;
  const start = Date.now();
  try {
    const raw = await callGemini(systemPrompt, userPrompt, activeModel, 30, 0);
    recordSuccess(activeModel, Date.now() - start);
    // Clean up the response to extract just the status
    const inferred = VALID_STATUSES.find(s => raw.trim().toLowerCase().includes(s.toLowerCase())) || currentStatus;
    // Only return a new status if it's a forward progression or "Lost"
    const currentOrder = STAGE_ORDER[currentStatus] ?? 0;
    const inferredOrder = STAGE_ORDER[inferred] ?? 0;
    const changed = inferred !== currentStatus && (inferredOrder > currentOrder || inferred === "Lost");
    res.json({ status: changed ? inferred : currentStatus, changed });
  } catch (error: any) {
    console.error("Gemini /api/infer-status error:", error);
    recordFailure(activeModel, error?.message || String(error));
    res.status(500).json({ error: friendlyError(error) });
  }
});

// ── /api/generate-dm — DM generator ─────────────────────────────────────────
app.post("/api/generate-dm", async (req, res) => {
  res.setHeader("Content-Type", "application/json");
  const { name, company, role, niche, channel, painPoint, stage, lastConversation, notes, model } = req.body || {};

  if (!name || !company) {
    res.status(400).json({ error: "Prospect name and company are required." });
    return;
  }
  if (!getGeminiApiKey()) {
    res.status(500).json({ error: "GEMINI_API_KEY is not configured on the server." });
    return;
  }

  const stageMap: Record<string, { nextStage: string; objective: string }> = {
    "Outreach Sent":       { nextStage: "Replied / Interested", objective: "Get them to respond. Follow up on the previous touchpoint or introduce a fresh, low-resistance angle." },
    "Replied / Interested":{ nextStage: "Audit Requested",       objective: "Offer a free custom audit. Transition their general interest into requesting a custom audit." },
    "Audit Requested":     { nextStage: "Audit Delivered",       objective: "Deliver an outstanding audit insight and invite a 10-minute walk-through call." },
    "Audit Delivered":     { nextStage: "Meeting Booked",        objective: "Move them to book a specific strategy session." },
    "Meeting Booked":      { nextStage: "Proposal Sent",         objective: "Follow up on the meeting and send a clear, tailored business proposal." },
    "Proposal Sent":       { nextStage: "Client Closed",         objective: "Follow up to address final concerns and close the deal." },
    "Client Closed":       { nextStage: "Referrals / Account Growth", objective: "Express appreciation and request a warm referral." },
  };

  const { nextStage, objective } = stageMap[stage] || { nextStage: "Replied / Interested", objective: "Build rapport and offer value." };

  const systemPrompt = `You are an elite outreach strategist writing on behalf of DFQ Labs — a boutique sales consultancy for Abuja real estate brands.

TONE: You are a respectful, experienced consultant — not a hungry salesperson. The prospect is a busy professional. Their time is more valuable than yours. Write from that position of confidence and courtesy.

STRICT RULES:
1. NEVER open with: "Hope you're doing well", "I came across your profile", "Great page!", or any hollow warm-up.
2. ZERO AI buzzwords: no "synergy", "leverage" (as a verb), "revolutionize", "supercharge", "unleash", "delve", "holistic", "elevate", "disrupt".
3. ZERO exclamation marks. ZERO emojis. Write the way a senior consultant texts — dry, precise, on-point.
4. ONE ask per message. Low-friction. Never ask for a long meeting before trust is established.
5. Reference something specific to this prospect's niche, company, or prior conversation — never generic copy.
6. LENGTH: WhatsApp/Instagram/Twitter: 2-3 short sentences max. Email: 80-120 words, sharp subject line.
7. TIMING AWARENESS: If prior conversation history is provided and shows a gap (days or weeks), pick up that thread naturally. Never pretend it is a first contact when it isn't.
8. RESPECT THE SILENCE: If they haven't replied in a while, re-engage with value or a new angle — never guilt-trip.

OUTPUT: Write ONLY the final message. No preamble, no labels, no explanations.`;
  const userPrompt = `Write a hyper-personalized outreach message for:
- Name: ${name}, Company: ${company}, Role: ${role || "decision-maker"}
- Niche: ${niche || "their sector"}, Channel: ${channel}
- Pain Point: ${painPoint || "client acquisition"}, Stage: ${stage} → ${nextStage}
- Objective: ${objective}
${lastConversation ? `- Prior conversation: "${lastConversation}"` : ""}
${notes ? `- Notes: "${notes}"` : ""}
Output ONLY the final message text. No meta-commentary.`;

  const activeModel = model || GEMINI_MODEL;
  const start = Date.now();
  try {
    const draft = await callGemini(systemPrompt, userPrompt, activeModel, 900, 0.8);
    recordSuccess(activeModel, Date.now() - start);
    res.json({ draft: draft || "Failed to generate DM." });
  } catch (error: any) {
    console.error("Gemini /api/generate-dm error:", error);
    recordFailure(activeModel, error?.message || String(error));
    res.status(500).json({ error: friendlyError(error) });
  }
});

// ── Attachment content enrichment (on-demand) ────────────────────────────────
// The lead JSON carries only attachment metadata. When the AI needs the actual
// file content (e.g. the value-DM drafting pipeline), fetch it from the
// dedicated lead_attachments table and merge it onto the lead object.
async function enrichLeadAttachments(lead: any): Promise<any> {
  const atts = lead?.attachments;
  if (!Array.isArray(atts) || atts.length === 0) return lead;
  const ids = atts.map((a: any) => a?.id).filter(Boolean);
  if (ids.length === 0) return lead;
  try {
    const result = await db.query(
      "SELECT id, data FROM lead_attachments WHERE id = ANY($1::text[])",
      [ids]
    );
    const byId = new Map(result.rows.map((r: any) => [r.id, r.data?.content ?? ""]));
    return {
      ...lead,
      attachments: atts.map((a: any) => ({ ...a, content: byId.get(a.id) ?? a.content ?? "" })),
    };
  } catch (err) {
    console.error("enrichLeadAttachments error:", err);
    return lead;
  }
}

// ── Knowledge retrieval (Part 2, 23) ─────────────────────────────────────────
// Keyword-based retrieval: derive keywords from the lead's context and match
// against enabled knowledge sources. Returns the most relevant snippets so
// the AI reasons with targeted knowledge instead of the entire knowledge base.
async function retrieveKnowledgeForLead(lead: any, messageType: string): Promise<{ title: string; category: string; sourceUrl: string; snippet: string }[]> {
  try {
    const result = await db.query("SELECT data FROM knowledge_sources");
    const sources = (result.rows as any[])
      .map(r => r.data)
      .filter(s => s.enabled !== false && s.status === "ready" && s.content);

    if (sources.length === 0) return [];

    // Build a keyword set from the lead's context
    const contextText = [
      lead.clientType, lead.service, lead.company, lead.notes,
      lead.dmText, lead.prospectInitialResponse, lead.prospectLatestResponse,
      lead.aiBucket, lead.status, lead.nextAction,
    ].filter(Boolean).join(" ").toLowerCase();

    // Domain keywords relevant to DFQ Labs real estate outreach
    const domainKeywords = [
      "buyer", "psychology", "content", "strategy", "trust", "developer", "marketing",
      "lead generation", "real estate", "positioning", "conversion", "audit", "outbound",
      "whatsapp", "nurture", "reactivation", "objection", "pricing", "closing",
      "off-plan", "realtor", "agency", "construction", "architecture", "funnel",
      "follow-up", "value", "insight", "buyer inquiry", "brand", "positioning gap",
    ];

    // Score each source by keyword overlap with the lead context + message type
    const typeKeywords: Record<string, string[]> = {
      VALUE_DM: ["value", "insight", "buyer psychology", "content strategy", "trust", "education"],
      SALES_DM: ["outreach", "positioning", "hook", "audit", "conversion"],
      FOLLOW_UP: ["follow-up", "nurture", "trust", "objection"],
      REACTIVATION_DM: ["reactivation", "re-engagement", "nurture"],
      NURTURE_DM: ["nurture", "value", "trust", "education"],
      INTRODUCTION_DM: ["outreach", "positioning", "hook", "first touch"],
      RESPONSE_DM: ["objection", "trust", "response", "conversion"],
    };
    const typeKw = typeKeywords[messageType] || [];

    const scored = sources.map(s => {
      const contentLower = (s.content || "").toLowerCase();
      const titleLower = (s.title || "").toLowerCase();
      let score = 0;
      const matched: string[] = [];
      for (const kw of domainKeywords) {
        if (contextText.includes(kw) && (contentLower.includes(kw) || titleLower.includes(kw))) {
          score += 2;
          matched.push(kw);
        }
      }
      for (const kw of typeKw) {
        if (contentLower.includes(kw) || titleLower.includes(kw)) {
          score += 1;
          matched.push(kw);
        }
      }
      // Boost sources whose title keywords appear in the lead context
      const titleWords = (s.title || "").toLowerCase().split(/\s+/).filter(w => w.length > 4);
      for (const w of titleWords) {
        if (contextText.includes(w)) score += 1;
      }
      return { source: s, score, matched };
    }).filter(x => x.score > 0).sort((a, b) => b.score - a.score).slice(0, 3);

    return scored.map(x => {
      const content = x.source.content;
      // Return a focused snippet (first 1200 chars) — never the whole document
      const snippet = content.length > 1200 ? content.slice(0, 1200) + "\n[...]" : content;
      return { title: x.source.title, category: x.source.category || "Uncategorised", sourceUrl: x.source.sourceUrl || "", snippet };
    });
  } catch (err) {
    console.error("retrieveKnowledgeForLead error:", err);
    return [];
  }
}

// ── /api/value-dm — structured message generation with knowledge retrieval ─────
// Supports all message types (Part 18). VALUE_DM enforces strict no-CTA rules.
app.post("/api/value-dm", async (req, res) => {
  res.setHeader("Content-Type", "application/json");
  const { leadId, task, messageType } = req.body || {};
  if (!leadId || typeof leadId !== "string") { res.status(400).json({ error: "leadId is required" }); return; }

  // Generation must never be based on a browser snapshot.  Resolve the lead
  // immediately before context assembly so every surface sees the same CRM.
  const lead = await getAuthoritativeLead(leadId);
  if (!lead) { res.status(404).json({ error: "Lead not found." }); return; }

  const type: string = messageType || "VALUE_DM";

  // Enrich the lead with attachment content from the dedicated table so the AI
  // pipeline can reference attached documents (content is not in the lead JSON).
  const leadWithAttachments = await enrichLeadAttachments(lead);

  // Retrieve relevant knowledge for this lead + message type (Part 2)
  const knowledge = await retrieveKnowledgeForLead(leadWithAttachments, type);
  const knowledgeBlock = knowledge.length > 0
    ? `\n\n=== RELEVANT DFQ LABS KNOWLEDGE (use only what is genuinely relevant — do not force unrelated material) ===\n${knowledge.map(k => `--- ${k.title} | Category: ${k.category}${k.sourceUrl ? ` | Source: ${k.sourceUrl}` : ""} ---\n${k.snippet}`).join("\n\n")}\n=== END KNOWLEDGE ===`
    : "";

  let styleInstructions: string;
  let pipelineTask: string;

  if (type === "VALUE_DM") {
    // STRICT VALUE DM — no CTA, no selling (Parts 3, 4, 5)
    styleInstructions = `You are Alex from DFQ Labs writing directly to ${lead.name || "this prospect"} at ${lead.company || "their company"} (${lead.clientType || "Real Estate"}).

This is a VALUE_DM. ${`A VALUE_DM is a short message whose sole objective is to provide genuinely useful, immediately applicable insight WITHOUT asking for a sale, call, meeting, reply, registration, consultation, beta participation, purchase, or any other conversion action.`}

ABSOLUTE PROHIBITIONS — the message must NOT:
- Sell, pitch, or ask for a call, meeting, reply, booking, registration, beta join, purchase, follow, or website visit.
- Mention DFQ Labs services unless genuinely necessary for the insight itself.
- Manufacture urgency or manufacture a problem.
- Continue a sales sequence disguised as value.
- End with "let me know if...", "would you like me to...", "I can help you...", or ANY call-to-action.
- Attempt to continue the interaction in any way.

The objective is simply: leave the prospect better off than they were before receiving the message.

STRUCTURE: Problem → Insight → Specific action. Include ONE specific, concrete observation grounded in their industry and what they are likely struggling with. Avoid generic advice ("post consistently", "know your audience", "use better hooks", "build trust") unless you explain a specific implementation that makes it actionable.

QUALITY CHECK (run silently before finalizing — regenerate internally if any answer is NO):
1. Is this genuinely useful? 2. Specific to this prospect? 3. Could they implement something today? 4. Supported by context/knowledge? 5. Avoids selling? 6. Avoids asking for anything? 7. Concrete insight not generic? 8. Valuable even if they never become a client? 9. Short enough for WhatsApp? 10. Sounds like a knowledgeable human?

FORMAT: 3-4 sentences maximum. Zero emojis. Zero exclamation marks. Zero buzzwords. Plain WhatsApp-friendly text — no markdown, no bullet points. NO call-to-action. NO next step. The message simply ends after delivering the insight.

FORBIDDEN words: "I hope", "I trust", "excited to", "leverage", "synergy", "holistic", "elevate", "game-changer", "value-add", "reach out", "touch base", "circle back", "let me know", "would you like", "I can help".

Output ONLY the actual message. No labels. No quotes. No explanation. No strategy in the message.`;

    pipelineTask = `CURRENT USER INSTRUCTION (highest-priority direction for this draft):
${typeof task === "string" && task.trim() ? task.trim() : "Write a useful, prospect-specific value DM."}

TASK:
Generate a VALUE_DM that follows the user's requested strategy while remaining factually grounded in this lead's CRM context, complete chronology, prior outbounds, notes, and available attachments. Do not repeat an earlier message. No selling, CTA, or ask unless the user explicitly selected a different message type.`;
  } else {
    // Other message types — use per-type rules (Part 18)
    const typeRules: Record<string, string> = {
      SALES_DM: "A sales outreach DM. Pursue exactly one pipeline-stage objective. One low-friction ask. Reference something specific. 2-4 sentences.",
      FOLLOW_UP: "A follow-up in an active conversation. Pick up where the last exchange left off. One objective. 2-4 sentences.",
      REACTIVATION_DM: "A re-engagement for a cold lead. New angle, no guilt-trip, no re-pitch. 2-3 sentences.",
      NURTURE_DM: "A nurture message. Provide value without asking for anything (VALUE_DM-style, no CTA) unless a sales step is clearly warranted. 3-4 sentences.",
      INTRODUCTION_DM: "A first-touch cold outreach DM. Hook on a positioning gap. Ask only for permission to send a breakdown. No pitching. 2-3 sentences.",
      RESPONSE_DM: "A reply to a prospect who just messaged. Continue the dialog. One objective. 2-3 sentences.",
    };
    styleInstructions = `You are Alex from DFQ Labs writing directly to ${lead.name || "this prospect"} at ${lead.company || "their company"} (${lead.clientType || "Real Estate"}).

Message type: ${type}. ${typeRules[type] || typeRules.SALES_DM}

FORMAT: Zero emojis. Zero exclamation marks. Zero buzzwords. Plain WhatsApp-friendly text. Output ONLY the actual message. No labels. No explanation.

FORBIDDEN words: "I hope", "I trust", "excited to", "leverage", "synergy", "holistic", "elevate", "game-changer", "value-add", "reach out", "touch base", "circle back".`;
    pipelineTask = task || `Generate a ${type} for this prospect following the message-type rules above.`;
  }

  // Conversation-aware: detect repetition (Part 7) — if recent messages repeat the same topic,
  // instruct the AI to introduce a new angle or recommend changing strategy.
  const recentLogs = (lead.conversationLog || []).slice(-5).filter((l: any) => l.type === "dm" || l.type === "reply");
  const repetitionNote = recentLogs.length >= 3
    ? `\n\nREPETITION CHECK: The last ${recentLogs.length} messages are provided in the conversation thread. If they already discuss the same topic, introduce a genuinely NEW angle or recommend changing the follow-up strategy. Do not generate a variation of the same message.`
    : "";

  try {
    const fullTask = pipelineTask + knowledgeBlock + repetitionNote;
    // This route is already on the server: use its Gemini provider directly.
    // Calling runSalesBrain (the browser wrapper) here used fetch("/api/ai")
    // in Node and caused the production "Failed to parse URL" failure.
    const storedInsights = LEARNING_INFLUENCE_ENABLED
      ? (await db.query("SELECT data FROM sales_learning_insights")).rows.map((row: any) => row.data as LearningInsight)
      : [];
    const learningInsights = relevantInsights(storedInsights, leadWithAttachments, type).map(insight => ({
      insightId: insight.id,
      pattern: insight.pattern,
      relevance: `${insight.segment} / ${insight.strategyType}`,
      confidence: insight.confidence,
      evidenceSummary: `${insight.evidenceCount} sent; ${Math.round(insight.positiveResponseRate * 100)}% positive; ${insight.meetingCount} meetings`,
    }));
    const brain = await runSalesBrainWithGenerator(
      leadWithAttachments,
      { task: fullTask, requestedMessageType: type as any, learningInsights },
      (prompt, maxTokens) => callGemini(SYSTEM_PROMPT, prompt, GEMINI_MODEL, maxTokens),
    );
    res.json({
      text: brain.message,
      strategy: brain.reasoningSummary,
      messageType: brain.messageType,
      brain,
      knowledgeUsed: knowledge.map(k => k.title),
      learningInsights,
    });
  } catch (err: any) {
    console.error("POST /api/value-dm error:", err);
    res.status(500).json({ error: err.message });
  }
});

// Shared authoritative Sales Brain entry point.  Browser components send an
// identity and intent only; context is always reconstructed from PostgreSQL.
app.post("/api/sales-brain", async (req, res) => {
  const { leadId, task, requestedMessageType } = req.body || {};
  if (!leadId || typeof leadId !== "string") return res.status(400).json({ error: "leadId is required" });
  try {
    const stored = await getAuthoritativeLead(leadId);
    if (!stored) return res.status(404).json({ error: "Lead not found." });
    const lead = await enrichLeadAttachments(stored);
    const insights = LEARNING_INFLUENCE_ENABLED
      ? (await db.query("SELECT data FROM sales_learning_insights")).rows.map((row: any) => row.data as LearningInsight)
      : [];
    const learningInsights = relevantInsights(insights, lead, requestedMessageType || "FOLLOW_UP").map(insight => ({
      insightId: insight.id,
      pattern: insight.pattern,
      relevance: `${insight.segment} / ${insight.strategyType}`,
      confidence: insight.confidence,
      evidenceSummary: `${insight.evidenceCount} sent; ${Math.round(insight.positiveResponseRate * 100)}% positive; ${insight.meetingCount} meetings`,
    }));
    const brain = await runSalesBrainWithGenerator(
      lead,
      { task: typeof task === "string" ? task : undefined, requestedMessageType: requestedMessageType as any, learningInsights },
      (prompt, maxTokens) => callGemini(SYSTEM_PROMPT, prompt, GEMINI_MODEL, maxTokens),
    );
    return res.json({ ok: true, lead, brain });
  } catch (error: any) {
    console.error("POST /api/sales-brain:", error);
    return res.status(500).json({ error: error?.message || "Could not generate the Sales Brain recommendation." });
  }
});

// Founder-only batch drafting. This stages content for review; it never sends messages.
app.post("/api/agents/generate", async (req, res) => {
  const actor = getAuthUserFromReq(req);
  if (!actor || actor.role !== "FOUNDER") return res.status(actor ? 403 : 401).json({ error: "Founder access required" });
  const { leadIds, actionType } = req.body || {};
  const actionMap: Record<string, string> = { outreach_dm: "INTRODUCTION_DM", value_dm: "VALUE_DM", follow_up: "FOLLOW_UP" };
  if (!Array.isArray(leadIds) || leadIds.length < 1 || leadIds.length > 10 || leadIds.some((id: unknown) => typeof id !== "string")) {
    return res.status(400).json({ error: "Select between 1 and 10 leads." });
  }
  if (!actionMap[actionType]) return res.status(400).json({ error: "Choose outreach_dm, value_dm or follow_up." });
  try {
    const cfgResult = await db.query("SELECT * FROM agent_config WHERE id = 1");
    const config = cfgResult.rows[0];
    if (!config || config.automation_mode !== "queue_only") return res.status(409).json({ error: "Drafting requires Review Queue mode." });
    const cap = actionType === "value_dm" ? config.daily_value_dm_cap : config.daily_outreach_cap;
    const capActionTypes = actionType === "value_dm" ? ["value_dm"] : ["outreach_dm", "follow_up"];
    const capCount = await db.query(
      "SELECT COUNT(*)::int AS count FROM agent_queue WHERE action_type = ANY($1::text[]) AND created_at >= date_trunc('day', NOW()) AND status IN ('pending_approval','approved','sent')",
      [capActionTypes]
    );
    let remaining = Math.max(0, cap - Number(capCount.rows[0]?.count || 0));
    if (!remaining) return res.status(429).json({ error: "Daily draft cap reached for this action type.", cap });
    const uniqueIds = [...new Set(leadIds)].slice(0, Math.min(10, remaining));
    const staged: any[] = [];
    const skipped: string[] = [];
    const priorWriterLog = await db.query("SELECT status, consecutive_failures FROM agent_logs WHERE agent_name='writer' ORDER BY created_at DESC LIMIT 1");
    if (priorWriterLog.rows[0]?.status === "halted_circuit_breaker") return res.status(423).json({ error: "Writer circuit breaker is active. A founder must reset it before more drafts can be generated." });
    let consecutiveFailures = priorWriterLog.rows[0]?.status === "error" ? Number(priorWriterLog.rows[0].consecutive_failures || 0) : 0;
    for (const leadId of uniqueIds) {
      try {
        const stored = await getAuthoritativeLead(leadId);
        if (!stored) { skipped.push(leadId + ": lead not found"); continue; }
        if (["Closed", "Lost"].includes(stored.status)) { skipped.push((stored.company || stored.name || leadId) + ": closed/lost"); continue; }
        const lead = await enrichLeadAttachments(stored);
        const inboundTexts = [
          lead.prospectInitialResponse || "",
          lead.prospectLatestResponse || "",
          ...(Array.isArray(lead.conversationLog) ? lead.conversationLog.filter((entry: any) => entry?.direction === "inbound" || entry?.type === "reply").map((entry: any) => entry.text || "") : [])
        ];
        const explicitOptOut = containsExplicitOptOut(inboundTexts);
        if (explicitOptOut) {
          await db.query(`
            INSERT INTO agent_contact_controls (lead_id, do_not_contact, reason, source, updated_by, updated_at)
            VALUES ($1, TRUE, 'Explicit opt-out detected in recorded inbound conversation', 'inbound_detection', 'system', NOW())
            ON CONFLICT (lead_id) DO UPDATE SET do_not_contact=TRUE, reason=EXCLUDED.reason, source='inbound_detection', updated_by='system', updated_at=NOW()
          `, [leadId]);
          await db.query("UPDATE agent_queue SET status='rejected', error_log='Cancelled: explicit opt-out detected', updated_at=NOW() WHERE lead_id=$1 AND status IN ('pending_approval','approved')", [leadId]);
          skipped.push((lead.company || lead.name || leadId) + ": explicit opt-out; marked do-not-contact");
          continue;
        }
        const contactControl = await db.query("SELECT do_not_contact FROM agent_contact_controls WHERE lead_id=$1", [leadId]);
        if (contactControl.rows[0]?.do_not_contact) {
          skipped.push((lead.company || lead.name || leadId) + ": do-not-contact flag is active");
          continue;
        }
        const brain = await runSalesBrainWithGenerator(
          lead,
          {
            requestedMessageType: actionMap[actionType] as any,
            task: `DFQ Labs agent configuration — brand voice: ${config.brand_voice}. Buyer psychology pillars: ${(config.buyer_psychology_pillars || []).join("; ")}. Stay grounded in the verified CRM facts and full conversation history. Do not invent observations, projects, budgets or outcomes.`,
          },
          (prompt, maxTokens) => callGemini(SYSTEM_PROMPT, prompt, GEMINI_MODEL, maxTokens),
        );
        const draft = String(brain.message || "").trim();
        if (!draft) throw new Error("Sales Brain returned an empty draft");
        const id = randomUUID();
        const idempotencyKey = "agent-draft:" + leadId + ":" + actionType + ":" + new Date().toISOString().slice(0,10);
        const saved = await db.query(`
          INSERT INTO agent_queue (id, lead_id, agent_name, action_type, draft_content, metadata, reasoning, idempotency_key)
          VALUES ($1,$2,'writer',$3,$4,$5::jsonb,$6,$7)
          ON CONFLICT (idempotency_key) DO UPDATE SET idempotency_key = EXCLUDED.idempotency_key
          RETURNING *
        `, [
          id, leadId, actionType, draft,
          JSON.stringify({ company: lead.company, contact_name: lead.name, message_type: actionMap[actionType], model: GEMINI_MODEL }),
          String(brain.reasoningSummary || brain.recommendedAction || "Generated from the authoritative CRM record and conversation history.").slice(0,5000),
          idempotencyKey
        ]);
        staged.push(saved.rows[0]);
        consecutiveFailures = 0;
      } catch (error: any) {
        consecutiveFailures++;
        skipped.push(leadId + ": " + String(error?.message || "generation failed").slice(0,180));
        await db.query(
          "INSERT INTO agent_logs (id, agent_name, status, summary, items_processed, consecutive_failures, metadata) VALUES ($1,'writer','error',$2,0,$3,$4::jsonb)",
          [randomUUID(), "Draft generation failed for " + leadId, consecutiveFailures, JSON.stringify({ leadId })]
        );
        if (consecutiveFailures >= 2) {
          await db.query(
            "INSERT INTO agent_logs (id, agent_name, status, summary, items_processed, consecutive_failures, metadata) VALUES ($1,'writer','halted_circuit_breaker',$2,$3,$4,$5::jsonb)",
            [randomUUID(), "Writer halted after two consecutive generation failures.", staged.length, consecutiveFailures, JSON.stringify({ actionType })]
          );
          break;
        }
      }
    }
    await db.query(
      "INSERT INTO agent_logs (id, agent_name, status, summary, items_processed, consecutive_failures, metadata) VALUES ($1,'writer',$2,$3,$4,$5,$6::jsonb)",
      [randomUUID(), consecutiveFailures >= 2 ? "halted_circuit_breaker" : consecutiveFailures > 0 ? "error" : "success", "Staged " + staged.length + " draft(s) for founder review.", staged.length, consecutiveFailures, JSON.stringify({ actionType, requested: uniqueIds.length, skipped })]
    );
    await db.query(
      "INSERT INTO agent_audit_log (id, actor_id, action, details) VALUES ($1,$2,'draft_batch_generated',$3::jsonb)",
      [randomUUID(), actor.userId, JSON.stringify({ actionType, staged: staged.length, skipped })]
    );
    return res.json({ ok: true, staged, skipped, remainingCap: Math.max(0, remaining - staged.length) });
  } catch (error: any) {
    console.error("Agent batch generation failed:", error);
    return res.status(500).json({ error: "Could not generate drafts." });
  }
});

// Daily Closer: stages follow-ups for review only. PostgreSQL advisory lock + run ledger
// prevent duplicate execution across restarts or multiple web instances.
let agentSchedulerStarted = false;
let closerSchedulerBusy = false;

function lagosDateTimeParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Lagos", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(date);
  return Object.fromEntries(parts.map(part => [part.type, part.value])) as Record<string, string>;
}

async function runDailyCloserIfDue(): Promise<void> {
  if (closerSchedulerBusy) return;
  const local = lagosDateTimeParts();
  const hour = Number(local.hour);
  if (hour < 14) return;
  const scheduledDate = `${local.year}-${local.month}-${local.day}`;
  closerSchedulerBusy = true;
  let client: any = null;
  let locked = false;
  try {
    client = await db.connect();
    const lock = await client.query("SELECT pg_try_advisory_lock(hashtext($1)) AS locked", ["dfqlabs-os1-daily-closer"]);
    locked = Boolean(lock.rows[0]?.locked);
    if (!locked) return;
    const runId = randomUUID();
    const run = await client.query(`
      INSERT INTO agent_schedule_runs (id, job_name, scheduled_date, status)
      VALUES ($1, 'daily_closer', $2::date, 'started')
      ON CONFLICT (job_name, scheduled_date) DO NOTHING RETURNING id
    `, [runId, scheduledDate]);
    if (!run.rowCount) return;

    let staged = 0;
    const priorCloserLog = await client.query("SELECT status, consecutive_failures FROM agent_logs WHERE agent_name='closer' ORDER BY created_at DESC LIMIT 1");
    if (priorCloserLog.rows[0]?.status === "halted_circuit_breaker") {
      await client.query("UPDATE agent_schedule_runs SET status='blocked', summary='Closer circuit breaker is active; founder reset required.', completed_at=NOW() WHERE id=$1", [runId]);
      return;
    }
    let failures = priorCloserLog.rows[0]?.status === "error" ? Number(priorCloserLog.rows[0].consecutive_failures || 0) : 0;
    const configResult = await client.query("SELECT * FROM agent_config WHERE id=1");
    const config = configResult.rows[0];
    if (!config || config.automation_mode !== "queue_only") {
      await client.query("UPDATE agent_schedule_runs SET status='blocked', summary='Review Queue mode is required.', completed_at=NOW() WHERE id=$1", [runId]);
      return;
    }
    const count = await client.query(`
      SELECT COUNT(*)::int AS count FROM agent_queue
      WHERE action_type IN ('outreach_dm','follow_up')
        AND created_at >= date_trunc('day', NOW())
        AND status IN ('pending_approval','approved','sent')
    `);
    const remaining = Math.max(0, Number(config.daily_outreach_cap) - Number(count.rows[0]?.count || 0));
    if (!remaining) {
      await client.query("UPDATE agent_schedule_runs SET status='completed', summary='Daily outreach/follow-up cap already reached.', completed_at=NOW() WHERE id=$1", [runId]);
      return;
    }

    const leadsResult = await client.query("SELECT data FROM leads");
    const blockedResult = await client.query("SELECT lead_id FROM agent_contact_controls WHERE do_not_contact=TRUE");
    const blockedIds = new Set(blockedResult.rows.map((row: any) => String(row.lead_id)));
    const candidates = leadsResult.rows.map((row: any) => row.data as Lead).filter((lead: Lead) => {
      if (!lead?.id || blockedIds.has(String(lead.id)) || ["Closed","Lost"].includes(lead.status)) return false;
      if (!lead.awaitingReplySince) return false;
      const hours = (Date.now() - new Date(lead.awaitingReplySince).getTime()) / 3600000;
      if (!Number.isFinite(hours) || hours < 48 || hours > 72) return false;
      const thread = (lead.conversationLog || []).filter((entry: any) => entry?.type === "dm" || entry?.type === "reply").sort((a,b) => String(a.ts).localeCompare(String(b.ts)));
      return !thread.length || thread[thread.length - 1].direction !== "inbound";
    }).slice(0, Math.min(10, remaining));

    for (const storedLead of candidates) {
      try {
        const lead = await enrichLeadAttachments(storedLead);
        const brain = await runSalesBrainWithGenerator(
          lead,
          {
            requestedMessageType: "FOLLOW_UP",
            task: `This is a scheduled closer review. The prospect has been awaiting a reply for approximately ${Math.round((Date.now() - new Date(lead.awaitingReplySince).getTime()) / 3600000)} hours. Draft one fresh, non-pushy follow-up that resumes the exact conversation context. Do not restart the sales sequence, repeat a prior angle, invent facts, or pressure the prospect. DFQ Labs voice: ${config.brand_voice}. Buyer psychology pillars: ${(config.buyer_psychology_pillars || []).join("; ")}.`,
          },
          (prompt, maxTokens) => callGemini(SYSTEM_PROMPT, prompt, GEMINI_MODEL, maxTokens),
        );
        const draft = String(brain.message || "").trim();
        if (!draft) throw new Error("Sales Brain returned an empty follow-up");
        await client.query(`
          INSERT INTO agent_queue (id, lead_id, agent_name, action_type, draft_content, metadata, reasoning, idempotency_key)
          VALUES ($1,$2,'closer','follow_up',$3,$4::jsonb,$5,$6)
          ON CONFLICT (idempotency_key) DO NOTHING
        `, [
          randomUUID(), lead.id, draft,
          JSON.stringify({ company: lead.company, contact_name: lead.name, scheduled: true, message_type: "FOLLOW_UP" }),
          String(brain.reasoningSummary || brain.recommendedAction || "Scheduled from the authoritative CRM thread.").slice(0,5000),
          `closer:${lead.id}:${scheduledDate}`,
        ]);
        staged++;
        failures = 0;
      } catch (error: any) {
        failures++;
        await client.query(
          "INSERT INTO agent_logs (id, agent_name, status, summary, items_processed, consecutive_failures, metadata) VALUES ($1,'closer','error',$2,$3,$4,$5::jsonb)",
          [randomUUID(), "Scheduled follow-up generation failed for " + (storedLead.company || storedLead.id), staged, failures, JSON.stringify({ leadId: storedLead.id })]
        );
        if (failures >= 2) break;
      }
    }
    const status = failures >= 2 ? "halted_circuit_breaker" : failures > 0 ? "error" : "success";
    const summary = `Daily closer staged ${staged} follow-up draft(s) for founder review.${failures ? ` ${failures} consecutive failure(s).` : ""}`;
    await client.query(
      "INSERT INTO agent_logs (id, agent_name, status, summary, items_processed, consecutive_failures, metadata) VALUES ($1,'closer',$2,$3,$4,$5,$6::jsonb)",
      [randomUUID(), status, summary, staged, failures, JSON.stringify({ scheduledDate, candidateCount: candidates.length })]
    );
    await client.query("UPDATE agent_schedule_runs SET status=$1, summary=$2, completed_at=NOW() WHERE id=$3", [status, summary, runId]);
  } catch (error: any) {
    console.error("Daily closer scheduler failed:", error);
  } finally {
    if (client) {
      if (locked) await client.query("SELECT pg_advisory_unlock(hashtext($1))", ["dfqlabs-os1-daily-closer"]).catch(() => {});
      client.release();
    }
    closerSchedulerBusy = false;
  }
}

let dispatcherBusy = false;

async function dispatchApprovedQueue(): Promise<void> {
  if (dispatcherBusy) return;
  const bridgeStatus = await whatsappBridge.status();
  if (bridgeStatus.status !== "connected") return;
  const dispatcherState = await db.query("SELECT status FROM agent_logs WHERE agent_name='dispatcher' ORDER BY created_at DESC LIMIT 1");
  if (dispatcherState.rows[0]?.status === "halted_circuit_breaker") return;
  dispatcherBusy = true;
  let client: any = null;
  let locked = false;
  let claimedItem: any = null;
  try {
    client = await db.connect();
    const lock = await client.query("SELECT pg_try_advisory_lock(hashtext($1)) AS locked", ["dfqlabs-os1-approved-dispatcher"]);
    locked = Boolean(lock.rows[0]?.locked);
    if (!locked) return;

    await client.query("BEGIN");
    const selected = await client.query(`
      SELECT * FROM agent_queue
      WHERE status='approved' AND action_type = ANY($1::text[])
      ORDER BY created_at ASC
      LIMIT 1 FOR UPDATE SKIP LOCKED
    `, [["outreach_dm","value_dm","follow_up"]]);
    if (!selected.rowCount) { await client.query("COMMIT"); return; }
    claimedItem = selected.rows[0];
    await client.query(
      "UPDATE agent_queue SET status='sending', dispatch_attempts=dispatch_attempts+1, updated_at=NOW(), error_log=NULL WHERE id=$1",
      [claimedItem.id]
    );
    await client.query("COMMIT");

    await client.query("BEGIN");
    const leadResult = await client.query("SELECT data FROM leads WHERE id=$1 FOR UPDATE", [claimedItem.lead_id]);
    const lead = leadResult.rows[0]?.data as Lead | undefined;
    if (!lead) {
      await client.query("UPDATE agent_queue SET status='failed', error_log='Lead not found at dispatch time.', updated_at=NOW() WHERE id=$1", [claimedItem.id]);
      await client.query("COMMIT");
      return;
    }

    const control = await client.query("SELECT do_not_contact FROM agent_contact_controls WHERE lead_id=$1 FOR UPDATE", [lead.id]);
    if (control.rows[0]?.do_not_contact) {
      await client.query("UPDATE agent_queue SET status='rejected', error_log='Blocked at dispatch: do-not-contact flag is active.', updated_at=NOW() WHERE id=$1", [claimedItem.id]);
      await client.query("COMMIT");
      return;
    }

    const configResult = await client.query("SELECT daily_outreach_cap, daily_value_dm_cap FROM agent_config WHERE id=1");
    const config = configResult.rows[0] || { daily_outreach_cap: 30, daily_value_dm_cap: 30 };
    const isValue = claimedItem.action_type === "value_dm";
    const isReactiveReply = claimedItem.metadata?.messageType === "RESPONSE_DM";
    const cap = Number(isValue ? config.daily_value_dm_cap : config.daily_outreach_cap);
    const capTypes = isValue ? ["value_dm"] : ["outreach_dm","follow_up"];
    if (!isReactiveReply) {
      const sentCount = await client.query(`
        SELECT COUNT(*)::int AS count FROM agent_queue
        WHERE action_type = ANY($1::text[]) AND status='sent'
          AND COALESCE(metadata->>'messageType','') <> 'RESPONSE_DM'
          AND sent_at >= (date_trunc('day', NOW() AT TIME ZONE 'Africa/Lagos') AT TIME ZONE 'Africa/Lagos')
      `, [capTypes]);
      if (Number(sentCount.rows[0]?.count || 0) >= cap) {
        await client.query("UPDATE agent_queue SET status='approved', error_log='Waiting for the next Lagos calendar day: daily send cap reached.', updated_at=NOW() WHERE id=$1", [claimedItem.id]);
        await client.query("COMMIT");
        return;
      }
    }

    const phone = normalizePhone(getWhatsAppNumber(lead));
    if (!phone.valid) {
      await client.query("UPDATE agent_queue SET status='failed', error_log=$1, updated_at=NOW() WHERE id=$2", [phone.error || "Lead has no valid WhatsApp number.", claimedItem.id]);
      await client.query("COMMIT");
      return;
    }

    const messageType = String(claimedItem.metadata?.messageType ||
      (claimedItem.action_type === "value_dm" ? "VALUE_DM" : claimedItem.action_type === "outreach_dm" ? "INTRODUCTION_DM" : "FOLLOW_UP")) as MessageType;
    const outbound = newOutboundMessage({
      leadId: lead.id,
      userId: "DFQLABS AI",
      messageType,
      messageText: claimedItem.draft_content,
      source: "agent_review_queue",
      strategy: claimedItem.reasoning || undefined,
    });
    const existingOutbound = Array.isArray(lead.outboundMessages) ? lead.outboundMessages : [];
    if (existingOutbound.some(item => item.id === outbound.id)) throw new Error("Generated outbound ID collision.");
    const withGeneratedOutbound: Lead = { ...lead, outboundMessages: [...existingOutbound, outbound] };
    await client.query("UPDATE leads SET data=$1::jsonb, updated_at=NOW() WHERE id=$2", [JSON.stringify(withGeneratedOutbound), lead.id]);

    // Keep the lead row locked through the final DNC check and WhatsApp handoff.
    // If delivery becomes uncertain, the queue is failed for manual verification and is never auto-retried.
    const delivery = await whatsappBridge.sendText(phone.international, claimedItem.draft_content);
    const sentAt = new Date().toISOString();
    const updatedLead = commitOutboundSent(withGeneratedOutbound, outbound.id, sentAt);
    await client.query("UPDATE leads SET data=$1::jsonb, updated_at=NOW() WHERE id=$2", [JSON.stringify(updatedLead), lead.id]);
    await client.query(`
      UPDATE agent_queue SET status='sent', external_message_id=$1, sent_at=$2::timestamptz, updated_at=NOW(), error_log=NULL
      WHERE id=$3 AND status='sending'
    `, [delivery.messageId, sentAt, claimedItem.id]);
    await client.query(
      "INSERT INTO agent_audit_log (id, actor_id, action, queue_item_id, details) VALUES ($1,'system:dispatcher','outbound_sent',$2,$3::jsonb)",
      [randomUUID(), claimedItem.id, JSON.stringify({ leadId: lead.id, phone: phone.digits, externalMessageId: delivery.messageId, messageType })]
    );
    await client.query("COMMIT");
    void syncLearningForLead(updatedLead).catch(error => console.error("Agent outbound learning sync failed:", error));
    await db.query(
      "INSERT INTO agent_logs (id, agent_name, status, summary, items_processed, consecutive_failures, metadata) VALUES ($1,'dispatcher','success',$2,1,0,$3::jsonb)",
      [randomUUID(), "Approved WhatsApp message sent and committed to the canonical outbound history.", JSON.stringify({ queueItemId: claimedItem.id, leadId: lead.id, externalMessageId: delivery.messageId })]
    );
  } catch (error: any) {
    if (client) await client.query("ROLLBACK").catch(() => {});
    if (claimedItem?.id) {
      const safeError = String(error?.message || "WhatsApp send failed; delivery outcome may be uncertain.").slice(0, 500);
      await db.query("UPDATE agent_queue SET status='failed', error_log=$1, updated_at=NOW() WHERE id=$2 AND status='sending'", [safeError + " Verify the WhatsApp chat manually before any retry.", claimedItem.id]).catch(() => {});
      const prior = await db.query("SELECT status, consecutive_failures FROM agent_logs WHERE agent_name='dispatcher' ORDER BY created_at DESC LIMIT 1").catch(() => ({ rows: [] as any[] }));
      const failures = prior.rows[0]?.status === "error" ? Number(prior.rows[0].consecutive_failures || 0) + 1 : 1;
      const status = failures >= 2 ? "halted_circuit_breaker" : "error";
      await db.query(
        "INSERT INTO agent_logs (id, agent_name, status, summary, items_processed, consecutive_failures, metadata) VALUES ($1,'dispatcher',$2,$3,0,$4,$5::jsonb)",
        [randomUUID(), status, "Approved message dispatch failed: " + safeError, failures, JSON.stringify({ queueItemId: claimedItem.id })]
      ).catch(() => {});
    } else {
      console.error("Approved dispatcher tick failed:", String(error?.message || error).slice(0, 300));
    }
  } finally {
    if (client) {
      if (locked) await client.query("SELECT pg_advisory_unlock(hashtext($1))", ["dfqlabs-os1-approved-dispatcher"]).catch(() => {});
      client.release();
    }
    dispatcherBusy = false;
  }
}

function scheduleDispatcherTick(): void {
  const delay = 45_000 + Math.floor(Math.random() * 45_000);
  const timer = setTimeout(async () => {
    try { await dispatchApprovedQueue(); }
    catch (error) { console.error("Dispatcher scheduler tick failed:", error); }
    finally { scheduleDispatcherTick(); }
  }, delay);
  timer.unref?.();
}

let agentSystemToken: string | null = null;

async function runScheduledInternalRoute(
  jobName: string,
  hour: number,
  route: string,
  bodyFactory: () => Promise<Record<string, unknown> | null>,
  allowedWeekdays?: string[],
): Promise<void> {
  const local = lagosDateTimeParts();
  if (Number(local.hour) < hour) return;
  const weekday = new Intl.DateTimeFormat("en-US", { timeZone: "Africa/Lagos", weekday: "short" }).format(new Date());
  if (allowedWeekdays && !allowedWeekdays.includes(weekday)) return;
  const scheduledDate = `${local.year}-${local.month}-${local.day}`;
  let client: any = null;
  let locked = false;
  try {
    client = await db.connect();
    const lock = await client.query("SELECT pg_try_advisory_lock(hashtext($1)) AS locked", ["dfqlabs-os1-schedule:" + jobName]);
    locked = Boolean(lock.rows[0]?.locked);
    if (!locked) return;
    await client.query("UPDATE agent_schedule_runs SET status='error' WHERE job_name=$1 AND scheduled_date=$2::date AND status='started' AND created_at < NOW() - INTERVAL '10 minutes'", [jobName, scheduledDate]);
    const runId = randomUUID();
    const run = await client.query(`
      INSERT INTO agent_schedule_runs (id, job_name, scheduled_date, status)
      VALUES ($1,$2,$3::date,'started')
      ON CONFLICT (job_name, scheduled_date) DO UPDATE SET status='started', summary='', completed_at=NULL
      WHERE agent_schedule_runs.status IN ('error','failed')
      RETURNING id
    `, [runId, jobName, scheduledDate]);
    if (!run.rowCount) return;
    const config = await client.query("SELECT automation_mode FROM agent_config WHERE id=1");
    if (config.rows[0]?.automation_mode !== "queue_only") {
      await client.query("UPDATE agent_schedule_runs SET status='blocked', summary='Review Queue mode is required.', completed_at=NOW() WHERE id=$1", [runId]);
      return;
    }
    const body = await bodyFactory();
    if (!body) {
      await client.query("UPDATE agent_schedule_runs SET status='completed', summary='No eligible work was found.', completed_at=NOW() WHERE id=$1", [runId]);
      return;
    }
    if (!agentSystemToken) throw new Error("Internal agent scheduler identity is not initialized.");
    const response = await fetch(`http://127.0.0.1:${PORT}${route}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${agentSystemToken}` },
      body: JSON.stringify(body),
    });
    const payload: any = await response.json().catch(() => ({}));
    if (!response.ok) {
      const status = response.status === 423 ? "blocked" : "error";
      await client.query("UPDATE agent_schedule_runs SET status=$1, summary=$2, completed_at=NOW() WHERE id=$3", [status, String(payload.error || "Scheduled agent request failed").slice(0,500), runId]);
      return;
    }
    const summary = payload.staged?.length !== undefined
      ? `Staged ${payload.staged.length} review item(s).`
      : payload.item ? "Generated a LinkedIn article draft for review."
      : `Scheduled ${jobName} completed.`;
    await client.query("UPDATE agent_schedule_runs SET status='completed', summary=$1, completed_at=NOW() WHERE id=$2", [summary, runId]);
  } catch (error: any) {
    console.error("Scheduled agent route failed (" + jobName + "):", String(error?.message || error).slice(0,300));
    if (client) await client.query("UPDATE agent_schedule_runs SET status='error', summary=$1, completed_at=NOW() WHERE job_name=$2 AND scheduled_date=$3::date AND status='started'", [String(error?.message || "Scheduled job failed").slice(0,500), jobName, scheduledDate]).catch(() => {});
  } finally {
    if (client) {
      if (locked) await client.query("SELECT pg_advisory_unlock(hashtext($1))", ["dfqlabs-os1-schedule:" + jobName]).catch(() => {});
      client.release();
    }
  }
}

async function runDailyScoutSchedule(): Promise<void> {
  const weekday = new Intl.DateTimeFormat("en-US", { timeZone: "Africa/Lagos", weekday: "short" }).format(new Date());
  const city = weekday === "Tue" || weekday === "Fri" ? "Lagos" : weekday === "Wed" || weekday === "Sat" ? "Port Harcourt" : "Abuja";
  await runScheduledInternalRoute("daily_scout", 8, "/api/agents/scout", async () => ({ city, limit: 10 }));
}

async function runDailyWriterSchedule(): Promise<void> {
  await runScheduledInternalRoute("daily_writer", 9, "/api/agents/generate", async () => {
    const [leads, queued, controls] = await Promise.all([
      db.query("SELECT id, data FROM leads"),
      db.query("SELECT DISTINCT lead_id FROM agent_queue WHERE action_type='outreach_dm' AND status IN ('pending_approval','approved','sending','sent')"),
      db.query("SELECT lead_id FROM agent_contact_controls WHERE do_not_contact=TRUE"),
    ]);
    const alreadyDrafted = new Set(queued.rows.map((row: any) => String(row.lead_id)));
    const dnc = new Set(controls.rows.map((row: any) => String(row.lead_id)));
    const leadIds = leads.rows
      .map((row: any) => row.data as Lead)
      .filter((lead: Lead) => lead?.id && !dnc.has(String(lead.id)) && !alreadyDrafted.has(String(lead.id)))
      .filter((lead: Lead) => !["Closed","Lost"].includes(lead.status) && !lead.dmText && !(lead.outboundMessages || []).length && !(lead.conversationLog || []).length && !lead.prospectInitialResponse && !lead.prospectLatestResponse)
      .sort((a: Lead,b: Lead) => String(a.dateAdded || "").localeCompare(String(b.dateAdded || "")))
      .slice(0,10)
      .map((lead: Lead) => lead.id);
    return leadIds.length ? { leadIds, actionType: "outreach_dm" } : null;
  });
}

async function runLinkedInArticleSchedule(): Promise<void> {
  const local = lagosDateTimeParts();
  const topics = [
    "Why high-ticket property buyers hesitate even after a promising viewing",
    "The trust signals that make a real-estate developer credible before a sales call",
    "How property brands can reduce perceived risk without relying on discounts",
    "Why luxury buyers read status cues differently from generic property marketing",
    "The gap between property attention and buyer confidence",
    "What a serious real-estate buyer needs to believe before making contact",
  ];
  const topic = topics[Number(local.day) % topics.length];
  await runScheduledInternalRoute("linkedin_article", 10, "/api/agents/linkedin-article", async () => ({ topic }), ["Mon","Thu"]);
}

function startAgentScheduler(): void {
  if (agentSchedulerStarted) return;
  agentSchedulerStarted = true;
  agentSystemToken = randomUUID();
  activeSessions.set(agentSystemToken, { userId: "system:agent-scheduler", role: "FOUNDER", username: "system", displayName: "DFQLABS Scheduler" });
  const runAllScheduledJobs = () => {
    runDailyScoutSchedule().catch(error => console.error("Scout schedule failed:", error));
    runDailyWriterSchedule().catch(error => console.error("Writer schedule failed:", error));
    runLinkedInArticleSchedule().catch(error => console.error("LinkedIn schedule failed:", error));
    runDailyCloserIfDue().catch(error => console.error("Closer schedule failed:", error));
  };
  const timer = setInterval(runAllScheduledJobs, 60_000);
  timer.unref?.();
  const initial = setTimeout(runAllScheduledJobs, 5_000);
  initial.unref?.();
  scheduleDispatcherTick();
}

app.post("/api/agents/whatsapp/bulk-sync", async (req, res) => {
  const actor = getAuthUserFromReq(req);
  if (!actor || actor.role !== "FOUNDER") return res.status(actor ? 403 : 401).json({ error: "Founder access required" });
  const phone = normalizePhone(String(req.body?.phone || ""));
  const exportText = typeof req.body?.exportText === "string" ? req.body.exportText.trim() : "";
  const myName = typeof req.body?.myName === "string" ? req.body.myName.trim().slice(0,80) : "";
  if (!phone.valid) return res.status(400).json({ error: phone.error || "Enter a valid WhatsApp contact number." });
  if (!exportText || exportText.length > 100_000) return res.status(400).json({ error: "Paste a WhatsApp export between 1 and 100,000 characters." });
  try {
    const prompt = `Parse this WhatsApp plain-text chat export into a chronological JSON array. Return ONLY valid JSON, no markdown or explanation. Each item must have: timestamp (ISO 8601 with timezone when present, otherwise null), direction ("inbound" or "outbound" or "unknown"), author (exact author label if visible, otherwise empty string), text (message text preserved as accurately as possible). The connected business account owner's display name is "${myName || "Me/You"}"; messages from that account are outbound, messages from the contact are inbound. Never invent message content or timestamps. Ignore system notices, encryption notices, missed-call notices, and attachment placeholders with no text. Keep message order. Do not merge distinct messages. Maximum 300 messages.\n\nCHAT EXPORT:\n${exportText}`;
    const raw = await callGemini(SYSTEM_PROMPT, prompt, GEMINI_MODEL, 12000);
    const first = raw.indexOf("[");
    const last = raw.lastIndexOf("]");
    if (first < 0 || last <= first) throw new Error("Gemini did not return a valid message array. Try a cleaner WhatsApp export.");
    const parsed = JSON.parse(raw.slice(first, last + 1));
    if (!Array.isArray(parsed)) throw new Error("Parsed export is not a message list.");
    let inbound = 0, outbound = 0, unmatched = 0, skipped = 0;
    for (const item of parsed.slice(0,300)) {
      const textValue = typeof item?.text === "string" ? item.text.trim() : "";
      const direction = item?.direction;
      const timestamp = typeof item?.timestamp === "string" ? new Date(item.timestamp) : null;
      if (!textValue || !timestamp || !Number.isFinite(timestamp.getTime()) || !["inbound","outbound"].includes(direction)) { skipped++; continue; }
      const receivedAt = timestamp.toISOString();
      const messageId = "bulk-" + createHash("sha256").update([phone.digits, receivedAt, direction, textValue].join("|")).digest("hex").slice(0,40);
      const message: WhatsAppInbound = {
        messageId, remoteJid: phone.digits + "@s.whatsapp.net", phone: phone.digits,
        text: textValue, receivedAt, pushName: typeof item.author === "string" ? item.author : undefined, historical: true,
      };
      if (direction === "inbound") {
        await handleWhatsAppInbound(message);
        inbound++;
        const matched = await db.query("SELECT lead_id FROM agent_whatsapp_events WHERE id=$1", [messageId]);
        if (!matched.rows[0]?.lead_id) unmatched++;
      } else {
        const saved = await appendWhatsAppHistoricalOutbound(message, myName || "You");
        if (saved) outbound++; else skipped++;
      }
    }
    await db.query(
      "INSERT INTO agent_audit_log (id, actor_id, action, details) VALUES ($1,$2,'whatsapp_bulk_sync',$3::jsonb)",
      [randomUUID(), actor.userId, JSON.stringify({ phone: phone.digits, inbound, outbound, unmatched, skipped })]
    );
    res.json({ ok: true, inbound, outbound, unmatched, skipped, totalParsed: Math.min(parsed.length,300) });
  } catch (error: any) {
    console.error("WhatsApp bulk sync failed:", String(error?.message || error).slice(0,300));
    res.status(422).json({ error: String(error?.message || "Could not parse this WhatsApp export.") });
  }
});

app.post("/api/agents/linkedin-article", async (req, res) => {
  const actor = getAuthUserFromReq(req);
  if (!actor || actor.role !== "FOUNDER") return res.status(actor ? 403 : 401).json({ error: "Founder access required" });
  const topic = typeof req.body?.topic === "string" ? req.body.topic.trim().slice(0,300) : "";
  if (!topic) return res.status(400).json({ error: "Enter an article topic or strategic question." });
  try {
    const priorWriterLog = await db.query("SELECT status FROM agent_logs WHERE agent_name='writer' ORDER BY created_at DESC LIMIT 1");
    if (priorWriterLog.rows[0]?.status === "halted_circuit_breaker") return res.status(423).json({ error: "Writer circuit breaker is active. A founder must reset it first." });
    const configResult = await db.query("SELECT brand_voice, buyer_psychology_pillars FROM agent_config WHERE id=1");
    const config = configResult.rows[0] || {};
    const prompt = `Write a high-quality LinkedIn thought-leadership article for DFQ Labs on this topic: "${topic}". Audience: founders, CEOs and marketing leaders at real-estate developers, brokerages and architecture/construction firms in Nigeria. Position DFQ Labs as a buyer-psychology and content-intelligence authority, not a generic social media agency. Brand voice: ${config.brand_voice || "Sharp, consultative, peer-to-peer."}. Strategic pillars: ${(config.buyer_psychology_pillars || []).join("; ")}. Structure: a strong non-clickbait opening, a clear central argument, practical examples relevant to high-ticket real estate, a concise actionable framework, and a thoughtful closing question. Use 600–900 words. Do not invent statistics, client stories, research findings, named companies or market facts. Do not make a hard sales pitch. Return only the finished article, with a compelling headline and readable LinkedIn paragraph spacing.`;
    const article = (await callGemini(SYSTEM_PROMPT, prompt, GEMINI_MODEL, 3500, 0.7)).trim();
    if (article.length < 500) throw new Error("Gemini returned an article that was too short.");
    const dateKey = new Date().toISOString().slice(0,10);
    const slug = topic.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,60) || "thought-leadership";
    const idempotencyKey = `linkedin-article:${dateKey}:${slug}`;
    const saved = await db.query(`
      INSERT INTO agent_queue (id, agent_name, action_type, draft_content, metadata, reasoning, idempotency_key)
      VALUES ($1,'writer','linkedin_article',$2,$3::jsonb,$4,$5)
      ON CONFLICT (idempotency_key) DO UPDATE SET idempotency_key=EXCLUDED.idempotency_key
      RETURNING *
    `, [
      randomUUID(), article, JSON.stringify({ platform: "LinkedIn", topic, generatedDate: dateKey, wordCount: article.split(/\s+/).length }),
      "Thought-leadership draft built around a single buyer-psychology argument. Review all factual claims before publishing.",
      idempotencyKey,
    ]);
    await db.query("INSERT INTO agent_audit_log (id, actor_id, action, queue_item_id, details) VALUES ($1,$2,'linkedin_article_generated',$3,$4::jsonb)", [randomUUID(), actor.userId, saved.rows[0].id, JSON.stringify({ topic })]);
    await db.query("INSERT INTO agent_logs (id, agent_name, status, summary, items_processed, consecutive_failures, metadata) VALUES ($1,'writer','success',$2,1,0,$3::jsonb)", [randomUUID(), "Generated a LinkedIn article draft for founder review.", JSON.stringify({ topic })]);
    res.json({ ok: true, item: saved.rows[0] });
  } catch (error: any) {
    console.error("LinkedIn article generation failed:", String(error?.message || error).slice(0,250));
    const prior = await db.query("SELECT status, consecutive_failures FROM agent_logs WHERE agent_name='writer' ORDER BY created_at DESC LIMIT 1").catch(() => ({ rows: [] as any[] }));
    const failures = prior.rows[0]?.status === "error" ? Number(prior.rows[0].consecutive_failures || 0) + 1 : 1;
    const status = failures >= 2 ? "halted_circuit_breaker" : "error";
    await db.query("INSERT INTO agent_logs (id, agent_name, status, summary, items_processed, consecutive_failures, metadata) VALUES ($1,'writer',$2,$3,0,$4,$5::jsonb)", [randomUUID(), status, "LinkedIn article generation failed: " + String(error?.message || "unknown error").slice(0,250), failures, JSON.stringify({ topic })]).catch(() => {});
    res.status(failures >= 2 ? 423 : 500).json({ error: String(error?.message || "Could not generate LinkedIn article.") });
  }
});

app.post("/api/agents/scout", async (req, res) => {
  const actor = getAuthUserFromReq(req);
  if (!actor || actor.role !== "FOUNDER") return res.status(actor ? 403 : 401).json({ error: "Founder access required" });
  const city = typeof req.body?.city === "string" ? req.body.city.trim().slice(0,80) : "Abuja";
  const limit = Math.min(10, Math.max(1, Number(req.body?.limit) || 10));
  try {
    const prior = await db.query("SELECT status FROM agent_logs WHERE agent_name='scout' ORDER BY created_at DESC LIMIT 1");
    if (prior.rows[0]?.status === "halted_circuit_breaker") return res.status(423).json({ error: "Scout circuit breaker is active. A founder must reset it first." });
    const apiKey = getGeminiApiKey();
    if (!apiKey) throw new Error("GEMINI_API_KEY is not configured.");
    const ai = new GoogleGenAI({ apiKey });
    const prompt = `Use Google Search to discover up to ${limit} real-estate businesses based in or actively serving ${city}, Nigeria. Focus on property developers, established real-estate brokerages, luxury realtor brands, and architecture/construction firms with a credible high-ticket property presence. Prefer companies with a verifiable website or strong public business profile. Return ONLY a JSON array. Each object must contain: company_name, city, category, website, phone, whatsapp, instagram_url, linkedin_url, source_url, buyer_psychology_observation, evidence_summary. Only include businesses you can verify from the search results. Never invent or infer URLs, phone numbers, contacts, projects, budgets or facts. Use null for unavailable contact fields. source_url must be a direct public source URL that supports the company's existence or positioning. buyer_psychology_observation must be one concise, specific observation about how the brand currently signals trust, reduces buyer hesitation, communicates risk, or positions status/identity; if evidence is insufficient, say "Needs manual review" rather than speculate. Do not include duplicate companies. Return at most ${limit} objects.`;
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: { tools: [{ googleSearch: {} }], maxOutputTokens: 7000, temperature: 0.2 } as any,
    });
    const raw = response.text || "";
    const first = raw.indexOf("[");
    const last = raw.lastIndexOf("]");
    if (first < 0 || last <= first) throw new Error("Google Search Scout did not return a parseable JSON list.");
    const discovered = JSON.parse(raw.slice(first,last+1));
    if (!Array.isArray(discovered)) throw new Error("Scout response is not a list.");
    const candidate: any = response.candidates?.[0];
    const groundingMetadata = candidate?.groundingMetadata || {};
    const groundingSources = (groundingMetadata.groundingChunks || []).map((chunk: any) => ({
      title: String(chunk.web?.title || chunk.maps?.title || "").slice(0,200),
      uri: String(chunk.web?.uri || chunk.maps?.uri || ""),
    })).filter((source: any) => /^https?:\/\//i.test(source.uri));
    const searchEntryPoint = typeof groundingMetadata.searchEntryPoint?.renderedContent === "string" ? groundingMetadata.searchEntryPoint.renderedContent : null;
    const webSearchQueries = Array.isArray(groundingMetadata.webSearchQueries) ? groundingMetadata.webSearchQueries : [];

    const existingRows = await db.query("SELECT data FROM leads");
    const existingQueue = await db.query("SELECT metadata FROM agent_queue WHERE action_type='new_lead' AND status IN ('pending_approval','approved','completed')");
    const norm = (value: unknown) => String(value || "").trim().toLowerCase().replace(/^https?:\/\//,"").replace(/^www\./,"").replace(/\/$/,"");
    const domain = (value: unknown) => { try { return new URL(String(value)).hostname.toLowerCase().replace(/^www\./,""); } catch { return ""; } };
    const phoneDigits = (value: unknown) => String(value || "").replace(/\D/g,"");
    const known = [
      ...existingRows.rows.map((row: any) => row.data || {}),
      ...existingQueue.rows.map((row: any) => row.metadata || {}),
    ];
    const dateKey = new Date().toISOString().slice(0,10);
    const staged: any[] = [];
    const skipped: string[] = [];
    let failures = 0;
    for (const item of discovered.slice(0,limit)) {
      const company = String(item?.company_name || "").trim().slice(0,200);
      const sourceUrl = String(item?.source_url || "").trim();
      const safeUrl = (value: unknown) => {
        try { const url = new URL(String(value)); return ["https:","http:"].includes(url.protocol) ? url.toString() : ""; } catch { return ""; }
      };
      const verifiedSource = safeUrl(sourceUrl);
      if (!company || !verifiedSource || !groundingSources.some((source: any) => norm(source.uri) === norm(verifiedSource))) {
        skipped.push((company || "Unnamed result") + ": missing a source URL that appears in Google grounding sources.");
        continue;
      }
      const website = safeUrl(item.website);
      const instagramUrl = safeUrl(item.instagram_url);
      const linkedinUrl = safeUrl(item.linkedin_url);
      const phone = phoneDigits(item.phone || item.whatsapp);
      const duplicate = known.find((lead: any) =>
        norm(lead.company_name || lead.company) === norm(company) ||
        (!!website && !!lead.website && domain(website) === domain(lead.website)) ||
        (!!instagramUrl && norm(instagramUrl) === norm(lead.instagram_url || lead.instagram)) ||
        (!!linkedinUrl && norm(linkedinUrl) === norm(lead.linkedin_url || lead.linkedin)) ||
        (!!phone && phoneDigits(lead.phone || lead.whatsapp) === phone)
      );
      if (duplicate) { skipped.push(company + ": possible CRM or queue duplicate."); continue; }
      const metadata = {
        company_name: company,
        city: String(item.city || city).slice(0,80),
        category: String(item.category || "Real Estate").slice(0,120),
        website: website || null,
        phone: phone ? String(item.phone || item.whatsapp) : null,
        whatsapp: phone ? String(item.whatsapp || item.phone) : null,
        instagram_url: instagramUrl || null,
        linkedin_url: linkedinUrl || null,
        source_url: verifiedSource,
        buyer_psychology_observation: String(item.buyer_psychology_observation || "Needs manual review").slice(0,1000),
        evidence_summary: String(item.evidence_summary || "").slice(0,1500),
        grounding_sources: groundingSources,
        search_entry_point: searchEntryPoint,
        web_search_queries: webSearchQueries,
      };
      const contentText = [
        "Company: " + company,
        "City: " + metadata.city,
        "Category: " + metadata.category,
        "Website: " + (website || "Not verified"),
        "Public phone: " + (metadata.phone || "Not verified"),
        "Instagram: " + (instagramUrl || "Not verified"),
        "LinkedIn: " + (linkedinUrl || "Not verified"),
        "Buyer psychology observation: " + metadata.buyer_psychology_observation,
        "Evidence: " + metadata.evidence_summary,
        "Source: " + verifiedSource,
      ].join("\n");
      const slug = company.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,60);
      const saved = await db.query(`
        INSERT INTO agent_queue (id, agent_name, action_type, draft_content, metadata, reasoning, idempotency_key)
        VALUES ($1,'scout','new_lead',$2,$3::jsonb,$4,$5)
        ON CONFLICT (idempotency_key) DO NOTHING RETURNING *
      `, [
        randomUUID(), contentText, JSON.stringify(metadata),
        "Discovered from Google-grounded public sources. Verify all details before creating or contacting the lead.",
        `scout:${dateKey}:${city.toLowerCase().replace(/[^a-z0-9]+/g,"-")}:${slug}`,
      ]);
      if (saved.rowCount) {
        staged.push(saved.rows[0]);
        known.push(metadata);
      } else skipped.push(company + ": already staged today.");
    }
    const summary = "Scout staged " + staged.length + " verified real-estate lead candidate(s) for founder review.";
    await db.query("INSERT INTO agent_logs (id, agent_name, status, summary, items_processed, consecutive_failures, metadata) VALUES ($1,'scout','success',$2,$3,0,$4::jsonb)", [randomUUID(), summary, staged.length, JSON.stringify({ city, discovered: discovered.length, skipped })]);
    await db.query("INSERT INTO agent_audit_log (id, actor_id, action, details) VALUES ($1,$2,'scout_discovery_run',$3::jsonb)", [randomUUID(), actor.userId, JSON.stringify({ city, staged: staged.length, skipped })]);
    res.json({ ok: true, city, staged, skipped, groundingSources, searchEntryPoint });
  } catch (error: any) {
    console.error("Scout discovery failed:", String(error?.message || error).slice(0,300));
    const prior = await db.query("SELECT consecutive_failures FROM agent_logs WHERE agent_name='scout' ORDER BY created_at DESC LIMIT 1").catch(() => ({ rows: [] as any[] }));
    const failures = Number(prior.rows[0]?.consecutive_failures || 0) + 1;
    const status = failures >= 2 ? "halted_circuit_breaker" : "error";
    await db.query("INSERT INTO agent_logs (id, agent_name, status, summary, items_processed, consecutive_failures, metadata) VALUES ($1,'scout',$2,$3,0,$4,$5::jsonb)", [randomUUID(), status, "Scout run failed: " + String(error?.message || "unknown error").slice(0,250), failures, JSON.stringify({ city })]).catch(() => {});
    res.status(502).json({ error: String(error?.message || "Scout discovery failed.") });
  }
});

// Safe deployment evidence for Render; intentionally exposes no configuration
// values beyond the commit supplied by Render's build environment.
app.get("/api/runtime/version", (_req, res) => {
  res.json({
    service: "dfqlabs-os",
    commit: process.env.RENDER_GIT_COMMIT || process.env.GIT_COMMIT || "unknown",
  });
});


app.get("/api/prospecting-activities", async (req, res) => {
  try {
    const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 100));
    const result = await db.query(
      `SELECT id, actor_name AS "actorName", prospect_name AS "prospectName",
        to_char(activity_date, 'YYYY-MM-DD') AS "activityDate", channel, outcome, created_at AS "createdAt"
       FROM prospecting_activity_events ORDER BY activity_date DESC, created_at DESC LIMIT $1`,
      [limit]
    );
    res.json({ activities: result.rows });
  } catch (error) {
    console.error("GET prospecting activities:", error);
    res.status(500).json({ error: "Could not load prospecting activity." });
  }
});

app.post("/api/prospecting-activities/bulk", async (req, res) => {
  const { actorName, activityDate, channel, outcome, events } = req.body || {};
  const allowedActors = ["Alex", "Alex (Founder)", "Blessing Mudi", "Sa'adatu Mohammed"];
  if (!allowedActors.includes(actorName)) return res.status(400).json({ error: "A recognised team member is required." });
  if (typeof activityDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(activityDate) || Number.isNaN(Date.parse(activityDate + "T00:00:00Z"))) {
    return res.status(400).json({ error: "A valid activity date is required." });
  }
  if (!Array.isArray(events) || events.length < 1 || events.length > 100) return res.status(400).json({ error: "Submit between 1 and 100 prospect records." });
  const clean = events.map((event: any) => ({
    id: typeof event?.id === "string" && /^[A-Za-z0-9:_-]{1,128}$/.test(event.id) ? event.id : "",
    prospectName: typeof event?.prospectName === "string" ? event.prospectName.trim().slice(0, 180) : "",
  }));
  if (clean.some(event => !event.id || !event.prospectName)) return res.status(400).json({ error: "Every record requires a stable ID and prospect name." });
  if (new Set(clean.map(event => event.id)).size !== clean.length) return res.status(400).json({ error: "Duplicate event IDs in batch." });
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    let insertedCount = 0;
    for (const event of clean) {
      const result = await client.query(
        `INSERT INTO prospecting_activity_events (id, actor_name, prospect_name, activity_date, channel, outcome)
         VALUES ($1, $2, $3, $4::date, $5, $6) ON CONFLICT (id) DO NOTHING RETURNING id`,
        [event.id, actorName, event.prospectName, activityDate, String(channel || "WhatsApp").slice(0, 40), String(outcome || "Contacted").slice(0, 40)]
      );
      insertedCount += result.rowCount || 0;
    }
    await client.query("COMMIT");
    res.json({ ok: true, insertedCount, duplicateCount: clean.length - insertedCount });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("POST prospecting activities:", error);
    res.status(500).json({ error: "Could not save prospecting activity." });
  } finally { client.release(); }
});

// ── Sales Brain Learning API ────────────────────────────────────────────────
// These endpoints expose aggregate organizational evidence only; raw private
// conversations remain in the CRM and are never returned by analytics.
app.get("/api/outbound/activity", async (req, res) => {
  try {
    const rows = (await db.query("SELECT id, data FROM leads WHERE jsonb_typeof(data->'outboundMessages') = 'array'")).rows;
    const activity = rows.flatMap((row: any) => {
      const lead = row.data as Lead;
      return (Array.isArray(lead.outboundMessages) ? lead.outboundMessages : []).map((outbound: any) => ({
        id: outbound.id,
        leadId: lead.id,
        leadName: lead.name || "Unnamed contact",
        company: lead.company || "",
        assignedTo: lead.assignedTo || "Unassigned",
        generatedBy: outbound.userId || "Unknown",
        messageType: outbound.messageType || "UNKNOWN",
        messageText: outbound.messageText || "",
        originalGeneratedMessage: outbound.originalGeneratedMessage || outbound.messageText || "",
        status: outbound.status || "GENERATED",
        source: outbound.source || "",
        generatedAt: outbound.generatedAt || null,
        whatsappOpenedAt: outbound.whatsappOpenedAt || null,
        sentAt: outbound.sentAt || null,
      }));
    });
    activity.sort((a: any, b: any) => String(b.generatedAt || "").localeCompare(String(a.generatedAt || "")));
    res.json({ activity: activity.slice(0, 1000), total: activity.length });
  } catch (error) {
    console.error("GET outbound activity:", error);
    res.status(500).json({ error: "Could not load outbound activity." });
  }
});

// Historical reconciliation is deliberately a one-time background task. Running
// hundreds of per-outbound database operations inside the summary request kept
// the mobile UI on its loading state and made every refresh repeat the work.
let legacyLearningBackfillStarted = false;
function scheduleLegacyLearningBackfill() {
  if (!LEARNING_ENABLED || legacyLearningBackfillStarted) return;
  legacyLearningBackfillStarted = true;
  setImmediate(async () => {
    try {
      const leadRows = (await db.query("SELECT data FROM leads WHERE jsonb_typeof(data->'outboundMessages') = 'array'")).rows;
      for (const row of leadRows) await syncLearningForLead(row.data as Lead);
      console.log(`✓ Legacy learning reconciliation processed ${leadRows.length} lead(s)`);
    } catch (error) {
      // Permit a later request to retry if the background reconciliation fails.
      legacyLearningBackfillStarted = false;
      console.error("Legacy learning reconciliation failed:", error);
    }
  });
}

app.get("/api/learning/summary", async (_req, res) => {
  try {
    // Serve the durable projection immediately. New outbound activity is synced
    // on write; older records are reconciled separately without blocking UI.
    const [eventResult, insightResult] = await Promise.all([
      db.query("SELECT data FROM sales_learning_events"),
      db.query("SELECT data FROM sales_learning_insights"),
    ]);
    const events = eventResult.rows.map((row: any) => row.data as LearningEvent);
    const insights = insightResult.rows.map((row: any) => row.data as LearningInsight);
    res.json({ enabled: LEARNING_ENABLED, influenceEnabled: LEARNING_INFLUENCE_ENABLED, summary: summarizeLearning(events, insights), insights: insights.sort((a, b) => b.confidence - a.confidence).slice(0, 20) });
    scheduleLegacyLearningBackfill();
  } catch (error) { console.error("GET /api/learning/summary:", error); res.status(500).json({ error: "Failed to load learning analytics." }); }
});

app.get("/api/learning/insights", async (req, res) => {
  if (!LEARNING_INFLUENCE_ENABLED) return res.json({ insights: [] });
  try {
    const leadId = String(req.query.leadId || "");
    const leadResult = await db.query("SELECT data FROM leads WHERE id = $1", [leadId]);
    if (!leadResult.rows[0]) return res.json({ insights: [] });
    const insights = (await db.query("SELECT data FROM sales_learning_insights")).rows.map((row: any) => row.data as LearningInsight);
    const selected = relevantInsights(insights, leadResult.rows[0].data as Lead, String(req.query.messageType || "")).map(insight => ({ insightId: insight.id, pattern: insight.pattern, relevance: `${insight.segment} / ${insight.strategyType}`, confidence: insight.confidence, evidenceSummary: `${insight.evidenceCount} sent; ${Math.round(insight.positiveResponseRate * 100)}% positive; ${insight.meetingCount} meetings` }));
    res.json({ insights: selected });
  } catch (error) { console.error("GET /api/learning/insights:", error); res.status(500).json({ error: "Failed to retrieve learning insights." }); }
});

app.post("/api/learning/insights/:id/disable", async (req, res) => {
  try {
    const result = await db.query("SELECT data FROM sales_learning_insights WHERE id = $1", [req.params.id]);
    if (!result.rows[0]) return res.status(404).json({ error: "Insight not found." });
    const insight = { ...(result.rows[0].data as LearningInsight), status: "DISABLED" as const, updatedAt: new Date().toISOString() };
    await db.query("UPDATE sales_learning_insights SET data = $1::jsonb, updated_at = NOW() WHERE id = $2", [JSON.stringify(insight), req.params.id]);
    res.json({ ok: true, insight });
  } catch (error) { console.error("POST /api/learning/insights disable:", error); res.status(500).json({ error: "Failed to disable learning insight." }); }
});

app.post("/api/learning/outcomes", async (req, res) => {
  const { outboundId, outcome, responseMessage, outcomeRecordedAt } = req.body || {};
  if (!outboundId || !LEARNING_OUTCOMES.includes(outcome)) return res.status(400).json({ error: "A valid outboundId and controlled outcome are required." });
  try {
    const result = await db.query("SELECT data FROM sales_learning_events WHERE outbound_id = $1", [outboundId]);
    if (!result.rows[0]) return res.status(404).json({ error: "Learning event not found for outbound message." });
    const event = result.rows[0].data as LearningEvent;
    // Idempotent retries with the same outcome replace metadata, never create a second event.
    const recordedAt = outcomeRecordedAt || new Date().toISOString();
    if (event.sentAt && new Date(recordedAt).getTime() < new Date(event.sentAt).getTime()) return res.status(400).json({ error: "An outcome cannot precede the sent timestamp." });
    const updated: LearningEvent = { ...event, outcome, outcomeSource: "manual", outcomeRecordedAt: recordedAt, responseMessage: responseMessage || event.responseMessage, outcomeConfidence: 100, responseTimeSeconds: event.sentAt ? Math.round((new Date(recordedAt).getTime() - new Date(event.sentAt).getTime()) / 1000) : undefined, updatedAt: new Date().toISOString() };
    await db.query("UPDATE sales_learning_events SET data = $1::jsonb, updated_at = NOW() WHERE outbound_id = $2", [JSON.stringify(updated), outboundId]);
    scheduleLearningAnalysis();
    res.json({ ok: true, event: updated });
  } catch (error) { console.error("POST /api/learning/outcomes:", error); res.status(500).json({ error: "Failed to record learning outcome." }); }
});

function extractDocxText(buffer: Buffer): string {
  const eocd = buffer.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd < 0) throw new Error("Invalid DOCX archive.");
  const count = buffer.readUInt16LE(eocd + 10);
  const directoryOffset = buffer.readUInt32LE(eocd + 16);
  let offset = directoryOffset;
  for (let i = 0; i < count; i++) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) break;
    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.toString("utf8", offset + 46, offset + 46 + nameLength);
    if (name === "word/document.xml") {
      const localName = buffer.readUInt16LE(localOffset + 26);
      const localExtra = buffer.readUInt16LE(localOffset + 28);
      const dataStart = localOffset + 30 + localName + localExtra;
      const compressed = buffer.subarray(dataStart, dataStart + compressedSize);
      const xml = (method === 8 ? inflateRawSync(compressed) : compressed).toString("utf8");
      return xml.replace(/<w:tab\b[^>]*\/>/g, " ").replace(/<w:br\b[^>]*\/>/g, "\n").replace(/<\/w:p>/g, "\n").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").trim();
    }
    offset += 46 + nameLength + extraLength + commentLength;
  }
  throw new Error("Could not locate readable Word document text.");
}

function extractPdfText(buffer: Buffer): string {
  const raw = buffer.toString("latin1");
  const chunks: string[] = [];
  const streamPattern = /<<(.*?)>>\s*stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let match: RegExpExecArray | null;
  while ((match = streamPattern.exec(raw))) {
    let stream = Buffer.from(match[2], "latin1");
    try { if (/\/FlateDecode/.test(match[1])) stream = inflateSync(stream); } catch { continue; }
    const content = stream.toString("latin1");
    const textBlocks = content.match(/BT[\s\S]*?ET/g) || [];
    for (const block of textBlocks) {
      const strings = block.match(/\((?:\\.|[^\\)])*\)\s*Tj|\[(?:[\s\S]*?)\]\s*TJ/g) || [];
      for (const item of strings) {
        const literals = item.match(/\((?:\\.|[^\\)])*\)/g) || [];
        for (const literal of literals) chunks.push(literal.slice(1, -1).replace(/\\([nrtbf()\\])/g, (_m, ch) => ({ n: "\n", r: "\r", t: "\t", b: "\b", f: "\f" } as any)[ch] || ch).replace(/\\([0-7]{1,3})/g, (_m, oct) => String.fromCharCode(parseInt(oct, 8))));
        const hex = item.match(/<([0-9A-Fa-f]{4,})>/g) || [];
        for (const h of hex) { const v = h.slice(1, -1); for (let j = 0; j + 3 < v.length; j += 4) chunks.push(String.fromCharCode(parseInt(v.slice(j, j + 4), 16))); }
      }
    }
  }
  const text = chunks.join(" ").replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, " ").replace(/\s+/g, " ").trim();
  if (text.length < 40) throw new Error("This PDF has no extractable text layer. Scanned PDFs need OCR before they can be indexed.");
  return text;
}

app.post("/api/knowledge/extract-file", async (req, res) => {
  try {
    const { fileName, base64 } = req.body || {};
    if (typeof fileName !== "string" || typeof base64 !== "string" || base64.length > 18_000_000) return res.status(400).json({ error: "A supported file under 13 MB is required." });
    const buffer = Buffer.from(base64, "base64");
    const lower = fileName.toLowerCase();
    let text = "";
    if (lower.endsWith(".pdf")) text = extractPdfText(buffer);
    else if (lower.endsWith(".docx")) text = extractDocxText(buffer);
    else return res.status(415).json({ error: "Supported binary documents are PDF and DOCX. Use TXT or Markdown for text files." });
    if (text.length < 40) return res.status(422).json({ error: "Not enough readable text was extracted from this document." });
    res.json({ text: text.slice(0, 100000), characters: text.length });
  } catch (error: any) {
    res.status(422).json({ error: error.message || "Could not extract document text." });
  }
});

// ── Knowledge Base API (Parts 1, 2, 23) ──────────────────────────────────────

app.get("/api/knowledge", async (_req, res) => {
  try {
    const result = await db.query("SELECT data FROM knowledge_sources ORDER BY created_at DESC");
    res.json({ sources: result.rows.map((r: any) => r.data) });
  } catch (err: any) {
    console.error("GET /api/knowledge:", err);
    res.status(500).json({ error: "Failed to load knowledge sources." });
  }
});

app.post("/api/knowledge", async (req, res) => {
  const source = req.body?.source;
  if (!source?.id) return res.status(400).json({ error: "source.id is required." });
  try {
    await db.query(
      `INSERT INTO knowledge_sources (id, data, created_at) VALUES ($1, $2::jsonb, NOW())
       ON CONFLICT (id) DO UPDATE SET data = $2::jsonb`,
      [source.id, JSON.stringify(source)]
    );
    res.json({ ok: true });
  } catch (err: any) {
    console.error("POST /api/knowledge:", err);
    res.status(500).json({ error: "Failed to save knowledge source." });
  }
});

app.delete("/api/knowledge", async (req, res) => {
  const id = req.body?.id;
  if (!id) return res.status(400).json({ error: "id is required." });
  try {
    await db.query("DELETE FROM knowledge_sources WHERE id = $1", [id]);
    res.json({ ok: true });
  } catch (err: any) {
    console.error("DELETE /api/knowledge:", err);
    res.status(500).json({ error: "Failed to delete knowledge source." });
  }
});

// Fetch a website URL and extract readable text (Part 1 — Website URL source)
app.post("/api/knowledge/fetch-url", async (req, res) => {
  const { url } = req.body || {};
  if (!url) return res.status(400).json({ error: "url is required." });
  const isPublicHttpUrl = (value: string) => {
    let parsed: URL;
    try { parsed = new URL(value); } catch { return false; }
    if (!["http:", "https:"].includes(parsed.protocol)) return false;
    const host = parsed.hostname.toLowerCase();
    if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host === "::1") return false;
    const ip = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (ip) {
      const a = Number(ip[1]), b = Number(ip[2]);
      if (a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224) return false;
    }
    return true;
  };
  const extractPage = async (target: string, originHost: string) => {
    if (!isPublicHttpUrl(target)) throw new Error("Only public HTTP/HTTPS website URLs can be indexed.");
    const response = await fetch(target, { headers: { "User-Agent": "Mozilla/5.0 (compatible; DFQLabsKnowledgeBot/1.0)" }, signal: AbortSignal.timeout(12000), redirect: "follow" });
    const finalUrl = new URL(response.url || target);
    if (!response.ok) throw new Error("Website returned HTTP " + response.status);
    if (finalUrl.host !== originHost) throw new Error("Website redirected to a different host; indexing stopped for safety.");
    const type = response.headers.get("content-type") || "";
    if (!type.includes("text/html") && !type.includes("text/plain")) throw new Error("This page did not return readable HTML or text.");
    const html = (await response.text()).slice(0, 2000000);
    const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || finalUrl.pathname || finalUrl.host).replace(/<[^>]+>/g, " ").trim();
    const links = [...html.matchAll(/<a\b[^>]*href=["']([^"'#]+)["'][^>]*>/gi)].map(m => {
      try { const u = new URL(m[1], finalUrl); return u.host === originHost && isPublicHttpUrl(u.toString()) ? u.toString().split("#")[0] : ""; } catch { return ""; }
    }).filter(Boolean);
    const text = html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<noscript[\s\S]*?<\/noscript>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&#39;|&apos;/gi, "'").replace(/&quot;/gi, '"').replace(/\s+/g, " ").trim();
    return { title, text, links };
  };
  try {
    if (!isPublicHttpUrl(url)) return res.status(400).json({ error: "Enter a valid public HTTP/HTTPS website URL." });
    const first = new URL(url);
    const visited = new Set<string>();
    const queue = [first.toString()];
    const pages: string[] = [];
    let title = first.host;
    while (queue.length && visited.size < 12 && pages.join("\n").length < 45000) {
      const next = queue.shift()!;
      if (visited.has(next)) continue;
      visited.add(next);
      try {
        const page = await extractPage(next, first.host);
        if (pages.length === 0) title = page.title;
        pages.push("PAGE: " + page.title + "\nURL: " + next + "\n" + page.text);
        for (const link of page.links) if (!visited.has(link) && queue.length < 30) queue.push(link);
      } catch (pageError: any) {
        if (pages.length === 0) throw pageError;
      }
    }
    const text = pages.join("\n\n").slice(0, 50000);
    if (text.length < 100) throw new Error("The website did not expose enough readable text to index.");
    res.json({ text, title, pagesIndexed: pages.length });
  } catch (err: any) {
    res.status(502).json({ error: "Could not index website: " + (err.message || "unknown error") });
  }
});

// ── Attachment content API (on-demand) ──────────────────────────────────────
// Content lives in the lead_attachments table, separate from lead JSON. These
// endpoints let the UI/AI load a single attachment's content only when needed.

// GET a single attachment (with content) by id — used for viewing/downloading.
app.get("/api/attachments/:id", async (req, res) => {
  try {
    const result = await db.query("SELECT data FROM lead_attachments WHERE id = $1", [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: "Attachment not found." });
    res.json({ attachment: result.rows[0].data });
  } catch (err: any) {
    console.error("GET /api/attachments:", err);
    res.status(500).json({ error: "Failed to load attachment." });
  }
});

// POST a single attachment (with content) — stores the file content separately.
app.post("/api/attachments", async (req, res) => {
  const att = req.body?.attachment;
  if (!att?.id) return res.status(400).json({ error: "attachment.id is required." });
  try {
    await db.query(
      `INSERT INTO lead_attachments (id, lead_id, data, uploaded_at) VALUES ($1, $2, $3::jsonb, NOW())
       ON CONFLICT (id) DO UPDATE SET data = $3::jsonb`,
      [att.id, att.leadId || att.lead_id || "", JSON.stringify(att)]
    );
    res.json({ ok: true });
  } catch (err: any) {
    console.error("POST /api/attachments:", err);
    res.status(500).json({ error: "Failed to save attachment." });
  }
});

// DELETE an attachment's content by id.
app.delete("/api/attachments/:id", async (req, res) => {
  try {
    await db.query("DELETE FROM lead_attachments WHERE id = $1", [req.params.id]);
    res.json({ ok: true });
  } catch (err: any) {
    console.error("DELETE /api/attachments:", err);
    res.status(500).json({ error: "Failed to delete attachment." });
  }
});

// ── Server Permission Middleware & Authorization Helpers ─────────────────────
function requireAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  const user = getAuthUserFromReq(req);
  if (!user) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  (req as any).authUser = user;
  next();
}

function requireFounder(req: express.Request, res: express.Response, next: express.NextFunction) {
  const user = getAuthUserFromReq(req);
  if (!user || user.role !== "FOUNDER") {
    res.status(403).json({ error: "Forbidden: Founder access required" });
    return;
  }
  (req as any).authUser = user;
  next();
}

// ── Leads API — unified (mirrors api/leads.ts for Vercel) ─────────────────────

app.get("/api/leads", async (_req, res) => {
  try {
    const result = await db.query("SELECT data FROM leads ORDER BY updated_at ASC");
    // Never return embedded attachment content in the list payload — only
    // lightweight metadata. This keeps the response small (prevents "Load failed").
    res.json({ leads: result.rows.map((r: any) => stripAttachmentContent(r.data)) });
  } catch (err: any) {
    console.error("GET /api/leads:", err);
    res.status(500).json({ error: "Failed to load leads." });
  }
});

// POST handles single { lead }, bulk { leads }, and authoritative snapshot replacement
app.post("/api/leads", async (req, res) => {
  const body = req.body || {};

  const authUser = getAuthUserFromReq(req);

  if (Array.isArray(body.leads)) {
    // Only Founder can import or bulk-replace leads
    if (authUser && authUser.role !== "FOUNDER") {
      return res.status(403).json({ error: "Forbidden: Specialists cannot import or bulk update leads" });
    }
    const rawLeads = Array.isArray(body.leads) ? body.leads : [];
    const isSnapshot = body.snapshot === true || body.replace === true || body.mode === "snapshot";

    if (isSnapshot) {
      const summary = summarizeSnapshotImport(rawLeads);
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
          finalDatabaseCount: 0,
        });
      }

      try {
        const transactionResult = await runSnapshotReplaceTransaction(db, valid);
        // Backfill only deterministic outbound/conversation evidence after the
        // snapshot transaction has succeeded; never block or alter the import.
        for (const imported of valid) {
          void syncLearningForLead(imported as Lead).catch(error => console.error("Learning snapshot sync failed:", error));
        }
        await Promise.all(valid.map((imported: any) => syncAgentDoNotContact(imported as Lead).catch(error => console.error("Agent opt-out sync failed:", error))));

        return res.json({
          ok: true,
          count: transactionResult.count,
          importedIds: transactionResult.importedIds,
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
          finalDatabaseCount: transactionResult.finalDatabaseCount,
        });
      } catch (err: any) {
        const safeDetails = describeDbError(err);
        console.error("POST /api/leads snapshot replace error:", safeDetails);
        return res.status(500).json({
          ok: false,
          error: "Snapshot replacement failed and was rolled back.",
          details: safeDetails,
        });
      }
    }

    const currentIds = new Set((await db.query("SELECT id FROM leads")).rows.map((r: any) => String(r.id)));
    const summary = summarizeImportBatch(rawLeads, currentIds);
    const valid = summary.valid.map((lead: any) => stripAttachmentContent(lead));
    const {
      duplicates, rejected, sourceCount, validCount, rejectedCount,
      duplicateSourceCount, failedCount, finalDatabaseCount, newCount, updatedCount,
    } = summary;

    if (valid.length === 0) {
      return res.json({
        ok: true,
        count: 0,
        importedIds: [],
        duplicates,
        rejected,
        sourceCount,
        validCount: 0,
        rejectedCount,
        duplicateSourceCount,
        duplicateCount: duplicateSourceCount,
        newCount: 0,
        updatedCount: 0,
        failedCount,
        finalDatabaseCount: currentIds.size,
      });
    }

    try {
      const values = valid.map((_: any, i: number) => `($${i * 2 + 1}, $${i * 2 + 2}::jsonb, NOW())`).join(", ");
      const params = valid.flatMap((l: any) => [String(l.id), JSON.stringify(l)]);
      const query = `INSERT INTO leads (id, data, updated_at) VALUES ${values}
        ON CONFLICT (id) DO UPDATE SET
        data = EXCLUDED.data,
        updated_at = NOW() RETURNING id`;
      const result = await db.query(query, params);
      const importedIds = result.rows.map((row: any) => row.id);
      for (const imported of valid) {
        void syncLearningForLead(imported as Lead).catch(error => console.error("Learning bulk sync failed:", error));
      }
      await Promise.all(valid.map((imported: any) => syncAgentDoNotContact(imported as Lead).catch(error => console.error("Agent opt-out sync failed:", error))));
      return res.json({
        ok: true,
        count: importedIds.length,
        importedIds,
        duplicates,
        rejected,
        sourceCount,
        validCount,
        rejectedCount,
        duplicateSourceCount,
        duplicateCount: duplicateSourceCount,
        newCount,
        updatedCount,
        failedCount,
        finalDatabaseCount,
      });
    } catch (err: any) {
      console.error("POST /api/leads bulk:", err);
      return res.status(500).json({ error: "Failed to bulk-import leads." });
    }
  }

  const lead = stripAttachmentContent(body.lead);
  if (!lead?.id) return res.status(400).json({ error: "lead.id is required." });

  // Auto-assign owner and creator to authenticated user for new leads
  if (authUser) {
    if (!lead.assignedTo || lead.assignedTo === "Unassigned") {
      lead.assignedTo = authUser.displayName;
    }
    lead.ownerUserId = authUser.userId;
    lead.createdByUserId = authUser.userId;
  }

  const actorId = requestedActor(body.actorId);
  const source = typeof body.source === "string" ? body.source.slice(0, 80) : "crm";
  const client = await db.connect();
  try {
    // Lock the current row before read/merge/write. This is intentionally a
    // narrow transaction used only by a single-lead update; it makes SENT
    // confirmation append-only even when another browser has updated the lead.
    await client.query("BEGIN");
    const existing = await client.query("SELECT data FROM leads WHERE id = $1 FOR UPDATE", [lead.id]);
    const mergedLead = mergeSentOutboundUpdate(existing.rows[0]?.data, lead);
    await client.query(
      `INSERT INTO leads (id, data, updated_at) VALUES ($1, $2::jsonb, NOW())
       ON CONFLICT (id) DO UPDATE SET data = $2::jsonb, updated_at = NOW()`,
      [lead.id, JSON.stringify(mergedLead)]
    );
    const action = actorId && existing.rows[0]?.data
      ? createLeadAction({
          id: `action-${randomUUID()}`,
          leadId: String(lead.id),
          actorId,
          source,
          before: existing.rows[0].data,
          after: mergedLead,
          now: new Date().toISOString(),
        })
      : null;
    if (action) {
      // A fresh change starts a new branch and invalidates the actor's redo
      // entries without deleting their audit history.
      await client.query(
        `UPDATE crm_action_history
         SET data = jsonb_set(data, '{redoInvalidatedAt}', to_jsonb(NOW()::text), true)
         WHERE data->>'actorId' = $1 AND data ? 'undoneAt' AND NOT (data ? 'redoInvalidatedAt')`,
        [actorId]
      );
      await client.query(
        "INSERT INTO crm_action_history (id, lead_id, data, created_at) VALUES ($1, $2, $3::jsonb, NOW())",
        [action.id, action.leadId, JSON.stringify(action)]
      );
    }
    await client.query("COMMIT");
    // CRM persistence is authoritative. Learning is an idempotent, best-effort
    // projection keyed by outbound ID and can never prevent a lead save.
    void syncLearningForLead(mergedLead as Lead).catch(error => console.error("Learning lead sync failed:", error));
    await syncAgentDoNotContact(mergedLead as Lead).catch(error => console.error("Agent opt-out sync failed:", error));
    res.json({ ok: true, lead: mergedLead, actionId: action?.id });
  } catch (err: any) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("POST /api/leads single:", err);
    res.status(500).json({ error: "Failed to save lead." });
  } finally {
    client.release();
  }
});

// Durable, actor-scoped action stack.  The client may display this data, but
// all conflict checks and mutations occur here against locked database rows.
app.get("/api/actions", async (req, res) => {
  const actorId = requestedActor(req.query.actorId);
  if (!actorId) return res.status(403).json({ error: "Unauthorized action history request." });
  try {
    const result = await db.query(
      `SELECT data FROM crm_action_history WHERE data->>'actorId' = $1 ORDER BY created_at DESC LIMIT 100`,
      [actorId]
    );
    res.json({ actions: result.rows.map((row: any) => row.data) });
  } catch (error) {
    console.error("GET /api/actions:", error);
    res.status(500).json({ error: "Could not load action history." });
  }
});

app.post("/api/actions/:id/:direction", async (req, res) => {
  const direction = req.params.direction === "undo" ? "undo" : req.params.direction === "redo" ? "redo" : null;
  const actorId = requestedActor(req.body?.actorId);
  if (!direction || !actorId) return res.status(403).json({ error: "Unauthorized action request." });
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const actionResult = await client.query("SELECT data FROM crm_action_history WHERE id = $1 FOR UPDATE", [req.params.id]);
    const action = actionResult.rows[0]?.data as LeadAction | undefined;
    if (!action || action.actorId !== actorId) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Action not found." });
    }
    if ((direction === "undo" && (action.undoneAt || action.redoInvalidatedAt)) || (direction === "redo" && (!action.undoneAt || action.redoInvalidatedAt))) {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "This action is no longer eligible for that operation." });
    }
    const leadResult = await client.query("SELECT data FROM leads WHERE id = $1 FOR UPDATE", [action.leadId]);
    const current = leadResult.rows[0]?.data;
    if (!current) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "The lead no longer exists." });
    }
    if (!actionCanApply(action, current, direction)) {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "This change can no longer be safely undone because the lead has changed." });
    }
    const now = new Date().toISOString();
    const updated = applyActionFields(current, action, direction);
    updated.auditLog = [...(Array.isArray(current.auditLog) ? current.auditLog : []), {
      ts: now, by: actorId, action: direction === "undo" ? "Undo lead field change" : "Redo lead field change", field: action.affectedFields.join(","),
    }];
    const nextAction = { ...action, ...(direction === "undo" ? { undoneAt: now, redoneAt: undefined } : { redoneAt: now, undoneAt: undefined }) };
    await client.query("UPDATE leads SET data = $1::jsonb, updated_at = NOW() WHERE id = $2", [JSON.stringify(updated), action.leadId]);
    await client.query("UPDATE crm_action_history SET data = $1::jsonb WHERE id = $2", [JSON.stringify(nextAction), action.id]);
    await client.query("COMMIT");
    void syncLearningForLead(updated as Lead).catch(error => console.error("Learning undo/redo sync failed:", error));
    res.json({ ok: true, lead: updated, action: nextAction });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("POST /api/actions:", error);
    res.status(500).json({ error: "Could not apply the action safely." });
  } finally {
    client.release();
  }
});

// Canonical outbound confirmation.  The browser supplies only stable IDs; the
// exact message is read from the locked, persisted outbound record.
app.post("/api/leads/:leadId/outbound", async (req, res) => {
  const outbound = req.body?.outbound;
  if (!outbound?.id || !outbound?.messageText || outbound.leadId !== req.params.leadId) {
    return res.status(400).json({ error: "A valid outbound record for this lead is required." });
  }
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query("SELECT data FROM leads WHERE id = $1 FOR UPDATE", [req.params.leadId]);
    const lead = result.rows[0]?.data as Lead | undefined;
    if (!lead) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Lead not found." });
    }
    const existing = Array.isArray(lead.outboundMessages) ? lead.outboundMessages : [];
    const existingRecord = existing.find((item: any) => item.id === outbound.id);
    if (existingRecord && (existingRecord.leadId !== lead.id || existingRecord.messageText !== outbound.messageText)) {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "Outbound ID conflicts with an existing message." });
    }
    const updated = existingRecord ? lead : { ...lead, outboundMessages: [...existing, outbound] };
    if (!existingRecord) {
      await client.query("UPDATE leads SET data = $1::jsonb, updated_at = NOW() WHERE id = $2", [JSON.stringify(updated), lead.id]);
    }
    await client.query("COMMIT");
    if (!existingRecord) void syncLearningForLead(updated as Lead).catch(error => console.error("Learning generated-outbound sync failed:", error));
    return res.json({ ok: true, lead: updated, idempotent: !!existingRecord });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("POST outbound record:", error);
    return res.status(500).json({ error: "Could not save the generated outbound message." });
  } finally {
    client.release();
  }
});

app.post("/api/leads/:leadId/outbound/:outboundId/opened", async (req, res) => {
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query("SELECT data FROM leads WHERE id = $1 FOR UPDATE", [req.params.leadId]);
    const lead = result.rows[0]?.data as Lead | undefined;
    if (!lead) { await client.query("ROLLBACK"); return res.status(404).json({ error: "Lead not found." }); }
    const outboundMessages = Array.isArray(lead.outboundMessages) ? lead.outboundMessages : [];
    const outbound = outboundMessages.find((item: any) => item.id === req.params.outboundId);
    if (!outbound || outbound.leadId !== lead.id) { await client.query("ROLLBACK"); return res.status(404).json({ error: "Outbound message not found for this lead." }); }
    if (outbound.status === "SENT") { await client.query("COMMIT"); return res.json({ ok: true, lead, idempotent: true }); }
    const opened = markWhatsAppOpened(outbound);
    const updated = { ...lead, outboundMessages: outboundMessages.map((item: any) => item.id === outbound.id ? opened : item) };
    await client.query("UPDATE leads SET data = $1::jsonb, updated_at = NOW() WHERE id = $2", [JSON.stringify(updated), lead.id]);
    await client.query("COMMIT");
    void syncLearningForLead(updated as Lead).catch(error => console.error("Learning opened-outbound sync failed:", error));
    return res.json({ ok: true, lead: updated, idempotent: false });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("POST opened outbound:", error);
    return res.status(500).json({ error: "Could not record WhatsApp execution." });
  } finally { client.release(); }
});

app.post("/api/leads/:leadId/outbound/:outboundId/sent", async (req, res) => {
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query("SELECT data FROM leads WHERE id = $1 FOR UPDATE", [req.params.leadId]);
    const lead = result.rows[0]?.data as Lead | undefined;
    if (!lead) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Lead not found." });
    }
    const outboundMessages = Array.isArray(lead.outboundMessages) ? lead.outboundMessages : [];
    const outbound = outboundMessages.find((item: any) => item.id === req.params.outboundId);
    if (!outbound || outbound.leadId !== lead.id) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Outbound message not found for this lead." });
    }
    if (outbound.status === "SENT") {
      await client.query("COMMIT");
      return res.json({ ok: true, lead, idempotent: true });
    }
    const updated = commitOutboundSent(lead, outbound.id, new Date().toISOString());
    await client.query("UPDATE leads SET data = $1::jsonb, updated_at = NOW() WHERE id = $2", [JSON.stringify(updated), lead.id]);
    await client.query("COMMIT");
    void syncLearningForLead(updated as Lead).catch(error => console.error("Learning sent-outbound sync failed:", error));
    res.json({ ok: true, lead: updated, idempotent: false });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("POST sent outbound:", error);
    res.status(500).json({ error: "Could not confirm the outbound message." });
  } finally {
    client.release();
  }
});

// Reversible, server-authoritative removal of one Latest Thread event.  The
// durable outbound record is deliberately retained for execution/audit/learning;
// only the canonical AI-visible conversation event is removed.
app.delete("/api/leads/:leadId/conversation/:eventId", async (req, res) => {
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query("SELECT data FROM leads WHERE id = $1 FOR UPDATE", [req.params.leadId]);
    const lead = result.rows[0]?.data as Lead | undefined;
    if (!lead) { await client.query("ROLLBACK"); return res.status(404).json({ error: "Lead not found." }); }
    const existingRemoved = Array.isArray(lead.removedConversationEvents) ? lead.removedConversationEvents : [];
    if (existingRemoved.some(item => item.eventId === req.params.eventId)) {
      await client.query("COMMIT");
      return res.json({ ok: true, lead, idempotent: true });
    }
    let changed;
    try {
      changed = removeConversationEvent(Array.isArray(lead.conversationLog) ? lead.conversationLog : [], req.params.eventId, lead.dmText || "", lead.prospectInitialResponse || "", new Date().toISOString());
    } catch (error: any) {
      await client.query("ROLLBACK");
      return res.status(error?.message?.includes("anchors") || error?.message?.includes("Only Latest") ? 400 : 404).json({ error: error?.message || "Could not remove conversation event." });
    }
    const updated = { ...lead, conversationLog: changed.log, removedConversationEvents: [...existingRemoved, changed.removed] };
    await client.query("UPDATE leads SET data = $1::jsonb, updated_at = NOW() WHERE id = $2", [JSON.stringify(updated), lead.id]);
    await client.query("COMMIT");
    return res.json({ ok: true, lead: updated, removedEventId: changed.removed.eventId });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("DELETE conversation event:", error);
    return res.status(500).json({ error: "Could not remove conversation event." });
  } finally { client.release(); }
});

app.post("/api/leads/:leadId/conversation/:eventId/restore", async (req, res) => {
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query("SELECT data FROM leads WHERE id = $1 FOR UPDATE", [req.params.leadId]);
    const lead = result.rows[0]?.data as Lead | undefined;
    if (!lead) { await client.query("ROLLBACK"); return res.status(404).json({ error: "Lead not found." }); }
    const removed = Array.isArray(lead.removedConversationEvents) ? lead.removedConversationEvents as RemovedConversationEvent[] : [];
    const target = removed.find(item => item.eventId === req.params.eventId);
    if (!target) {
      const exists = (Array.isArray(lead.conversationLog) ? lead.conversationLog : []).some(event => conversationEventId(event as ConversationEvent) === req.params.eventId);
      await client.query("COMMIT");
      return exists
        ? res.json({ ok: true, lead, idempotent: true })
        : res.status(404).json({ error: "Removed conversation event not found." });
    }
    const updatedLog = restoreConversationEvent(Array.isArray(lead.conversationLog) ? lead.conversationLog : [], target);
    const updated = { ...lead, conversationLog: updatedLog, removedConversationEvents: removed.filter(item => item.eventId !== target.eventId) };
    await client.query("UPDATE leads SET data = $1::jsonb, updated_at = NOW() WHERE id = $2", [JSON.stringify(updated), lead.id]);
    await client.query("COMMIT");
    return res.json({ ok: true, lead: updated, idempotent: updatedLog === lead.conversationLog });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("POST restore conversation event:", error);
    return res.status(500).json({ error: "Could not restore conversation event." });
  } finally { client.release(); }
});

// ── Duplicate Check Endpoint ──────────────────────────────────────────────────
app.post("/api/leads/check-duplicate", async (req, res) => {
  const { phone, instagram, email, company, website } = req.body || {};

  const normalizePhone = (p?: string) => {
    if (!p) return "";
    let digits = p.replace(/\D/g, "");
    if (digits.startsWith("234")) digits = digits.slice(3);
    else if (digits.startsWith("0") && digits.length >= 11) digits = digits.slice(1);
    return digits.slice(-10);
  };

  const normalizeHandle = (h?: string) => {
    if (!h) return "";
    return h.trim().toLowerCase().replace(/^@/, "").replace(/https?:\/\/(www\.)?instagram\.com\//, "").replace(/\/$/, "");
  };

  const normPhone = normalizePhone(phone);
  const normIg = normalizeHandle(instagram);
  const normEmail = email ? email.trim().toLowerCase() : "";
  const normCompany = company ? company.trim().toLowerCase() : "";

  if (!normPhone && !normIg && !normEmail && !normCompany) {
    return res.status(400).json({ error: "At least one search field (phone, instagram, email, company) is required." });
  }

  try {
    const result = await db.query("SELECT id, data FROM leads");
    const matches: Array<{
      leadId: string;
      company: string;
      instagram?: string;
      status: string;
      assignedTo: string;
      lastContacted?: string;
      matchReason: string;
      confidence: "Exact Match" | "Potential Match";
    }> = [];

    for (const row of result.rows) {
      const lead = row.data as Lead;
      let matchedReason = "";
      let isExact = false;

      if (normPhone && normalizePhone(lead.phone || lead.whatsapp) === normPhone) {
        matchedReason = "Phone number matches existing lead";
        isExact = true;
      } else if (normIg && normalizeHandle(lead.instagram) === normIg) {
        matchedReason = "Instagram handle matches existing lead";
        isExact = true;
      } else if (normEmail && lead.email && lead.email.trim().toLowerCase() === normEmail) {
        matchedReason = "Email address matches existing lead";
        isExact = true;
      } else if (normCompany && lead.company && lead.company.trim().toLowerCase() === normCompany) {
        matchedReason = "Company/Brand name matches existing lead";
        isExact = false;
      }

      if (matchedReason) {
        matches.push({
          leadId: lead.id,
          company: lead.company || "Unknown Company",
          instagram: lead.instagram,
          status: lead.status || "New",
          assignedTo: lead.assignedTo || "Unassigned",
          lastContacted: lead.lastContacted,
          matchReason: matchedReason,
          confidence: isExact ? "Exact Match" : "Potential Match",
        });
      }
    }

    res.json({
      hasDuplicates: matches.length > 0,
      matchCount: matches.length,
      highestConfidence: matches.some(m => m.confidence === "Exact Match") ? "Exact Match" : matches.length > 0 ? "Potential Match" : "No Match",
      matches,
    });
  } catch (err: any) {
    console.error("POST /api/leads/check-duplicate error:", err);
    res.status(500).json({ error: "Failed to perform database duplicate check." });
  }
});

// DELETE with id in body (works on both Express and Vercel)
app.delete("/api/leads", async (req, res) => {
  const id = req.body?.id;
  if (!id) return res.status(400).json({ error: "id is required." });
  try {
    await db.query("DELETE FROM leads WHERE id = $1", [id]);
    res.json({ ok: true });
  } catch (err: any) {
    console.error("DELETE /api/leads:", err);
    res.status(500).json({ error: "Failed to delete lead." });
  }
});

// ── Frontend serving ──────────────────────────────────────────────────────────
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`DFQ Labs OS — Gemini-powered server on port ${PORT} (model: ${GEMINI_MODEL})`);
  });
  startAgentScheduler();
}

// ── Initialize database and start server ────────────────────────────────────────
(async () => {
  try {
    await initializeDatabase();
  await whatsappBridge.initialize();
    await startServer();
  } catch (err) {
    console.error("✗ Failed to start application:", err);
    process.exit(1);
  }
})();
