// ─────────────────────────────────────────────────────────────────────────────
// DFQ Labs OS — Phone Number Normalization Utility (Part 16)
//
// A single reusable utility for normalizing and validating phone numbers,
// with Nigerian-number awareness. Used by every WhatsApp execution path so
// phone handling is never reimplemented per component.
// ─────────────────────────────────────────────────────────────────────────────

export interface NormalizedPhone {
  /** E.164-style international number, e.g. "+2348012345678" */
  international: string;
  /** Digits only, no plus, e.g. "2348012345678" */
  digits: string;
  /** Whether the number looks structurally valid (right length, valid prefix) */
  valid: boolean;
  /** Human-readable reason when invalid */
  error?: string;
  /** Detected country, best-effort */
  country?: string;
}

/**
 * Normalize a raw phone string into international format.
 *
 * Rules:
 *  - Remove spaces, brackets, dashes, dots, and unnecessary punctuation.
 *  - Nigerian local numbers starting "0" (e.g. "08012345678") → "+2348012345678".
 *  - Nigerian numbers with leading "234" but no "+" → "+234...".
 *  - Already-correct international numbers ("+234...", "+1...") are preserved.
 *  - Never blindly modify non-Nigerian international numbers.
 *  - Validate length and prefix; reject malformed numbers.
 */
export function normalizePhone(raw: string | null | undefined): NormalizedPhone {
  if (!raw) return { international: "", digits: "", valid: false, error: "No phone number provided." };

  // Strip everything except digits and a leading plus
  let trimmed = raw.trim();
  const hasPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/[^\d]/g, "");

  if (!digits) return { international: "", digits: "", valid: false, error: "Phone number contains no digits." };

  // ── Nigerian number detection ──────────────────────────────────────────────
  // Local format: 0XXXXXXXXXX (11 digits, starts with 0)
  // International: 234XXXXXXXXXX (13 digits, starts with 234)
  const isNigerianLocal = /^0\d{10}$/.test(digits);
  const isNigerianIntl = /^234\d{10}$/.test(digits);

  if (isNigerianLocal) {
    const intl = "+234" + digits.slice(1); // drop leading 0
    return { international: intl, digits: "234" + digits.slice(1), valid: true, country: "NG" };
  }

  if (isNigerianIntl) {
    return { international: "+" + digits, digits, valid: true, country: "NG" };
  }

  // ── Already-international with explicit plus ───────────────────────────────
  if (hasPlus) {
    const intlDigits = digits;
    // Generic validation: at least 7 digits, at most 15 (E.164 max)
    if (intlDigits.length < 7) {
      return { international: "+" + intlDigits, digits: intlDigits, valid: false, error: "Number is too short." };
    }
    if (intlDigits.length > 15) {
      return { international: "+" + intlDigits.slice(0, 15), digits: intlDigits, valid: false, error: "Number is too long." };
    }
    return { international: "+" + intlDigits, digits: intlDigits, valid: true };
  }

  // ── No plus, not obviously Nigerian ─────────────────────────────────────────
  // If it's 11 digits starting with 0 we already handled it. If it's 10 digits
  // starting with 7/8/9 (common Nigerian mobile without leading 0), treat as NG.
  if (/^[789]\d{9}$/.test(digits)) {
    return { international: "+234" + digits, digits: "234" + digits, valid: true, country: "NG" };
  }

  // Otherwise, assume it needs a plus if it looks like a reasonable intl number
  if (digits.length >= 7 && digits.length <= 15) {
    return { international: "+" + digits, digits, valid: true };
  }

  return { international: "+" + digits, digits, valid: false, error: "Unrecognized number format." };
}

/**
 * Pick the best available phone number for WhatsApp from a lead, preferring
 * the explicit `whatsapp` field, then `phone`.
 */
export function getWhatsAppNumber(lead: { phone?: string; whatsapp?: string }): string {
  return (lead.whatsapp && lead.whatsapp.trim()) || (lead.phone && lead.phone.trim()) || "";
}

/**
 * Build a WhatsApp click-to-chat deep link (wa.me) for a normalized number +
 * URL-encoded message. Returns null if the number is invalid.
 */
export function buildWhatsAppLink(internationalNumber: string, message: string): string | null {
  if (!internationalNumber) return null;
  const digits = internationalNumber.replace(/[^\d]/g, "");
  if (!digits) return null;
  const encoded = encodeURIComponent(message);
  return `https://wa.me/${digits}?text=${encoded}`;
}
