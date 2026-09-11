// Stable identity and reversible-deletion helpers for the canonical
// conversationLog.  Legacy events may not have an id; their complete recorded
// payload produces a deterministic, lead-local identity without using an index.

export type ConversationEvent = {
  id?: string; ts: string; type: "dm" | "reply" | "note" | "status_change";
  direction?: "inbound" | "outbound"; outboundId?: string; messageType?: string;
  status?: "sent" | "reversed"; label: string; text: string; by: string;
};

export type RemovedConversationEvent = {
  eventId: string; event: ConversationEvent; position: number; removedAt: string;
};

function hash(value: string): string {
  let valueHash = 2166136261;
  for (let i = 0; i < value.length; i++) valueHash = Math.imul(valueHash ^ value.charCodeAt(i), 16777619);
  return (valueHash >>> 0).toString(36);
}

export function conversationEventId(event: ConversationEvent): string {
  if (event.id) return event.id;
  return `legacy-${hash(JSON.stringify([
    event.outboundId || "", event.ts, event.type, event.direction || "", event.messageType || "",
    event.status || "", event.label, event.text, event.by,
  ]))}`;
}

export function isLatestThreadEvent(event: ConversationEvent): boolean {
  return event.type === "dm" || event.type === "reply";
}

export function isProtectedConversationAnchor(event: ConversationEvent, dmText: string, initialResponse: string): boolean {
  return (event.type === "dm" && !!dmText && event.text === dmText) ||
    (event.type === "reply" && !!initialResponse && event.text === initialResponse);
}

export function removeConversationEvent(log: ConversationEvent[], eventId: string, dmText: string, initialResponse: string, removedAt: string): { log: ConversationEvent[]; removed: RemovedConversationEvent } {
  const position = log.findIndex(event => conversationEventId(event) === eventId);
  if (position < 0) throw new Error("Conversation event not found.");
  const event = log[position];
  if (!isLatestThreadEvent(event)) throw new Error("Only Latest Thread messages can be removed.");
  if (isProtectedConversationAnchor(event, dmText, initialResponse)) throw new Error("Historical conversation anchors cannot be removed.");
  return { log: [...log.slice(0, position), ...log.slice(position + 1)], removed: { eventId, event: { ...event, id: event.id || eventId }, position, removedAt } };
}

export function restoreConversationEvent(log: ConversationEvent[], removed: RemovedConversationEvent): ConversationEvent[] {
  if (log.some(event => conversationEventId(event) === removed.eventId)) return log;
  const next = [...log];
  next.splice(Math.min(Math.max(removed.position, 0), next.length), 0, removed.event);
  return next;
}
