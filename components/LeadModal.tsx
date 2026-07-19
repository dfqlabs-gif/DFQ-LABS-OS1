import { useState, useMemo, useRef } from "react";
import { X, UserCheck, AlertTriangle, Calendar, Sprout, Ticket, Lock, CheckCircle2, Brain, GitMerge, ExternalLink, Search, ShieldAlert, Paperclip, Trash2, FileText, Image } from "lucide-react";
import React from "react";
import { Lead, LeadAttachment } from "../types";
import { 
  CLIENT_TYPES, 
  SOURCES, 
  PRIORITIES, 
  SERVICES, 
  STATUSES, 
  DELIVERY_STAGES, 
  BUCKETS, 
  BUCKET_COLOR, 
  SPECIALISTS, 
  specialistLabel,
  BETA_SPOTS_TOTAL, 
  BETA_MONTH_LABEL, 
  today, 
  daysSince, 
  touchpointDate, 
  normalizeCompany,
  cleanText,
  getMissingRequiredFields,
  findPotentialDuplicates,
  DuplicateMatch,
  Fld,
  iStyle,
  G,
  G_DIM,
  G_BORDER,
  BORDER,
  SURFACE2,
  TEXT,
  MUTED,
  MUTED2
} from "../constants";

// Subcomponent: Append-only full conversation history view
export function ConversationHistoryPanel({ log }: { log: any[] }) {
  const [open, setOpen] = useState(false);
  if (!log || !log.length) return null;
  const sorted = [...log].sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());
  const typeColor: Record<string, string> = { dm: G, reply: "#8B5CF6", status_change: "#a855f7", note: "#F59E0B" };

  return (
    <div style={{ background: SURFACE2, border: `1px solid ${BORDER}`, borderRadius: 8, padding: "10px 14px" }}>
      <div onClick={() => setOpen(!open)} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", gap: 8, flexWrap: "wrap" }}>
        <span style={{ fontSize: 9, color: MUTED2, fontWeight: 700, letterSpacing: "0.08em" }}>
          FULL CONVERSATION HISTORY — {sorted.length} entr{sorted.length !== 1 ? "ies" : "y"} (never overwritten)
        </span>
        <span style={{ fontSize: 11, color: MUTED }}>{open ? "Hide ▲" : "Show ▼"}</span>
      </div>
      {open && (
        <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 9, maxHeight: 340, overflowY: "auto" }}>
          {sorted.map((e, i) => (
            <div key={i} style={{ borderLeft: `2px solid ${typeColor[e.type] || MUTED}`, paddingLeft: 9 }}>
              <div style={{ fontSize: 9, color: typeColor[e.type] || MUTED, fontWeight: 700 }}>
                {e.label || e.type} · {new Date(e.ts).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
              </div>
              <div style={{ fontSize: 11, color: "#ccc", lineHeight: 1.6, whiteSpace: "pre-wrap", marginTop: 2 }}>{e.text}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface LeadModalProps {
  lead: Lead;
  leads: Lead[];
  onSave: (l: Lead) => void;
  onClose: () => void;
  role?: "founder" | "intern";
  onOpenExisting?: (l: Lead) => void;
  onMerge?: (existing: Lead, draft: Lead) => void;
}

export function LeadModal({ lead: initial, leads, onSave, onClose, role = "founder", onOpenExisting, onMerge }: LeadModalProps) {
  const [lead, setLead] = useState<Lead>(initial);
  const set = (k: keyof Lead, v: any) => setLead(p => ({ ...p, [k]: v }));

  // Whether this modal was opened on a lead that doesn't exist in the shared
  // dataset yet — required-field validation and duplicate checks only apply
  // to brand-new leads, so editing older, looser-filled records never breaks.
  const isNewLead = useMemo(() => !leads.some(l => l.id === initial.id), [leads, initial.id]);

  const isClient = lead.status === "Closed";
  const missingFields = useMemo(() => (isNewLead ? getMissingRequiredFields(lead) : []), [isNewLead, lead.name, lead.company, lead.source, lead.assignedTo, lead.status]);
  const canSave = isNewLead ? missingFields.length === 0 : Boolean(lead.name.trim() || lead.company.trim());

  // Live search-before-create: surface likely-existing leads as the user types,
  // so double entry is caught before a new record is even submitted.
  const liveMatches = useMemo<DuplicateMatch[]>(() => {
    if (!isNewLead) return [];
    if (!cleanText(lead.name) && !cleanText(lead.company) && !cleanText(lead.phone) && !cleanText(lead.instagram) && !cleanText(lead.whatsapp) && !cleanText(lead.email)) return [];
    return findPotentialDuplicates(leads, lead, { threshold: 30 }).slice(0, 5);
  }, [isNewLead, leads, lead.name, lead.company, lead.phone, lead.instagram, lead.whatsapp, lead.email]);

  const [pendingDuplicates, setPendingDuplicates] = useState<DuplicateMatch[]>([]);
  const [showDupWarning, setShowDupWarning] = useState(false);
  const [dupOverridden, setDupOverridden] = useState(false);

  // ── Attachments ───────────────────────────────────────────────────────────
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    setUploadError(null);
    files.forEach(file => {
      if (file.size > 5 * 1024 * 1024) {
        setUploadError(`${file.name} exceeds the 5 MB limit.`);
        return;
      }
      const reader = new FileReader();
      const isText = file.type.startsWith("text/") || file.type === "application/json";
      reader.onload = ev => {
        const att: LeadAttachment = {
          id: Date.now().toString(36) + Math.random().toString(36).slice(2),
          name: file.name,
          mimeType: file.type || "application/octet-stream",
          size: file.size,
          content: ev.target?.result as string,
          uploadedAt: new Date().toISOString(),
        };
        setLead(p => ({ ...p, attachments: [...(p.attachments || []), att] }));
      };
      isText ? reader.readAsText(file) : reader.readAsDataURL(file);
    });
    e.target.value = "";
  };

  const handleSaveClick = () => {
    if (!canSave) return;
    const cleaned: Lead = {
      ...lead,
      name: cleanText(lead.name),
      company: cleanText(lead.company),
      phone: cleanText(lead.phone),
      instagram: cleanText(lead.instagram),
      whatsapp: cleanText(lead.whatsapp),
      email: cleanText(lead.email)
    };
    if (isNewLead && !dupOverridden) {
      const dups = findPotentialDuplicates(leads, cleaned, { threshold: 45 });
      if (dups.length) {
        setPendingDuplicates(dups);
        setShowDupWarning(true);
        return;
      }
    }
    onSave(cleaned);
    onClose();
  };

  const betaFilledCount = useMemo(() => {
    return leads.filter(l => l.betaCandidate && l.status === "Closed" && l.id !== lead.id).length;
  }, [leads, lead.id]);
  
  const betaLocked = betaFilledCount >= BETA_SPOTS_TOTAL && !lead.betaCandidate;
  const tp = daysSince(touchpointDate(lead));
  const conflict = useMemo(() => {
    const norm = normalizeCompany(lead.company);
    if (!norm || !lead.assignedTo || lead.assignedTo === "Unassigned") return null;
    return leads.find(l => l.id !== lead.id && normalizeCompany(l.company) === norm && l.assignedTo && l.assignedTo !== "Unassigned" && l.assignedTo !== lead.assignedTo && l.status !== "Lost") || null;
  }, [leads, lead.company, lead.assignedTo, lead.id, lead.status]);

  const meetingLocalValue = lead.meetingScheduledAt 
    ? new Date(new Date(lead.meetingScheduledAt).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) 
    : "";

  return (
    <div className="lead-modal-outer" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.92)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 12, overflowY: "auto" }}>
      <div className="lead-modal-inner" style={{ background: "#0d0d0d", border: `1px solid ${BORDER}`, borderRadius: 12, width: "100%", maxWidth: 520, padding: 22, margin: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.6)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
          <span style={{ fontWeight: 800, fontSize: 12, color: G, letterSpacing: "0.1em" }}>
            {initial.name || initial.company ? "EDIT LEAD" : "NEW LEAD"}
          </span>
          <button onClick={onClose} style={{ background: "none", border: "none", color: MUTED, cursor: "pointer" }}>
            <X size={18} />
          </button>
        </div>
        
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div className="lead-modal-grid-2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <Fld label="Contact Name">
              <input value={lead.name} onChange={e => set("name", e.target.value)} placeholder="Jane Doe" style={iStyle} />
            </Fld>
            <Fld label="Company">
              <input value={lead.company} onChange={e => set("company", e.target.value)} placeholder="Acme Homes" style={iStyle} />
            </Fld>
          </div>
          
          {isNewLead && (lead.name.trim() || lead.company.trim()) && liveMatches.length > 0 && (
            <div style={{ background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.3)", borderRadius: 8, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ fontSize: 9, color: "#F59E0B", fontWeight: 700, letterSpacing: "0.08em", display: "flex", alignItems: "center", gap: 5 }}>
                <Search size={11} /> POSSIBLE EXISTING LEADS — check before creating a new one
              </div>
              {liveMatches.map(m => (
                <div key={m.lead.id} onClick={() => onOpenExisting?.(m.lead)} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, cursor: onOpenExisting ? "pointer" : "default", padding: "5px 6px", borderRadius: 5, background: SURFACE2 }}>
                  <span style={{ fontSize: 11, color: TEXT }}>{m.lead.name || "—"} <span style={{ color: MUTED }}>{m.lead.company}</span></span>
                  <span style={{ fontSize: 9, color: "#F59E0B", fontWeight: 700, flexShrink: 0 }}>{m.confidence}% match</span>
                </div>
              ))}
            </div>
          )}

          <div className="lead-modal-grid-2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <Fld label="Phone">
              <input value={lead.phone || ""} onChange={e => set("phone", e.target.value)} placeholder="+234 …" style={iStyle} type="tel" />
            </Fld>
            <Fld label="WhatsApp">
              <input value={lead.whatsapp || ""} onChange={e => set("whatsapp", e.target.value)} placeholder="+234 … (if different)" style={iStyle} type="tel" />
            </Fld>
          </div>

          <div className="lead-modal-grid-2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <Fld label="Instagram">
              <input value={lead.instagram || ""} onChange={e => set("instagram", e.target.value)} placeholder="@handle" style={iStyle} />
            </Fld>
            <Fld label="Email">
              <input value={lead.email || ""} onChange={e => set("email", e.target.value)} placeholder="name@company.com" style={iStyle} type="email" />
            </Fld>
          </div>
          
          <div style={{ background: "rgba(62,207,220,0.05)", border: `1px solid ${G_BORDER}`, borderRadius: 8, padding: "11px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ fontSize: 9, color: G, fontWeight: 700, letterSpacing: "0.1em", display: "flex", alignItems: "center", gap: 5 }}>
              <UserCheck size={11} /> ASSIGNMENT
            </div>
            <Fld label="Assigned To">
              <select value={lead.assignedTo || "Unassigned"} onChange={e => set("assignedTo", e.target.value)} style={{ ...iStyle, cursor: "pointer" }}>
                {SPECIALISTS.map(o => <option key={o} value={o}>{specialistLabel(o)}</option>)}
              </select>
            </Fld>
            {conflict && (
              <div style={{ fontSize: 10, color: "#EF4444", display: "flex", alignItems: "center", gap: 5 }}>
                <AlertTriangle size={12} /> This company is already being worked by {conflict.assignedTo} ({conflict.name || "—"}, {conflict.status}). Reassign to avoid double outreach.
              </div>
            )}
          </div>
          
          <Fld label="Client Type — who are we actually selling to?">
            <select value={lead.clientType || "Real Estate Developer"} onChange={e => set("clientType", e.target.value)} style={{ ...iStyle, cursor: "pointer" }}>
              {CLIENT_TYPES.map(o => <option key={o}>{o}</option>)}
            </select>
          </Fld>
          
          <div className="lead-modal-grid-2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <Fld label="Source">
              <select value={lead.source} onChange={e => set("source", e.target.value)} style={{ ...iStyle, cursor: "pointer" }}>
                {SOURCES.map(o => <option key={o}>{o}</option>)}
              </select>
            </Fld>
            <Fld label="Priority">
              <select value={lead.priority} onChange={e => set("priority", e.target.value)} style={{ ...iStyle, cursor: "pointer" }}>
                {PRIORITIES.map(o => <option key={o}>{o}</option>)}
              </select>
            </Fld>
          </div>
          
          <Fld label="Service / Tier">
            <select value={lead.service} onChange={e => set("service", e.target.value)} style={{ ...iStyle, cursor: "pointer" }}>
              {SERVICES.map(o => <option key={o}>{o}</option>)}
            </select>
          </Fld>
          
          <Fld label="Status">
            <select value={lead.status} onChange={e => set("status", e.target.value)} style={{ ...iStyle, cursor: "pointer" }}>
              {STATUSES.map(o => <option key={o}>{o}</option>)}
            </select>
          </Fld>
          
          <div style={{ background: "rgba(249,115,22,0.05)", border: "1px solid rgba(249,115,22,0.25)", borderRadius: 8, padding: "11px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ fontSize: 9, color: "#F97316", fontWeight: 700, letterSpacing: "0.1em", display: "flex", alignItems: "center", gap: 5 }}>
              <Calendar size={11} /> MEETING INTELLIGENCE
            </div>
            <Fld label="Scheduled Meeting (date & time)">
              <input type="datetime-local" value={meetingLocalValue} onChange={e => set("meetingScheduledAt", e.target.value ? new Date(e.target.value).toISOString() : "")} style={iStyle} />
            </Fld>
            <div style={{ fontSize: 10, color: MUTED }}>If this falls within the next 24 hours, a full AI prep package auto-surfaces on Mission Control.</div>
          </div>
          
          <div style={{ background: "rgba(139,92,246,0.05)", border: "1px solid rgba(139,92,246,0.25)", borderRadius: 8, padding: "11px 14px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <div>
              <div style={{ fontSize: 9, color: "#8B5CF6", fontWeight: 700, letterSpacing: "0.1em", display: "flex", alignItems: "center", gap: 5 }}>
                <Sprout size={11} /> RELATIONSHIP CONTINUITY
              </div>
              <div style={{ fontSize: 11, color: MUTED, marginTop: 3 }}>Last meaningful touchpoint: <span style={{ color: TEXT, fontWeight: 700 }}>{lead.lastMeaningfulTouchpoint || "—"}</span> ({tp}d ago)</div>
            </div>
            {tp >= 90 && (
              <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 6px", borderRadius: 4, background: "rgba(139,92,246,0.15)", border: "1px solid rgba(139,92,246,0.4)", color: "#8B5CF6" }}>
                90D+ DUE FOR RENEWAL
              </span>
            )}
          </div>
          
          {betaLocked ? (
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 14px", background: "rgba(239,68,68,0.05)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 8 }}>
              <Lock size={16} color="#EF4444" style={{ flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#EF4444" }}>Beta program full — {BETA_SPOTS_TOTAL} of {BETA_SPOTS_TOTAL} spots filled this month</div>
                <div style={{ fontSize: 10, color: MUTED }}>Locked on purpose — overcommitting now means under-delivering on every beta client. This lead goes in at standard pricing.</div>
              </div>
            </div>
          ) : (
            <div
              onClick={() => {
                const newVal = !lead.betaCandidate;
                set("betaCandidate", newVal);
                // Auto-save immediately so the Mission Control tracker updates
                // without requiring the user to scroll to and click the Save button.
                const isExisting = leads.some(l => l.id === lead.id);
                if (isExisting) onSave({ ...lead, betaCandidate: newVal });
              }}
              style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 14px", background: lead.betaCandidate ? "rgba(250,204,21,0.08)" : SURFACE2, border: `1px solid ${lead.betaCandidate ? "rgba(250,204,21,0.4)" : BORDER}`, borderRadius: 8, cursor: "pointer" }}
            >
              <div style={{ width: 20, height: 20, borderRadius: 5, border: `2px solid ${lead.betaCandidate ? "#FACC15" : MUTED}`, background: lead.betaCandidate ? "#FACC15" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                {lead.betaCandidate && <CheckCircle2 size={12} color="#000" />}
              </div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: lead.betaCandidate ? "#FACC15" : TEXT, display: "flex", alignItems: "center", gap: 5 }}>
                  <Ticket size={12} /> Beta Candidate — {BETA_MONTH_LABEL}
                </div>
                <div style={{ fontSize: 10, color: MUTED }}>{BETA_SPOTS_TOTAL - betaFilledCount} of {BETA_SPOTS_TOTAL} spots open. Closing this lead fills one automatically.</div>
              </div>
            </div>
          )}
          
          <div style={{ background: SURFACE2, border: `1px solid ${BORDER}`, borderRadius: 8, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ fontSize: 9, color: G, fontWeight: 700, letterSpacing: "0.1em" }}>CONVERSATION THREAD — QUICK REFERENCE</div>
            <div style={{ fontSize: 10, color: MUTED, marginTop: -4 }}>These three boxes always show the latest value only. Every edit here is also saved permanently below in Full Conversation History — nothing you've written is ever lost.</div>
            <Fld label="Your DM">
              <textarea value={lead.dmText} onChange={e => set("dmText", e.target.value)} placeholder="Paste what you sent…" rows={3} style={{ ...iStyle, resize: "vertical", lineHeight: 1.5, borderColor: "rgba(62,207,220,0.2)" }} />
            </Fld>
            <Fld label="Their Initial Reply">
              <textarea value={lead.prospectInitialResponse || ""} onChange={e => set("prospectInitialResponse", e.target.value)} placeholder="What did they say back?" rows={2} style={{ ...iStyle, resize: "vertical", lineHeight: 1.5, borderColor: "rgba(245,158,11,0.2)" }} />
            </Fld>
            <Fld label="Latest Thread">
              <textarea value={lead.prospectLatestResponse || ""} onChange={e => set("prospectLatestResponse", e.target.value)} placeholder="Most recent exchange…" rows={3} style={{ ...iStyle, resize: "vertical", lineHeight: 1.5, borderColor: "rgba(139,92,246,0.2)" }} />
            </Fld>
            {lead.awaitingReplySince && <div style={{ fontSize: 10, color: "#EF4444" }}>Marked as awaiting our reply since {new Date(lead.awaitingReplySince).toLocaleString("en-GB")} — clears automatically when you mark contacted.</div>}
          </div>
          
          <ConversationHistoryPanel log={lead.conversationLog} />
          
          <div style={{ fontSize: 10, color: MUTED, marginTop: -4 }}>The moment you save or mark contacted, AI reads the full thread above and schedules the next follow-up automatically — no date required from you.</div>
          
          {(lead.autoFollowUpDate || lead.aiBucket) && (
            <div style={{ background: lead.aiBucket ? `${(BUCKET_COLOR[lead.aiBucket] || MUTED2)}10` : G_DIM, border: `1px solid ${lead.aiBucket ? (BUCKET_COLOR[lead.aiBucket] || MUTED2) + "30" : G_BORDER}`, borderRadius: 8, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ fontSize: 9, color: lead.aiBucket ? (BUCKET_COLOR[lead.aiBucket] || MUTED2) : G, fontWeight: 700, letterSpacing: "0.1em", display: "flex", alignItems: "center", gap: 5 }}>
                <Brain size={11} /> AI SCHEDULE & CLASSIFICATION
              </div>
              {lead.autoFollowUpDate && <div style={{ fontSize: 11, color: MUTED }}>Next follow-up: <span style={{ color: TEXT, fontWeight: 700 }}>{lead.autoFollowUpDate}</span> — {lead.autoFollowUpReason}</div>}
              {lead.aiReason && <div style={{ fontSize: 11, color: MUTED }}>"{lead.aiReason}"{lead.aiNextAction ? <><br /><span style={{ color: TEXT }}>Suggested: {lead.aiNextAction}</span></> : ""}</div>}
              {lead.aiBucket && (
                <Fld label="Override Bucket">
                  <select value={lead.aiBucket} onChange={e => set("aiBucket", e.target.value)} style={{ ...iStyle, cursor: "pointer" }}>
                    {BUCKETS.map(b => <option key={b}>{b}</option>)}
                  </select>
                </Fld>
              )}
            </div>
          )}
          
          <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
            <Fld label="Manual Override (optional)">
              <input value={lead.nextAction} onChange={e => set("nextAction", e.target.value)} placeholder="Leave blank — AI handles this" style={iStyle} />
            </Fld>
            <Fld label="Override Date (optional)">
              <input type="date" value={lead.nextActionDate} onChange={e => set("nextActionDate", e.target.value)} style={iStyle} />
            </Fld>
          </div>
          
          <Fld label="Notes">
            <textarea value={lead.notes} onChange={e => set("notes", e.target.value)} placeholder="Objections, context, key details…" rows={2} style={{ ...iStyle, resize: "vertical" }} />
          </Fld>

          {/* ── Attachments ─────────────────────────────────────────────── */}
          <div style={{ background: SURFACE2, border: `1px solid ${BORDER}`, borderRadius: 8, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ fontSize: 9, color: G, fontWeight: 700, letterSpacing: "0.1em", display: "flex", alignItems: "center", gap: 5 }}>
              <Paperclip size={11} /> ATTACHMENTS — feeds the AI
            </div>
            <div style={{ fontSize: 10, color: MUTED }}>Upload contracts, proposals, conversation exports, screenshots — text files are read directly by the AI when drafting messages. Max 5 MB per file.</div>

            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".pdf,.png,.jpg,.jpeg,.gif,.webp,.json,.txt,.html,.htm"
              style={{ display: "none" }}
              onChange={handleFileUpload}
            />

            {(lead.attachments || []).map(att => (
              <div key={att.id} style={{ display: "flex", alignItems: "center", gap: 8, background: "#0d0d0d", border: `1px solid ${BORDER}`, borderRadius: 6, padding: "7px 10px" }}>
                {att.mimeType.startsWith("image/")
                  ? <Image size={13} color={G} style={{ flexShrink: 0 }} />
                  : <FileText size={13} color={G} style={{ flexShrink: 0 }} />}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11, color: "#ccc", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{att.name}</div>
                  <div style={{ fontSize: 9, color: MUTED }}>{att.mimeType} · {(att.size / 1024).toFixed(0)} KB · {new Date(att.uploadedAt).toLocaleDateString("en-GB")}</div>
                </div>
                {att.mimeType.startsWith("image/") && (
                  <img src={att.content} alt={att.name} style={{ width: 36, height: 36, objectFit: "cover", borderRadius: 4, border: `1px solid ${BORDER}`, flexShrink: 0 }} />
                )}
                <button
                  onClick={() => set("attachments", (lead.attachments || []).filter(a => a.id !== att.id))}
                  style={{ background: "none", border: "none", color: MUTED, cursor: "pointer", padding: 4, flexShrink: 0 }}
                  title="Remove attachment"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}

            <button
              onClick={() => fileInputRef.current?.click()}
              style={{ background: "transparent", border: `1px solid ${BORDER}`, borderRadius: 6, padding: "7px 12px", fontSize: 11, color: MUTED, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, width: "fit-content" }}
            >
              <Paperclip size={12} /> Attach files
            </button>

            {uploadError && <div style={{ fontSize: 10, color: "#EF4444" }}>{uploadError}</div>}
          </div>

          {isClient && (
            <div style={{ background: SURFACE2, border: "1px solid rgba(34,197,94,0.2)", borderRadius: 8, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ fontSize: 9, color: "#22C55E", fontWeight: 700, letterSpacing: "0.1em" }}>CLIENT DELIVERY</div>
              <Fld label="Delivery Stage">
                <select value={lead.deliveryStage || "Discovery"} onChange={e => set("deliveryStage", e.target.value)} style={{ ...iStyle, cursor: "pointer" }}>
                  {DELIVERY_STAGES.map(s => <option key={s}>{s}</option>)}
                </select>
              </Fld>
              <Fld label="Delivery Note (add 'risk' to flag)">
                <input value={lead.deliveryNote || ""} onChange={e => set("deliveryNote", e.target.value)} placeholder="e.g. Waiting on assets — risk of delay" style={iStyle} />
              </Fld>
            </div>
          )}
          
          {isNewLead && missingFields.length > 0 && (
            <div style={{ fontSize: 10, color: "#EF4444" }}>Before saving, fill in: {missingFields.join(", ")}.</div>
          )}

          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 4 }}>
            <button onClick={onClose} style={{ background: "none", border: `1px solid ${BORDER}`, color: MUTED, borderRadius: 6, padding: "8px 18px", fontSize: 12, cursor: "pointer" }}>Cancel</button>
            <button onClick={handleSaveClick} style={{ background: canSave ? G : "#1a1a1a", color: canSave ? "#000" : MUTED, border: "none", borderRadius: 6, padding: "8px 22px", fontWeight: 800, fontSize: 12, cursor: canSave ? "pointer" : "not-allowed" }}>SAVE</button>
          </div>
        </div>
      </div>

      {showDupWarning && pendingDuplicates.length > 0 && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, padding: 12 }}>
          <div style={{ background: "#0d0d0d", border: "1px solid rgba(239,68,68,0.4)", borderRadius: 12, width: "100%", maxWidth: 460, padding: 20, boxShadow: "0 20px 60px rgba(0,0,0,0.6)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 12 }}>
              <AlertTriangle size={16} color="#EF4444" />
              <span style={{ fontWeight: 800, fontSize: 12, color: "#EF4444", letterSpacing: "0.06em" }}>POSSIBLE DUPLICATE LEAD</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, maxHeight: 260, overflowY: "auto", marginBottom: 14 }}>
              {pendingDuplicates.map(m => (
                <div key={m.lead.id} style={{ background: SURFACE2, border: `1px solid ${BORDER}`, borderRadius: 8, padding: "10px 12px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: TEXT }}>{m.lead.name || "—"} <span style={{ color: MUTED, fontWeight: 400 }}>{m.lead.company}</span></span>
                    <span style={{ fontSize: 10, color: "#EF4444", fontWeight: 700, flexShrink: 0 }}>{m.confidence}% match</span>
                  </div>
                  <div style={{ fontSize: 10, color: MUTED, marginTop: 4 }}>Matched on: {m.matchedFields.join(", ")} · Assigned to {m.lead.assignedTo || "Unassigned"} · {m.lead.status}</div>
                  <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                    <button onClick={() => { onOpenExisting?.(m.lead); onClose(); }} style={{ background: G_DIM, color: G, border: `1px solid ${G_BORDER}`, borderRadius: 5, padding: "5px 10px", fontSize: 10, fontWeight: 700, display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}><ExternalLink size={11} /> View Existing</button>
                    {role === "founder" && onMerge && (
                      <button onClick={() => { onMerge(m.lead, { ...lead, name: cleanText(lead.name), company: cleanText(lead.company) }); onClose(); }} style={{ background: "rgba(139,92,246,0.1)", color: "#8B5CF6", border: "1px solid rgba(139,92,246,0.3)", borderRadius: 5, padding: "5px 10px", fontSize: 10, fontWeight: 700, display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}><GitMerge size={11} /> Merge</button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {role === "founder" ? (
              <div style={{ fontSize: 10, color: MUTED, marginBottom: 12 }}>As Founder you can force-create this lead anyway if you're confident it's genuinely separate.</div>
            ) : (
              <div style={{ display: "flex", alignItems: "flex-start", gap: 7, fontSize: 10.5, color: "#F59E0B", background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.25)", borderRadius: 6, padding: "8px 10px", marginBottom: 12 }}>
                <ShieldAlert size={13} style={{ flexShrink: 0, marginTop: 1 }} />
                <span>Only the Founder can create a lead that looks like a duplicate. Please contact her to proceed, or view/edit the existing lead above.</span>
              </div>
            )}

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={() => setShowDupWarning(false)} style={{ background: "none", border: `1px solid ${BORDER}`, color: MUTED, borderRadius: 6, padding: "7px 16px", fontSize: 11, cursor: "pointer" }}>Cancel</button>
              {role === "founder" && (
                <button onClick={() => { setDupOverridden(true); setShowDupWarning(false); onSave({ ...lead, name: cleanText(lead.name), company: cleanText(lead.company), phone: cleanText(lead.phone), instagram: cleanText(lead.instagram), whatsapp: cleanText(lead.whatsapp), email: cleanText(lead.email) }); onClose(); }} style={{ background: "#EF4444", color: "#fff", border: "none", borderRadius: 6, padding: "7px 16px", fontWeight: 800, fontSize: 11, cursor: "pointer" }}>Create Anyway</button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
export default LeadModal;
