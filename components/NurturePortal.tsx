import React, { useEffect, useMemo, useState } from "react";
import { Search, Sprout, Loader2, ClipboardList, Plus } from "lucide-react";
import type { Lead } from "../types";
import { runSalesBrain, VALUE_DM_NURTURE_GUIDANCE } from "../salesBrain";
import { newOutboundMessage, type OutboundMessage } from "../lib/outbound";
import { createOutboundRecord, markOutboundWhatsAppOpened, confirmOutboundSent } from "../lib/execution";
import { WhatsAppExecutionButton } from "./WhatsAppExecutionButton";
import { G, G_DIM, G_BORDER, SURFACE, SURFACE2, BORDER, MUTED, MUTED2, TEXT, STATUS_COLOR, today } from "../constants";

type Activity = { id: string; actorName: string; prospectName: string; activityDate: string };
interface Props { leads: Lead[]; userId: string; specialistNames?: string[]; allowActorSelection?: boolean; onLeadCommitted: (lead: Lead) => void; }
const panel: React.CSSProperties = { background: SURFACE, border: "1px solid " + BORDER, borderRadius: 10, padding: 14 };

export function NurturePortal({ leads, userId, specialistNames, allowActorSelection = false, onLeadCommitted }: Props) {
  const [activityActor, setActivityActor] = useState(userId);
  const [query, setQuery] = useState("");
  const [stageFilter, setStageFilter] = useState("All");
  const [drafting, setDrafting] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [outbounds, setOutbounds] = useState<Record<string, OutboundMessage>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [activities, setActivities] = useState<Activity[]>([]);
  const [activityDate, setActivityDate] = useState(today());
  const [batchText, setBatchText] = useState("");
  const [savingBatch, setSavingBatch] = useState(false);
  const [batchMessage, setBatchMessage] = useState("");

  const THREE_DAYS_MS = 72 * 60 * 60 * 1000;
  const nurtureState = (lead: Lead) => {
    const sent = (lead.outboundMessages || []).filter(item => item.messageType === "VALUE_DM" && item.status === "SENT");
    const latest = sent.sort((a, b) => (b.sentAt || "").localeCompare(a.sentAt || ""))[0];
    if (!latest) return { due: true, label: "Ready for first value DM", lastSentAt: "" };
    if (!latest.sentAt) return { due: false, label: "Review required — sent time unavailable", lastSentAt: "" };
    const nextAt = new Date(latest.sentAt).getTime() + THREE_DAYS_MS;
    const remaining = nextAt - Date.now();
    if (remaining > 0) {
      const hours = Math.ceil(remaining / 3600000);
      return { due: false, label: "Next value DM in " + (hours >= 24 ? Math.ceil(hours / 24) + " day(s)" : hours + " hour(s)"), lastSentAt: latest.sentAt };
    }
    return { due: true, label: "Ready — 3-day interval completed", lastSentAt: latest.sentAt };
  };

  const dueLeads = useMemo(() => leads
    .filter(lead => !lead.mergedInto && !["Closed", "Lost"].includes(lead.status))
    .filter(lead => !specialistNames?.length || specialistNames.includes(lead.assignedTo || ""))
    .filter(lead => nurtureState(lead).due)
    .sort((a, b) => {
      const aLast = (a.outboundMessages || []).filter(m => m.messageType === "VALUE_DM" && m.status === "SENT").map(m => m.sentAt || "").sort().at(-1) || "";
      const bLast = (b.outboundMessages || []).filter(m => m.messageType === "VALUE_DM" && m.status === "SENT").map(m => m.sentAt || "").sort().at(-1) || "";
      return aLast.localeCompare(bLast) || (a.lastMeaningfulTouchpoint || a.lastContacted || a.dateAdded || "").localeCompare(b.lastMeaningfulTouchpoint || b.lastContacted || b.dateAdded || "");
    }), [leads, specialistNames]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return dueLeads
      .filter(lead => stageFilter === "All" || lead.status === stageFilter)
      .filter(lead => !q || [lead.name, lead.company, lead.status, lead.assignedTo, lead.instagram].some(value => String(value || "").toLowerCase().includes(q)))
      .slice(0, 30);
  }, [dueLeads, query, stageFilter]);

  const loadActivities = async () => {
    try {
      const response = await fetch("/api/prospecting-activities?limit=100");
      if (response.ok) { const data = await response.json(); setActivities(Array.isArray(data.activities) ? data.activities : []); }
    } catch {}
  };
  useEffect(() => { void loadActivities(); }, []);

  const draftValue = async (lead: Lead) => {
    setDrafting(lead.id);
    setErrors(current => ({ ...current, [lead.id]: "" }));
    try {
      const brain = await runSalesBrain(lead, {
        requestedMessageType: "VALUE_DM",
        task: [
          VALUE_DM_NURTURE_GUIDANCE,
          "Create a prospect-specific relationship-nurture message, not a sales follow-up.",
          "Use the complete available conversation history, CRM notes, company/project evidence, previous outbound messages and current pipeline stage.",
          "Provide one concrete, useful insight relevant to this prospect's real-estate business, content positioning, investor confidence or buyer psychology.",
          "No pitch, sales CTA, question, request for a reply, or disguised sales ask.",
          "Never invent projects, locations, numbers or personal facts. If evidence is limited, provide a grounded insight relevant to the known business category.",
          "End with a low-pressure closing sentence such as: “Just thought this was worth sharing in case it’s useful.” Do not add a question, invitation to book, sales pitch, or request for a reply to this routine value message.",
          "Write one concise paragraph, or two only when genuinely necessary, in natural WhatsApp language."
        ].join("\n"),
      });
      const message = brain.message.trim();
      const outbound = newOutboundMessage({ leadId: lead.id, userId, messageType: "VALUE_DM", messageText: message, source: "nurture_portal", strategy: brain.recommendedAction || "Value-first relationship nurture." });
      const saved = await createOutboundRecord(lead.id, outbound);
      setOutbounds(current => ({ ...current, [lead.id]: saved.outboundMessages?.find(item => item.id === outbound.id) || outbound }));
      setDrafts(current => ({ ...current, [lead.id]: message }));
    } catch (error: any) {
      setErrors(current => ({ ...current, [lead.id]: error?.message || "Could not generate this value message." }));
    } finally { setDrafting(null); }
  };

  const logBatch = async () => {
    const names = batchText.split("\n").map(value => value.trim()).filter(Boolean);
    if (!names.length) { setBatchMessage("Enter at least one prospect name."); return; }
    if (names.length > 100) { setBatchMessage("Log up to 100 prospects per batch."); return; }
    setSavingBatch(true); setBatchMessage("");
    try {
      const events = names.map(prospectName => ({ id: "manual-" + crypto.randomUUID(), prospectName }));
      const response = await fetch("/api/prospecting-activities/bulk", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actorName: activityActor, activityDate, channel: "WhatsApp", outcome: "Contacted", events }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Could not save the activity batch.");
      setBatchMessage("Saved " + payload.insertedCount + " new prospecting record(s). " + (payload.duplicateCount || 0) + " duplicate(s) skipped.");
      setBatchText(""); await loadActivities();
    } catch (error: any) { setBatchMessage(error?.message || "Could not save this batch."); }
    finally { setSavingBatch(false); }
  };

  return <div style={{ display: "flex", flexDirection: "column", gap: 14, color: TEXT }}>
    <div style={{ ...panel, borderColor: G_BORDER, background: "linear-gradient(135deg, rgba(62,207,220,0.08), rgba(15,15,15,0.96))" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, color: G, fontSize: 10, fontWeight: 800, letterSpacing: "0.12em" }}><Sprout size={14} /> RELATIONSHIP INTELLIGENCE</div>
      <div style={{ fontSize: 21, fontWeight: 850, marginTop: 7 }}>Nurture Portal</div>
      <div style={{ fontSize: 12, color: MUTED2, lineHeight: 1.65, marginTop: 5 }}>Deliver useful, prospect-specific intelligence without turning every interaction into a sales follow-up. Drafts enter the conversation only after you confirm they were sent.</div>
      <div style={{ fontSize: 11, color: MUTED2, marginTop: 8, lineHeight: 1.6 }}>Relationship cadence: a prospect becomes eligible again 72 hours after the last confirmed SENT Value DM. Drafting or opening WhatsApp does not start the cooldown. The list always surfaces the next 30 prospects who are due.</div>
      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <div style={{ background: SURFACE2, border: "1px solid " + BORDER, borderRadius: 7, padding: "8px 12px" }}><strong style={{ color: G, fontSize: 18 }}>{filtered.length}</strong><div style={{ color: MUTED, fontSize: 9 }}>NEXT 30 DUE</div></div>
        <div style={{ background: SURFACE2, border: "1px solid " + BORDER, borderRadius: 7, padding: "8px 12px" }}><strong style={{ color: "#22C55E", fontSize: 18 }}>{activities.filter(item => item.activityDate === today()).length}</strong><div style={{ color: MUTED, fontSize: 9 }}>PROSPECTING LOGS TODAY</div></div>
      </div>
    </div>
    <div style={panel}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 10 }}><Search size={14} color={G} /><strong style={{ fontSize: 12 }}>Find a prospect</strong></div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><input value={query} onChange={event => { setQuery(event.target.value); }} placeholder="Search name, company or owner…" style={{ flex: "1 1 220px", background: SURFACE2, border: "1px solid " + BORDER, borderRadius: 7, color: TEXT, padding: "11px 12px", fontSize: 12 }} /><select value={stageFilter} onChange={event => { setStageFilter(event.target.value); }} style={{ background: SURFACE2, border: "1px solid " + BORDER, borderRadius: 7, color: TEXT, padding: "8px 10px", fontSize: 11 }}><option value="All">All stages</option>{Array.from(new Set(leads.map(lead => lead.status).filter(Boolean))).sort().map(stage => <option key={stage} value={stage}>{stage}</option>)}</select></div>
    </div>
    {filtered.map(lead => {
      const message = drafts[lead.id]; const outbound = outbounds[lead.id];
      return <div key={lead.id} style={panel}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
          <div><div style={{ fontWeight: 800, fontSize: 13 }}>{lead.name || lead.company || "Unnamed prospect"}</div><div style={{ color: MUTED2, fontSize: 11, marginTop: 2 }}>{lead.company || "Company not recorded"}</div></div>
          <span style={{ border: "1px solid " + (STATUS_COLOR[lead.status] || G) + "55", color: STATUS_COLOR[lead.status] || G, borderRadius: 5, padding: "3px 7px", fontSize: 9, fontWeight: 800 }}>{lead.status || "Unstaged"}</span>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, margin: "9px 0", fontSize: 10, color: MUTED }}>
          <span>Owner: {lead.assignedTo || "Unassigned"}</span><span>· Last contact: {lead.lastContacted || "Not recorded"}</span>
          <span>· {(lead.outboundMessages || []).filter(item => item.messageType === "VALUE_DM" && item.status === "SENT").length} confirmed Value DM(s)</span><span>· {nurtureState(lead).label}</span>
        </div>
        <button onClick={() => void draftValue(lead)} disabled={drafting !== null} style={{ display: "inline-flex", alignItems: "center", gap: 6, border: "1px solid " + G_BORDER, background: G_DIM, color: G, borderRadius: 6, padding: "7px 11px", fontSize: 10, fontWeight: 800 }}>
          {drafting === lead.id ? <><Loader2 size={12} /> Drafting…</> : <><Sprout size={12} /> Draft Value DM</>}
        </button>
        {errors[lead.id] && <div style={{ color: "#F87171", fontSize: 10, marginTop: 8 }}>{errors[lead.id]}</div>}
        {message && outbound && <div style={{ marginTop: 11, paddingTop: 10, borderTop: "1px solid " + BORDER }}>
          <div style={{ color: G, fontSize: 9, fontWeight: 800, marginBottom: 6 }}>VALUE MESSAGE — REVIEW BEFORE SENDING</div>
          <textarea value={message} readOnly rows={4} style={{ width: "100%", background: SURFACE2, border: "1px solid " + BORDER, borderRadius: 7, color: TEXT, padding: 10, fontSize: 12, lineHeight: 1.6 }} />
          <WhatsAppExecutionButton lead={lead} message={message} messageType="VALUE_DM" source="nurture_portal" userId={userId} outboundId={outbound.id}
            onWhatsAppOpened={async () => { await markOutboundWhatsAppOpened(lead.id, outbound.id); }}
            onSent={async () => { const committed = await confirmOutboundSent(lead.id, outbound.id); onLeadCommitted(committed); }} />
        </div>}
      </div>;
    })}
    {filtered.length === 0 && <div style={{ ...panel, color: MUTED, textAlign: "center" }}>{dueLeads.length === 0 ? "No prospects are due right now. The next prospect becomes eligible 72 hours after their last confirmed Value DM." : "No due prospects match this search or stage filter."}</div>}
    {dueLeads.length > 30 && <div style={{ color: MUTED2, fontSize: 10, textAlign: "center" }}>Showing the next 30 of {dueLeads.length} prospects currently due.</div>}
    <div style={panel}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 5 }}><ClipboardList size={14} color={G} /><strong style={{ fontSize: 12 }}>Log prospecting activity</strong></div>
      <p style={{ color: MUTED2, fontSize: 10, lineHeight: 1.55 }}>For contacts made outside a saved CRM thread, enter one prospect per line. Historical records are date-stamped; no send times are invented.</p>
      <label style={{ fontSize: 10, color: MUTED }}>Activity date <input type="date" value={activityDate} onChange={event => setActivityDate(event.target.value)} style={{ display: "block", marginTop: 4, background: SURFACE2, border: "1px solid " + BORDER, color: TEXT, borderRadius: 6, padding: 7 }} /></label>
      {allowActorSelection ? <label style={{ display: "block", fontSize: 10, color: MUTED, margin: "8px 0" }}>Team member <select value={activityActor} onChange={event => setActivityActor(event.target.value)} style={{ display: "block", marginTop: 4, background: SURFACE2, border: "1px solid " + BORDER, color: TEXT, borderRadius: 6, padding: 7 }}><option value="Alex">Alex</option><option value="Blessing Mudi">Blessing Mudi</option><option value="Sa'adatu Mohammed">Sa'adatu Mohammed</option></select></label> : <div style={{ fontSize: 10, color: MUTED, margin: "8px 0" }}>Team member: <strong style={{ color: TEXT }}>{userId}</strong></div>}
      <textarea value={batchText} onChange={event => setBatchText(event.target.value)} rows={4} placeholder={"One prospect per line\nExample Properties\nSample Realty"} style={{ width: "100%", background: SURFACE2, border: "1px solid " + BORDER, borderRadius: 7, color: TEXT, padding: 10, fontSize: 11 }} />
      <button onClick={() => void logBatch()} disabled={savingBatch || !batchText.trim()} style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 8, background: G, color: "#001014", border: "none", borderRadius: 6, padding: "8px 12px", fontSize: 10, fontWeight: 900 }}><Plus size={12} />{savingBatch ? "Saving…" : "Save Prospecting Log"}</button>
      {batchMessage && <div style={{ color: batchMessage.startsWith("Saved") ? "#22C55E" : "#F87171", fontSize: 10, marginTop: 8 }}>{batchMessage}</div>}
      <div style={{ fontSize: 10, fontWeight: 800, marginTop: 14, marginBottom: 7 }}>RECENT MANUAL PROSPECTING RECORDS</div>
      {activities.filter(item => item.activityDate === activityDate).slice(0, 12).map(item => <div key={item.id} style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "7px 0", borderTop: "1px solid " + BORDER, fontSize: 10 }}><span>{item.prospectName} <span style={{ color: MUTED }}>· {item.actorName}</span></span><span style={{ color: MUTED }}>{item.activityDate}</span></div>)}
    </div>
  </div>;
}
