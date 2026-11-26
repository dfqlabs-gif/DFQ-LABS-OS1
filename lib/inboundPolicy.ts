/**
 * Conservative classifier for the small set of factual inbound questions
 * eligible for automatic replies. Anything commercial, sensitive or ambiguous
 * must stay in the founder approval queue.
 */
export function isRoutineInboundFaq(text: string): boolean {
  const value = String(text || "").trim();
  if (value.length < 8 || value.length > 700) return false;
  if (/\b(price|pricing|cost|quote|quotation|discount|budget|proposal|contract|agreement|invoice|payment|refund|complaint|complain|angry|lawsuit|legal|negotiate|negotiation|book a call|schedule a meeting|appointment|urgent|stop|unsubscribe|remove me|not interested|cancel)\b/i.test(value)) return false;
  return /\b(what do you do|what does dfq ?labs do|what services|your services|what is included|what's included|what does the audit cover|what is the audit|how does the audit work|how does it work|how long does (?:the )?(?:audit|process|project) take|where are you based|who are you|tell me about (?:your|dfq)|what can you help with)\b/i.test(value);
}
