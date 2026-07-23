import { useState, useMemo } from "react";
import { Users, UserCheck, AlertTriangle, FileText, Rocket, Calendar, Search, ChevronRight } from "lucide-react";
import React from "react";
import { Lead } from "../types";
import { 
  scoreLead, 
  normalizeCompany, 
  calcRevenue, 
  alphaSort, 
  fmt, 
  today,
  addDays,
  G, 
  G_DIM,
  G_BORDER,
  SURFACE, 
  SURFACE2, 
  BORDER,
  MUTED,
  MUTED2,
  TEXT,
  iStyle,
  SPECIALISTS, 
  SPECIALIST_COLOR, 
  specialistLabel,
  STATUS_COLOR,
  getInternActivities
} from "../constants";

interface TeamTabProps {
  leads: Lead[];
  onSave: (lead: Lead) => void;
  onBulkSave: (updatedLeads: Lead[]) => Promise<void>;
}

export function TeamTab({ leads, onSave, onBulkSave }: TeamTabProps) {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [expandedSpecialist, setExpandedSpecialist] = useState<string | null>(null);
  const [activityDate, setActivityDate] = useState(today());

  const unassigned = leads.filter(l => (!l.assignedTo || l.assignedTo === "Unassigned") && !["Closed", "Lost"].includes(l.status));
  
  const conflicts = useMemo(() => {
    const seen: Record<string, Lead[]> = {};
    const out: Lead[][] = [];
    leads.forEach(l => {
      if (l.status === "Lost") return;
      const norm = normalizeCompany(l.company);
      if (!norm || !l.assignedTo || l.assignedTo === "Unassigned") return;
      if (!seen[norm]) seen[norm] = [];
      seen[norm].push(l);
    });
    Object.values(seen).forEach(group => {
      const specialists = new Set(group.map(g => g.assignedTo));
      if (specialists.size > 1) out.push(group);
    });
    return out;
  }, [leads]);

  const autoBalance = async () => {
    if (unassigned.length === 0) return;
    setRunning(true);
    setResult(null);
    const claimedByCompany: Record<string, string> = {};
    leads.forEach(l => {
      const norm = normalizeCompany(l.company);
      if (norm && l.assignedTo && l.assignedTo !== "Unassigned" && l.assignedTo !== "Abigail Dick" && l.status !== "Lost") {
        claimedByCompany[norm] = l.assignedTo;
      }
    });

    const sorted = [...unassigned].sort((a, b) => scoreLead(b) - scoreLead(a));
    let countA = leads.filter(l => l.assignedTo === "Sa'adatu Mohammed" && !["Closed", "Lost"].includes(l.status)).length;

    const updates = sorted.map(l => {
      const norm = normalizeCompany(l.company);
      let assignTo: string;
      if (norm && claimedByCompany[norm]) {
        assignTo = claimedByCompany[norm];
      } else {
        assignTo = "Sa'adatu Mohammed";
        countA++;
        if (norm) claimedByCompany[norm] = assignTo;
      }
      return { ...l, assignedTo: assignTo };
    });

    await onBulkSave(updates);
    setResult(`Assigned ${updates.length} lead(s) to Sa'adatu Mohammed.`);
    setRunning(false);
  };

  const [reassigning, setReassigning] = useState(false);
  const [reassignResult, setReassignResult] = useState<string | null>(null);
  const abigailLeads = leads.filter(l => l.assignedTo === "Abigail Dick" && !["Closed", "Lost"].includes(l.status));

  const reassignAbigailToAlex = async () => {
    if (abigailLeads.length === 0) return;
    setReassigning(true);
    setReassignResult(null);
    const updates = abigailLeads.map(l => ({ ...l, assignedTo: "Alex" }));
    await onBulkSave(updates);
    setReassignResult(`${updates.length} lead(s) reassigned from Abigail Dick → Alex.`);
    setReassigning(false);
  };

  const bySpecialist = SPECIALISTS.filter(s => s !== "Unassigned").map(s => {
    const mine = leads.filter(l => l.assignedTo === s);
    const active = mine.filter(l => !["Closed", "Lost"].includes(l.status));
    return {
      name: s,
      total: mine.length,
      active: active.length,
      closed: mine.filter(l => l.status === "Closed").length,
      revenue: calcRevenue(mine).guaranteed,
      hot: active.filter(l => l.aiBucket === "Hot").length
    };
  });

  // Activity breakdown for a selected date
  const activityStats = useMemo(() => {
    const acts = getInternActivities(leads, activityDate);
    const report: Record<string, any> = {};
    SPECIALISTS.filter(s => s !== "Unassigned").forEach(s => {
      const myActs = acts.filter(a => a.actor === s);
      report[s] = {
        dmsSent: myActs.filter(a => a.type === "dm" || (a.type === "status_change" && a.text === "DM Sent")).length,
        followUps: myActs.filter(a => (a.type === "note" && a.title === "Follow-up Made") || (a.type === "status_change" && a.text === "Follow-up Made")).length,
        replies: myActs.filter(a => a.type === "reply" || (a.type === "status_change" && a.text === "Replied")).length,
        auditsRequested: myActs.filter(a => a.type === "status_change" && a.text === "Audit Requested").length,
        auditsDelivered: myActs.filter(a => a.type === "status_change" && (a.text === "Audit Delivered" || a.text === "Value Given")).length,
        callsBooked: myActs.filter(a => a.type === "status_change" && a.text === "Discovery Call Booked").length,
        callsDone: myActs.filter(a => a.type === "status_change" && a.text === "Discovery Call Done").length,
        leadsAdded: myActs.filter(a => a.type === "add").length,
        events: myActs,
      };
    });
    return report;
  }, [leads, activityDate]);

  const specialistLeads = (name: string) =>
    alphaSort(leads.filter(l => l.assignedTo === name));

  return (
    <div>
      {/* ── Team Workload (clickable cards) ─────────────────────────────────── */}
      <div className="dfq-card" style={{ background: SURFACE, border: `1px solid rgba(62,207,220,0.22)`, borderRadius: 12, padding: "16px 18px", marginBottom: 14 }}>
        <div style={{ fontSize: 9, color: G, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
          <Users size={12} /> Team Workload
        </div>
        <div style={{ fontSize: 11, color: MUTED, marginBottom: 12 }}>Click on a team member to see their detailed activity breakdown.</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 10, marginBottom: 14 }}>
          {bySpecialist.map(s => {
            const isExpanded = expandedSpecialist === s.name;
            return (
              <div
                key={s.name}
                onClick={() => setExpandedSpecialist(isExpanded ? null : s.name)}
                style={{
                  background: isExpanded ? `${SPECIALIST_COLOR[s.name]}18` : SURFACE2,
                  border: `1px solid ${isExpanded ? SPECIALIST_COLOR[s.name] : SPECIALIST_COLOR[s.name] + "30"}`,
                  borderTop: `2px solid ${SPECIALIST_COLOR[s.name]}`,
                  borderRadius: 8,
                  padding: "12px 14px",
                  cursor: "pointer",
                  transition: "background 0.15s, border-color 0.15s"
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 800, color: SPECIALIST_COLOR[s.name], display: "flex", alignItems: "center", justifyContent: "space-between", gap: 5 }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 5 }}><UserCheck size={13} /> {specialistLabel(s.name)}</span>
                  <ChevronRight size={12} style={{ transform: isExpanded ? "rotate(90deg)" : "none", transition: "transform 0.2s", flexShrink: 0 }} />
                </div>
                <div style={{ fontSize: 20, fontWeight: 900, marginTop: 6, color: "#fff" }}>{s.active}</div>
                <div style={{ fontSize: 9, color: MUTED }}>active leads</div>
                <div style={{ fontSize: 10, color: "#888", marginTop: 6 }}>{s.hot} hot · {s.closed} closed · {fmt(s.revenue)} guaranteed</div>
              </div>
            );
          })}
        </div>

        {/* ── Expanded Specialist Activity Panel ─────────────────────────── */}
        {expandedSpecialist && (() => {
          const sColor = SPECIALIST_COLOR[expandedSpecialist] || G;
          const stats = activityStats[expandedSpecialist] || {};
          const sLeads = specialistLeads(expandedSpecialist);
          const activeLeads = sLeads.filter(l => !["Closed", "Lost"].includes(l.status));
          return (
            <div style={{ background: `${sColor}08`, border: `1px solid ${sColor}30`, borderRadius: 10, padding: "16px 18px", marginBottom: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: sColor, marginBottom: 14 }}>
                {specialistLabel(expandedSpecialist)} — Activity Details
              </div>

              {/* Date Picker */}
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
                <Calendar size={12} color={sColor} />
                <span style={{ fontSize: 10, color: MUTED2, fontWeight: 600 }}>View activity for:</span>
                {[{ label: "Today", val: today() }, { label: "Yesterday", val: addDays(-1) }, { label: "2 Days Ago", val: addDays(-2) }].map(d => (
                  <button
                    key={d.label}
                    onClick={e => { e.stopPropagation(); setActivityDate(d.val); }}
                    style={{ background: activityDate === d.val ? G_DIM : "transparent", border: `1px solid ${activityDate === d.val ? G_BORDER : BORDER}`, color: activityDate === d.val ? G : MUTED, borderRadius: 5, padding: "3px 8px", fontSize: 10, cursor: "pointer" }}
                  >
                    {d.label}
                  </button>
                ))}
                <input
                  type="date"
                  value={activityDate}
                  onClick={e => e.stopPropagation()}
                  onChange={e => { e.stopPropagation(); setActivityDate(e.target.value); }}
                  style={{ background: SURFACE2, border: `1px solid ${BORDER}`, color: TEXT, fontSize: 10, borderRadius: 5, padding: "3px 7px", outline: "none" }}
                />
              </div>

              {/* Activity stat tiles */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(110px,1fr))", gap: 8, marginBottom: 16 }}>
                {[
                  { label: "Leads Added", val: stats.leadsAdded || 0, color: "#22C55E" },
                  { label: "New DMs Sent", val: stats.dmsSent || 0, color: G },
                  { label: "Follow-ups Made", val: stats.followUps || 0, color: "#3B82F6" },
                  { label: "Replies Received", val: stats.replies || 0, color: "#F59E0B" },
                  { label: "Audits Requested", val: stats.auditsRequested || 0, color: "#a855f7" },
                  { label: "Audits Delivered", val: stats.auditsDelivered || 0, color: "#ec4899" },
                  { label: "Calls Booked", val: stats.callsBooked || 0, color: "#F97316" },
                  { label: "Calls Done", val: stats.callsDone || 0, color: "#06B6D4" },
                ].map(stat => (
                  <div key={stat.label} style={{ background: SURFACE2, border: `1px solid ${BORDER}`, borderRadius: 8, padding: "10px 12px", textAlign: "center" }}>
                    <div style={{ fontSize: 18, fontWeight: 900, color: stat.color }}>{stat.val}</div>
                    <div style={{ fontSize: 9, color: MUTED2, marginTop: 3 }}>{stat.label}</div>
                  </div>
                ))}
              </div>

              {/* Event log for that date */}
              {(stats.events || []).length > 0 ? (
                <div>
                  <div style={{ fontSize: 9, color: MUTED2, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 8 }}>
                    Chronological Events — {activityDate}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 220, overflowY: "auto" }}>
                    {(stats.events as any[]).map((act: any, i: number) => {
                      const timeStr = new Date(act.ts).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
                      return (
                        <div key={i} style={{ borderLeft: `2px solid ${sColor}`, paddingLeft: 10, paddingBottom: 4 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: TEXT }}>
                            <span style={{ color: MUTED2 }}>{act.title}</span>
                            <span style={{ color: MUTED }}>{timeStr !== "Invalid Date" ? timeStr : ""}</span>
                          </div>
                          <div style={{ fontSize: 10, color: MUTED, marginTop: 2, fontWeight: 600 }}>{act.company}</div>
                          {act.text && <div style={{ fontSize: 10, color: "#999", marginTop: 1, whiteSpace: "pre-wrap" }}>{act.text.slice(0, 100)}{act.text.length > 100 ? "…" : ""}</div>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div style={{ fontSize: 11, color: MUTED, textAlign: "center", padding: "12px 0" }}>No events logged for {activityDate}.</div>
              )}

              {/* All their leads */}
              <div style={{ marginTop: 16, paddingTop: 14, borderTop: `1px solid ${sColor}25` }}>
                <div style={{ fontSize: 9, color: MUTED2, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 8 }}>
                  All Active Leads ({activeLeads.length})
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 5, maxHeight: 240, overflowY: "auto" }}>
                  {activeLeads.map(l => (
                    <div
                      key={l.id}
                      onClick={e => { e.stopPropagation(); onSave(l); }}
                      style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 10px", background: SURFACE2, border: `1px solid ${BORDER}`, borderRadius: 7, cursor: "pointer", flexWrap: "wrap", gap: 6 }}
                    >
                      <span style={{ fontSize: 11, fontWeight: 600, color: "#fff" }}>
                        {l.name || l.company} <span style={{ color: MUTED, fontWeight: 400 }}>{l.company && l.name ? `· ${l.company}` : ""}</span>
                      </span>
                      <span style={{ fontSize: 9, padding: "1px 6px", borderRadius: 4, background: `${STATUS_COLOR[l.status]}20`, border: `1px solid ${STATUS_COLOR[l.status]}50`, color: STATUS_COLOR[l.status], fontWeight: 700 }}>
                        {l.status}
                      </span>
                    </div>
                  ))}
                  {activeLeads.length === 0 && <div style={{ fontSize: 11, color: MUTED }}>No active leads.</div>}
                </div>
              </div>
            </div>
          );
        })()}

        {/* Abigail offboarding — reassign her active leads */}
        {abigailLeads.length > 0 && (
          <div style={{ background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 8, padding: "12px 14px", marginBottom: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#EF4444", marginBottom: 6 }}>
              Abigail Dick — Offboarding Action Required
            </div>
            <div style={{ fontSize: 11, color: MUTED, marginBottom: 10 }}>
              {abigailLeads.length} active lead{abigailLeads.length !== 1 ? "s" : ""} still assigned to Abigail. Reassign them to Alex to maintain continuity.
            </div>
            <button
              onClick={reassignAbigailToAlex}
              disabled={reassigning}
              style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.4)", color: "#EF4444", borderRadius: 6, padding: "8px 16px", fontSize: 11, fontWeight: 700, cursor: reassigning ? "not-allowed" : "pointer" }}
            >
              {reassigning ? "Reassigning…" : `Reassign All ${abigailLeads.length} Leads → Alex`}
            </button>
            {reassignResult && <div style={{ marginTop: 8, fontSize: 11, color: "#22C55E", fontWeight: 700 }}>{reassignResult}</div>}
          </div>
        )}

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
          <div style={{ fontSize: 11, color: MUTED }}>{unassigned.length} lead{unassigned.length !== 1 ? "s" : ""} unassigned right now.</div>
          <button
            onClick={autoBalance}
            disabled={running || unassigned.length === 0}
            style={{
              background: running || unassigned.length === 0 ? SURFACE2 : G,
              color: running || unassigned.length === 0 ? MUTED : "#000",
              border: "none",
              borderRadius: 6,
              padding: "9px 18px",
              fontWeight: 800,
              fontSize: 12,
              cursor: running || unassigned.length === 0 ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              gap: 6
            }}
          >
            <Rocket size={13} /> {running ? "Balancing…" : "Auto-Balance Unassigned Leads"}
          </button>
        </div>
        {result && <div style={{ marginTop: 10, fontSize: 11, color: "#22C55E", fontWeight: 700 }}>{result}</div>}
        <div style={{ fontSize: 10, color: MUTED, marginTop: 8 }}>New leads are auto-assigned the moment they're created — this is a backstop for anything unassigned. All new leads now go to Sa'adatu Mohammed by default.</div>
      </div>

      {conflicts.length > 0 && (
        <div className="dfq-card" style={{ background: SURFACE, border: "1px solid rgba(239,68,68,0.4)", borderRadius: 12, padding: "16px 18px", marginBottom: 14 }}>
          <div style={{ fontSize: 9, color: "#EF4444", fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
            <AlertTriangle size={12} /> Duplicate Brand Conflicts ({conflicts.length})
          </div>
          <div style={{ fontSize: 11, color: MUTED, marginBottom: 10 }}>These companies are currently assigned to more than one intern — reassign one of them to avoid double outreach.</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {conflicts.map((group, i) => (
              <div key={i} style={{ background: SURFACE2, border: "1px solid rgba(239,68,68,0.25)", borderRadius: 8, padding: "10px 12px" }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#fff", marginBottom: 6 }}>{group[0].company}</div>
                {group.map(l => (
                  <div key={l.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: MUTED, marginBottom: 3 }}>
                    <span>{l.name || "—"} · {l.status}</span>
                    <span style={{ fontSize: 10, color: SPECIALIST_COLOR[l.assignedTo], fontWeight: 700 }}>{specialistLabel(l.assignedTo)}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="dfq-card" style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 12, padding: "16px 18px" }}>
        <div style={{ fontSize: 9, color: G, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
          <FileText size={12} /> All Leads by Assignment
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {alphaSort(leads).map(l => (
            <div
              key={l.id}
              onClick={() => onSave(l)}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "8px 12px",
                background: SURFACE2,
                border: `1px solid ${BORDER}`,
                borderRadius: 7,
                cursor: "pointer",
                flexWrap: "wrap",
                gap: 6
              }}
            >
              <span style={{ fontSize: 12, fontWeight: 600, color: "#fff" }}>
                {l.name || l.company} <span style={{ color: MUTED, fontWeight: 400 }}>{l.company && l.name ? `· ${l.company}` : ""}</span>
              </span>
              <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
                <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 4, background: `${STATUS_COLOR[l.status]}20`, border: `1px solid ${STATUS_COLOR[l.status]}50`, color: STATUS_COLOR[l.status], fontWeight: 700 }}>
                  {l.status}
                </span>
                <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 4, background: `${SPECIALIST_COLOR[l.assignedTo]}15`, border: `1px solid ${SPECIALIST_COLOR[l.assignedTo]}50`, color: SPECIALIST_COLOR[l.assignedTo], fontWeight: 700 }}>
                  {specialistLabel(l.assignedTo)}
                </span>
              </div>
            </div>
          ))}
          {leads.length === 0 && <div style={{ fontSize: 11, color: MUTED }}>No leads yet.</div>}
        </div>
      </div>
    </div>
  );
}
export default TeamTab;
