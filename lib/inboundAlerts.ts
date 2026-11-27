export type InboundCommercialSignal = {
  type: "meeting_request" | "pricing_request" | "positive_interest";
  label: string;
  nextAction: string;
};

export function classifyInboundCommercialSignal(text: string): InboundCommercialSignal | null {
  const value = String(text || "").trim().toLowerCase();
  if (!value || /\b(not interested|no longer interested|stop contacting|do not contact|don't contact|remove me|unsubscribe)\b/.test(value)) return null;
  if (/\b(audit|content audit|strategy audit|page review|account review|strategy review)\b/.test(value)) return null;

  if (/\b(book (a )?(call|meeting|viewing)|schedule (a )?(call|meeting|viewing)|set up (a )?(call|meeting)|arrange (a )?(call|meeting|viewing)|meet (with|you)|available for (a )?(call|meeting)|can we (talk|meet)|let'?s (talk|meet)|visit( the property| the site)?|property viewing)\b/.test(value)) {
    return {
      type: "meeting_request",
      label: "Meeting / viewing request",
      nextAction: "Review the requested timing, confirm the decision-maker and proposed meeting details, then prepare a concise response for founder approval.",
    };
  }

  if (/\b(price|pricing|how much|cost|budget|quote|quotation|fee|fees|rates|payment terms|what do you charge|investment required)\b/.test(value)) {
    return {
      type: "pricing_request",
      label: "Pricing / commercial request",
      nextAction: "Confirm the exact service and scope requested. Do not invent or commit to pricing; prepare a fact-checked response for founder approval.",
    };
  }

  if (/\b(we are interested|i am interested|i'm interested|we're interested|interested in working|want to proceed|ready to proceed|move forward|next steps|send the proposal|share the proposal|let's proceed|would like to work|keen to work|sounds good|this is interesting)\b/.test(value)) {
    return {
      type: "positive_interest",
      label: "Positive buying signal",
      nextAction: "Review the conversation history and identify the prospect's immediate objective. Advance only the next relevant step and keep any commercial commitment in founder approval.",
    };
  }

  return null;
}
