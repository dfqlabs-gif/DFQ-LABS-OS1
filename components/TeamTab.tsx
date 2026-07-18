import { useState, useMemo } from "react";
import { Users, UserCheck, AlertTriangle, FileText, Rocket } from "lucide-react";
import React from "react";
import { Lead } from "../types";
import { 
  scoreLead, 
  normalizeCompany, 
  calcRevenue, 
  alphaSort, 
  fmt, 
  G, 
  SURFACE, 
  SURFACE2, 
  BORDER, 
  MUTED, 
  SPECIALISTS, 
  SPECIALIST_COLOR, 
  specialistLabel,
  STATUS_COLOR 
} from "../constants";

interface TeamTabProps {
  leads: Lead[];
  onSave: (lead: Lead) => void;
  onBulkSave: (updatedLeads: Lead[]) => Promise<void>;
}

export function TeamTab({ leads, onSave, onBulkSave }: TeamTabProps) {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<string | null>(null);

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
      if (norm && l.assignedTo && l.assignedTo !== "Unassigned" && l.status !== "Lost") {
        claimedByCompany[norm] = l.assignedTo;
      }
    });

    const sorted = [...unassigned].sort((a, b) => scoreLead(b) - scoreLead(a));
    let countA = leads.filter(l => l.assignedTo === "Sa'adatu Mohammed" && !["Closed", "Lost"].includes(l.status)).length;
    let countB = leads.filter(l => l.assignedTo === "Abigail Dick" && !["Closed", "Lost"].includes(l.status)).length;

    const updates = sorted.map(l => {
      const norm = normalizeCompany(l.company);
      let assignTo;
      if (norm && claimedByCompany[norm]) {
        assignTo = claimedByCompany[norm];
      } else {
        assignTo = countA <= countB ? "Sa'adatu Mohammed" : "Abigail Dick";
        if (assignTo === "Sa'adatu Mohammed") countA++;
        else countB++;
        if (norm) claimedByCompany[norm] = assignTo;
      }
      return { ...l, assignedTo: assignTo };
    });

    await onBulkSave(updates);
    setResult(`Assigned ${updates.length} lead(s) — ${updates.filter(u => u.assignedTo === "Sa'adatu Mohammed").length} to Sa'adatu, ${updates.filter(u => u.assignedTo === "Abigail Dick").length} to Abigail.`);
    setRunning(false);
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

  return (
    <div>
      <div className="dfq-card" style={{ background: SURFACE, border: `1px solid rgba(62,207,220,0.22)`, borderRadius: 12, padding: "16px 18px", marginBottom: 14 }}>
        <div style={{ fontSize: 9, color: G, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
          <Users size={12} /> Team Workload
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 10, marginBottom: 14 }}>
          {bySpecialist.map(s => (
            <div key={s.name} style={{ background: SURFACE2, border: `1px solid ${SPECIALIST_COLOR[s.name]}30`, borderTop: `2px solid ${SPECIALIST_COLOR[s.name]}`, borderRadius: 8, padding: "12px 14px" }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: SPECIALIST_COLOR[s.name], display: "flex", alignItems: "center", gap: 5 }}>
                <UserCheck size={13} /> {specialistLabel(s.name)}
              </div>
              <div style={{ fontSize: 20, fontWeight: 900, marginTop: 6, color: "#fff" }}>{s.active}</div>
              <div style={{ fontSize: 9, color: MUTED }}>active leads</div>
              <div style={{ fontSize: 10, color: "#888", marginTop: 6 }}>{s.hot} hot · {s.closed} closed · {fmt(s.revenue)} guaranteed</div>
            </div>
          ))}
        </div>
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
        <div style={{ fontSize: 10, color: MUTED, marginTop: 8 }}>New leads are now auto-assigned the instant they're created — this button is just a backstop for anything that slips through unassigned. Assignment always keeps a company with whichever intern already claimed it, so nobody ends up DMing a brand the other person already owns.</div>
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
