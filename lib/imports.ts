export interface ImportRejection {
  index: number;
  id?: string;
  reason: string;
}

export interface ImportDuplicate {
  id: string;
  reason: string;
}

export interface ImportSummary {
  valid: any[];
  importable: any[];
  duplicates: ImportDuplicate[];
  rejected: ImportRejection[];
}

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function sdbHash(value: string): string {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    const byte = value.charCodeAt(i);
    hash ^= byte;
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function normalizeImportedLead(raw: any, index: number): any {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("expected an object");
  }

  const base = { ...raw };
  const name = normalizeText(base.name) || `Lead ${index + 1}`;
  const company = normalizeText(base.company) || "Unknown Company";
  const idSeed = [base.id, base.name, base.company, base.phone, base.email, base.instagram, base.whatsapp]
    .filter(Boolean)
    .join("|");
  const generatedId = idSeed ? `imp-${sdbHash(idSeed)}` : `imp-${Date.now()}-${index}`;
  const lead = {
    ...base,
    id: normalizeText(base.id) || generatedId,
    name,
    company,
    source: normalizeText(base.source) || "Imported",
    clientType: normalizeText(base.clientType) || "Real Estate",
    service: normalizeText(base.service) || "Lead Generation",
    status: normalizeText(base.status) || "New",
    priority: normalizeText(base.priority) || "Medium",
    assignedTo: normalizeText(base.assignedTo) || "Unassigned",
    notes: normalizeText(base.notes) || "",
    dmText: normalizeText(base.dmText) || "",
    prospectInitialResponse: normalizeText(base.prospectInitialResponse) || "",
    prospectLatestResponse: normalizeText(base.prospectLatestResponse) || "",
    nextAction: normalizeText(base.nextAction) || "",
    nextActionDate: normalizeText(base.nextActionDate) || "",
    dateAdded: normalizeText(base.dateAdded) || new Date().toISOString(),
    lastContacted: normalizeText(base.lastContacted) || "",
    lastMeaningfulTouchpoint: normalizeText(base.lastMeaningfulTouchpoint) || normalizeText(base.lastContacted) || normalizeText(base.dateAdded) || "",
    awaitingReplySince: normalizeText(base.awaitingReplySince) || "",
    meetingScheduledAt: normalizeText(base.meetingScheduledAt) || "",
    meetingPrepNote: normalizeText(base.meetingPrepNote) || "",
    followUpCount: Number.isFinite(Number(base.followUpCount)) ? Number(base.followUpCount) : 0,
    weekAdded: normalizeText(base.weekAdded) || new Date().toISOString().slice(0, 10),
    completedFollowUps: Array.isArray(base.completedFollowUps) ? base.completedFollowUps : [],
    betaCandidate: Boolean(base.betaCandidate),
    autoFollowUpDate: base.autoFollowUpDate || null,
    autoFollowUpReason: normalizeText(base.autoFollowUpReason) || "",
    aiBucket: normalizeText(base.aiBucket) || undefined,
    aiReason: normalizeText(base.aiReason) || undefined,
    aiNextAction: normalizeText(base.aiNextAction) || undefined,
    aiClassifiedAt: normalizeText(base.aiClassifiedAt) || undefined,
    mergedInto: normalizeText(base.mergedInto) || undefined,
    mergedFrom: Array.isArray(base.mergedFrom) ? base.mergedFrom : undefined,
    auditLog: Array.isArray(base.auditLog) ? base.auditLog : [],
    attachments: Array.isArray(base.attachments) ? base.attachments.map((att: any) => {
      if (!att || typeof att !== "object") return att;
      const { content: _content, ...meta } = att;
      return meta;
    }) : [],
    outboundMessages: Array.isArray(base.outboundMessages) ? base.outboundMessages : [],
    conversationLog: Array.isArray(base.conversationLog) ? base.conversationLog : [],
  };

  return lead;
}

export function summarizeImportBatch(rawLeads: any[], existingIds: Set<string>): ImportSummary {
  const valid: any[] = [];
  const duplicates: ImportDuplicate[] = [];
  const rejected: ImportRejection[] = [];
  const seen = new Set<string>();

  rawLeads.forEach((lead, index) => {
    if (!lead || typeof lead !== "object" || Array.isArray(lead)) {
      rejected.push({ index, reason: "expected an object" });
      return;
    }

    const idSeed = [lead.id, lead.name, lead.company, lead.phone, lead.email, lead.instagram, lead.whatsapp]
      .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
      .join("|");
    const normalizedId = normalizeText(lead.id) || (idSeed ? `imp-${sdbHash(idSeed)}` : undefined);
    const id = normalizedId || `imp-${Date.now()}-${index}`;

    if (!normalizeText(lead.name) || !normalizeText(lead.company)) {
      rejected.push({ index, id, reason: "missing required name/company" });
      return;
    }

    let normalized: any;
    try {
      normalized = normalizeImportedLead(lead, index);
    } catch (error: any) {
      rejected.push({ index, id, reason: error?.message || "invalid record" });
      return;
    }

    if (existingIds.has(normalized.id)) {
      duplicates.push({ id: normalized.id, reason: "already exists in database" });
      return;
    }
    if (seen.has(normalized.id)) {
      duplicates.push({ id: normalized.id, reason: "duplicate within source file" });
      return;
    }

    seen.add(normalized.id);
    valid.push(normalized);
  });

  return {
    valid,
    importable: valid,
    duplicates,
    rejected,
  };
}
