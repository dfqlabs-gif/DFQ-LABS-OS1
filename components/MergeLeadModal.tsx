import { useMemo, useState } from "react";
import React from "react";
import { GitMerge, X, ArrowRight } from "lucide-react";
import { Lead } from "../types";
import { Fld, iStyle, G, G_DIM, G_BORDER, BORDER, SURFACE2, TEXT, MUTED, MUTED2, cleanText, today } from "../constants";

interface MergeLeadModalProps {
  leadA: Lead;
  leadB: Lead;
  onClose: () => void;
  onConfirm: (merged: Lead, discarded: Lead) => void;
  by?: string;
}

// Field-level conflict resolution for the two records being merged. Only
// fields where the two records actually disagree (and both are non-blank)
// need a founder decision — everything else resolves automatically.
const SCALAR_FIELDS: Array<{ key: keyof Lead; label: string }> = [
  { key: "name", label: "Contact Name" },
  { key: "company", label: "Company" },
  { key: "phone", label: "Phone" },
  { key: "whatsapp", label: "WhatsApp" },
  { key: "instagram", label: "Instagram" },
  { key: "email", label: "Email" },
  { key: "source", label: "Lead Source" },
  { key: "clientType", label: "Client Type" },
  { key: "service", label: "Service / Tier" },
  { key: "status", label: "Pipeline Stage" },
  { key: "priority", label: "Priority" },
  { key: "assignedTo", label: "Assigned To" },
  { key: "deliveryStage", label: "Delivery Stage" }
];

function fieldVal(l: Lead, key: keyof Lead): string {
  const v = l[key];
  return v === undefined || v === null ? "" : String(v);
}

