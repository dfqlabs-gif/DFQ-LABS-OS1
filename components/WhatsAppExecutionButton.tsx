// ─────────────────────────────────────────────────────────────────────────────
// WhatsAppExecutionButton — the ONE reusable execution component (Part 8)
//
// Drop this anywhere a generated lead message exists. It powers:
//   - Open WhatsApp  (opens wa.me with ONLY the actual message)
//   - Mark as Sent   (confirms delivery → updates CRM, conversation, follow-up)
//
// Props:
//   lead          — the lead (needs phone/whatsapp)
//   message       — ONLY the actual message text (never strategy)
//   messageType   — VALUE_DM, SALES_DM, etc.
//   source        — where this button lives ("mission_control", "ask_ai", ...)
//   userId        — who is executing
//   onWhatsAppOpened  — callback when WhatsApp opens (update outbound → WHATSAPP_OPENED)
//   onSent        — callback when user confirms sent (update CRM, conversation, follow-up)
//   followUpId    — optional follow-up task id (anti-duplication)
//   compact       — smaller variant for inline use
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState } from "react";
import { MessageCircle, CheckCircle2, AlertCircle, ExternalLink } from "lucide-react";
import { openWhatsAppWithMessage } from "../lib/whatsapp";
import { normalizePhone, getWhatsAppNumber } from "../lib/phone";
import { MessageType, MESSAGE_TYPE_LABEL } from "../lib/messageTypes";
import { G, G_DIM, G_BORDER, BORDER, SURFACE2, MUTED, MUTED2, TEXT } from "../constants";

interface Props {
  lead: { phone?: string; whatsapp?: string; name?: string; company?: string; id: string };
  message: string;
  messageType?: MessageType;
  source?: string;
  userId?: string;
  onWhatsAppOpened?: () => void;
  onSent?: () => void;
  followUpId?: string;
  compact?: boolean;
  disabled?: boolean;
}

export function WhatsAppExecutionButton({
  lead,
  message,
  messageType = "VALUE_DM",
  source = "os",
  userId,
  onWhatsAppOpened,
  onSent,
  followUpId,
  compact = false,
  disabled = false,
}: Props) {
  const [opened, setOpened] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);

  const handleOpenWhatsApp = () => {
    setError(null);
    const result = openWhatsAppWithMessage(lead, message);
    if (!result.ok) {
      setError(result.error || "Could not open WhatsApp.");
      return;
    }
    setOpened(true);
    onWhatsAppOpened?.();
  };

  const handleMarkSent = () => {
    setSent(true);
    setShowConfirm(false);
    onSent?.();
  };

  const pad = compact ? "5px 10px" : "7px 14px";
  const fontSize = compact ? 10 : 11;

  // Phone validity check for the icon color
  const rawNumber = getWhatsAppNumber(lead);
  const phoneValid = rawNumber ? normalizePhone(rawNumber).valid : false;

  if (sent) {
    return (
      <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: compact ? "5px 10px" : "7px 14px", background: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.35)", borderRadius: 6, fontSize, fontWeight: 700, color: "#22C55E" }}>
        <CheckCircle2 size={compact ? 11 : 13} /> Sent
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        <button
          onClick={handleOpenWhatsApp}
          disabled={disabled || !message?.trim()}
          title={phoneValid ? `Open WhatsApp for ${normalizePhone(rawNumber).international}` : "No valid phone number"}
          style={{
            background: disabled || !message?.trim() ? SURFACE2 : "#25D366",
            color: disabled || !message?.trim() ? MUTED : "#fff",
            border: "none",
            borderRadius: 6,
            padding: pad,
            fontSize,
            fontWeight: 800,
            cursor: disabled || !message?.trim() ? "not-allowed" : "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            whiteSpace: "nowrap",
          }}
        >
          <MessageCircle size={compact ? 11 : 13} /> Open WhatsApp
        </button>

        {opened && !showConfirm && (
          <button
            onClick={() => setShowConfirm(true)}
            style={{
              background: "rgba(34,197,94,0.1)",
              color: "#22C55E",
              border: "1px solid rgba(34,197,94,0.35)",
              borderRadius: 6,
              padding: pad,
              fontSize,
              fontWeight: 700,
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              whiteSpace: "nowrap",
            }}
          >
            <CheckCircle2 size={compact ? 11 : 13} /> Mark as Sent
          </button>
        )}
      </div>

      {/* Confirmation step — opening WhatsApp ≠ sent */}
      {showConfirm && (
        <div style={{ background: "rgba(34,197,94,0.06)", border: "1px solid rgba(34,197,94,0.3)", borderRadius: 8, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ fontSize: 11, color: TEXT, lineHeight: 1.5 }}>
            Did you actually send the message in WhatsApp? Confirming logs it to the conversation, updates the follow-up, and marks this task complete.
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={handleMarkSent} style={{ background: "#22C55E", color: "#000", border: "none", borderRadius: 6, padding: "6px 14px", fontSize, fontWeight: 800, cursor: "pointer" }}>✓ Yes, Sent</button>
            <button onClick={() => setShowConfirm(false)} style={{ background: "transparent", border: `1px solid ${BORDER}`, color: MUTED, borderRadius: 6, padding: "6px 12px", fontSize, cursor: "pointer" }}>Not yet</button>
          </div>
        </div>
      )}

      {error && (
        <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10, color: "#EF4444", background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 5, padding: "5px 8px" }}>
          <AlertCircle size={11} /> {error}
        </div>
      )}

      {opened && !sent && !showConfirm && !error && (
        <div style={{ fontSize: 10, color: MUTED2, display: "flex", alignItems: "center", gap: 4 }}>
          <ExternalLink size={10} /> WhatsApp opened — this only means the message is prepared, not sent. Tap "Mark as Sent" once you've actually sent it.
        </div>
      )}
    </div>
  );
}

export default WhatsAppExecutionButton;
