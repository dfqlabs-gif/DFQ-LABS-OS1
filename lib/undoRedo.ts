// Durable, field-level undo/redo primitives.  These deliberately exclude
// append-only conversation and real-world outbound execution state.

export const UNDOABLE_LEAD_FIELDS = [
  "name", "company", "phone", "instagram", "whatsapp", "email",
  "source", "clientType", "service", "status", "priority", "assignedTo",
  "notes", "nextAction", "nextActionDate", "meetingPrepNote", "deliveryStage",
  "deliveryNote", "betaCandidate", "aiBucket", "autoFollowUpDate", "autoFollowUpReason",
] as const;

export type UndoableLeadField = typeof UNDOABLE_LEAD_FIELDS[number];

export interface LeadAction {
  id: string;
  leadId: string;
  actorId: string;
  source: string;
  actionType: "LEAD_FIELDS_UPDATED";
  createdAt: string;
  affectedFields: UndoableLeadField[];
  before: Partial<Record<UndoableLeadField, unknown>>;
  after: Partial<Record<UndoableLeadField, unknown>>;
  undoneAt?: string;
  redoneAt?: string;
  redoInvalidatedAt?: string;
}

const equal = (left: unknown, right: unknown) => JSON.stringify(left ?? null) === JSON.stringify(right ?? null);

export function createLeadAction(params: {
  id: string; leadId: string; actorId: string; source: string; before: Record<string, any>; after: Record<string, any>; now: string;
}): LeadAction | null {
  const fields = UNDOABLE_LEAD_FIELDS.filter(field => !equal(params.before[field], params.after[field]));
  if (!fields.length) return null;
  const before: Partial<Record<UndoableLeadField, unknown>> = {};
  const after: Partial<Record<UndoableLeadField, unknown>> = {};
  for (const field of fields) {
    before[field] = params.before[field] ?? null;
    after[field] = params.after[field] ?? null;
  }
  return { id: params.id, leadId: params.leadId, actorId: params.actorId, source: params.source, actionType: "LEAD_FIELDS_UPDATED", createdAt: params.now, affectedFields: fields, before, after };
}

export function actionCanApply(action: LeadAction, lead: Record<string, any>, direction: "undo" | "redo"): boolean {
  const expected = direction === "undo" ? action.after : action.before;
  return action.affectedFields.every(field => equal(lead[field], expected[field]));
}

export function applyActionFields<T extends Record<string, any>>(lead: T, action: LeadAction, direction: "undo" | "redo"): T {
  const values = direction === "undo" ? action.before : action.after;
  const patch: Record<string, unknown> = {};
  for (const field of action.affectedFields) patch[field] = values[field] ?? null;
  return { ...lead, ...patch };
}
