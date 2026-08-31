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
  sourceCount: number;
  validCount: number;
  rejectedCount: number;
  duplicateSourceCount: number;
  newCount: number;
  updatedCount: number;
  failedCount: number;
  finalDatabaseCount: number;
  valid: any[];
  importable: any[];
  duplicates: ImportDuplicate[];
  rejected: ImportRejection[];
}

export interface SnapshotImportSummary extends ImportSummary {
  replaceMode: boolean;
  canReplace: boolean;
}

export function describeDbError(error: any): Record<string, string | undefined> {
  if (!error || typeof error !== "object") return { message: "Unknown database error." };

  const details: Record<string, string | undefined> = {
    code: typeof error.code === "string" ? error.code : undefined,
    message: typeof error.message === "string" ? error.message : undefined,
    detail: typeof error.detail === "string" ? error.detail : undefined,
    hint: typeof error.hint === "string" ? error.hint : undefined,
    constraint: typeof error.constraint === "string" ? error.constraint : undefined,
    column: typeof error.column === "string" ? error.column : undefined,
    table: typeof error.table === "string" ? error.table : undefined,
  };

  const sanitized = Object.fromEntries(
    Object.entries(details).filter(([, value]) => typeof value === "string" && value.trim().length > 0)
  );

  return Object.keys(sanitized).length > 0 ? sanitized : { message: "Unknown database error." };
}

export async function runSnapshotReplaceTransaction(pool: any, validLeads: any[]) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM leads");

    if (validLeads.length > 0) {
      const values = validLeads.map((_: any, i: number) => `($${i * 2 + 1}, $${i * 2 + 2}::jsonb, NOW())`).join(", ");
      const params = validLeads.flatMap((lead: any) => [String(lead.id), JSON.stringify(lead)]);
      await client.query(`INSERT INTO leads (id, data, updated_at) VALUES ${values}`, params);
    }

    const incomingIds = validLeads.map((lead: any) => String(lead.id));
    if (incomingIds.length > 0) {
      await client.query("DELETE FROM lead_attachments WHERE lead_id != ALL($1::text[])", [incomingIds]);
    } else {
      await client.query("DELETE FROM lead_attachments");
    }

    await client.query("COMMIT");
    return {
      count: validLeads.length,
      importedIds: incomingIds,
      finalDatabaseCount: validLeads.length,
    };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
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
  const validById = new Map<string, any>();
  const duplicates: ImportDuplicate[] = [];
  const rejected: ImportRejection[] = [];

  let newCount = 0;
  let updatedCount = 0;

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

    const existingEntry = validById.get(normalized.id);
    if (existingEntry) {
      duplicates.push({ id: normalized.id, reason: "duplicate within source file; latest row wins" });
    }

    validById.set(normalized.id, normalized);
  });

  const valid = Array.from(validById.values());
  valid.forEach((lead) => {
    if (existingIds.has(lead.id)) {
      updatedCount += 1;
    } else {
      newCount += 1;
    }
  });

  const validCount = valid.length;
  const rejectedCount = rejected.length;
  const duplicateSourceCount = duplicates.length;
  const failedCount = rejectedCount + duplicateSourceCount;
  const finalDatabaseCount = existingIds.size + newCount;

  return {
    sourceCount: rawLeads.length,
    validCount,
    rejectedCount,
    duplicateSourceCount,
    newCount,
    updatedCount,
    failedCount,
    finalDatabaseCount,
    valid,
    importable: valid,
    duplicates,
    rejected,
  };
}

export function summarizeSnapshotImport(rawLeads: any[]): SnapshotImportSummary {
  const validById = new Map<string, any>();
  const duplicates: ImportDuplicate[] = [];
  const rejected: ImportRejection[] = [];

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

    if (validById.has(normalized.id)) {
      duplicates.push({ id: normalized.id, reason: "duplicate within source file; latest row wins" });
    }
    validById.set(normalized.id, normalized);
  });

  const valid = Array.from(validById.values());
  const validCount = valid.length;
  const rejectedCount = rejected.length;
  const duplicateSourceCount = duplicates.length;
  const failedCount = rejectedCount + duplicateSourceCount;
  const finalDatabaseCount = validCount;
  const canReplace = validCount > 0;

  return {
    sourceCount: rawLeads.length,
    validCount,
    rejectedCount,
    duplicateSourceCount,
    newCount: validCount,
    updatedCount: 0,
    failedCount,
    finalDatabaseCount,
    valid,
    importable: valid,
    duplicates,
    rejected,
    replaceMode: true,
    canReplace,
  };
}
