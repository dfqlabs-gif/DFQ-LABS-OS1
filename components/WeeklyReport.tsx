import { useState, useMemo } from "react";
import { Calendar, Search } from "lucide-react";
import React from "react";
import { Lead, Stats } from "../types";
import { 
  today, 
  addDays, 
  fmt, 
  calcRevenue, 
  SPECIALISTS, 
  SPECIALIST_COLOR, 
  specialistLabel,
  SURFACE, 
  SURFACE2, 
  BORDER, 
  MUTED, 
  TEXT, 
  getWeekKey
} from "../constants";

interface WeeklyReportProps {
  leads: Lead[];
  stats: Stats;
  revenue: any;
}

export function WeeklyReport({ leads }: WeeklyReportProps) {
  const [selectedWeek, setSelectedWeek] = useState(getWeekKey(new Date()));
  const [searchDate, setSearchDate] = useState(today());
  
  // Calculate date boundaries for selected week
  const weekStartEnd = useMemo(() => {
    const parts = selectedWeek.split("-W");
    const year = parts[0];
    const weekStr = parts[1];
    if (!year || !weekStr) return { start: today(), end: today() };
    const wNum = parseInt(weekStr, 10);
    const yNum = parseInt(year, 10);
    
    const jan1 = new Date(yNum, 0, 1);
    const dayMs = 86400000;
    const firstMonday = jan1.getDay() <= 1 ? 
      new Date(yNum, 0, 1 + (1 - jan1.getDay())) : 
      new Date(yNum, 0, 1 + (8 - jan1.getDay()));
    
    const start = new Date(firstMonday.getTime() + (wNum - 1) * 7 * dayMs);
    const end = new Date(start.getTime() + 6 * dayMs);
    
    return {
      start: start.toISOString().split("T")[0],
      end: end.toISOString().split("T")[0]
    };
  }, [selectedWeek]);

  // General counts for currently selected week
  const weekStats = useMemo(() => {
    const start = weekStartEnd.start;
    const end = weekStartEnd.end;
    
    const weekLeads = leads.filter(l => l.dateAdded >= start && l.dateAdded <= end);
    const weekFollowUps = leads.filter(l => l.lastContacted >= start && l.lastContacted <= end);
    const closedThisWeek = leads.filter(l => l.status === "Closed" && l.lastContacted >= start && l.lastContacted <= end);
    
    return {
      newLeads: weekLeads.length,
      followUps: weekFollowUps.length,
      closed: closedThisWeek.length,
      volume: weekLeads.length + weekFollowUps.length
    };
  }, [leads, weekStartEnd]);

  // Aggregate monthly performance
  const monthlyStats = useMemo(() => {
    const currentMonthPrefix = today().slice(0, 7); // e.g. "2026-07"
    const monthLeads = leads.filter(l => l.dateAdded.startsWith(currentMonthPrefix));
    const monthClosed = leads.filter(l => l.status === "Closed" && (l.lastContacted || "").startsWith(currentMonthPrefix));
    
    return {
      newLeads: monthLeads.length,
      closed: monthClosed.length,
      revenue: calcRevenue(monthClosed).guaranteed
    };
  }, [leads]);

  // Activity search results for specific selected date
  const searchedActivities = useMemo(() => {
    const results: any[] = [];
    leads.forEach(l => {
      // Find events matching exact date
      if (l.dateAdded === searchDate) {
        results.push({
          actor: l.assignedTo || "Unassigned",
          type: "add",
          title: "New Lead Added",
          company: l.company || l.name,
          ts: l.dateAdded,
          text: `Added new lead profile to queue under priority level ${l.priority}.`
        });
      }
      
      const logs = l.conversationLog || [];
      logs.forEach(log => {
        if (log.ts && log.ts.startsWith(searchDate)) {
          results.push({
            actor: log.by || l.assignedTo || "Unassigned",
            type: log.type,
            title: log.label || "Activity logged",
            company: l.company || l.name,
            ts: log.ts,
            text: log.text
          });
        }
      });
    });
    
    return results.sort((a, b) => b.ts.localeCompare(a.ts));
  }, [leads, searchDate]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* 1. Monthly Performance Banner */}
      <div className="dfq-card" style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 12, padding: "16px 18px" }}>
        <div style={{ fontSize: 9, color: MUTED, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 6 }}>
          Monthly Overview · {new Date().toLocaleDateString("en-GB", { month: "long", year: "numeric" })}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 8 }}>
          <div style={{ background: SURFACE2, padding: "10px 12px", borderRadius: 8, border: `1px solid ${BORDER}` }}>
            <div style={{ fontSize: 20, fontWeight: 900, color: "#fff" }}>{monthlyStats.newLeads}</div>
            <div style={{ fontSize: 9, color: MUTED, textTransform: "uppercase", marginTop: 2 }}>Monthly Leads Added</div>
          </div>
          <div style={{ background: SURFACE2, padding: "10px 12px", borderRadius: 8, border: `1px solid ${BORDER}` }}>
            <div style={{ fontSize: 20, fontWeight: 900, color: "#22C55E" }}>{monthlyStats.closed}</div>
            <div style={{ fontSize: 9, color: MUTED, textTransform: "uppercase", marginTop: 2 }}>Monthly Closed Deals</div>
          </div>
          <div style={{ background: SURFACE2, padding: "10px 12px", borderRadius: 8, border: `1px solid ${BORDER}` }}>
            <div style={{ fontSize: 20, fontWeight: 900, color: SPECIALIST_COLOR["Intern A"] }}>{fmt(monthlyStats.revenue)}</div>
            <div style={{ fontSize: 9, color: MUTED, textTransform: "uppercase", marginTop: 2 }}>Closed Revenue Locked</div>
          </div>
        </div>
      </div>

      {/* 2. Interactive Weekly Performance Rollup */}
      <div className="dfq-card" style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 12, padding: "16px 18px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
          <div>
            <div style={{ fontSize: 9, color: MUTED, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase" }}>WEEKLY PERFORMANCE AUDIT</div>
            <div style={{ fontSize: 13, fontWeight: 800, color: TEXT, marginTop: 2 }}>{weekStartEnd.start} to {weekStartEnd.end}</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 11, color: MUTED }}>Choose Week:</span>
            <input 
              type="week" 
              value={selectedWeek} 
              onChange={e => setSelectedWeek(e.target.value)} 
              style={{ background: SURFACE2, border: `1px solid ${BORDER}`, color: TEXT, borderRadius: 6, padding: "4px 8px", fontSize: 11, outline: "none" }}
            />
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8, marginBottom: 14 }}>
          <div style={{ background: SURFACE2, padding: "10px 12px", borderRadius: 8, border: `1px solid ${BORDER}` }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: TEXT }}>{weekStats.newLeads}</div>
            <div style={{ fontSize: 10, color: MUTED }}>New Conversations Created</div>
          </div>
          <div style={{ background: SURFACE2, padding: "10px 12px", borderRadius: 8, border: `1px solid ${BORDER}` }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: TEXT }}>{weekStats.followUps}</div>
            <div style={{ fontSize: 10, color: MUTED }}>Follow-Ups Completed</div>
          </div>
        </div>
        
        {/* Dynamic insights for selected week */}
        <div style={{ fontSize: 11, color: MUTED, background: SURFACE2, padding: "10px 12px", borderRadius: 8, border: `1px solid ${BORDER}`, lineHeight: 1.6 }}>
          💡 This week, your team started <b>{weekStats.newLeads}</b> new outreach conversations and logged <b>{weekStats.followUps}</b> touchpoints, closing <b>{weekStats.closed}</b> partnership spots. Keep conversations flowing on WhatsApp to lock in target conversions!
        </div>
      </div>

      {/* 3. Search Past Intern Activities - USER REQUESTED AUDIT CAPABILITY */}
      <div className="dfq-card" style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 12, padding: "16px 18px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
          <div>
            <div style={{ fontSize: 9, color: MUTED, fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase" }}>SEARCH INTERN WORK LOGS</div>
            <div style={{ fontSize: 13, fontWeight: 800, color: TEXT, marginTop: 2 }}>Audit Past Dates</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 4, background: SURFACE2, border: `1px solid ${BORDER}`, borderRadius: 6, padding: "2px 6px" }}>
            <Search size={11} color={MUTED} />
            <input 
              type="date" 
              value={searchDate}
              onChange={e => setSearchDate(e.target.value)}
              style={{ background: "none", border: "none", color: TEXT, fontSize: 11, outline: "none", width: 115 }}
            />
          </div>
        </div>
        
        <p style={{ fontSize: 11, color: MUTED, marginBottom: 14 }}>
          Enter any past date using the search bar above to audit team activities (such as outbound DMs, replies received, or lead adjustments) compiled on that day.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 300, overflowY: "auto", paddingRight: 4 }}>
          {searchedActivities.map((act, index) => {
            const isAdd = act.type === "add";
            const isDm = act.type === "dm";
            const isReply = act.type === "reply";
            const isStatusChange = act.type === "status_change";
            const typeColor = isAdd ? "#22C55E" : isDm ? "#3ECFDC" : isReply ? "#8B5CF6" : isStatusChange ? "#a855f7" : "#F59E0B";
            
            return (
              <div key={index} style={{ background: SURFACE2, border: `1px solid ${BORDER}`, borderLeft: `3px solid ${typeColor}`, padding: "10px 12px", borderRadius: 6 }}>
                <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 4, marginBottom: 4 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: SPECIALIST_COLOR[act.actor] || TEXT }}>{specialistLabel(act.actor)}</span>
                  <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 4, background: `${typeColor}15`, color: typeColor, fontWeight: 700 }}>{act.title}</span>
                </div>
                <div style={{ fontSize: 11, fontWeight: 600, color: TEXT, marginBottom: 4 }}>Brand: {act.company}</div>
                <p style={{ fontSize: 11, color: "#ccc", lineHeight: 1.5, margin: 0, whiteSpace: "pre-wrap" }}>{act.text}</p>
              </div>
            );
          })}
          
          {searchedActivities.length === 0 && (
            <div style={{ textAlign: "center", padding: "50px 0", color: MUTED }}>
              No activities found for this date.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
export default WeeklyReport;