export function MergeLeadModal({ leadA, leadB, onClose, onConfirm, by = "Founder" }: MergeLeadModalProps) {
  // Default the record with more history (more activity) as the primary/kept
  // record — the one whose id survives the merge.
  const defaultPrimary = (leadA.conversationLog?.length || 0) + (leadA.followUpCount || 0) >= (leadB.conversationLog?.length || 0) + (leadB.followUpCount || 0) ? leadA : leadB;
  const [primaryId, setPrimaryId] = useState(defaultPrimary.id);
  const primary = primaryId === leadA.id ? leadA : leadB;
  const secondary = primaryId === leadA.id ? leadB : leadA;

  const conflicts = useMemo(() => SCALAR_FIELDS.filter(f => {
    const va = cleanText(fieldVal(leadA, f.key));
    const vb = cleanText(fieldVal(leadB, f.key));
    return va && vb && va !== vb;
  }), [leadA, leadB]);

  const [choices, setChoices] = useState<Record<string, "A" | "B">>(() => {
    const init: Record<string, "A" | "B"> = {};
    conflicts.forEach(f => { init[f.key as string] = "A"; });
    return init;
  });

  const resolvedValue = (key: keyof Lead): any => {
    const va = fieldVal(leadA, key);
    const vb = fieldVal(leadB, key);
    const aTrim = cleanText(va);
    const bTrim = cleanText(vb);
    if (aTrim && bTrim && aTrim !== bTrim) {
      const pick = choices[key as string] || "A";
      return pick === "A" ? leadA[key] : leadB[key];
    }
    return aTrim ? leadA[key] : leadB[key];
  };

  const buildMerged = (): { merged: Lead; discarded: Lead } => {
    const discarded = primary.id === leadA.id ? leadB : leadA;

    const mergedConversationLog = [...(leadA.conversationLog || []), ...(leadB.conversationLog || [])]
      .filter((entry, i, arr) => arr.findIndex(e => e.ts === entry.ts && e.text === entry.text && e.type === entry.type) === i)
      .sort((x, y) => new Date(x.ts).getTime() - new Date(y.ts).getTime());
    mergedConversationLog.push({
      ts: new Date().toISOString(),
      type: "note",
      label: "Lead Merged",
      text: `Merged with duplicate record for ${discarded.name || discarded.company || discarded.id} — all history preserved.`,
      by
    });

    const mergedAuditLog = [...(leadA.auditLog || []), ...(leadB.auditLog || [])];
    mergedAuditLog.push({ ts: new Date().toISOString(), by, action: "merge", previousValue: discarded.id, newValue: primary.id });

    const dateAddedA = leadA.dateAdded || "";
    const dateAddedB = leadB.dateAdded || "";
    const earliestDateAdded = [dateAddedA, dateAddedB].filter(Boolean).sort()[0] || today();

    const latestNonEmpty = (a: string, b: string) => [a, b].filter(Boolean).sort().slice(-1)[0] || "";

    const merged: Lead = {
      ...primary,
      id: primary.id,
      name: resolvedValue("name"),
      company: resolvedValue("company"),
      phone: resolvedValue("phone"),
      whatsapp: resolvedValue("whatsapp"),
      instagram: resolvedValue("instagram"),
      email: resolvedValue("email"),
      source: resolvedValue("source"),
      clientType: resolvedValue("clientType"),
      service: resolvedValue("service"),
      status: resolvedValue("status"),
      priority: resolvedValue("priority"),
      assignedTo: resolvedValue("assignedTo"),
      deliveryStage: resolvedValue("deliveryStage"),
      notes: [leadA.notes, leadB.notes].map(cleanText).filter(Boolean).join(cleanText(leadA.notes) === cleanText(leadB.notes) ? "" : "\n---\n"),
      dmText: cleanText(primary.dmText) || cleanText(secondary.dmText),
      prospectInitialResponse: cleanText(primary.prospectInitialResponse) || cleanText(secondary.prospectInitialResponse),
      prospectLatestResponse: cleanText(primary.prospectLatestResponse) || cleanText(secondary.prospectLatestResponse),
      conversationLog: mergedConversationLog,
      auditLog: mergedAuditLog,
      completedFollowUps: Array.from(new Set([...(leadA.completedFollowUps || []), ...(leadB.completedFollowUps || [])])),
      followUpCount: (leadA.followUpCount || 0) + (leadB.followUpCount || 0),
      dateAdded: earliestDateAdded,
      lastContacted: latestNonEmpty(leadA.lastContacted, leadB.lastContacted),
      lastMeaningfulTouchpoint: latestNonEmpty(leadA.lastMeaningfulTouchpoint, leadB.lastMeaningfulTouchpoint),
      betaCandidate: leadA.betaCandidate || leadB.betaCandidate,
      mergedFrom: Array.from(new Set([...(primary.mergedFrom || []), discarded.id, ...(discarded.mergedFrom || [])])),
      mergedInto: undefined
    };

    return { merged, discarded };
  };

  const handleConfirm = () => {
    const { merged, discarded } = buildMerged();
    onConfirm(merged, discarded);
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.88)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 300, padding: 12, overflowY: "auto" }}>
      <div style={{ background: "#0d0d0d", border: "1px solid rgba(139,92,246,0.35)", borderRadius: 12, width: "100%", maxWidth: 560, padding: 22, margin: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.6)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <span style={{ fontWeight: 800, fontSize: 12, color: "#8B5CF6", letterSpacing: "0.1em", display: "flex", alignItems: "center", gap: 6 }}><GitMerge size={14} /> MERGE DUPLICATE LEADS</span>
          <button onClick={onClose} style={{ background: "none", border: "none", color: MUTED, cursor: "pointer" }}><X size={18} /></button>
        </div>

        <div style={{ fontSize: 10.5, color: MUTED, marginBottom: 14 }}>Nothing is deleted — every note, message, and reply from both records is kept. Choose which record stays as the primary, then resolve any conflicting fields below.</div>

        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          {[leadA, leadB].map(l => (
            <button key={l.id} onClick={() => setPrimaryId(l.id)} style={{ flex: 1, textAlign: "left", background: primaryId === l.id ? "rgba(139,92,246,0.1)" : SURFACE2, border: `1px solid ${primaryId === l.id ? "rgba(139,92,246,0.5)" : BORDER}`, borderRadius: 8, padding: "10px 12px", cursor: "pointer" }}>
              <div style={{ fontSize: 9, color: primaryId === l.id ? "#8B5CF6" : MUTED2, fontWeight: 700, letterSpacing: "0.08em", marginBottom: 4 }}>{primaryId === l.id ? "KEEP AS PRIMARY" : "WILL BE MERGED IN"}</div>
              <div style={{ fontSize: 12, fontWeight: 700, color: TEXT }}>{l.name || "—"}</div>
              <div style={{ fontSize: 11, color: MUTED }}>{l.company || "—"}</div>
              <div style={{ fontSize: 10, color: MUTED, marginTop: 4 }}>{l.status} · {l.assignedTo || "Unassigned"} · added {l.dateAdded || "—"}</div>
            </button>
          ))}
        </div>

        {conflicts.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
            <div style={{ fontSize: 9, color: G, fontWeight: 700, letterSpacing: "0.08em" }}>RESOLVE CONFLICTING FIELDS</div>
            {conflicts.map(f => (
              <div key={f.key as string} style={{ background: SURFACE2, border: `1px solid ${BORDER}`, borderRadius: 8, padding: "9px 12px" }}>
                <div style={{ fontSize: 10, color: MUTED2, fontWeight: 700, marginBottom: 6 }}>{f.label}</div>
                <div style={{ display: "flex", gap: 8 }}>
                  <label style={{ flex: 1, display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: choices[f.key as string] !== "B" ? G : MUTED, cursor: "pointer" }}>
                    <input type="radio" checked={(choices[f.key as string] || "A") === "A"} onChange={() => setChoices(p => ({ ...p, [f.key as string]: "A" }))} /> {fieldVal(leadA, f.key)}
                  </label>
                  <label style={{ flex: 1, display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: choices[f.key as string] === "B" ? G : MUTED, cursor: "pointer" }}>
                    <input type="radio" checked={choices[f.key as string] === "B"} onChange={() => setChoices(p => ({ ...p, [f.key as string]: "B" }))} /> {fieldVal(leadB, f.key)}
                  </label>
                </div>
              </div>
            ))}
          </div>
        )}

        <div style={{ fontSize: 10, color: MUTED, marginBottom: 16, display: "flex", alignItems: "center", gap: 6 }}>
          <ArrowRight size={11} /> Full conversation history, notes, and follow-up counts from both records will be combined automatically.
        </div>

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{ background: "none", border: `1px solid ${BORDER}`, color: MUTED, borderRadius: 6, padding: "8px 18px", fontSize: 12, cursor: "pointer" }}>Cancel</button>
          <button onClick={handleConfirm} style={{ background: "#8B5CF6", color: "#fff", border: "none", borderRadius: 6, padding: "8px 22px", fontWeight: 800, fontSize: 12, cursor: "pointer" }}>Confirm Merge</button>
        </div>
      </div>
    </div>
  );
}
export default MergeLeadModal;
