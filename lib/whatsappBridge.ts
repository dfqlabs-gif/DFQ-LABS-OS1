import * as QRCode from "qrcode";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import type { Pool } from "pg";
import { normalizePhone } from "./phone.js";

export type WhatsAppInbound = {
  messageId: string;
  remoteJid: string;
  phone: string;
  text: string;
  receivedAt: string;
  pushName?: string;
  historical?: boolean;
};

export type WhatsAppBridgeStatus = {
  enabled: boolean;
  status: string;
  connectedPhone: string | null;
  lastError: string | null;
  lastConnectedAt: string | null;
  qrDataUrl: string | null;
  encryptionConfigured: boolean;
};

type InboundHandler = (message: WhatsAppInbound) => Promise<void>;

// The server bundle is emitted as CommonJS while Baileys ships ESM builds.
// Load it dynamically and normalize both legacy and newer export shapes.
let baileysModulePromise: Promise<any> | null = null;
async function getBaileysModule(): Promise<{ makeWASocket: (...args: any[]) => any; DisconnectReason: any; initAuthCreds: () => any }> {
  if (!baileysModulePromise) {
    baileysModulePromise = import("@whiskeysockets/baileys").then((loaded: any) => {
      const namespace = loaded?.default && typeof loaded.default === "object"
        ? { ...loaded.default, ...loaded }
        : loaded;
      const socketFactory = typeof namespace?.default === "function"
        ? namespace.default
        : typeof namespace?.makeWASocket === "function"
          ? namespace.makeWASocket
          : typeof loaded?.default?.default === "function"
            ? loaded.default.default
            : null;
      if (!socketFactory || typeof namespace?.initAuthCreds !== "function" || !namespace?.DisconnectReason) {
        throw new Error("Baileys module exports are incompatible. Expected makeWASocket, initAuthCreds and DisconnectReason.");
      }
      return { makeWASocket: socketFactory, initAuthCreds: namespace.initAuthCreds, DisconnectReason: namespace.DisconnectReason };
    }).catch(error => {
      baileysModulePromise = null;
      throw error;
    });
  }
  return baileysModulePromise;
}

function encryptionKey(): Buffer {
  const secret = process.env.WHATSAPP_SESSION_ENCRYPTION_KEY || "";
  if (secret.length < 32) throw new Error("WHATSAPP_SESSION_ENCRYPTION_KEY must be configured with at least 32 characters.");
  return createHash("sha256").update(secret, "utf8").digest();
}

function serialize(value: unknown): string {
  return JSON.stringify(value);
}

function deserialize<T>(value: string): T {
  return JSON.parse(value, (_key, item) => {
    if (item && item.type === "Buffer" && Array.isArray(item.data)) return Buffer.from(item.data);
    return item;
  }) as T;
}

function encrypt(value: unknown) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(serialize(value), "utf8"), cipher.final()]);
  return { ciphertext: ciphertext.toString("base64"), iv: iv.toString("base64"), authTag: cipher.getAuthTag().toString("base64") };
}

function decrypt<T>(row: { ciphertext: string; iv: string; auth_tag: string }): T {
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(row.iv, "base64"));
  decipher.setAuthTag(Buffer.from(row.auth_tag, "base64"));
  const plaintext = Buffer.concat([decipher.update(Buffer.from(row.ciphertext, "base64")), decipher.final()]).toString("utf8");
  return deserialize<T>(plaintext);
}

function extractText(message: any): string {
  const content = message?.message || {};
  return String(
    content.conversation ||
    content.extendedTextMessage?.text ||
    content.imageMessage?.caption ||
    content.videoMessage?.caption ||
    content.documentMessage?.caption ||
    content.buttonsResponseMessage?.selectedDisplayText ||
    content.listResponseMessage?.title ||
    content.templateButtonReplyMessage?.selectedDisplayText ||
    ""
  ).trim();
}

