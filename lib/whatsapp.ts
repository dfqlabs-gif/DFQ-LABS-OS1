// ─────────────────────────────────────────────────────────────────────────────
// DFQ Labs OS — WhatsApp Execution Service (Parts 8, 9)
//
// One reusable service powering every "Open WhatsApp" action across the OS.
// Uses WhatsApp's click-to-chat deep link (wa.me) which opens the chat and
// prepopulates the composer with ONLY the actual generated message.
// ─────────────────────────────────────────────────────────────────────────────

import { normalizePhone, getWhatsAppNumber, buildWhatsAppLink, NormalizedPhone } from "./phone";

export interface WhatsAppOpenResult {
  ok: boolean;
  link?: string;
  error?: string;
  normalized?: NormalizedPhone;
}

/**
 * Open WhatsApp for a lead with a prepopulated message.
 *
 * 1. Retrieve the lead's phone number (whatsapp field preferred, then phone).
 * 2. Normalize into international format.
 * 3. Validate the number exists.
 * 4. Build the click-to-chat deep link with ONLY the actual message URL-encoded.
 * 5. Open the link (new tab).
 *
 * Returns the result so the caller can update the outbound message state.
 * NEVER includes strategy, reasoning, or metadata in the WhatsApp message.
 */
export function openWhatsAppWithMessage(
  lead: { phone?: string; whatsapp?: string; name?: string; company?: string },
  message: string
): WhatsAppOpenResult {
  const rawNumber = getWhatsAppNumber(lead);
  if (!rawNumber) {
    return {
      ok: false,
      error: `No phone number on file for ${lead.name || lead.company || "this lead"}. Add a WhatsApp or phone number in the lead profile.`,
    };
  }

  const normalized = normalizePhone(rawNumber);
  if (!normalized.valid) {
    return {
      ok: false,
      error: `Phone number "${rawNumber}" could not be normalized: ${normalized.error || "invalid format"}`,
      normalized,
    };
  }

  // ONLY the actual message — never strategy, metadata, or labels
  const cleanMessage = (message || "").trim();
  if (!cleanMessage) {
    return { ok: false, error: "No message text to send." };
  }

  const link = buildWhatsAppLink(normalized.international, cleanMessage);
  if (!link) {
    return { ok: false, error: "Could not build WhatsApp link." };
  }

  // Open in a new tab — wa.me redirects to WhatsApp web or app
  try {
    window.open(link, "_blank", "noopener,noreferrer");
  } catch {
    // Fallback for environments where window.open is blocked
    window.location.href = link;
  }

  return { ok: true, link, normalized };
}
