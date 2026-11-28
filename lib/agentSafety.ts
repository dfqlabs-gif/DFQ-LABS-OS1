/**
 * Conservative WhatsApp opt-out classifier.
 * "Not interested in the property" and incidental uses such as "stop by" are
 * intentionally not treated as communication opt-outs.
 */
export function isExplicitOptOut(value: unknown): boolean {
  const text = String(value ?? "").trim().toLowerCase().replace(/[.!?]+$/g, "").replace(/\s+/g, " ");
  if (!text) return false;
  if (/^(stop|unsubscribe|remove me|remove my number|take me off (?:your )?(?:list|contact list)|do not contact me|don't contact me|dont contact me|no more messages|no more texts|no more whatsapp messages|stop messaging me|please stop contacting me|not interested|i am not interested|i'm not interested|leave me alone)( thanks| please)?$/.test(text)) return true;
  return /\b(stop sending (?:me )?(?:messages|texts|whatsapp)|do not (?:message|contact) me|don't (?:message|contact) me|dont (?:message|contact) me|remove me from (?:your )?(?:list|contact list)|remove my number|take me off (?:your )?(?:list|contact list)|unsubscribe me|not interested in (?:being contacted|further contact|further messages))\b/.test(text);
}

export function containsExplicitOptOut(messages: unknown[]): boolean {
  return messages.some(isExplicitOptOut);
}
