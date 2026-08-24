// ─────────────────────────────────────────────────────────────────────────────
// DFQ Labs OS — Formal Message Types (Parts 3, 4, 18)
//
// Each message type carries its own strategic rules so VALUE_DM never inherits
// sales-CTA behavior from SALES_DM. The AI classifies the requested message
// type before generation and applies the matching rule set.
// ─────────────────────────────────────────────────────────────────────────────

export type MessageType =
  | "VALUE_DM"
  | "SALES_DM"
  | "FOLLOW_UP"
  | "REACTIVATION_DM"
  | "NURTURE_DM"
  | "INTRODUCTION_DM"
  | "RESPONSE_DM";

export const ALL_MESSAGE_TYPES: MessageType[] = [
  "VALUE_DM",
  "SALES_DM",
  "FOLLOW_UP",
  "REACTIVATION_DM",
  "NURTURE_DM",
  "INTRODUCTION_DM",
  "RESPONSE_DM",
];

export const MESSAGE_TYPE_LABEL: Record<MessageType, string> = {
  VALUE_DM: "Value DM",
  SALES_DM: "Sales DM",
  FOLLOW_UP: "Follow-up",
  REACTIVATION_DM: "Reactivation DM",
  NURTURE_DM: "Nurture DM",
  INTRODUCTION_DM: "Introduction DM",
  RESPONSE_DM: "Response DM",
};

export const MESSAGE_TYPE_COLOR: Record<MessageType, string> = {
  VALUE_DM: "#22C55E",
  SALES_DM: "#3ECFDC",
  FOLLOW_UP: "#3B82F6",
  REACTIVATION_DM: "#F59E0B",
  NURTURE_DM: "#8B5CF6",
  INTRODUCTION_DM: "#a855f7",
  RESPONSE_DM: "#ec4899",
};

// ── VALUE DM definition (Part 3) ──────────────────────────────────────────────
export const VALUE_DM_DEFINITION = `A VALUE_DM is a short message whose sole objective is to provide genuinely useful, immediately applicable insight to the recipient WITHOUT asking for a sale, call, meeting, registration, reply, consultation, beta participation, purchase, or any other conversion action.`;

// ── Strict prohibitions for VALUE DMs (Part 4) ────────────────────────────────
export const VALUE_DM_PROHIBITIONS = `ABSOLUTE PROHIBITIONS — a VALUE_DM must NOT:
- Sell, pitch, or ask for a call, meeting, reply, booking, registration, beta join, purchase, follow, or website visit.
- Mention DFQ Labs services unless genuinely necessary for the insight itself.
- Manufacture urgency or manufacture a problem.
- Continue a sales sequence disguised as value.
- End with "let me know if...", "would you like me to...", "I can help you...", or ANY call-to-action.
- Attempt to continue the interaction in any way.

The objective is simply: leave the prospect better off than they were before receiving the message.`;

// ── VALUE DM quality control checklist (Part 5) ───────────────────────────────
export const VALUE_DM_QUALITY_CHECK = `Before finalizing, silently evaluate against these questions and regenerate internally if any answer is NO:
1. Is this genuinely useful?
2. Is this specific to this prospect?
3. Could this prospect implement something from this message today?
4. Is the advice supported by the prospect's context or relevant knowledge?
5. Does it avoid selling?
6. Does it avoid asking for anything?
7. Does it contain a concrete insight rather than generic advice?
8. Would the message still be valuable if the prospect never became a DFQ Labs client?
9. Is it short enough to naturally send through WhatsApp?
10. Does it sound like a knowledgeable human rather than an AI?`;

// ── Per-type strategic rules ─────────────────────────────────────────────────
export const MESSAGE_TYPE_RULES: Record<MessageType, string> = {
  VALUE_DM: `${VALUE_DM_DEFINITION}

${VALUE_DM_PROHIBITIONS}

Structure: Problem → Insight → Specific action. Avoid generic advice ("post consistently", "know your audience", "use better hooks", "build trust") unless the message explains a specific implementation that makes the advice actionable. Prefer one specific, actionable insight the prospect could implement today.

${VALUE_DM_QUALITY_CHECK}

Output ONLY the actual message. 3-4 sentences max. No emojis. No exclamation marks. No markdown. Plain WhatsApp-friendly text.`,

  SALES_DM: `A sales outreach DM. Pursue exactly one pipeline-stage objective (provided in the briefing). One low-friction ask per message. Reference something specific to this prospect. 2-4 sentences. No emojis, no buzzwords. Output ONLY the message.`,

  FOLLOW_UP: `A follow-up in an active conversation. Pick up exactly where the last exchange left off. Pursue ONLY the single correct next objective. Refer to something specific from conversation history. 2-4 sentences. No emojis. Output ONLY the message.`,

  REACTIVATION_DM: `A re-engagement message for a lead that has gone cold. Bring a genuinely new angle or reference something concrete from the prior conversation. Do not guilt-trip. Do not re-pitch the same thing. 2-3 sentences. Output ONLY the message.`,

  NURTURE_DM: `A nurture message for a lead in the Nurture bucket. Evaluate what the prospect currently needs and what information would help them. If the best action is to provide value without asking for anything, generate a VALUE_DM-style message (no CTA). Do NOT automatically interpret this as a sales opportunity. 3-4 sentences. Output ONLY the message.`,

  INTRODUCTION_DM: `A first-touch cold outreach DM. Hook on a positioning gap or specific observation about their brand. Ask only for permission to send a breakdown. Do NOT pitch services or pricing. 2-3 sentences. Output ONLY the message.`,

  RESPONSE_DM: `A reply to a prospect who just messaged us. Continue the dialog naturally. Pursue ONLY the objective in the briefing. Match their energy. 2-3 sentences. No emojis. Output ONLY the message.`,
};

/**
 * Classify the best message type for a lead given the user's request and lead context.
 * Used when the user says "generate a message" without specifying the type.
 */
export function classifyMessageType(
  request: string,
  leadStatus: string,
  leadBucket?: string
): MessageType {
  const r = request.toLowerCase();
  if (/\bvalue\b/.test(r)) return "VALUE_DM";
  if (/\bfollow\s*up\b/.test(r)) return "FOLLOW_UP";
  if (/\breactivat/.test(r)) return "REACTIVATION_DM";
  if (/\bnurture\b/.test(r)) return "NURTURE_DM";
  if (/\bintro/.test(r) || /\bfirst\s*(touch|outreach|dm)\b/.test(r)) return "INTRODUCTION_DM";
  if (/\breply|respond|response\b/.test(r)) return "RESPONSE_DM";
  if (/\bsales|pitch|close|closing\b/.test(r)) return "SALES_DM";

  // Infer from lead state
  if (leadBucket === "Nurture") return "NURTURE_DM";
  if (leadStatus === "New") return "INTRODUCTION_DM";
  if (leadStatus === "DM Sent") return "FOLLOW_UP";
  return "VALUE_DM";
}
