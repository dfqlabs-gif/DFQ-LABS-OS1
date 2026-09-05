// ─────────────────────────────────────────────────────────────────────────────
// DFQ Labs OS — Message Execution Flow (Parts 10, 11, 12, 13, 15)
//
// When a message is confirmed SENT, this updates the lead's conversation
// history, last-contacted timestamp, follow-up schedule, and outbound
// message record — all in one place so every execution path stays consistent.
// ─────────────────────────────────────────────────────────────────────────────

import type { Lead } from "../types";
import type { OutboundMessage } from "./outbound";
import {
  markSent as markOutboundSent,
  markWhatsAppOpened as markOutboundOpened,
} from "./outbound";
import { today, addDays, nowISO } from "../constants";
import type { MessageType } from "./messageTypes";

/**
 * Mark a generated outbound message as opened in WhatsApp without treating it as
 * sent. This retains the human approval gate while recording the fact that the
 * rep prepared and opened the message.
 */
export function applyWhatsAppOpened(
  lead: Lead,
  outboundId?: string,
): Lead {
  const outboundMessages = (lead.outboundMessages || []).map(om => {
    if (outboundId && om.id !== outboundId) return om;
    if (!outboundId && !(om.status === "GENERATED" || om.status === "READY_TO_SEND")) return om;
    return markOutboundOpened(om);
  });

  return {
    ...lead,
    outboundMessages,
  };
}

/**
 * Apply a confirmed-sent message to a lead.
 *
 * Per Part 11, the conversation thread entry contains ONLY the actual message
 * (never the AI's internal strategy). The strategy is stored separately on the
 * outbound message's `strategy` field.
 *
 * Returns a new Lead object with:
 *  - conversation log entry (OUTBOUND)
 *  - updated lastContacted / lastMeaningfulTouchpoint
 *  - follow-up count incremented, completedFollowUps appended
 *  - autoFollowUpDate rescheduled
 *  - outbound message marked SENT
 *  - dmText updated (quick reference) if it's a DM-type message
 */
export function applySentMessage(
  lead: Lead,
  messageText: string,
  messageType: MessageType,
  userId: string,
  outboundId?: string,
  strategy?: string,
  nextAction?: string,
  nextActionDate?: string,
): Lead {
  if (outboundId && (lead.outboundMessages || []).some(om => om.id === outboundId && om.status === "SENT")) {
    return lead;
  }

  const now = nowISO();
  const isDm = ["VALUE_DM", "SALES_DM", "INTRODUCTION_DM", "REACTIVATION_DM", "NURTURE_DM"].includes(messageType);

  // Update outbound message record (Part 10, 15)
  const outboundMessages = (lead.outboundMessages || []).map(om =>
    outboundId && om.id === outboundId ? markOutboundSent(om) : om
  );

  // Conversation log entry — ONLY the actual message (Part 11)
  const logEntry = {
    ts: now,
    type: "dm" as const,
    label: `${messageType} sent via WhatsApp`,
    text: messageText,
    by: userId || lead.assignedTo || "Unassigned",
  };

  return {
    ...lead,
    conversationLog: [...(lead.conversationLog || []), logEntry],
    lastContacted: today(),
    lastMeaningfulTouchpoint: today(),
    awaitingReplySince: "",
    followUpCount: (lead.followUpCount || 0) + 1,
    completedFollowUps: [...(lead.completedFollowUps || []), now],
    autoFollowUpDate: ["Closed", "Lost"].includes(lead.status) ? null : (nextActionDate || addDays(3)),
    autoFollowUpReason: "Recently contacted via WhatsApp outbound.",
    nextAction: nextAction || "Wait for reply and review the response.",
    nextActionDate: nextActionDate || addDays(3),
    // Update quick-reference DM field for DM-type messages
    ...(isDm ? { dmText: messageText } : {}),
    outboundMessages,
  };
}
