import { useState, useMemo } from "react";
import { Calendar, UserCheck, Shield, FileText, BarChart3, DollarSign, Brain, Search, Clock3, AlertTriangle, Sprout } from "lucide-react";
import React from "react";
import { Lead, Stats } from "../types";
import { 
  today, 
  addDays, 
  fmt, 
  calcRevenue, 
  getInternActivities, 
  alphaSort, 
  STATUSES, 
  STATUS_COLOR, 
  SPECIALISTS, 
  SPECIALIST_COLOR, 
  SERVICE_VALUE, 
  STAGE_PROBABILITY, 
  G, 
  G_DIM, 
  G_BORDER, 
  SURFACE, 
  SURFACE2, 
  BG, 
  BORDER, 
  MUTED, 
  MUTED2, 
  TEXT, 
  iStyle,
  daysSince,
  hoursSince,
  hoursUntil,
  touchpointDate,
  RELATIONSHIP_WARNING_DAYS,
  RELATIONSHIP_RENEWAL_DAYS,
  RESPONSE_GUARD_HOURS,
  MEETING_WINDOW_HOURS
} from "../constants";
import { BUSINESS_CONTEXT, callClaude } from "../prompts";

interface CEOTabProps {
  leads: Lead[];
  stats: Stats;
  revenue: any;
  onEdit: (l: Lead) => void;
}