export function createWhatsAppBridge(db: Pool, onInbound: InboundHandler) {
  let socket: any = null;
  let qrDataUrl: string | null = null;
  let lockClient: any = null;
  let manualStop = false;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  const updateSettings = async (patch: Record<string, unknown>) => {
    const fields = Object.keys(patch);
    if (!fields.length) return;
    const sets = fields.map((field, index) => `${field} = $${index + 1}`).join(", ");
    await db.query(`UPDATE agent_whatsapp_settings SET ${sets}, updated_at=NOW() WHERE id=1`, fields.map(field => patch[field]));
  };

  const clearAuthState = async () => {
    await db.query("DELETE FROM agent_whatsapp_auth_state");
  };

  const saveEncrypted = async (stateKey: string, value: unknown) => {
    const encrypted = encrypt(value);
    await db.query(`
      INSERT INTO agent_whatsapp_auth_state (state_key, ciphertext, iv, auth_tag, updated_at)
      VALUES ($1,$2,$3,$4,NOW())
      ON CONFLICT (state_key) DO UPDATE SET ciphertext=EXCLUDED.ciphertext, iv=EXCLUDED.iv, auth_tag=EXCLUDED.auth_tag, updated_at=NOW()
    `, [stateKey, encrypted.ciphertext, encrypted.iv, encrypted.authTag]);
  };

  const loadAuthState = async () => {
    const credsResult = await db.query("SELECT ciphertext, iv, auth_tag FROM agent_whatsapp_auth_state WHERE state_key='creds'");
    const { initAuthCreds } = await getBaileysModule();
    const creds = credsResult.rows[0] ? decrypt<any>(credsResult.rows[0]) : initAuthCreds();
    const keys = {
      get: async (type: string, ids: string[]) => {
        if (!ids.length) return {};
        const stateKeys = ids.map(id => `${type}:${id}`);
        const result = await db.query("SELECT state_key, ciphertext, iv, auth_tag FROM agent_whatsapp_auth_state WHERE state_key = ANY($1::text[])", [stateKeys]);
        const values: Record<string, unknown> = {};
        for (const row of result.rows) {
          const id = row.state_key.slice(type.length + 1);
          values[id] = decrypt(row);
        }
        return values;
      },
      set: async (data: Record<string, Record<string, unknown>>) => {
        for (const [type, entries] of Object.entries(data)) {
          for (const [id, value] of Object.entries(entries || {})) {
            const stateKey = `${type}:${id}`;
            if (value === null || value === undefined) {
              await db.query("DELETE FROM agent_whatsapp_auth_state WHERE state_key=$1", [stateKey]);
            } else {
              await saveEncrypted(stateKey, value);
            }
          }
        }
      },
    };
    return { state: { creds, keys } as any, saveCreds: () => saveEncrypted("creds", creds) };
  };

  const releaseLock = async () => {
    if (!lockClient) return;
    await lockClient.query("SELECT pg_advisory_unlock(hashtext($1))", ["dfqlabs-os1-whatsapp-bridge"]).catch(() => {});
    lockClient.release();
    lockClient = null;
  };

  const scheduleReconnect = () => {
    if (manualStop || reconnectTimer) return;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      startSocket().catch(async error => {
        await updateSettings({ status: "error", last_error: String(error?.message || "WhatsApp reconnect failed").slice(0, 500) }).catch(() => {});
        scheduleReconnect();
      });
    }, 5000);
    reconnectTimer.unref?.();
  };

  const handleInbound = async (raw: any) => {
    try {
      if (raw?.key?.fromMe) return;
      const remoteJid = String(raw?.key?.remoteJid || "");
      if (!remoteJid || remoteJid.endsWith("@g.us") || remoteJid === "status@broadcast" || !remoteJid.endsWith("@s.whatsapp.net")) return;
      const text = extractText(raw);
      if (!text) return;
      const rawDigits = remoteJid.split("@")[0].split(":")[0].replace(/\D/g, "");
      const normalized = normalizePhone("+" + rawDigits);
      if (!normalized.valid) return;
      const messageId = String(raw?.key?.id || randomBytes(12).toString("hex"));
      const seconds = Number(raw?.messageTimestamp?.toString?.() || raw?.messageTimestamp || 0);
      const receivedAt = new Date(seconds > 0 ? seconds * 1000 : Date.now()).toISOString();
      const inserted = await db.query(`
        INSERT INTO agent_whatsapp_events (id, remote_jid, phone, message_text, received_at, metadata)
        VALUES ($1,$2,$3,$4,$5::timestamptz,$6::jsonb)
        ON CONFLICT (id) DO NOTHING RETURNING id
      `, [messageId, remoteJid, normalized.digits, text, receivedAt, JSON.stringify({ pushName: raw?.pushName || null, messageType: Object.keys(raw?.message || {})[0] || "unknown" })]);
      if (!inserted.rowCount) return;
      await onInbound({
        messageId, remoteJid, phone: normalized.digits, text, receivedAt,
        pushName: typeof raw?.pushName === "string" ? raw.pushName : undefined,
      });
    } catch (error: any) {
      console.error("WhatsApp inbound processing failed:", String(error?.message || error).slice(0, 300));
    }
  };

  async function startSocket() {
    if (socket) return;
    encryptionKey();
    manualStop = false;
    try {
    if (!lockClient) {
      lockClient = await db.connect();
      const lock = await lockClient.query("SELECT pg_try_advisory_lock(hashtext($1)) AS locked", ["dfqlabs-os1-whatsapp-bridge"]);
      if (!lock.rows[0]?.locked) {
        lockClient.release();
        lockClient = null;
        throw new Error("WhatsApp bridge is already active on another OS1 instance.");
      }
    }
    await updateSettings({ enabled: true, status: "connecting", last_error: null });
    const auth = await loadAuthState();
    const { makeWASocket, DisconnectReason } = await getBaileysModule();
    const nextSocket = makeWASocket({
      auth: auth.state,
      printQRInTerminal: false,
      syncFullHistory: false,
      markOnlineOnConnect: false,
    });
    socket = nextSocket;
    nextSocket.ev.on("creds.update", () => {
      auth.saveCreds().catch(error => console.error("WhatsApp encrypted credential save failed:", String(error?.message || error).slice(0, 200)));
    });
    nextSocket.ev.on("connection.update", (update: any) => {
      void (async () => {
        if (update.qr) {
          qrDataUrl = await QRCode.toDataURL(update.qr, { width: 280, margin: 1, errorCorrectionLevel: "M" });
          await updateSettings({ status: "qr_required", last_error: null });
        }
        if (update.connection === "open") {
          qrDataUrl = null;
          const connectedPhone = String(nextSocket.user?.id || "").split(":")[0].split("@")[0] || null;
          await updateSettings({ enabled: true, status: "connected", connected_phone: connectedPhone, last_error: null, last_connected_at: new Date().toISOString() });
        }
        if (update.connection === "close") {
          socket = null;
          qrDataUrl = null;
          if (manualStop) return;
          const code = update.lastDisconnect?.error?.output?.statusCode;
          if (code === DisconnectReason.loggedOut) {
            await clearAuthState();
            await updateSettings({ enabled: false, status: "needs_qr", connected_phone: null, last_error: "WhatsApp session was logged out. Scan a new QR code." });
            await releaseLock();
          } else {
            await updateSettings({ status: "reconnecting", last_error: code ? `WhatsApp connection closed (${code})` : "WhatsApp connection closed; reconnecting." });
            scheduleReconnect();
          }
        }
      })().catch(error => console.error("WhatsApp connection state update failed:", String(error?.message || error).slice(0, 200)));
    });
    nextSocket.ev.on("messages.upsert", (event: any) => {
      if (event?.type !== "notify") return;
      for (const message of event.messages || []) void handleInbound(message);
    });
    } catch (error) {
      const current = socket;
      socket = null;
      if (current) current.end(error as Error);
      await releaseLock();
      throw error;
    }
  }

  return {
    async connect() {
      await updateSettings({ enabled: true, status: "connecting", last_error: null });
      try {
        await startSocket();
        return this.status();
      } catch (error: any) {
        await updateSettings({ enabled: false, status: "error", last_error: String(error?.message || "WhatsApp connection failed").slice(0, 500) });
        throw error;
      }
    },
    async disconnect() {
      manualStop = true;
      if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
      const current = socket;
      socket = null;
      qrDataUrl = null;
      if (current) current.end(undefined);
      await updateSettings({ enabled: false, status: "disconnected", connected_phone: null, last_error: null });
      await releaseLock();
      return this.status();
    },
    async status(): Promise<WhatsAppBridgeStatus> {
      const result = await db.query("SELECT enabled, status, connected_phone, last_error, last_connected_at FROM agent_whatsapp_settings WHERE id=1");
      const row = result.rows[0] || {};
      return {
        enabled: Boolean(row.enabled),
        status: row.status || "disconnected",
        connectedPhone: row.connected_phone || null,
        lastError: row.last_error || null,
        lastConnectedAt: row.last_connected_at || null,
        qrDataUrl,
        encryptionConfigured: (process.env.WHATSAPP_SESSION_ENCRYPTION_KEY || "").length >= 32,
      };
    },
    async sendText(phone: string, text: string) {
      if (!socket || !socket.user) throw new Error("WhatsApp is not connected.");
      const normalized = normalizePhone(phone);
      if (!normalized.valid) throw new Error(normalized.error || "Invalid WhatsApp number.");
      const jid = `${normalized.digits}@s.whatsapp.net`;
      const result = await socket.sendMessage(jid, { text });
      return { messageId: result?.key?.id || null, remoteJid: jid };
    },
    async initialize() {
      const status = await this.status();
      if (status.enabled && !status.encryptionConfigured) {
        await updateSettings({ status: "encryption_key_missing", last_error: "Set WHATSAPP_SESSION_ENCRYPTION_KEY to restore the encrypted WhatsApp session." });
      } else if (status.enabled) {
        await startSocket().catch(async error => {
          await updateSettings({ status: "error", last_error: String(error?.message || "WhatsApp startup failed").slice(0, 500) }).catch(() => {});
        });
      }
    },
  };
}
