import type { Lead } from "../types";

export type OutboundTouch = { at: string; text: string; id?: string; messageType?: string };

export function normalizeCompanyIdentity(value: string | undefined): string {
  return String(value || "").toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .filter(token => !["team", "the", "company", "co", "limited", "ltd", "llc", "plc", "developers", "developer", "development", "properties", "property", "realty", "real", "estate", "homes", "group"].includes(token))
    .join(" ");
}

export function normalizePhoneIdentity(value: string | undefined): string {
  const digits = String(value || "").replace(/\D/g, "");
  return digits.length >= 10 ? digits.slice(-10) : digits;
}

export function latestOutboundTouch(lead: Lead): OutboundTouch | null {
  const touches: OutboundTouch[] = [];
  for (const item of lead.outboundMessages || []) {
    if (item.status === "SENT" && item.sentAt) touches.push({ at: item.sentAt, text: item.messageText || "", id: item.id, messageType: item.messageType });
  }
  for (const item of lead.conversationLog || []) {
    if (item.type === "dm" && item.direction === "outbound" && item.status !== "reversed" && item.ts) {
      touches.push({ at: item.ts, text: item.text || "", id: item.outboundId || item.id, messageType: item.messageType });
    }
  }
  if (!touches.length && lead.dmText && lead.lastContacted) touches.push({ at: lead.lastContacted, text: lead.dmText, id: "legacy-dmText", messageType: "INTRODUCTION_DM" });
  const valid = touches.filter(item => Number.isFinite(new Date(item.at).getTime()));
  valid.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  return valid[0] || null;
}

export function lagosDayKey(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const get = (type: string) => parts.find(part => part.type === type)?.value || "";
  return get("year") + "-" + get("month") + "-" + get("day");
}

export function ageDays(at: string, now = new Date()): number | null {
  const timestamp = new Date(at).getTime();
  if (!Number.isFinite(timestamp)) return null;
  return Math.max(0, Math.floor((now.getTime() - timestamp) / 86400000));
}

export function chooseOutboundMessageType(lead: Lead, requested: string, now = new Date()): string {
  const last = latestOutboundTouch(lead);
  if (!last) return "INTRODUCTION_DM";
  const age = ageDays(last.at, now);
  if (age !== null && age >= 30) return "REACTIVATION_DM";
  if (requested === "INTRODUCTION_DM") return "FOLLOW_UP";
  if (requested === "VALUE_DM" && !lead.awaitingReplySince) return "VALUE_DM";
  return "FOLLOW_UP";
}

export function formatProspectGreeting(lead: Pick<Lead, "name" | "company">, now = new Date()): string {
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Lagos", hour: "2-digit", hourCycle: "h23" }).format(now));
  const salutation = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const contact = String(lead.name || "").trim();
  const company = String(lead.company || "").trim();
  const genericContact = !contact || /^(unknown|n\/a|not available|team)$/i.test(contact) || normalizeCompanyIdentity(contact) === normalizeCompanyIdentity(company);
  const recipient = genericContact ? (company ? "Team " + company.replace(/^team\s+/i, "") : "there") : contact;
  return salutation + ", " + recipient + ".";
}

export function ensureProspectGreeting(lead: Pick<Lead, "name" | "company">, message: string, now = new Date()): string {
  let clean = String(message || "").trim();
  if (/^(hi|hello|good morning|good afternoon|good evening|dear)\\b/i.test(clean)) return clean;
  const recipient = String(lead.name || lead.company || "").trim().replace(/^team\\s+/i, "");
  if (recipient) clean = clean.replace(new RegExp("^" + recipient.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\  const clean = String(message || "").trim();
  if (/^(hi|hello|good morning|good afternoon|good evening|dear)\\b/i.test(clean)) return clean;
  return formatProspectGreeting(lead, now) + " " + clean;") + "[,.:]\\s*", "i"), "");
  return formatProspectGreeting(lead, now) + " " + clean;
}

export function buildOutreachChronology(lead: Lead, now = new Date()): string {
  const last = latestOutboundTouch(lead);
  if (!last) return "CHRONOLOGY: No confirmed sent outbound message is recorded for this lead. Treat this as a first touch. Do not imply prior contact.";
  const age = ageDays(last.at, now);
  const sentDate = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Lagos", dateStyle: "medium", timeStyle: "short" }).format(new Date(last.at));
  const interval = age === null ? "unknown interval" : age === 0 ? "earlier today" : age === 1 ? "yesterday" : age + " days ago";
  return [
    "CHRONOLOGY — AUTHORITATIVE SENT OUTBOUND HISTORY:",
    "Most recent confirmed outbound: " + sentDate + " (" + interval + ").",
    "Previous message: " + (last.text || "[message text not recorded]").slice(0, 700),
    age !== null && age >= 30
      ? "This is a dormant relationship (30+ days). Use a respectful reactivation, acknowledge that DFQLABS contacted them previously and that time has passed, introduce a genuinely new angle, and do not pretend the last exchange was recent."
      : "Continue from the actual prior exchange. Do not describe this as first contact or claim a recent message unless the timestamp supports it.",
  ].join("\n");
}

export function isSameLagosDay(value: string | undefined, now = new Date()): boolean {
  return !!value && Number.isFinite(new Date(value).getTime()) && lagosDayKey(new Date(value)) === lagosDayKey(now);
}

export function hasSameDayContactIdentity(
  lead: Lead,
  records: Array<{ leadId?: string; company?: string; phone?: string }>,
): boolean {
  const company = normalizeCompanyIdentity(lead.company);
  const phone = normalizePhoneIdentity(lead.phone || lead.whatsapp);
  return records.some(record => {
    if (record.leadId && record.leadId === lead.id) return true;
    const sameCompany = company.length >= 3 && normalizeCompanyIdentity(record.company) === company;
    const otherPhone = normalizePhoneIdentity(record.phone);
    const samePhone = phone.length >= 7 && otherPhone.length >= 7 && phone === otherPhone;
    return sameCompany || samePhone;
  });
}