export function CEOTab({ leads, stats, revenue, onEdit }: CEOTabProps) {
  const specialists = SPECIALISTS.filter(s => s !== "Unassigned");
  const [fSpecialist, setFSpecialist] = useState("All");
  
  // Intern Activity Tracker Date Selection State
  const [selectedActivityDate, setSelectedActivityDate] = useState(today());
  
  // AI brief state
  const [brief, setBrief] = useState("");
  const [briefLoading, setBriefLoading] = useState(false);

  // Date constants for easy presets
  const yesterdayStr = addDays(-1);
  const dayBeforeYesterdayStr = addDays(-2);

  // Calculate detailed chronological intern activity list for selected date
  const activitiesForSelectedDate = useMemo(() => {
    return getInternActivities(leads, selectedActivityDate);
  }, [leads, selectedActivityDate]);

  // Aggregate stats per intern for selected date using status transition auditing
  const internStatsForSelectedDate = useMemo(() => {
    const report: Record<string, { 
      newLeads: number, 
      outreaches: number, 
      replies: number, 
      auditsRequested: number, 
      auditsDelivered: number, 
      meetingsBooked: number, 
      proposalsSent: number, 
      clientsClosed: number 
    }> = {};
    
    specialists.forEach(s => {
      const myActs = activitiesForSelectedDate.filter(a => a.actor === s);
      report[s] = {
        newLeads: myActs.filter(a => a.type === "add").length,
        outreaches: myActs.filter(a => (a.type === "dm") || (a.type === "status_change" && a.text === "DM Sent")).length,
        replies: myActs.filter(a => (a.type === "reply") || (a.type === "status_change" && a.text === "Replied")).length,
        auditsRequested: myActs.filter(a => a.type === "status_change" && a.text === "Audit Requested").length,
        auditsDelivered: myActs.filter(a => a.type === "status_change" && (a.text === "Audit Delivered" || a.text === "Value Given")).length,
        meetingsBooked: myActs.filter(a => a.type === "status_change" && a.text === "Discovery Call Booked").length,
        proposalsSent: myActs.filter(a => a.type === "status_change" && a.text === "Proposal Sent").length,
        clientsClosed: myActs.filter(a => a.type === "status_change" && a.text === "Closed").length,
      };
    });
    return report;
  }, [activitiesForSelectedDate, specialists]);

  // CEO Weekly roll-up Calculations
  const isSunday = new Date().getDay() === 0;
  const weekStart = (() => {
    const d = new Date();
    if (isSunday) {
      d.setDate(d.getDate() - 6);
    } else {
      d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    }
    return d.toISOString().split("T")[0];
  })();
  const weekEnd = (() => {
    if (isSunday) {
      const d = new Date();
      d.setDate(d.getDate() - 1);
      return d.toISOString().split("T")[0];
    }
    return today();
  })();

  const inWeek = (d: string) => d && d >= weekStart && d <= weekEnd;

  const rollup = specialists.map(s => {
    const mine = leads.filter(l => l.assignedTo === s);
    return {
      name: s,
      newLeads: mine.filter(l => inWeek(l.dateAdded)).length,
      followUps: mine.filter(l => inWeek(l.lastContacted)).length,
      replies: mine.filter(l => (l.prospectInitialResponse || l.prospectLatestResponse) && inWeek(l.lastContacted)).length,
      proposals: mine.filter(l => l.status === "Proposal Sent" && inWeek(l.lastContacted)).length,
      closed: mine.filter(l => l.status === "Closed" && inWeek(l.lastContacted)).length,
      totalLeads: mine.length,
      totalClosed: mine.filter(l => l.status === "Closed").length,
      totalRevenue: calcRevenue(mine).guaranteed,
    };
  });

  const filteredLeads = fSpecialist === "All" ? leads : leads.filter(l => l.assignedTo === fSpecialist);

  // Executive Dashboard metrics
  const active = leads.filter(l => !["Closed", "Lost"].includes(l.status));
  const dueTodayCount = active.filter(l => {
    const due = l.autoFollowUpDate || l.nextActionDate;
    return due && due <= today();
  }).length;
  const meetings = active.filter(l => l.meetingScheduledAt && hoursUntil(l.meetingScheduledAt) <= MEETING_WINDOW_HOURS && hoursUntil(l.meetingScheduledAt) >= -1);
  const awaitingReply = active.filter(l => l.awaitingReplySince && hoursSince(l.awaitingReplySince) >= RESPONSE_GUARD_HOURS);
  const approaching90 = active.filter(l => {
    const d = daysSince(touchpointDate(l));
    return d >= RELATIONSHIP_WARNING_DAYS && d < RELATIONSHIP_RENEWAL_DAYS;
  });
  const overdue90 = active.filter(l => daysSince(touchpointDate(l)) >= RELATIONSHIP_RENEWAL_DAYS);
  
  const highestRisk = [...active].filter(l => l.status === "Proposal Sent" && daysSince(l.lastContacted) >= 2)
    .concat(active.filter(l => l.aiBucket === "Cold"))
    .sort((a, b) => (SERVICE_VALUE[b.service] || 0) - (SERVICE_VALUE[a.service] || 0)).slice(0, 3);
  
  const highestPotential = [...active]
    .sort((a, b) => ((SERVICE_VALUE[b.service] || 0) * (STAGE_PROBABILITY[b.status] || 0)) - ((SERVICE_VALUE[a.service] || 0) * (STAGE_PROBABILITY[a.status] || 0)))
    .slice(0, 3);

  const closedCount = leads.filter(l => l.status === "Closed").length;
  const closeRate = leads.length ? Math.round((closedCount / leads.length) * 100) : 0;

  const getBrief = async () => {
    setBriefLoading(true);
    setBrief("");
    const snapshot = `Active leads: ${active.length}. Follow-ups due: ${dueTodayCount}. Scheduled meetings (<24h): ${meetings.length}. Overdue replies from us: ${awaitingReply.length}. Relationships nearing 90-days limits: ${approaching90.length}. past 90-days limits: ${overdue90.length}. Weighted value: ${fmt(revenue.weighted)}. Locked value: ${fmt(revenue.guaranteed)}. Conversion rate: ${closeRate}%.`;
    
    try {
      const text = await callClaude(
        BUSINESS_CONTEXT,
        `Generate Daily CEO briefing for Alex. Today is ${today()} (${new Date().toLocaleDateString("en-GB", { weekday: "long" })}). Give a direct focus map. Answer the question: if Alex only has two focused hours today, what should he work on first to optimize for watches on audits, booked discovery calls, or closing beta partnership program spots? Include relevant lead names.\n\nPipeline snapshot:\n${snapshot}\n\nFormat the output exactly:\nCURRENT STATE: [one honest sentence on where we stand]\nSTRATEGIC FOCUS FOR TODAY: [the single highest-leverage task to spend 2 hours on]\nWHY IT WINS: [1 line explaining the psychology]\nCONVERSION HAZARD: [specific risk that could cost revenue today if ignored]`,
        600
      );
      setBrief(text);
    } catch (e: any) {
      setBrief("Error: " + e.message);
    }
    setBriefLoading(false);
  };

  const Stat = ({ label, value, color, icon: Icon }: any) => (
    <div style={{ background: SURFACE2, border: `1px solid ${BORDER}`, borderRadius: 8, padding: "10px 12px", textAlign: "center" }}>
      <Icon size={15} color={color} style={{ display: "inline-block", marginBottom: 3 }} />
      <div style={{ fontSize: 18, fontWeight: 800, color }}>{value}</div>
      <div style={{ fontSize: 9, color: MUTED, fontWeight: 600, marginTop: 2 }}>{label}</div>
    </div>
  );

  return (
    <div>
      {/* 1. Daily Executive Dashboard Overview */}
      <div className="dfq-card" style={{ background: `linear-gradient(160deg, ${SURFACE}, #0c0c0c)`, border: `1px solid ${G_BORDER}`, borderRadius: 12, padding: "16px 18px", marginBottom: 14 }}>
        <div style={{ fontSize: 9, color: G, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
          <Brain size={12} /> Daily Executive Dashboard
        </div>
        
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(96px,1fr))", gap: 8, marginBottom: 14 }}>
          <Stat label="MEETINGS <24H" value={meetings.length} color="#F97316" icon={Calendar} />
          <Stat label="AWAITING REPLY" value={awaitingReply.length} color="#EF4444" icon={Clock3} />
          <Stat label="NEARING 90D" value={approaching90.length} color="#F59E0B" icon={AlertTriangle} />
          <Stat label="PAST 90D" value={overdue90.length} color="#8B5CF6" icon={Sprout} />
          <Stat label="CLOSE RATE" value={`${closeRate}%`} color="#22C55E" icon={BarChart3} />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
          <div style={{ background: "#0a0a0a", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 8, padding: "10px 12px" }}>
            <div style={{ fontSize: 9, color: "#EF4444", fontWeight: 700, letterSpacing: "0.08em", marginBottom: 6 }}>HIGHEST-RISK OPPORTUNITIES</div>
            {highestRisk.length === 0 ? (
              <div style={{ fontSize: 11, color: MUTED }}>None flagged right now.</div>
            ) : (
              highestRisk.map(l => <div key={l.id} style={{ fontSize: 11, color: "#ccc", marginBottom: 3 }}>• {l.name || l.company} — {l.status}</div>)
            )}
          </div>
          <div style={{ background: "#0a0a0a", border: "1px solid rgba(34,197,94,0.25)", borderRadius: 8, padding: "10px 12px" }}>
            <div style={{ fontSize: 9, color: "#22C55E", fontWeight: 700, letterSpacing: "0.08em", marginBottom: 6 }}>HIGHEST-POTENTIAL OPPORTUNITIES</div>
            {highestPotential.length === 0 ? (
              <div style={{ fontSize: 11, color: MUTED }}>Add leads to visualize pipeline potential.</div>
            ) : (
              highestPotential.map(l => (
                <div key={l.id} style={{ fontSize: 11, color: "#ccc", marginBottom: 3 }}>
                  • {l.name || l.company} — {fmt(SERVICE_VALUE[l.service] || 0)} · {l.status}
                </div>
              ))
            )}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: brief ? 10 : 0, flexWrap: "wrap", gap: 8 }}>
          <div style={{ fontSize: 10, color: MUTED }}>AI-generated single strategic focus for today's two focused hours.</div>
          <button
            onClick={getBrief}
            disabled={briefLoading}
            style={{
              background: briefLoading ? SURFACE2 : G,
              color: briefLoading ? MUTED : "#000",
              border: "none",
              borderRadius: 6,
              padding: "8px 16px",
              fontWeight: 800,
              fontSize: 11,
              cursor: briefLoading ? "not-allowed" : "pointer"
            }}
          >
            {briefLoading ? "Briefing…" : "Get Strategic Focus →"}
          </button>
        </div>
        {brief && (
          <div style={{ fontSize: 12, lineHeight: 1.85, color: "#ccc", whiteSpace: "pre-wrap", background: SURFACE2, padding: "12px 14px", borderRadius: 8, border: `1px solid ${BORDER}` }}>
            {brief}
          </div>
        )}
      </div>

      {/* 2. CHRONOLOGICAL INTERN ACTIVITY MONITOR - AUDIT OF THE 7 CRITICAL FUNNEL STAGES BY DATE */}
      <div className="dfq-card" style={{ background: SURFACE, border: `1px solid ${G_BORDER}`, borderRadius: 12, padding: "16px 18px", marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
          <div style={{ fontSize: 9, color: G, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", display: "flex", alignItems: "center", gap: 6 }}>
            <Calendar size={12} /> Intern Activity Monitor & Audit
          </div>
          <div style={{ display: "flex", gap: 4, alignItems: "center", flexWrap: "wrap" }}>
            <button
              onClick={() => setSelectedActivityDate(today())}
              style={{
                background: selectedActivityDate === today() ? G_DIM : "transparent",
                border: `1px solid ${selectedActivityDate === today() ? G_BORDER : BORDER}`,
                color: selectedActivityDate === today() ? G : MUTED,
                borderRadius: 6,
                padding: "4px 10px",
                fontSize: 11,
                cursor: "pointer"
              }}
            >
              Today
            </button>
            <button
              onClick={() => setSelectedActivityDate(yesterdayStr)}
              style={{
                background: selectedActivityDate === yesterdayStr ? G_DIM : "transparent",
                border: `1px solid ${selectedActivityDate === yesterdayStr ? G_BORDER : BORDER}`,
                color: selectedActivityDate === yesterdayStr ? G : MUTED,
                borderRadius: 6,
                padding: "4px 10px",
                fontSize: 11,
                cursor: "pointer"
              }}
            >
              Yesterday
            </button>
            <button
              onClick={() => setSelectedActivityDate(dayBeforeYesterdayStr)}
              style={{
                background: selectedActivityDate === dayBeforeYesterdayStr ? G_DIM : "transparent",
                border: `1px solid ${selectedActivityDate === dayBeforeYesterdayStr ? G_BORDER : BORDER}`,
                color: selectedActivityDate === dayBeforeYesterdayStr ? G : MUTED,
                borderRadius: 6,
                padding: "4px 10px",
                fontSize: 11,
                cursor: "pointer"
              }}
            >
              2 Days Ago
            </button>
            <div style={{ display: "flex", alignItems: "center", gap: 2, background: SURFACE2, border: `1px solid ${BORDER}`, borderRadius: 6, padding: "2px 6px" }}>
              <Search size={11} color={MUTED} />
              <input
                type="date"
                value={selectedActivityDate}
                onChange={e => setSelectedActivityDate(e.target.value)}
                style={{ background: "none", border: "none", color: TEXT, fontSize: 11, outline: "none", width: 115 }}
              />
            </div>
          </div>
        </div>
        
        <div style={{ fontSize: 11, color: MUTED, marginBottom: 14 }}>
          Audit what your interns worked on. Select any preset or search past dates to see added leads, completed follow-ups, and the exact outbound DMs/logs compiled.
        </div>

        {/* 7 Critical Funnel Metrics per intern for the selected activity date */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 10, marginBottom: 14 }}>
          {specialists.map(s => {
            const r = internStatsForSelectedDate[s] || { 
              newLeads: 0, outreaches: 0, replies: 0, auditsRequested: 0, auditsDelivered: 0, meetingsBooked: 0, proposalsSent: 0, clientsClosed: 0 
            };
            return (
              <div key={s} style={{ background: SURFACE2, border: `1px solid ${SPECIALIST_COLOR[s]}30`, borderTop: `2px solid ${SPECIALIST_COLOR[s]}`, borderRadius: 8, padding: "12px 14px" }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: SPECIALIST_COLOR[s], marginBottom: 8, display: "flex", alignItems: "center", gap: 4 }}>
                  <UserCheck size={12} /> {s}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
                    <span style={{ color: MUTED2 }}>New Leads Added:</span>
                    <span style={{ fontWeight: 700, color: TEXT }}>{r.newLeads}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
                    <span style={{ color: MUTED2 }}>Outreach Sent (DM Sent):</span>
                    <span style={{ fontWeight: 700, color: G }}>{r.outreaches}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
                    <span style={{ color: MUTED2 }}>Replies Received:</span>
                    <span style={{ fontWeight: 700, color: "#F59E0B" }}>{r.replies}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
                    <span style={{ color: MUTED2 }}>Audits Requested:</span>
                    <span style={{ fontWeight: 700, color: "#a855f7" }}>{r.auditsRequested}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
                    <span style={{ color: MUTED2 }}>Audits Delivered:</span>
                    <span style={{ fontWeight: 700, color: "#ec4899" }}>{r.auditsDelivered}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
                    <span style={{ color: MUTED2 }}>Meetings Booked (Calls):</span>
                    <span style={{ fontWeight: 700, color: "#F97316" }}>{r.meetingsBooked}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
                    <span style={{ color: MUTED2 }}>Proposals Sent:</span>
                    <span style={{ fontWeight: 700, color: "#06B6D4" }}>{r.proposalsSent}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
                    <span style={{ color: MUTED2 }}>Clients Closed:</span>
                    <span style={{ fontWeight: 700, color: "#22C55E" }}>{r.clientsClosed}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Chronological Detailed Activity Feed */}
        <div style={{ background: SURFACE2, border: `1px solid ${BORDER}`, borderRadius: 8, padding: 12 }}>
          <div style={{ fontSize: 9, color: MUTED2, fontWeight: 700, letterSpacing: "0.08em", marginBottom: 10, textTransform: "uppercase" }}>
            CHRONOLOGICAL ACTIVITY AUDIT FEED — {activitiesForSelectedDate.length} EVENT{activitiesForSelectedDate.length !== 1 ? "S" : ""} ON {selectedActivityDate}
          </div>
          
          <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 340, overflowY: "auto", paddingRight: 4 }}>
            {activitiesForSelectedDate.map((act, idx) => {
              const actorColor = SPECIALIST_COLOR[act.actor] || MUTED;
              const typeColor = act.type === "dm" ? G : act.type === "reply" ? "#8B5CF6" : act.type === "add" ? "#22C55E" : "#F59E0B";
              const timeStr = new Date(act.ts).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
              
              return (
                <div key={idx} style={{ borderLeft: `2px solid ${typeColor}`, paddingLeft: 10, paddingBottom: 4 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 4 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: TEXT }}>
                      <span style={{ color: actorColor }}>{act.actor}</span> logged <span style={{ color: typeColor }}>{act.title}</span> for <b style={{ color: G }}>{act.company}</b>
                    </span>
                    <span style={{ fontSize: 9, color: MUTED }}>{timeStr !== "Invalid Date" ? timeStr : ""}</span>
                  </div>
                  <p style={{ fontSize: 11, color: "#ccc", lineHeight: 1.5, marginTop: 4, whiteSpace: "pre-wrap", background: BG, padding: "6px 8px", borderRadius: 5, border: `1px solid ${BORDER}` }}>
                    {act.text}
                  </p>
                </div>
              );
            })}
            
            {activitiesForSelectedDate.length === 0 && (
              <div style={{ textAlign: "center", padding: "20px 0", color: MUTED, fontSize: 11 }}>
                No active events logged on {selectedActivityDate}. Use search above for another date!
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 3. This Week's Performance by Intern rollup */}
      <div className="dfq-card" style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 12, padding: "16px 18px", marginBottom: 14 }}>
        <div style={{ fontSize: 9, color: G, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
          <BarChart3 size={12} /> This Week — {weekStart} to {weekEnd} — By Intern
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 10 }}>
          {rollup.map(r => (
            <div key={r.name} style={{ background: SURFACE2, border: `1px solid ${SPECIALIST_COLOR[r.name]}30`, borderTop: `2px solid ${SPECIALIST_COLOR[r.name]}`, borderRadius: 8, padding: "12px 14px" }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: SPECIALIST_COLOR[r.name], marginBottom: 8, display: "flex", alignItems: "center", gap: 5 }}>
                <UserCheck size={13} /> {r.name}
              </div>
              <div style={{ fontSize: 11, color: "#ccc", display: "flex", flexDirection: "column", gap: 3 }}>
                <span>New WhatsApp conversations: <b style={{ color: TEXT }}>{r.newLeads}</b></span>
                <span>Follow-ups made this week: <b style={{ color: TEXT }}>{r.followUps}</b></span>
                <span>Replies logged from prospects: <b style={{ color: TEXT }}>{r.replies}</b></span>
                <span>Proposals sent to brands: <b style={{ color: TEXT }}>{r.proposals}</b></span>
                <span>Partnerships closed: <b style={{ color: "#22C55E" }}>{r.closed}</b></span>
              </div>
              <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${BORDER}`, fontSize: 10, color: MUTED }}>
                All-time context: {r.totalLeads} leads · {r.totalClosed} closed · {fmt(r.totalRevenue)} locked
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 4. Revenue Snapshot */}
      <div className="dfq-card" style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 12, padding: "16px 18px", marginBottom: 14 }}>
        <div style={{ fontSize: 9, color: G, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
          <DollarSign size={12} /> Business Revenue Pipeline Valuation
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8 }}>
          {[
            { label: "Guaranteed", value: revenue.guaranteed, color: "#22C55E" },
            { label: "Likely (60%+)", value: revenue.likely, color: G },
            { label: "Weighted (Probability-Adjusted)", value: revenue.weighted, color: "#8B5CF6" }
          ].map(r => (
            <div key={r.label} style={{ textAlign: "center", padding: "10px 8px", background: SURFACE2, borderRadius: 8, border: `1px solid ${BORDER}` }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: r.color }}>{fmt(r.value)}</div>
              <div style={{ fontSize: 9, color: MUTED, marginTop: 2 }}>{r.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* 5. Logs list with interactive filters */}
      <div className="dfq-card" style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 12, padding: "16px 18px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
          <div style={{ fontSize: 9, color: G, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", display: "flex", alignItems: "center", gap: 6 }}>
            <FileText size={12} /> Full Conversation Log View
          </div>
          <select
            value={fSpecialist}
            onChange={e => setFSpecialist(e.target.value)}
            style={{ ...iStyle, width: 170, cursor: "pointer" }}
          >
            <option value="All">All Interns</option>
            {specialists.map(s => <option key={s}>{s}</option>)}
          </select>
        </div>
        
        <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 600, overflowY: "auto" }}>
          {alphaSort(filteredLeads).map(l => (
            <div key={l.id} style={{ background: SURFACE2, border: `1px solid ${BORDER}`, borderRadius: 8, padding: "10px 12px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 6, marginBottom: l.dmText || l.prospectLatestResponse ? 6 : 0 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: TEXT }}>
                  {l.name || "—"} <span style={{ color: MUTED, fontWeight: 400 }}>{l.company}</span>
                </span>
                <div style={{ display: "flex", gap: 5 }}>
                  <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 4, background: `${STATUS_COLOR[l.status]}18`, border: `1px solid ${STATUS_COLOR[l.status]}40`, color: STATUS_COLOR[l.status], fontWeight: 700 }}>
                    {l.status}
                  </span>
                  <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 4, background: `${SPECIALIST_COLOR[l.assignedTo]}15`, border: `1px solid ${SPECIALIST_COLOR[l.assignedTo]}40`, color: SPECIALIST_COLOR[l.assignedTo], fontWeight: 700 }}>
                    {l.assignedTo}
                  </span>
                  {l.betaCandidate && (
                    <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 4, background: "rgba(250,204,21,0.1)", border: "1px solid rgba(250,204,21,0.3)", color: "#FACC15", fontWeight: 700 }}>
                      BETA
                    </span>
                  )}
                </div>
              </div>
              {l.dmText && <div style={{ fontSize: 10, color: MUTED2, marginBottom: 2 }}><b style={{ color: G }}>DM sent:</b> {l.dmText.slice(0, 140)}{l.dmText.length > 140 ? "…" : ""}</div>}
              {l.prospectLatestResponse && <div style={{ fontSize: 10, color: MUTED2 }}><b style={{ color: "#8B5CF6" }}>Latest replies:</b> {l.prospectLatestResponse.slice(0, 140)}{l.prospectLatestResponse.length > 140 ? "…" : ""}</div>}
            </div>
          ))}
          {filteredLeads.length === 0 && <div style={{ fontSize: 11, color: MUTED, textAlign: "center", padding: "14px 0" }}>No logged leads under this query.</div>}
        </div>
      </div>
    </div>
  );
}
