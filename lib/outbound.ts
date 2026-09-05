// ─────────────────────────────────────────────────────────────────────────────
// DFQ Labs OS — Outbound Message Architecture (Parts 10, 15, 17)
//
// A single reusable outbound-message record + execution-state machine that
// every part of the OS uses. Stored on the lead (Lead.outboundMessages) so it
// persists through the existing JSONB lead store with no new tables.
// ─────────────────────────────────────────────────────────────────────────────

import type { MessageType } from "./messageTypes";

export type OutboundStatus =
  | "DRAFT"
  | "GENERATED"
  | "READY_TO_SEND"
  | "WHATSAPP_OPENED"
  | "SENT"
  | "FAILED"
  | "CANCELLED";

export const OUTBOUND_STATUS_LABEL: Record<OutboundStatus, string> = {
  DRAFT: "Draft",
  GENERATED: "Generated",
  READY_TO_SEND: "Ready to Send",
  WHATSAPP_OPENED: "WhatsApp Opened",
  SENT: "Sent",
  FAILED: "Failed",
  CANCELLED: "Cancelled",
};

export const OUTBOUND_STATUS_COLOR: Record<OutboundStatus, string> = {
  DRAFT: "#555",
  GENERATED: "#3ECFDC",
  READY_TO_SEND: "#F59E0B",
  WHATSAPP_OPENED: "#3B82F6",
  SENT: "#22C55E",
  FAILED: "#EF4444",
  CANCELLED: "#555",
};

export interface OutboundMessage {
  id: string;
  leadId: string;
  userId: string;          // team member who generated/sent
  messageType: MessageType;
  messageText: string;     // ONLY the actual message (never strategy/metadata)
  status: OutboundStatus;
  generatedAt: string;     // ISO
  whatsappOpenedAt?: string;
  sentAt?: string;
  source: string;          // e.g. "mission_control", "ask_ai", "follow_up_queue"
  followUpId?: string;     // links to a follow-up task if applicable
  strategy?: string;       // internal AI strategy — stored separately, never sent
  salesBrain?: { salesStage: string; buyerIntent: string; recommendedAction: string; recommendedFollowUpDate: string; reasoningSummary: string; riskLevel: string };
  knowledgeUsed?: string[]; // titles of knowledge sources used
}

export function newOutboundMessage(params: {
  leadId: string;
  userId: string;
  messageType: MessageType;
  messageText: string;
  source: string;
  strategy?: string;
  knowledgeUsed?: string[];
  followUpId?: string;
  salesBrain?: OutboundMessage["salesBrain"];
}): OutboundMessage {
  return {
    id: "om-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
    leadId: params.leadId,
    userId: params.userId,
    messageType: params.messageType,
    messageText: params.messageText,
    status: "GENERATED",
    generatedAt: new Date().toISOString(),
    source: params.source,
    strategy: params.strategy,
    knowledgeUsed: params.knowledgeUsed,
    followUpId: params.followUpId,
    salesBrain: params.salesBrain,
  };
}

/**
 * Transition an outbound message to WHATSAPP_OPENED.
 * Anti-duplication: does NOT create a new record — updates the existing one.
 * Never marks as SENT (opening WhatsApp only proves the message was prepared).
 */
export function markReadyToSend(om: OutboundMessage): OutboundMessage {
  return {
    ...om,
    status: "READY_TO_SEND",
  };
}

/**
 * Transition an outbound message to WHATSAPP_OPENED.
 * Anti-duplication: does NOT create a new record — updates the existing one.
 * Never marks as SENT (opening WhatsApp only proves the message was prepared).
 */
export function markWhatsAppOpened(om: OutboundMessage): OutboundMessage {
  if (om.status === "SENT") {
    return {
      ...om,
      whatsappOpenedAt: om.whatsappOpenedAt || new Date().toISOString(),
    };
  }

  return {
    ...om,
    status: "WHATSAPP_OPENED",
    whatsappOpenedAt: om.whatsappOpenedAt || new Date().toISOString(),
  };
}

/**
 * Transition an outbound message to SENT. This is the only path to SENT and
 * requires explicit user confirmation ("Mark as Sent").
 */
export function markSent(om: OutboundMessage): OutboundMessage {
  return {
    ...om,
    status: "SENT",
    sentAt: om.sentAt || new Date().toISOString(),
  };
}

/**
 * Anti-duplication (Part 15): check whether a lead already has a SENT or
 * WHATSAPP_OPENED outbound message for the same follow-up task, so the same
 * pending task can't be sent twice without explicit action.
 */
export function hasActiveOutbound(
  outbound: OutboundMessage[] | undefined,
  followUpId?: string
): boolean {
  if (!outbound || outbound.length === 0) return false;
  return outbound.some(
    om =>
      (om.status === "WHATSAPP_OPENED" || om.status === "READY_TO_SEND") &&
      (!followUpId || om.followUpId === followUpId)
  );
}
