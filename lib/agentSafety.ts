/**
 * Conservative WhatsApp opt-out classifier.
 * "Not interested in the property" and incidental uses such as "stop by" are
 * intentionally not treated as communication opt-outs.
 */
export function isExplicitOptOut(value: unknown): boolean {
  const text = String(value ?? "").trim().toLowerCase().replace(/[.!?]+$/g, "").replace(/\s+/g, " ");
  if (!text) return false;
  if (/^(stop|unsubscribe|remove me|do not contact me|don't contact me|dont contact me|no more messages|stop messaging me|please stop contacting me|not interested)( thanks| please)?$/.test(text)) return true;
  return /\b(stop sending (?:me )?(?:messages|texts|whatsapp)|do not (?:message|contact) me|don't (?:message|contact) me|dont (?:message|contact) me|remove me from (?:your )?(?:list|contact list)|unsubscribe me)\b/.test(text);
}

export function containsExplicitOptOut(messages: unknown[]): boolean {
  return messages.some(isExplicitOptOut);
}
