import { StrictMode } from 'react';
import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { 
  Flame, Sprout, Circle, Ticket, Calendar, Clock3, 
  UserCheck, Plus, Shield, Search, Upload, Download
} from "lucide-react";

import { Lead, Stats } from "./types";
import { 
  G, G_DIM, G_BORDER, BG, SURFACE, SURFACE2, BORDER, BORDER2, TEXT, MUTED, MUTED2, 
  BETA_SPOTS_TOTAL, BETA_MONTH_LABEL, STATUSES, STATUS_COLOR, 
  BUCKETS, BUCKET_COLOR, today, addDays, nowISO, daysSince, 
  hoursSince, hoursUntil, touchpointDate, fmt, leadLabel, alphaSort, effectiveDue, 
  calcStreak, getXPLevel, calcRevenue, calcWeeklyTargets, scoreLead, ruleBasedBucket, 
  findDuplicateConflict, autoAssignSpecialist, SESSION_KEY, SESSION_IDLE_MS, 
  ROLE_ACCESS, classifyLead, detectMeetingRequest, meetingQualified, getWeekKey,
  DAILY_FOLLOWUP_CAP, RELATIONSHIP_RENEWAL_DAYS, RELATIONSHIP_WARNING_DAYS, RESPONSE_GUARD_HOURS, MEETING_WINDOW_HOURS,
  iStyle, Bdg, BucketBdg, BetaBdg, AssignedBdg, CopyBtn, Celebration,
  SPECIALIST_COLOR, SPECIALISTS, SERVICE_VALUE, specialistLabel
} from "./constants";
import { BUSINESS_CONTEXT, callClaude } from "./prompts";
import { runAI, buildFollowUpPrompt, runFollowUpReply, runQuickReply, runProspectSummary } from "./aiEngine";

// Import modular subcomponents
import { AICoach } from "./components/AICoach";
import { TeamTab } from "./components/TeamTab";
import { LeadModal, ConversationHistoryPanel } from "./components/LeadModal";
import { WeeklyReport } from "./components/WeeklyReport";
import { CEOTab } from "./components/CEOTab";
import { AIGateway } from "./components/AIGateway";
import { MergeLeadModal } from "./components/MergeLeadModal";
import { DuplicateReviewPanel } from "./components/DuplicateReviewPanel";
import { AskAI } from "./components/AskAI";

// Define general global style utility
const SectionLabel = ({ icon: Icon, children }: any) => (
  <div style={{ fontSize: 9, color: G, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
    {Icon && <Icon size={12} />}{children}
  </div>
);

// ----------------------------------------------------
// RECENT LEADS PANEL
// ----------------------------------------------------

function RecentLeadsPanel({ leads, onEdit }: { leads: Lead[], onEdit: (l: Lead) => void }) {
  const [filter, setFilter] = useState<"today" | "3days" | "week" | "all">("week");
  const [search, setSearch] = useState("");

  const cutoff = useMemo(() => {
    if (filter === "today") return today();
    if (filter === "3days") return addDays(-3);
    if (filter === "week") return addDays(-7);
    return null;
  }, [filter]);

  const FILTERS: { key: typeof filter; label: string }[] = [
    { key: "today", label: "Today" },
    { key: "3days", label: "Last 3 Days" },
    { key: "week", label: "Last 7 Days" },
    { key: "all", label: "All Time" },
  ];

  const q = search.trim().toLowerCase();
  const sorted = useMemo(() =>
    [...leads]
      .filter(l => !cutoff || (l.dateAdded && l.dateAdded >= cutoff))
      .filter(l => !q || (l.name || "").toLowerCase().includes(q) || (l.company || "").toLowerCase().includes(q) || (l.assignedTo || "").toLowerCase().includes(q))
      .sort((a, b) => (b.dateAdded || "").localeCompare(a.dateAdded || "")),
    [leads, cutoff, q]
  );

  const [showAll, setShowAll] = useState(false);
  const PAGE = 15;
  const visible = showAll ? sorted : sorted.slice(0, PAGE);

  return (
    <div style={{ maxWidth: 900 }}>
      {/* Header */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, color: MUTED, letterSpacing: "0.08em", textTransform: "uppercase" }}>
          {new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}
        </div>
        <div style={{ fontSize: 20, fontWeight: 800, color: TEXT, marginTop: 4 }}>
          Recently Added Leads
        </div>
      </div>

      {/* Filter chips + search row */}
      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
        {FILTERS.map(f => {
          const cnt = leads.filter(l => {
            const c = f.key === "today" ? today() : f.key === "3days" ? addDays(-3) : f.key === "week" ? addDays(-7) : null;
            return !c || (l.dateAdded && l.dateAdded >= c);
          }).length;
          const active = filter === f.key;
          return (
            <button key={f.key} onClick={() => { setFilter(f.key); setShowAll(false); }}
              style={{ background: active ? G_DIM : "transparent", border: `1px solid ${active ? G_BORDER : BORDER}`, color: active ? G : MUTED, borderRadius: 20, padding: "7px 14px", fontSize: 12, fontWeight: active ? 700 : 500, cursor: "pointer" }}>
              {f.label} ({cnt})
            </button>
          );
        })}
        <div style={{ position: "relative", flex: "1 1 200px", minWidth: 160 }}>
          <Search size={12} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: MUTED, pointerEvents: "none" }} />
          <input
            value={search}
            onChange={e => { setSearch(e.target.value); setShowAll(false); }}
            placeholder="Search by name, company or specialist…"
            style={{ ...iStyle, paddingLeft: 30, width: "100%", boxSizing: "border-box" }}
          />
        </div>
      </div>

      {/* Count line */}
      {sorted.length > 0 && (
        <div style={{ fontSize: 10, color: MUTED, marginBottom: 10 }}>
          {sorted.length} lead{sorted.length !== 1 ? "s" : ""}
          {filter !== "all" && ` added ${filter === "today" ? "today" : filter === "3days" ? "in the last 3 days" : "in the last 7 days"}`}
          {q && ` matching "${q}"`}
        </div>
      )}

      {sorted.length === 0 ? (
        <div style={{ textAlign: "center", padding: "48px 0", color: MUTED, background: SURFACE, borderRadius: 12, border: `1px solid ${BORDER}` }}>
          <div style={{ fontSize: 13, color: TEXT, fontWeight: 600, marginBottom: 4 }}>No leads found</div>
          <div style={{ fontSize: 11 }}>Try a different time range or clear the search.</div>
        </div>
      ) : (
        <>
          {/* Table header */}
          <div className="leads-grid-header" style={{ display: "grid", gridTemplateColumns: "2fr 1.5fr 1fr 1fr 1fr auto", gap: 8, padding: "6px 14px", marginBottom: 4 }}>
            {["Contact / Company", "Service", "Status", "Specialist", "Added", ""].map((h, i) => (
              <div key={i} style={{ fontSize: 9, color: MUTED2, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" }}>{h}</div>
            ))}
          </div>

          {/* Rows */}
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            {visible.map(l => {
              const isToday = l.dateAdded === today();
              const isYesterday = l.dateAdded === addDays(-1);
              const dateLabel = isToday ? "Today" : isYesterday ? "Yesterday" : l.dateAdded || "—";
              return (
                <div key={l.id} className="dfq-card leads-grid-row" style={{ background: SURFACE, border: `1px solid ${isToday ? G_BORDER : BORDER}`, borderLeft: `3px solid ${isToday ? G : STATUS_COLOR[l.status] || BORDER}`, borderRadius: 10, padding: "10px 14px", display: "grid", gridTemplateColumns: "2fr 1.5fr 1fr 1fr 1fr auto", gap: 8, alignItems: "center" }}>
                  {/* Name / Company */}
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 13, color: "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{l.name || "—"}</div>
                    <div style={{ fontSize: 10, color: MUTED, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{l.company || "—"}</div>
                  </div>
                  {/* Service */}
                  <div style={{ fontSize: 10, color: MUTED2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{l.service || "—"}</div>
                  {/* Status */}
                  <div><Bdg text={l.status} color={STATUS_COLOR[l.status]} solid /></div>
                  {/* Specialist */}
                  <div style={{ fontSize: 10, color: MUTED }}>{l.assignedTo && l.assignedTo !== "Unassigned" ? l.assignedTo : <span style={{ color: "#EF4444" }}>Unassigned</span>}</div>
                  {/* Date */}
                  <div style={{ fontSize: 10, color: isToday ? G : MUTED, fontWeight: isToday ? 700 : 400 }}>{dateLabel}</div>
                  {/* Edit */}
                  <button onClick={() => onEdit(l)}
                    style={{ background: G_DIM, color: G, border: `1px solid ${G_BORDER}`, borderRadius: 6, padding: "5px 12px", fontSize: 11, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>
                    Edit
                  </button>
                </div>
              );
            })}
          </div>

          {/* Show more / less */}
          {sorted.length > PAGE && (
            <div style={{ textAlign: "center", marginTop: 12 }}>
              <button onClick={() => setShowAll(p => !p)}
                style={{ background: "transparent", border: `1px solid ${BORDER}`, color: MUTED, borderRadius: 6, padding: "7px 20px", fontSize: 11, cursor: "pointer" }}>
                {showAll ? `Show fewer` : `Show all ${sorted.length} leads ↓`}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ----------------------------------------------------
// EXTRACTED SUBCOMPONENTS FOR MISSION CONTROL WORKSPACE
// ----------------------------------------------------

function BetaTrackerSummary({ leads, onEdit }: { leads: Lead[], onEdit: (l: Lead) => void }) {
  const candidates = leads.filter(l => l.betaCandidate);
  // A beta candidate fills a spot the moment they're marked — whether closed or still in pipeline.
  // Closed candidates count first (they're fully committed); open candidates fill remaining spots.
  const closedCandidates = candidates.filter(l => l.status === "Closed");
  const openCandidates = candidates.filter(l => !["Closed", "Lost"].includes(l.status)).sort((a, b) => scoreLead(b) - scoreLead(a));
  const filled = [...closedCandidates, ...openCandidates].slice(0, BETA_SPOTS_TOTAL);
  const inPlay = openCandidates;
  const spotsLeft = Math.max(0, BETA_SPOTS_TOTAL - filled.length);
  const isFull = filled.length >= BETA_SPOTS_TOTAL;
  const now = new Date();
  const isJuly = now.toISOString().slice(0, 7) === "2026-07";
  const daysLeftInMonth = isJuly ? Math.max(0, Math.ceil((new Date(2026, 7, 1).getTime() - now.getTime()) / 86400000)) : null;

  return (
    <div className="dfq-card" style={{ background: SURFACE, border: `1px solid ${isFull ? "rgba(34,197,94,0.35)" : "rgba(250,204,21,0.3)"}`, borderRadius: 12, padding: "16px 18px", marginBottom: 14 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, flexWrap: "wrap", gap: 6 }}>
        <SectionLabel icon={Ticket}>Beta Spot Tracker — {BETA_MONTH_LABEL}</SectionLabel>
        {isJuly && !isFull && <span style={{ fontSize: 10, color: "#FACC15" }}>{daysLeftInMonth} days left in July</span>}
      </div>
      <div className="beta-spots-row" style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        {Array.from({ length: BETA_SPOTS_TOTAL }).map((_, i) => {
          const taken = i < filled.length;
          return (
            <div key={i} style={{ flex: 1, textAlign: "center", padding: "12px 8px", borderRadius: 8, background: taken ? "rgba(34,197,94,0.08)" : "rgba(250,204,21,0.06)", border: `1px solid ${taken ? "rgba(34,197,94,0.35)" : "rgba(250,204,21,0.25)"}` }}>
              <div style={{ display: "flex", justifyContent: "center" }}>{taken ? <Circle size={18} color="#22C55E" style={{ fill: "#22C55E" }} /> : <Circle size={18} color="#FACC15" />}</div>
              <div style={{ fontSize: 9, color: taken ? "#22C55E" : "#FACC15", fontWeight: 700, marginTop: 4 }}>{taken ? (filled[i].name || filled[i].company) : "OPEN"}</div>
            </div>
          );
        })}
      </div>
      {isFull ? (
        <div style={{ padding: "10px 14px", background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.3)", borderRadius: 8, fontSize: 11, fontWeight: 700, color: "#22C55E", textAlign: "center" }}>All 3 beta spots filled. Stop offering this incentive — it's done its job, switch new candidates to standard pricing.</div>
      ) : (
        <div style={{ padding: "10px 14px", background: "rgba(250,204,21,0.06)", border: "1px solid rgba(250,204,21,0.25)", borderRadius: 8, fontSize: 11, color: "#FACC15", fontWeight: 600, marginBottom: inPlay.length ? 12 : 0 }}>
          {spotsLeft} spot{spotsLeft !== 1 ? "s" : ""} open. Use the real scarcity number in outreach — "{spotsLeft} of {BETA_SPOTS_TOTAL} beta spots left this month" is honest urgency, not manufactured.
        </div>
      )}
      {inPlay.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 9, color: MUTED, fontWeight: 700, letterSpacing: "0.08em", marginBottom: 6 }}>CANDIDATES IN PIPELINE ({inPlay.length})</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            {inPlay.map(l => (
              <div key={l.id} onClick={() => onEdit(l)} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 10px", background: SURFACE2, border: `1px solid ${BORDER}`, borderRadius: 6, cursor: "pointer" }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: "#fff" }}>{l.name || l.company}</span>
                <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
                  <Bdg text={l.status} color={STATUS_COLOR[l.status]} solid />
                  {l.aiBucket && <BucketBdg bucket={l.aiBucket} />}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StrategicPathsSummary({ leads }: { leads: Lead[] }) {
  const revenue = calcRevenue(leads);
  const gap = Math.max(0, 10000000 - revenue.guaranteed);
  const tierMix = [
    { tier: "Advanced only", price: 1000000, needed: Math.ceil(gap / 1000000), color: "#22C55E" },
    { tier: "Growth only", price: 500000, needed: Math.ceil(gap / 500000), color: G },
    { tier: "Starter only", price: 200000, needed: Math.ceil(gap / 200000), color: "#F59E0B" },
    { tier: "Mixed (2 Adv + 3 Growth/round)", price: 3500000, needed: Math.ceil(gap / 3500000) * 3, color: "#8B5CF6" },
  ];
  return (
    <div className="dfq-card" style={{ background: SURFACE, border: `1px solid ${BORDER2}`, borderRadius: 12, padding: "16px 18px", marginBottom: 14 }}>
      <SectionLabel icon={Compass}>Strategic Paths to ₦10M</SectionLabel>
      <div style={{ fontSize: 11, color: MUTED, marginBottom: 10 }}>Different client mixes that close the {fmt(gap)} gap. Pick a lane, don't chase all four.</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        {tierMix.map(t => (
          <div key={t.tier} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 12px", background: SURFACE2, borderRadius: 7, border: `1px solid ${BORDER}` }}>
            <span style={{ fontSize: 11, color: MUTED }}>{t.tier}</span>
            <span style={{ fontSize: 13, fontWeight: 800, color: t.color }}>{t.needed} client{t.needed !== 1 ? "s" : ""}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const Compass = ({ size, color }: any) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size || 16} height={size || 16} viewBox="0 0 24 24" fill="none" stroke={color || "currentColor"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/></svg>
);

function GrowthStrategySummary({ leads }: { leads: Lead[] }) {
  const [output, setOutput] = useState("");
  const [loading, setLoading] = useState(false);
  
  const run = async () => {
    setLoading(true);
    setOutput("");
    const revenue = calcRevenue(leads);
    const wt = calcWeeklyTargets(leads);
    const betaFilled = leads.filter(l => l.betaCandidate && l.status === "Closed").length;
    const stageBreakdown = STATUSES.map(s => `${s}=${leads.filter(l => l.status === s).length}`).join(", ");
    const bucketBreakdown = BUCKETS.map(b => `${b}=${leads.filter(l => l.aiBucket === b).length}`).join(", ");
    
    const prompt = `Act as Chief Revenue Intelligence Officer. Analyze the FULL pipeline below and recommend a growth strategy for DFQLabs as a business.
PIPELINE SNAPSHOT: Stages: ${stageBreakdown}. AI buckets: ${bucketBreakdown}. Guaranteed: ${fmt(revenue.guaranteed)}. Weighted: ${fmt(revenue.weighted)}. Gap to ₦10M: ${fmt(wt.gap)}. Weeks left: ${wt.weeksLeft}. Beta program spots closed: ${betaFilled}/3.

Give Alex a strategic growth plan focused on optimized WhatsApp outbound funnel (Audit WATCH agreed, booked CALLS, and commitment fee closing). Format:
BOTTLENECK DIAGNOSIS: [ Funnel leak analysis ]
HIGHEST-LEVERAGE ACTION: [ One strategic move to multiply conversions this week ]
BETA PROGRAM TACTIC: [ Spot tracking advice ]
30-DAY CRITICAL HABIT: [ 1 concise sentence focus ]`;
    
    try {
      const text = await callClaude(BUSINESS_CONTEXT, prompt, 1100);
      setOutput(text);
    } catch (e: any) {
      setOutput("Error: " + e.message);
    }
    setLoading(false);
  };

  return (
    <div className="dfq-card" style={{ background: SURFACE, border: `1px solid ${G_BORDER}`, borderRadius: 12, padding: "16px 18px", marginBottom: 14 }}>
      <SectionLabel icon={Compass}>Growth Strategy — Full Pipeline Analysis</SectionLabel>
      <div style={{ fontSize: 11, color: MUTED, marginBottom: 10 }}>AI reads every stage and re-evaluates conversion momentum to outline growth strategies.</div>
      <button onClick={run} disabled={loading || leads.length === 0} style={{ background: loading ? SURFACE2 : G, color: loading ? MUTED : "#000", border: "none", borderRadius: 6, padding: "9px 20px", fontWeight: 800, fontSize: 12, cursor: loading || leads.length === 0 ? "not-allowed" : "pointer" }}>
        {loading ? "Analyzing full pipeline…" : "Generate Growth Strategy →"}
      </button>
      {output && <div style={{ marginTop: 14, background: SURFACE2, border: `1px solid ${BORDER}`, borderRadius: 8, padding: "14px 16px" }}><div style={{ fontSize: 12, lineHeight: 1.85, color: "#ccc", whiteSpace: "pre-wrap", marginBottom: 10 }}>{output}</div><CopyBtn text={output} /></div>}
    </div>
  );
}

function RevenueGapSummary({ leads }: { leads: Lead[] }) {
  const wt = calcWeeklyTargets(leads);
  const pct = Math.min(100, Math.round((wt.closedRevenue / 10000000) * 100));
  return (
    <div className="dfq-card" style={{ background: SURFACE, border: `1px solid ${G_BORDER}`, borderRadius: 12, padding: "16px 18px", marginBottom: 14 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
        <SectionLabel icon={Calendar}>₦10M December Target</SectionLabel>
        <span style={{ fontSize: 11, color: MUTED }}>{wt.weeksLeft} weeks left</span>
      </div>
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 10 }}>
        <div style={{ flex: 1 }}>
          <div style={{ height: 10, background: "#111", borderRadius: 5, overflow: "hidden", border: `1px solid ${BORDER}` }}>
            <div style={{ width: `${pct}%`, height: "100%", background: `linear-gradient(90deg,${G},#22C55E)`, borderRadius: 5, transition: "width 0.5s" }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
            <span style={{ fontSize: 10, color: G, fontWeight: 700 }}>{fmt(wt.closedRevenue)} locked</span>
            <span style={{ fontSize: 10, color: MUTED }}>{pct}% of ₦10M</span>
          </div>
        </div>
      </div>
      <div style={{ background: "#0a0a0a", border: `1px solid ${BORDER}`, borderRadius: 8, padding: "12px 14px", marginBottom: 12 }}>
        <div style={{ fontSize: 22, fontWeight: 900, color: "#EF4444", marginBottom: 2 }}>{fmt(wt.gap)}</div>
        <div style={{ fontSize: 11, color: MUTED }}>still needed to hit ₦10M/month by December</div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
        <div style={{ background: SURFACE2, borderRadius: 8, padding: "10px 12px", border: `1px solid ${BORDER}` }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: "#F97316" }}>{wt.callsNeededPerWeek}</div>
          <div style={{ fontSize: 10, color: TEXT, fontWeight: 600 }}>Discovery calls/week</div>
          <div style={{ fontSize: 9, color: MUTED, marginTop: 2 }}>at {Math.round(wt.convRate * 100)}% close rate</div>
        </div>
        <div style={{ background: SURFACE2, borderRadius: 8, padding: "10px 12px", border: `1px solid ${BORDER}` }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: "#8B5CF6" }}>{wt.dmsNeededPerWeek}</div>
          <div style={{ fontSize: 10, color: TEXT, fontWeight: 600 }}>New outbound DMs/week</div>
          <div style={{ fontSize: 9, color: MUTED, marginTop: 2 }}>at {Math.round(wt.BOOKING_RATE * 100)}% conversion</div>
        </div>
      </div>
    </div>
  );
}

// 24-Hour response guard UI
function ResponseGuardSummary({ leads, onQuickContact, onEdit }: { leads: Lead[], onQuickContact: (l: Lead) => void, onEdit: (l: Lead) => void }) {
  const overdue = leads.filter(l => !["Closed", "Lost"].includes(l.status) && l.awaitingReplySince && hoursSince(l.awaitingReplySince) >= RESPONSE_GUARD_HOURS);
  const ranked = [...overdue].sort((a, b) => {
    const va = SERVICE_VALUE[a.service] || 0, vb = SERVICE_VALUE[b.service] || 0;
    const ia = { Hot: 3, Warm: 2, Nurture: 1, Cold: 0, Dead: -1 }[a.aiBucket || ""] || 0;
    const ib = { Hot: 3, Warm: 2, Nurture: 1, Cold: 0, Dead: -1 }[b.aiBucket || ""] || 0;
    if (ib !== ia) return ib - ia;
    if (vb !== va) return vb - va;
    return hoursSince(b.awaitingReplySince) - hoursSince(a.awaitingReplySince);
  });
  const [outputs, setOutputs] = useState<Record<string, string>>({});
  const [steps, setSteps] = useState<Record<string, string>>({});
  const [summaries, setSummaries] = useState<Record<string, string>>({});

  // Step 1 — read the thread and summarise where the prospect is for the specialist to verify.
  const startGen = async (lead: Lead) => {
    setSteps(p => ({ ...p, [lead.id]: 'summarizing' }));
    setSummaries(p => ({ ...p, [lead.id]: '' }));
    setOutputs(p => ({ ...p, [lead.id]: '' }));
    try {
      const summary = await runProspectSummary(lead);
      setSummaries(p => ({ ...p, [lead.id]: summary }));
      setSteps(p => ({ ...p, [lead.id]: 'awaiting-confirm' }));
    } catch {
      setSteps(p => ({ ...p, [lead.id]: 'idle' }));
    }
  };

  // Step 2 — specialist confirmed; generate the actual reply.
  const confirmGen = async (lead: Lead) => {
    setSteps(p => ({ ...p, [lead.id]: 'generating' }));
    try {
      const text = await runQuickReply(lead, Math.floor(hoursSince(lead.awaitingReplySince)));
      setOutputs(p => ({ ...p, [lead.id]: text }));
    } catch (e: any) {
      setOutputs(p => ({ ...p, [lead.id]: "Error: " + e.message }));
    }
    setSteps(p => ({ ...p, [lead.id]: 'idle' }));
  };

  const cancelGen = (lead: Lead) => {
    setSteps(p => ({ ...p, [lead.id]: 'idle' }));
    setSummaries(p => ({ ...p, [lead.id]: '' }));
  };

  if (ranked.length === 0) return null;
  return (
    <div className="dfq-card" style={{ background: SURFACE, border: "1px solid rgba(239,68,68,0.4)", borderRadius: 12, padding: "16px 18px", marginBottom: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
        <span className="pulse" style={{ width: 8, height: 8, borderRadius: "50%", background: "#EF4444" }} />
        <SectionLabel icon={Clock3}>24-Hour Response Guard ({ranked.length})</SectionLabel>
      </div>
      <div style={{ fontSize: 11, color: MUTED, marginBottom: 10 }}>Active leads awaiting replies from our end. Ground responses in human dialogue.</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {ranked.map(l => {
          const wait = Math.floor(hoursSince(l.awaitingReplySince));
          const dm = outputs[l.id];
          const step = steps[l.id] || 'idle';
          const summary = summaries[l.id];
          const busy = step === 'summarizing' || step === 'generating';
          return (
            <div key={l.id} style={{ background: SURFACE2, border: "1px solid rgba(239,68,68,0.25)", borderLeft: "3px solid #EF4444", borderRadius: 10, overflow: "hidden" }}>
              <div style={{ padding: "10px 14px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 13, color: "#fff" }}>{l.name || l.company} <BucketBdg bucket={l.aiBucket} /> <AssignedBdg who={l.assignedTo} /></div>
                  <div style={{ fontSize: 10, color: "#EF4444", marginTop: 2 }}>Waiting {wait}h · {fmt(SERVICE_VALUE[l.service] || 0)} value · {l.status}</div>
                </div>
                <div style={{ display: "flex", gap: 6, flexShrink: 0, flexWrap: "wrap" }}>
                  <button onClick={() => onQuickContact(l)} style={{ background: "rgba(34,197,94,0.1)", color: "#22C55E", border: "1px solid rgba(34,197,94,0.3)", borderRadius: 6, padding: "6px 11px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>✓ Replied</button>
                  <button onClick={() => startGen(l)} disabled={busy || step === 'awaiting-confirm'} style={{ background: busy ? SURFACE : "rgba(239,68,68,0.1)", color: busy ? MUTED : "#EF4444", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 6, padding: "6px 12px", fontSize: 11, fontWeight: 700, cursor: busy ? "not-allowed" : "pointer" }}>
                    {step === 'summarizing' ? "Reading thread…" : step === 'generating' ? "Drafting…" : "Suggest Reply →"}
                  </button>
                  <button onClick={() => onEdit(l)} style={{ background: "transparent", border: `1px solid ${BORDER}`, color: MUTED, borderRadius: 6, padding: "6px 9px", fontSize: 11, cursor: "pointer" }}>Edit</button>
                </div>
              </div>

              {/* Step 1 — show prospect summary for specialist to confirm */}
              {step === 'awaiting-confirm' && summary && (
                <div style={{ padding: "12px 14px", background: "rgba(62,207,220,0.04)", borderTop: `1px solid ${BORDER}` }}>
                  <div style={{ fontSize: 9, color: G, fontWeight: 700, letterSpacing: "0.1em", marginBottom: 8 }}>WHERE IS THIS PROSPECT?</div>
                  <div style={{ fontSize: 12, color: "#ccc", lineHeight: 1.78, whiteSpace: "pre-wrap", marginBottom: 10 }}>{summary}</div>
                  <div style={{ fontSize: 11, color: MUTED2, marginBottom: 10 }}>Does this match? If yes, the AI will draft a reply that moves them forward.</div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={() => confirmGen(l)} style={{ background: "rgba(34,197,94,0.12)", color: "#22C55E", border: "1px solid rgba(34,197,94,0.35)", borderRadius: 6, padding: "7px 16px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>Yes — Generate Reply</button>
                    <button onClick={() => cancelGen(l)} style={{ background: "transparent", border: `1px solid ${BORDER}`, color: MUTED, borderRadius: 6, padding: "7px 12px", fontSize: 11, cursor: "pointer" }}>Cancel</button>
                  </div>
                </div>
              )}

              {/* Step 2 — generated reply */}
              {dm && step === 'idle' && (
                <div style={{ padding: "12px 14px", background: SURFACE2, borderTop: `1px solid ${BORDER}` }}>
                  <div style={{ fontSize: 12, lineHeight: 1.85, color: "#ccc", whiteSpace: "pre-wrap", marginBottom: 10 }}>{dm}</div>
                  <CopyBtn text={dm} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MeetingIntelligenceSummary({ leads, onSave }: { leads: Lead[], onSave: (l: Lead) => void }) {
  const upcoming = leads.filter(l => !["Closed", "Lost"].includes(l.status) && l.meetingScheduledAt && hoursUntil(l.meetingScheduledAt) <= MEETING_WINDOW_HOURS && hoursUntil(l.meetingScheduledAt) >= -1)
    .sort((a, b) => new Date(a.meetingScheduledAt).getTime() - new Date(b.meetingScheduledAt).getTime());
  const [outputs, setOutputs] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState<Record<string, boolean>>({});

  const gen = async (lead: Lead) => {
    setLoading(p => ({ ...p, [lead.id]: true }));
    setOutputs(p => ({ ...p, [lead.id]: "" }));
    try {
      const text = await callClaude(BUSINESS_CONTEXT, `Build a full meeting preparation brief for a call happening within 24 hours. Analyze notes, client archetypes, and prior messages to create a solid tactical strategy.\n\nLead: ${lead.name || lead.company}. Company: ${lead.company}. Client archetype: ${lead.clientType}. Target service: ${lead.service}. Meeting time: ${new Date(lead.meetingScheduledAt).toLocaleString("en-GB")}.\nDM thread: ${lead.dmText}\nTheir replies: ${lead.prospectLatestResponse || lead.prospectInitialResponse}\nInternal logs: ${lead.notes}`, 1200);
      setOutputs(p => ({ ...p, [lead.id]: text }));
    } catch (e: any) {
      setOutputs(p => ({ ...p, [lead.id]: "Error: " + e.message }));
    }
    setLoading(p => ({ ...p, [lead.id]: false }));
  };

  const saveNote = (lead: Lead, text: string) => onSave({ ...lead, meetingPrepNote: text });

  if (upcoming.length === 0) return null;
  return (
    <div className="dfq-card" style={{ background: SURFACE, border: "1px solid rgba(249,115,22,0.35)", borderRadius: 12, padding: "16px 18px", marginBottom: 14 }}>
      <SectionLabel icon={Calendar}>Meeting Intelligence — Next 24 Hours</SectionLabel>
      <div style={{ fontSize: 11, color: MUTED, marginBottom: 10 }}>Action maps compiled automatically for upcoming discovery calls inside the 24-hour bracket.</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {upcoming.map(l => {
          const out = outputs[l.id] || l.meetingPrepNote;
          const isLoad = loading[l.id];
          const when = new Date(l.meetingScheduledAt);
          return (
            <div key={l.id} style={{ background: SURFACE2, border: "1px solid rgba(249,115,22,0.25)", borderLeft: "3px solid #F97316", borderRadius: 10, overflow: "hidden" }}>
              <div style={{ padding: "10px 14px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 13, color: "#fff" }}>{l.name || l.company} {l.betaCandidate && <BetaBdg />} <AssignedBdg who={l.assignedTo} /></div>
                  <div style={{ fontSize: 10, color: "#F97316", marginTop: 2 }}>{when.toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} · {l.service}</div>
                </div>
                <button onClick={() => gen(l)} disabled={isLoad} style={{ background: isLoad ? SURFACE : "rgba(249,115,22,0.1)", color: isLoad ? MUTED : "#F97316", border: "1px solid rgba(249,115,22,0.3)", borderRadius: 6, padding: "6px 12px", fontSize: 11, fontWeight: 700, cursor: isLoad ? "not-allowed" : "pointer" }}>
                  {isLoad ? "Building…" : out ? "Regenerate Prep →" : "Generate Prep Package →"}
                </button>
              </div>
              {out && (
                <div style={{ padding: "12px 14px", borderTop: `1px solid ${BORDER}`, background: SURFACE }}>
                  <div style={{ fontSize: 9, color: "#F97316", fontWeight: 700, letterSpacing: "0.1em", marginBottom: 8 }}>FULL PREP PACKAGE</div>
                  <div style={{ fontSize: 12, color: "#ccc", lineHeight: 1.8, whiteSpace: "pre-wrap", marginBottom: 10 }}>{out}</div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <CopyBtn text={out} />
                    <button onClick={() => saveNote(l, out)} style={{ background: "rgba(34,197,94,0.1)", color: "#22C55E", border: "1px solid rgba(34,197,94,0.3)", borderRadius: 5, padding: "5px 12px", fontSize: 10, fontWeight: 700, cursor: "pointer" }}>Save to Lead</button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function NonNegotiablesSummary({ leads, stats, onPersist, onQuickContact }: { leads: Lead[], stats: Stats, onPersist: (s: Stats) => void, onQuickContact: (l: Lead) => void }) {
  const hotLead = leads.find(l => l.status === "Proposal Sent" && daysSince(l.lastContacted) >= 1);
  const callBooked = leads.find(l => l.status === "Discovery Call Booked" && l.lastContacted !== today());
  const topLead = leads.filter(l => !["Closed", "Lost"].includes(l.status) && l.lastContacted !== today()).sort((a, b) => scoreLead(b) - scoreLead(a))[0];
  const replyPending = leads.find(l => l.status === "Replied" && daysSince(l.lastContacted) >= 2);

  const rawTasks = [
    hotLead && { id: "fu-proposal", label: `Follow up ${hotLead.name || hotLead.company}'s proposal`, icon: Flame, color: "#EF4444", xp: 30, lead: hotLead, reason: `Proposal sent ${daysSince(hotLead.lastContacted)} day(s) ago with no contact since.` },
    callBooked && { id: "prep-call", label: `Prep for ${callBooked.name || callBooked.company} discovery call`, icon: Clock3, color: "#F97316", xp: 25, reason: "A discovery call is booked and no prep brief has been generated yet." },
    topLead && { id: "dm-top", label: `Send value DM to ${topLead.name || topLead.company}`, icon: Flame, color: G, xp: 25, lead: topLead, reason: `Highest scoring active lead with no contact logged today (score: ${scoreLead(topLead)}).` },
    replyPending && { id: "nurture", label: `Nurture ${replyPending.name || replyPending.company} — they replied, now convert`, icon: Sprout, color: "#8B5CF6", xp: 20, lead: replyPending, reason: `Prospect replied ${daysSince(replyPending.lastContacted)} day(s) ago. Thread has gone quiet.` }
  ].filter(Boolean) as any[];

  const tasks = rawTasks.length > 0 ? rawTasks : [
    { id: "prospect", label: "Start 3 new conversations with real estate brands", icon: Circle, color: G, xp: 25, reason: "Feed the top of the funnel to lock future discovery calls." },
    { id: "review-pipeline", label: "Review pipeline and update every lead status", icon: Circle, color: "#8B5CF6", xp: 15, reason: "Stale statuses and notes feed bad data to the AI classifier." }
  ];

  const todayKey = `nnd-${today()}`;
  const [done, setDone] = useState<Set<string>>(() => {
    try {
      const raw = stats.nnd || {};
      return new Set(raw[todayKey] || []);
    } catch {
      return new Set();
    }
  });
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggleReason = (id: string, e: any) => {
    e.stopPropagation();
    setExpanded(prev => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };

  const handleToggle = (id: string) => {
    const updated = new Set(done);
    if (updated.has(id)) {
      updated.delete(id);
    } else {
      updated.add(id);
    }
    setDone(updated);
    
    const nnd = { ...(stats.nnd || {}), [todayKey]: Array.from(updated) as string[] };
    const task = tasks.find(t => t.id === id);
    const xpDelta = updated.has(id) ? (task?.xp || 0) : -(task?.xp || 0);
    
    onPersist({
      ...stats,
      nnd,
      xp: Math.max(0, (stats.xp || 0) + xpDelta)
    });
  };

  const allDone = tasks.every(t => done.has(t.id));
  const xpEarned = tasks.filter(t => done.has(t.id)).reduce((s, t) => s + (t.xp || 0), 0);

  return (
    <div className="dfq-card" style={{ background: SURFACE, border: `2px solid ${allDone ? "rgba(34,197,94,0.4)" : G_BORDER}`, borderRadius: 12, padding: "16px 18px", marginBottom: 14 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, flexWrap: "wrap", gap: 6 }}>
        <div>
          <SectionLabel icon={Circle}>Daily Non-Negotiables</SectionLabel>
          <div style={{ fontSize: 10, color: MUTED, marginTop: -6 }}>Tasks sync sequentially. Press ? to uncover underlying rationale.</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: allDone ? "#22C55E" : G }}>{done.size}/{tasks.length}</div>
          <div style={{ fontSize: 10, color: MUTED }}>+{xpEarned} XP earned</div>
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {tasks.map(t => {
          const isDone = done.has(t.id);
          const isExpanded = expanded.has(t.id);
          const TIcon = t.icon;
          return (
            <div key={t.id}>
              <div onClick={() => handleToggle(t.id)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 14px", background: isDone ? "rgba(34,197,94,0.05)" : SURFACE2, border: `1px solid ${isDone ? "rgba(34,197,94,0.3)" : BORDER}`, borderRadius: isExpanded ? "8px 8px 0 0" : 8, cursor: "pointer", transition: "all 0.2s" }}>
                <div style={{ width: 20, height: 20, borderRadius: 5, border: `2px solid ${isDone ? "#22C55E" : t.color}`, background: isDone ? "#22C55E" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "all 0.2s" }}>
                  {isDone && <Circle size={10} color="#000" style={{ fill: "#000" }} />}
                </div>
                <span style={{ fontSize: 11, flex: 1, color: isDone ? MUTED2 : TEXT, textDecoration: isDone ? "line-through" : "none", lineHeight: 1.4, display: "flex", alignItems: "center", gap: 5 }}>
                  <TIcon size={12} style={{ flexShrink: 0, color: t.color }} /> {t.label}
                </span>
                {t.reason && <button onClick={e => toggleReason(t.id, e)} style={{ background: isExpanded ? G_DIM : "transparent", border: `1px solid ${isExpanded ? G_BORDER : BORDER2}`, color: isExpanded ? G : MUTED, borderRadius: "50%", width: 18, height: 18, fontSize: 10, fontWeight: 800, cursor: "pointer", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }}>?</button>}
                <span style={{ fontSize: 9, color: isDone ? "#22C55E" : MUTED, fontWeight: 700, flexShrink: 0 }}>+{t.xp}XP</span>
              </div>
              {isExpanded && t.reason && <div style={{ padding: "9px 14px", background: "#0a0a0a", border: `1px solid ${BORDER}`, borderTop: "none", borderRadius: "0 0 8px 8px", fontSize: 11, color: MUTED, lineHeight: 1.6 }}>{t.reason}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function RelationshipRenewalQueue({ leads, onQuickContact, onEdit }: { leads: Lead[], onQuickContact: (l: Lead) => void, onEdit: (l: Lead) => void }) {
  const active = leads.filter(l => !["Closed", "Lost"].includes(l.status));
  const nearing = active.filter(l => {
    const d = daysSince(touchpointDate(l));
    return d >= RELATIONSHIP_WARNING_DAYS && d < RELATIONSHIP_RENEWAL_DAYS;
  });
  const critical = active.filter(l => daysSince(touchpointDate(l)) >= RELATIONSHIP_RENEWAL_DAYS);

  if (nearing.length === 0 && critical.length === 0) return null;

  return (
    <div className="dfq-card" style={{ background: SURFACE, border: "1px solid rgba(245,158,11,0.25)", borderRadius: 12, padding: "16px 18px", marginBottom: 14 }}>
      <SectionLabel icon={Sprout}>90-Day Relationship limits</SectionLabel>
      <div style={{ fontSize: 11, color: MUTED, marginBottom: 10 }}>Keep dialog warm. Complete value check-ins to reset touchpoint age before 90-day expiry.</div>
      
      {critical.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 9, color: "#EF4444", fontWeight: 700, marginBottom: 6 }}>CRITICAL — STALE TOUCHPOINTS (&gt;=90 Days)</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            {critical.map(l => (
              <div key={l.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 10px", background: SURFACE2, border: `1px solid ${BORDER}`, borderRadius: 6 }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "#fff" }}>{l.name || l.company} <AssignedBdg who={l.assignedTo} /></div>
                  <div style={{ fontSize: 10, color: "#EF4444", marginTop: 2 }}>Touchpoint age: {daysSince(touchpointDate(l))} days</div>
                </div>
                <div style={{ display: "flex", gap: 4 }}>
                  <button onClick={() => onQuickContact(l)} style={{ background: "rgba(34,197,94,0.1)", color: "#22C55E", border: "1px solid rgba(34,197,94,0.3)", borderRadius: 5, padding: "4px 8px", fontSize: 10, fontWeight: 700, cursor: "pointer" }}>✓ Reset</button>
                  <button onClick={() => onEdit(l)} style={{ background: "transparent", border: `1px solid ${BORDER}`, color: MUTED, borderRadius: 5, padding: "4px 8px", fontSize: 10, cursor: "pointer" }}>Edit</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {nearing.length > 0 && (
        <div>
          <div style={{ fontSize: 9, color: "#FACC15", fontWeight: 700, marginBottom: 6 }}>NEARING EXPIRY (75-89 Days)</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            {nearing.map(l => (
              <div key={l.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 10px", background: SURFACE2, border: `1px solid ${BORDER}`, borderRadius: 6 }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "#fff" }}>{l.name || l.company} <AssignedBdg who={l.assignedTo} /></div>
                  <div style={{ fontSize: 10, color: "#FACC15", marginTop: 2 }}>Touchpoint age: {daysSince(touchpointDate(l))} days</div>
                </div>
                <div style={{ display: "flex", gap: 4 }}>
                  <button onClick={() => onQuickContact(l)} style={{ background: "rgba(34,197,94,0.1)", color: "#22C55E", border: "1px solid rgba(34,197,94,0.3)", borderRadius: 5, padding: "4px 8px", fontSize: 10, fontWeight: 700, cursor: "pointer" }}>✓ Reset</button>
                  <button onClick={() => onEdit(l)} style={{ background: "transparent", border: `1px solid ${BORDER}`, color: MUTED, borderRadius: 5, padding: "4px 8px", fontSize: 10, cursor: "pointer" }}>Edit</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SmartBuckets({ leads, onEdit }: { leads: Lead[], onEdit: (l: Lead) => void }) {
  const [f, setF] = useState<string>("All");
  const filtered = leads.filter(l => !["Closed", "Lost"].includes(l.status));
  const buckets = useMemo(() => {
    const res: Record<string, Lead[]> = { Hot: [], Warm: [], Nurture: [], Cold: [], Dead: [] };
    filtered.forEach(l => {
      const b = l.aiBucket || "Cold";
      if (res[b]) res[b].push(l);
    });
    return res;
  }, [filtered]);

  return (
    <div className="dfq-card" style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 12, padding: "16px 18px", marginBottom: 14 }}>
      <SectionLabel icon={Circle}>Classifier Buckets</SectionLabel>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 8, marginBottom: 12 }}>
        {BUCKETS.map(b => {
          const arr = buckets[b] || [];
          const active = f === b;
          return (
            <div key={b} onClick={() => setF(active ? "All" : b)} style={{ background: active ? `${BUCKET_COLOR[b]}15` : SURFACE2, border: `1px solid ${active ? BUCKET_COLOR[b] : BORDER}`, padding: "10px 12px", borderRadius: 8, cursor: "pointer", textAlign: "center" }}>
              <div style={{ fontSize: 18, fontWeight: 900, color: BUCKET_COLOR[b] }}>{arr.length}</div>
              <div style={{ fontSize: 9, color: MUTED, textTransform: "uppercase", marginTop: 2 }}>{b}</div>
            </div>
          );
        })}
      </div>
      {f !== "All" && (buckets[f] || []).length > 0 && (
        <div style={{ background: "#050505", border: `1px solid ${BUCKET_COLOR[f]}30`, padding: 10, borderRadius: 8 }}>
          <div style={{ fontSize: 10, color: BUCKET_COLOR[f], fontWeight: 700, textTransform: "uppercase", marginBottom: 8 }}>BUCKET FEED — {f}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 200, overflowY: "auto" }}>
            {(buckets[f] || []).map(l => (
              <div key={l.id} onClick={() => onEdit(l)} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 10px", background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 6, cursor: "pointer" }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: "#fff" }}>{l.name || l.company}</span>
                <AssignedBdg who={l.assignedTo} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ----------------------------------------------------
// CORE APPLICATION CONTAINER & COORDINATOR
// ----------------------------------------------------

export default function App() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [stats, setStats] = useState<Stats>({ xp: 0, completedDates: [], totalFollowUps: 0, nnd: {}, dailyQueue: null });
  const [tab, setTab] = useState("mission");
  const [modal, setModal] = useState<Lead | null>(null);
  const [celebration, setCelebration] = useState<{ msg: string; sub: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [classifying, setClassifying] = useState<Set<string>>(new Set());
  const importRef = useRef<HTMLInputElement>(null);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [authed, setAuthed] = useState(false);
  const [mergeCandidates, setMergeCandidates] = useState<[Lead, Lead] | null>(null);
  
  const lastActivityRef = useRef(Date.now());
  const lastSessionWriteRef = useRef(0);

  const clearSession = useCallback(async () => {
    try {
      localStorage.removeItem(SESSION_KEY);
    } catch (_) {}
  }, []);

  const writeSession = useCallback(async (roleKey: string) => {
    const expiresAt = Date.now() + SESSION_IDLE_MS;
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify({ role: roleKey, expiresAt }));
    } catch (_) {}
  }, []);

  const logout = useCallback(() => {
    setAuthed(false);
    setRole(null);
    clearSession();
  }, [clearSession]);

  // Session persistence checks
  useEffect(() => {
    (() => {
      try {
        const r = localStorage.getItem(SESSION_KEY);
        if (r) {
          const s = JSON.parse(r);
          if (s?.role && s?.expiresAt && s.expiresAt > Date.now()) {
            lastActivityRef.current = Date.now();
            setRole(s.role);
            setAuthed(true);
          }
        }
      } catch (_) {}
    })();
  }, []);

  // Idle lock listener
  useEffect(() => {
    if (!role || !authed) return;
    const bump = () => {
      lastActivityRef.current = Date.now();
      if (Date.now() - lastSessionWriteRef.current > 60000) {
        lastSessionWriteRef.current = Date.now();
        writeSession(role);
      }
    };
    const events = ["click", "keydown", "mousemove", "touchstart", "scroll"];
    events.forEach(ev => window.addEventListener(ev, bump, { passive: true }));
    bump();
    const iv = setInterval(() => {
      if (Date.now() - lastActivityRef.current >= SESSION_IDLE_MS) logout();
    }, 30000);
    return () => {
      events.forEach(ev => window.removeEventListener(ev, bump));
      clearInterval(iv);
    };
  }, [role, authed, writeSession, logout]);

  // Load leads from shared database; stats remain per-user in localStorage
  useEffect(() => {
    const loadData = async () => {
      // Load stats from localStorage (per-user XP / streaks)
      try {
        const r = localStorage.getItem("dfqlabs-v12-stats");
        if (r) {
          const s = JSON.parse(r);
          if (s) setStats(s);
        } else {
          // Migrate: try to recover stats from old combined key
          const old = localStorage.getItem("dfqlabs-v12");
          if (old) {
            const d = JSON.parse(old);
            if (d.stats) setStats(d.stats);
          }
        }
      } catch (_) {}

      // Load leads from shared PostgreSQL via API
      try {
        const res = await fetch("/api/leads");
        if (res.ok) {
          const { leads: loadedLeads } = await res.json();
          const rulePatched: Lead[] = [];
          let changed = false;

          const refreshed = (loadedLeads as any[]).map((l: any) => {
            let assignedTo = l.assignedTo || "Unassigned";
            // Normalise legacy assignedTo values to current staff names
            const legacyMap: Record<string, string> = {
              "Specialist A": "Sa'adatu Mohammed",
              "Specialist B": "Abigail Dick",
              "Intern A": "Sa'adatu Mohammed",
              "Intern B": "Abigail Dick",
              "Outreach": "Abigail Dick",
              "Client Relationships": "Sa'adatu Mohammed",
              "Abigail Dixon": "Abigail Dick",
              "Abigail Dick": "Abigail Dick",
            };
            if (legacyMap[assignedTo]) assignedTo = legacyMap[assignedTo];

            let aiBucket = l.aiBucket;
            if (aiBucket && !BUCKETS.includes(aiBucket)) aiBucket = undefined;

            const patched: Lead = {
              lastMeaningfulTouchpoint: l.lastMeaningfulTouchpoint || l.lastContacted || l.dateAdded,
              awaitingReplySince: l.awaitingReplySince || "",
              meetingScheduledAt: l.meetingScheduledAt || "",
              meetingPrepNote: l.meetingPrepNote || "",
              conversationLog: l.conversationLog || [],
              ...l,
              assignedTo,
              aiBucket
            };

            // Leads merged away into another record are tombstoned — never
            // reclassify, resurface, or let AI analyze them (Lead Integrity spec).
            const ruled = patched.mergedInto ? null : ruleBasedBucket(patched);
            if (ruled && patched.aiBucket !== ruled.bucket) {
              changed = true;
              const updated = {
                ...patched,
                aiBucket: ruled.bucket,
                aiReason: `No reply for ${daysSince(patched.lastContacted || patched.dateAdded)} days — auto-moved to nurture.`,
                aiNextAction: patched.aiNextAction || "Send a pattern-interrupt re-engagement message.",
                aiClassifiedAt: new Date().toISOString(),
                autoFollowUpDate: patched.autoFollowUpDate && patched.autoFollowUpDate > today() ? patched.autoFollowUpDate : addDays(ruled.days ?? 3),
                autoFollowUpReason: "Send a pattern-interrupt re-engagement message."
              };
              rulePatched.push(updated);
              return updated;
            }
            return patched;
          });

          setLeads(refreshed);

          // Persist any rule-based reclassifications back to the DB
          if (changed && rulePatched.length > 0) {
            fetch("/api/leads", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ leads: rulePatched })
            }).catch(() => {});
          }
        }
      } catch (_) {}

      setLoading(false);
    };
    loadData();
  }, []);

  // persist() now only saves stats (per-user); leads live in the shared DB
  const persist = useCallback(async (_l: Lead[], s: Stats) => {
    setSaving(true);
    try {
      localStorage.setItem("dfqlabs-v12-stats", JSON.stringify(s));
    } catch (_) {}
    setTimeout(() => setSaving(false), 600);
  }, []);

  // Save a single lead to the shared database
  const saveLeadToDB = useCallback((lead: Lead) => {
    fetch("/api/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lead })
    }).catch(() => {});
  }, []);

  const persistStats = useCallback((s: Stats) => {
    setStats(s);
    persist(leads, s);
  }, [leads, persist]);

  const exportData = () => {
    const dataStr = JSON.stringify({ leads, stats });
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
    const exportFileDefaultName = `dfqlabs-backup-${today()}.json`;
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
  };

  const importData = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileReader = new FileReader();
    if (e.target.files && e.target.files[0]) {
      fileReader.readAsText(e.target.files[0], "UTF-8");
      fileReader.onload = async (event) => {
        try {
          const parsed = JSON.parse(event.target?.result as string);
          if (parsed && Array.isArray(parsed.leads)) {
            // Upload all leads to shared DB
            const res = await fetch("/api/leads", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ leads: parsed.leads })
            });
            if (res.ok) {
              setLeads(parsed.leads);
              if (parsed.stats) {
                setStats(parsed.stats);
                localStorage.setItem("dfqlabs-v12-stats", JSON.stringify(parsed.stats));
              }
              setImportMsg("✓ Leads uploaded to shared database — your team will see them instantly.");
            } else {
              setImportMsg("✗ Upload failed. Check your connection and try again.");
            }
          } else {
            setImportMsg("✗ Invalid backup file structure.");
          }
        } catch (_) {
          setImportMsg("✗ Failed to parse JSON file.");
        }
        setTimeout(() => setImportMsg(null), 5000);
      };
    }
  };

  const saveLead = async (lead: Lead) => {
    const final = { ...lead };
    const exists = leads.find(l => l.id === lead.id);
    
    if (!exists && (!final.assignedTo || final.assignedTo === "Unassigned")) {
      final.assignedTo = autoAssignSpecialist(leads, final);
    }
    if (lead.status === "Closed" && !lead.deliveryStage) final.deliveryStage = "Discovery";
    
    const threadFields = ["dmText", "prospectInitialResponse", "prospectLatestResponse", "notes"];
    const threadChanged = exists && threadFields.some(f => (exists[f as keyof Lead] || "").toString().trim() !== (lead[f as keyof Lead] || "").toString().trim());
    const replyFieldsChanged = exists && ["prospectInitialResponse", "prospectLatestResponse"].some(f => (exists[f as keyof Lead] || "").toString().trim() !== (lead[f as keyof Lead] || "").toString().trim() && (lead[f as keyof Lead] || "").toString().trim());

    // Append-only chronological conversation log compilation
    let conversationLog = exists?.conversationLog || lead.conversationLog || [];
    if (exists) {
      if (exists.status !== lead.status) {
        conversationLog = [...conversationLog, { 
          ts: nowISO(), 
          type: "status_change", 
          label: "Status Updated", 
          text: lead.status, 
          by: lead.assignedTo || "Unassigned" 
        }];
      }

      const logIfChanged = (field: keyof Lead, type: "dm" | "reply" | "note" | "status_change", label: string) => {
        const before = (exists[field] || "").toString().trim();
        const after = (lead[field] || "").toString().trim();
        if (after && after !== before) {
          conversationLog = [...conversationLog, { ts: nowISO(), type, label, text: after, by: lead.assignedTo || "Unassigned" }];
        }
      };
      logIfChanged("dmText", "dm", "Our DM");
      logIfChanged("prospectInitialResponse", "reply", "Their Initial Reply");
      logIfChanged("prospectLatestResponse", "reply", "Latest Thread");
      logIfChanged("notes", "note", "Note");
    } else {
      conversationLog = [...conversationLog, { 
        ts: nowISO(), 
        type: "status_change", 
        label: "Status Initialized", 
        text: lead.status, 
        by: lead.assignedTo || "Unassigned" 
      }];

      const logInitial = (field: keyof Lead, type: "dm" | "reply" | "note" | "status_change", label: string) => {
        const val = (lead[field] || "").toString().trim();
        if (val) {
          conversationLog = [...conversationLog, { ts: nowISO(), type, label, text: val, by: lead.assignedTo || "Unassigned" }];
        }
      };
      logInitial("dmText", "dm", "Our DM");
      logInitial("prospectInitialResponse", "reply", "Their Initial Reply");
      logInitial("prospectLatestResponse", "reply", "Latest Thread");
      logInitial("notes", "note", "Note");
    }
    
    final.conversationLog = conversationLog;

    if (["Closed", "Lost"].includes(final.status)) {
      final.autoFollowUpDate = null;
      final.autoFollowUpReason = "";
      final.awaitingReplySince = "";
    } else {
      const hasThread = final.dmText || final.prospectInitialResponse || final.prospectLatestResponse;
      if (!hasThread) {
        final.autoFollowUpDate = today();
        final.autoFollowUpReason = "New lead — needs outreach.";
      }
      if (threadChanged) {
        final.lastContacted = today();
        final.lastMeaningfulTouchpoint = today();
        final.autoFollowUpDate = addDays(3);
        final.autoFollowUpReason = "Recently updated check-in.";
      }
      if (replyFieldsChanged) final.awaitingReplySince = nowISO();
    }

    const next = exists ? leads.map(l => l.id === lead.id ? final : l) : [...leads, final];
    setLeads(next);
    persist(next, stats);
    saveLeadToDB(final);

    // AI classification sweep
    if (!["Closed", "Lost"].includes(final.status)) {
      setClassifying(p => new Set([...p, final.id]));
      try {
        const result = await classifyLead(final);
        if (result.bucket) {
          const days = typeof result.followUpInDays === "number" ? result.followUpInDays : 3;
          const classified: Lead = {
            ...final,
            aiBucket: result.bucket,
            aiReason: result.reason,
            aiNextAction: result.nextAction,
            aiClassifiedAt: new Date().toISOString(),
            autoFollowUpDate: addDays(days),
            autoFollowUpReason: result.nextAction || result.reason
          };
          setLeads(curr => {
            const updated = curr.map(l => l.id === classified.id ? classified : l);
            persist(updated, stats);
            return updated;
          });
          saveLeadToDB(classified);
        }
      } catch (e) {}
      setClassifying(p => {
        const n = new Set(p);
        n.delete(final.id);
        return n;
      });
    }
  };

  const bulkSaveLeads = async (updatedLeads: Lead[]) => {
    const byId: Record<string, Lead> = {};
    updatedLeads.forEach(l => byId[l.id] = l);
    const next = leads.map(l => byId[l.id] ? byId[l.id] : l);
    setLeads(next);
    await persist(next, stats);
    fetch("/api/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leads: updatedLeads })
    }).catch(() => {});
  };

  const deleteLead = (id: string) => {
    const next = leads.filter(l => l.id !== id);
    setLeads(next);
    persist(next, stats);
    fetch("/api/leads", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id })
    }).catch(() => {});
  };

  // Confirms a merge from either the Duplicate Review page (both leads already
  // persisted) or the create-lead duplicate warning (the "draft" lead may not
  // exist in the DB yet). Never deletes — the losing record is tombstoned
  // with mergedInto so its history stays auditable but it drops out of every
  // active view, stat, and AI pass.
  const handleMergeConfirm = (merged: Lead, discarded: Lead) => {
    const discardedExists = leads.some(l => l.id === discarded.id);
    let next = leads.map(l => (l.id === merged.id ? merged : l));
    if (!next.some(l => l.id === merged.id)) next = [...next, merged];
    if (discardedExists && discarded.id !== merged.id) {
      const tombstone: Lead = { ...discarded, mergedInto: merged.id, status: "Lost" };
      next = next.map(l => (l.id === discarded.id ? tombstone : l));
      saveLeadToDB(tombstone);
    }
    setLeads(next);
    persist(next, stats);
    saveLeadToDB(merged);
    setMergeCandidates(null);
    setModal(null);
  };

  const quickContact = async (lead: Lead) => {
    const now = nowISO();
    const touched: Lead = {
      ...lead,
      lastContacted: today(),
      lastMeaningfulTouchpoint: today(),
      awaitingReplySince: "",
      followUpCount: (lead.followUpCount || 0) + 1,
      completedFollowUps: [...(lead.completedFollowUps || []), now],
      autoFollowUpDate: addDays(3),
      autoFollowUpReason: "Recently contacted.",
      conversationLog: [...(lead.conversationLog || []), { ts: now, type: "note", label: "Follow-up Made", text: "Follow-up registered in system.", by: lead.assignedTo || "Unassigned" }]
    };

    const next = leads.map(l => l.id === lead.id ? touched : l);
    const newDates = [...(stats.completedDates || []), now];
    const newStats = { ...stats, completedDates: newDates, totalFollowUps: (stats.totalFollowUps || 0) + 1 };
    
    setLeads(next);
    setStats(newStats);
    persist(next, newStats);
    saveLeadToDB(touched);

    const activeStreak = calcStreak(newDates);
    const todayCount = newDates.filter(d => d.startsWith(today())).length;
    
    if (todayCount === 5) setCelebration({ msg: "Daily Goal Hit!", sub: "5 follow-ups complete" });
    else if (activeStreak >= 3 && todayCount === 1) setCelebration({ msg: `${activeStreak}-Day Streak!`, sub: "Momentum locked" });

    if (["Closed", "Lost"].includes(touched.status)) return;
    
    setClassifying(p => new Set([...p, touched.id]));
    try {
      const result = await classifyLead(touched);
      if (result.bucket) {
        const days = typeof result.followUpInDays === "number" ? result.followUpInDays : 3;
        const classified: Lead = {
          ...touched,
          aiBucket: result.bucket,
          aiReason: result.reason,
          aiNextAction: result.nextAction,
          aiClassifiedAt: new Date().toISOString(),
          autoFollowUpDate: addDays(days),
          autoFollowUpReason: result.nextAction || result.reason
        };
        setLeads(curr => {
          const updated = curr.map(l => l.id === classified.id ? classified : l);
          persist(updated, newStats);
          return updated;
        });
      }
    } catch (e) {}
    setClassifying(p => {
      const n = new Set(p);
      n.delete(touched.id);
      return n;
    });
  };

  const streakValue = calcStreak(stats.completedDates || []);
  const lvlValue = getXPLevel(stats.xp || 0);
  const todayCountValue = (stats.completedDates || []).filter(d => d.startsWith(today())).length;
  const xpPct = lvlValue.next ? Math.min(100, Math.round(((stats.xp || 0) / lvlValue.next) * 100)) : 100;
  // Leads merged away into another record during duplicate cleanup are kept
  // in the shared DB as a tombstone (for audit history) but excluded from
  // every active view, stat, and AI pass — see Lead Integrity system.
  const activeLeads = useMemo(() => leads.filter(l => !l.mergedInto), [leads]);
  const revenueValue = calcRevenue(activeLeads);
  const clientsValue = activeLeads.filter(l => l.status === "Closed");

  const TABS = [
    { key: "mission", label: "Mission Control" },
    { key: "recent", label: "Recent Leads" },
    { key: "pipeline", label: "Pipeline" },
    { key: "clients", label: "Client Delivery" },
    { key: "team", label: "Team" },
    { key: "strategy", label: "Strategy" },
    { key: "report", label: "CEO Report" },
    { key: "coach", label: "AI Coach" },
    { key: "ceo", label: "CEO Dashboard" },
    { key: "duplicates", label: "Duplicates" },
    { key: "gateway", label: "AI Gateway" }
  ];

  if (loading) return <div style={{ background: BG, height: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}><span style={{ color: G, fontFamily: "monospace", letterSpacing: 4, fontSize: 13 }}>LOADING OS…</span></div>;
  if (!role) return <RoleSelect onSelect={setRole} />;
  if (!authed) return <AccessGate roleKey={role} onSuccess={() => { setAuthed(true); writeSession(role); }} onBack={() => setRole(null)} />;

  // Staff dashboards — each person sees their own leads only
  if (role === "saadatu" || role === "abigail" || role === "internA" || role === "internB") {
    // Legacy internA/B sessions map to the correct person
    const staffName =
      role === "saadatu" ? "Sa'adatu Mohammed" :
      role === "abigail" ? "Abigail Dick" :
      role === "internA" ? "Sa'adatu Mohammed" :   // internA was Client Relationships → Sa'adatu
      "Abigail Dick";                           // internB was Outreach → Abigail
    return (
      <>
        <InternDashboardWrapper
          internNames={[staffName]}
          displayName={staffName}
          leads={activeLeads}
          onSave={saveLead}
          onQuickContact={quickContact}
          classifying={classifying}
          onLogout={logout}
        />
        <AskAI leads={activeLeads} />
      </>
    );
  }

  return (
    <div style={{ background: BG, minHeight: "100vh", color: TEXT, fontFamily: "'Inter',system-ui,sans-serif", fontSize: 14 }}>
      <style>{`
        * { scrollbar-width: thin; scrollbar-color: ${G_BORDER} transparent; box-sizing: border-box; }
        ::-webkit-scrollbar { height:6px; width:6px; }
        ::-webkit-scrollbar-thumb { background:${G_BORDER}; border-radius:4px; }
        button { transition: filter 0.15s ease, transform 0.1s ease, background 0.15s ease, border-color 0.15s ease; }
        button:hover:not(:disabled) { filter: brightness(1.14); }
        button:active:not(:disabled) { transform: scale(0.98); }
        input, select, textarea { transition: border-color 0.15s ease; }
        input:focus, select:focus, textarea:focus { border-color: ${G} !important; }
        .dfq-card { transition: box-shadow 0.25s ease; }
        .dfq-card:hover { box-shadow: 0 6px 24px rgba(0,0,0,0.35); }
        @keyframes pulse-glow { 0%,100%{opacity:1;} 50%{opacity:0.45;} }
        .pulse { animation: pulse-glow 1.8s ease-in-out infinite; }
      `}</style>
      
      {celebration && <Celebration msg={celebration.msg} sub={celebration.sub} onDone={() => setCelebration(null)} />}
      
      <header style={{ borderBottom: `1px solid ${BORDER}`, padding: "10px 14px", background: `linear-gradient(180deg, rgba(62,207,220,0.04), transparent)` }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div className="pulse" style={{ width: 7, height: 7, borderRadius: "50%", background: G, boxShadow: `0 0 8px ${G}` }} />
            <span style={{ fontWeight: 800, fontSize: 13, letterSpacing: "0.12em" }}>DFQ<span style={{color: G}}>LABS</span></span>
            <span style={{ color: MUTED, fontSize: 10, letterSpacing: "0.08em" }}>OS v12</span>
            <Bdg text="FOUNDER" color={G} solid icon={Shield} />
          </div>
          
          <div className="dfq-header-center" style={{ display: "flex", alignItems: "center", gap: 10, flex: "1 1 180px", justifyContent: "center" }}>
            <Flame size={14} color={streakValue > 0 ? G : MUTED} />
            <span style={{ fontSize: 11, fontWeight: 800, color: streakValue > 0 ? G : MUTED }}>{streakValue}d</span>
            <div style={{ flex: "1 1 80px", maxWidth: 120 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                <span style={{ fontSize: 9, color: lvlValue.color, fontWeight: 700 }}>{lvlValue.title}</span>
                <span style={{ fontSize: 9, color: MUTED }}>{stats.xp || 0} XP</span>
              </div>
              <div style={{ height: 3, background: "#1a1a1a", borderRadius: 2, overflow: "hidden" }}>
                <div style={{ width: `${xpPct}%`, height: "100%", background: `linear-gradient(90deg,${lvlValue.color},${G})`, borderRadius: 2 }} />
              </div>
            </div>
            <div style={{ fontSize: 11, background: G_DIM, border: `1px solid ${G_BORDER}`, borderRadius: 5, padding: "2px 8px", color: G, fontWeight: 700 }}>{todayCountValue} today</div>
          </div>
          
          <div className="dfq-header-right" style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
            <input ref={importRef} type="file" accept=".json" onChange={importData} style={{ display: "none" }} />
            <button onClick={() => importRef.current?.click()} style={{ background: "transparent", color: MUTED, border: `1px solid ${BORDER}`, borderRadius: 6, padding: "5px 9px", fontWeight: 700, fontSize: 10, cursor: "pointer" }}><Upload size={12} /></button>
            <button onClick={exportData} style={{ background: "transparent", color: G, border: `1px solid ${G_BORDER}`, borderRadius: 6, padding: "5px 9px", fontWeight: 700, fontSize: 10, cursor: "pointer" }}><Download size={12} /></button>
            {importMsg && <span style={{ fontSize: 11, color: importMsg.startsWith("✓") ? "#22C55E" : "#EF4444" }}>{importMsg}</span>}
            <span style={{ color: MUTED, fontSize: 10 }}>{saving ? <span style={{ color: G }}>SAVING…</span> : `${leads.length} leads`}</span>
            <button onClick={() => setModal({
              id: Date.now().toString(), name: "", company: "", phone: "", source: "WhatsApp", clientType: "Real Estate Developer", service: "Growth — ₦500K/mo", status: "New", priority: "Medium", assignedTo: "Unassigned", notes: "", dmText: "", prospectInitialResponse: "", prospectLatestResponse: "", conversationLog: [], nextAction: "", nextActionDate: "", dateAdded: today(), lastContacted: "", lastMeaningfulTouchpoint: today(), awaitingReplySince: "", meetingScheduledAt: "", meetingPrepNote: "", followUpCount: 0, weekAdded: getWeekKey(new Date()), completedFollowUps: [], deliveryStage: "Discovery", deliveryNote: "", betaCandidate: false, autoFollowUpDate: today(), autoFollowUpReason: "New lead."
            })} style={{ background: G, color: "#000", border: "none", borderRadius: 6, padding: "7px 14px", fontWeight: 800, fontSize: 11, cursor: "pointer", boxShadow: `0 0 14px ${G}30`, display: "flex", alignItems: "center", gap: 5 }}><Plus size={13} />ADD LEAD</button>
            <button onClick={logout} style={{ background: "transparent", border: `1px solid ${BORDER}`, color: MUTED, borderRadius: 6, padding: "6px 12px", fontSize: 11, cursor: "pointer" }}>Switch Role</button>
          </div>
        </div>
      </header>
      
      <div style={{ borderBottom: `1px solid ${BORDER}`, padding: "0 14px", display: "flex", overflowX: "auto" }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{ background: "none", border: "none", borderBottom: tab === t.key ? `2px solid ${G}` : "2px solid transparent", color: tab === t.key ? G : MUTED, padding: "10px 13px", fontSize: 11, fontWeight: 700, cursor: "pointer", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: -1, whiteSpace: "nowrap" }}>{t.label}</button>
        ))}
      </div>
      
      <div className="dfq-main-content" style={{ padding: "16px 14px" }}>
        {tab === "mission" && (
          <div>
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, color: MUTED, letterSpacing: "0.08em", textTransform: "uppercase" }}>{new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: TEXT, marginTop: 4 }}>DFQLABS Mission Control</div>
            </div>
            
            <RevenueGapSummary leads={activeLeads} />
            <ResponseGuardSummary leads={activeLeads} onQuickContact={quickContact} onEdit={setModal} />
            <MeetingIntelligenceSummary leads={activeLeads} onSave={saveLead} />
            
            <div style={{ height: 1, background: BORDER, margin: "4px 0 14px" }} />
            
            <NonNegotiablesSummary leads={activeLeads} stats={stats} onPersist={persistStats} onQuickContact={quickContact} />
            <RelationshipRenewalQueue leads={activeLeads} onQuickContact={quickContact} onEdit={setModal} />
            <BetaTrackerSummary leads={activeLeads} onEdit={setModal} />
            <SmartBuckets leads={activeLeads} onEdit={setModal} />
          </div>
        )}
        
        {tab === "recent" && <RecentLeadsPanel leads={activeLeads} onEdit={setModal} />}
        {tab === "pipeline" && <PipelineTab leads={activeLeads} onEdit={setModal} onDelete={deleteLead} onSave={saveLead} onQuickContact={quickContact} classifying={classifying} />}
        {tab === "clients" && <ClientDelivery clients={clientsValue} onEdit={setModal} />}
        {tab === "team" && <TeamTab leads={activeLeads} onSave={setModal} onBulkSave={bulkSaveLeads} />}
        {tab === "strategy" && <><GrowthStrategySummary leads={activeLeads} /><StrategicPathsSummary leads={activeLeads} /></>}
        {tab === "report" && <WeeklyReport leads={activeLeads} stats={stats} revenue={revenueValue} />}
        {tab === "coach" && <AICoach leads={activeLeads} />}
        {tab === "ceo" && <CEOTab leads={activeLeads} stats={stats} revenue={revenueValue} onEdit={setModal} />}
        {tab === "duplicates" && <DuplicateReviewPanel leads={activeLeads} stats={stats} onPersistStats={persistStats} onMerge={(a, b) => setMergeCandidates([a, b])} />}
        {tab === "gateway" && <AIGateway />}
      </div>
      
      {modal && <LeadModal lead={modal} leads={activeLeads} onSave={saveLead} onClose={() => setModal(null)} role="founder" onOpenExisting={l => setModal(l)} onMerge={(existing, draft) => setMergeCandidates([existing, draft])} />}
      {mergeCandidates && (
        <MergeLeadModal
          leadA={mergeCandidates[0]}
          leadB={mergeCandidates[1]}
          onClose={() => setMergeCandidates(null)}
          onConfirm={handleMergeConfirm}
        />
      )}
      <AskAI leads={activeLeads} />
    </div>
  );
}

// ----------------------------------------------------
// EXTRACTED INTERNAL UTILITY VIEWS
// ----------------------------------------------------

function RoleCard({ onClick, color, Icon, label, sub }: { onClick: () => void; color: string; Icon: any; label: string; sub: string }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        background: hover ? `linear-gradient(180deg, ${color}14, ${SURFACE})` : SURFACE,
        border: `1px solid ${hover ? color + "80" : BORDER}`,
        color: TEXT,
        borderRadius: 16,
        padding: "22px 20px",
        fontSize: 14,
        fontWeight: 700,
        cursor: "pointer",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 10,
        justifyContent: "center",
        width: "100%",
        transform: hover ? "translateY(-4px)" : "translateY(0)",
        boxShadow: hover ? `0 14px 30px -10px ${color}55, 0 0 0 1px ${color}25` : "0 1px 0 rgba(255,255,255,0.02)",
        transition: "all 0.25s cubic-bezier(0.16,1,0.3,1)"
      }}
    >
      <div style={{
        width: 44, height: 44, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center",
        background: `${color}18`, border: `1px solid ${color}40`
      }}>
        <Icon size={19} color={color} />
      </div>
      <div>{label}</div>
      <div style={{ fontSize: 10, fontWeight: 500, color: MUTED, letterSpacing: "0.02em" }}>{sub}</div>
    </button>
  );
}

function RoleSelect({ onSelect }: { onSelect: (r: string) => void }) {
  return (
    <div style={{ background: BG, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, color: TEXT, fontFamily: "'Inter',system-ui,sans-serif" }}>
      <div style={{ width: "100%", maxWidth: 420, textAlign: "center" }}>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 14 }}>
          <div className="pulse" style={{ width: 8, height: 8, borderRadius: "50%", background: G, boxShadow: `0 0 10px ${G}` }} />
        </div>
        <div style={{ fontWeight: 800, fontSize: 17, letterSpacing: "0.1em", marginBottom: 4 }}>DFQ<span style={{color: G}}>LABS</span> <span style={{ color: MUTED, fontSize: 12, letterSpacing: "0.05em" }}>OS</span></div>
        <div style={{ fontSize: 12, color: MUTED, marginBottom: 28 }}>Who's working today?</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: 12, maxWidth: 480, margin: "0 auto" }}>
          <RoleCard onClick={() => onSelect("saadatu")} color={SPECIALIST_COLOR["Sa'adatu Mohammed"]} Icon={UserCheck} label="Sa'adatu" sub="Outreach & client relationships" />
          <RoleCard onClick={() => onSelect("abigail")} color={SPECIALIST_COLOR["Abigail Dick"]} Icon={UserCheck} label="Abigail" sub="Outreach & client relationships" />
          <RoleCard onClick={() => onSelect("founder")} color={G} Icon={Shield} label="Founder" sub="Full command view" />
        </div>
      </div>
    </div>
  );
}

function AccessGate({ roleKey, onSuccess, onBack }: { roleKey: string, onSuccess: () => void, onBack: () => void }) {
  const cfg = ROLE_ACCESS[roleKey as keyof typeof ROLE_ACCESS] || ROLE_ACCESS.founder;
  const Icon = cfg.Icon;
  const [pin, setPin] = useState("");
  const [err, setErr] = useState("");
  
  const submit = () => {
    if (pin === cfg.password) {
      onSuccess();
    } else {
      setErr("Incorrect password.");
      setPin("");
    }
  };

  return (
    <div style={{ background: BG, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, color: TEXT, fontFamily: "'Inter',system-ui,sans-serif" }}>
      <div style={{ width: "100%", maxWidth: 320, textAlign: "center" }}>
        <Icon size={30} color={cfg.color} style={{ marginBottom: 10, display: "inline-block" }} />
        <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 4 }}>{cfg.label} Access</div>
        <div style={{ fontSize: 11, color: MUTED, marginBottom: 16 }}>Enter the password to unlock DFQ Labs Operating System.</div>
        <input type="password" value={pin} onChange={e => { setPin(e.target.value); setErr(""); }} onKeyDown={e => { if (e.key === "Enter") submit(); }} placeholder="Password" style={{ ...iStyle, textAlign: "center", marginBottom: 10 }} autoFocus />
        <button onClick={submit} style={{ background: cfg.color, color: "#000", border: "none", borderRadius: 6, padding: "10px 20px", fontWeight: 800, fontSize: 12, cursor: "pointer", width: "100%", marginBottom: 10 }}>Unlock</button>
        {err && <div style={{ fontSize: 11, color: "#EF4444", marginBottom: 8 }}>{err}</div>}
        <button onClick={onBack} style={{ background: "transparent", border: `1px solid ${BORDER}`, color: MUTED, borderRadius: 6, padding: "7px 16px", fontSize: 11, cursor: "pointer" }}>← Back</button>
      </div>
    </div>
  );
}

// ----------------------------------------------------
// ENHANCED INTERN DASHBOARD (WITH AI COACH ACCESS)
// ----------------------------------------------------

function InternDashboard({ internNames, displayName, leads, onSave, onQuickContact, classifying, onLogout }: any) {
  const [internTab, setInternTab] = useState<"queue" | "coach">("queue");
  const [range, setRange] = useState("today");
  const [search, setSearch] = useState("");
  const [dmOutputs, setDmOutputs] = useState<Record<string, string>>({});
  // dmStep tracks the two-step DM generation flow per lead:
  // 'idle' | 'summarizing' | 'awaiting-confirm' | 'generating'
  const [dmStep, setDmStep] = useState<Record<string, string>>({});
  const [dmSummary, setDmSummary] = useState<Record<string, string>>({});
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [modal, setModal] = useState<Lead | null>(null);

  // Show all leads assigned to any of the intern names (Saadatu covers both Intern A and Intern B)
  const names: string[] = Array.isArray(internNames) ? internNames : [internNames];
  const mine = useMemo(() => leads.filter((l: Lead) => names.includes(l.assignedTo || "") && !["Closed", "Lost"].includes(l.status)), [leads, internNames]);
  const tomorrowStr = addDays(1);
  const weekEnd = addDays(7);
  const RANGES = [
    { key: "today", label: "Today" },
    { key: "tomorrow", label: "Tomorrow" },
    { key: "week", label: "This Week" },
    { key: "overdue", label: "Overdue" }
  ];

  const q = search.trim().toLowerCase();
  const searching = q.length > 0;
  
  const matchesRange = (l: Lead) => {
    const due = effectiveDue(l);
    if (range === "overdue") return due && due < today();
    if (range === "today") return due && due <= today();
    if (range === "tomorrow") return due === tomorrowStr;
    if (range === "week") return due && due > today() && due <= weekEnd;
    return true;
  };

  const filtered = (searching 
    ? mine.filter((l: Lead) => (l.name || "").toLowerCase().includes(q) || (l.company || "").toLowerCase().includes(q))
    : mine.filter(matchesRange)
  ).sort((a: Lead, b: Lead) => scoreLead(b) - scoreLead(a));

  // Step 1 — read the conversation thread and show the specialist a plain-English
  // summary of where the prospect is. The specialist confirms before the DM is drafted.
  const startDMFlow = async (lead: Lead) => {
    setDmStep(p => ({ ...p, [lead.id]: 'summarizing' }));
    setDmSummary(p => ({ ...p, [lead.id]: '' }));
    setDmOutputs(p => ({ ...p, [lead.id]: '' }));
    try {
      const summary = await runProspectSummary(lead);
      setDmSummary(p => ({ ...p, [lead.id]: summary }));
      setDmStep(p => ({ ...p, [lead.id]: 'awaiting-confirm' }));
    } catch (e: any) {
      setDmStep(p => ({ ...p, [lead.id]: 'idle' }));
    }
  };

  // Step 2 — specialist confirmed the summary; now generate the actual DM.
  const confirmAndGenerateDM = async (lead: Lead) => {
    setDmStep(p => ({ ...p, [lead.id]: 'generating' }));
    try {
      const text = await runFollowUpReply(lead);
      setDmOutputs(p => ({ ...p, [lead.id]: text }));
    } catch (e: any) {
      setDmOutputs(p => ({ ...p, [lead.id]: 'Error: ' + e.message }));
    }
    setDmStep(p => ({ ...p, [lead.id]: 'idle' }));
  };

  const cancelDMFlow = (lead: Lead) => {
    setDmStep(p => ({ ...p, [lead.id]: 'idle' }));
    setDmSummary(p => ({ ...p, [lead.id]: '' }));
  };

  const saveReply = (lead: Lead) => {
    const draft = replyDrafts[lead.id];
    if (!draft || !draft.trim()) return;
    onSave({ ...lead, prospectLatestResponse: draft.trim(), prospectInitialResponse: lead.prospectInitialResponse || draft.trim() });
    setReplyDrafts(p => ({ ...p, [lead.id]: "" }));
  };

  return (
    <div style={{ background: BG, minHeight: "100vh", color: TEXT, fontFamily: "'Inter',system-ui,sans-serif", fontSize: 14 }}>
      <header style={{ borderBottom: `1px solid ${BORDER}`, padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontWeight: 800, fontSize: 13, letterSpacing: "0.1em" }}>DFQ<span style={{color: G}}>LABS</span></span>
          <Bdg text={displayName} color={SPECIALIST_COLOR[displayName] || "#F59E0B"} solid icon={UserCheck} />
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <button onClick={() => setModal({
            id: Date.now().toString(), name: "", company: "", phone: "", source: "WhatsApp", clientType: "Real Estate Developer", service: "Growth — ₦500K/mo", status: "New", priority: "Medium", assignedTo: names[0] || "Intern A", notes: "", dmText: "", prospectInitialResponse: "", prospectLatestResponse: "", conversationLog: [], nextAction: "", nextActionDate: "", dateAdded: today(), lastContacted: "", lastMeaningfulTouchpoint: today(), awaitingReplySince: "", meetingScheduledAt: "", meetingPrepNote: "", followUpCount: 0, weekAdded: getWeekKey(new Date()), completedFollowUps: [], deliveryStage: "Discovery", deliveryNote: "", betaCandidate: false, autoFollowUpDate: today(), autoFollowUpReason: "New lead."
          })} style={{ background: G, color: "#000", border: "none", borderRadius: 6, padding: "7px 14px", fontWeight: 800, fontSize: 11, cursor: "pointer", boxShadow: `0 0 14px ${G}30`, display: "flex", alignItems: "center", gap: 5 }}><Plus size={13} />ADD LEAD</button>
          <button onClick={onLogout} style={{ background: "transparent", border: `1px solid ${BORDER}`, color: MUTED, borderRadius: 6, padding: "6px 12px", fontSize: 11, cursor: "pointer" }}>Switch Role</button>
        </div>
      </header>

      {/* Intern tab selection */}
      <div style={{ borderBottom: `1px solid ${BORDER}`, padding: "0 14px", display: "flex" }}>
        <button 
          onClick={() => setInternTab("queue")} 
          style={{ background: "none", border: "none", borderBottom: internTab === "queue" ? `2px solid ${G}` : "2px solid transparent", color: internTab === "queue" ? G : MUTED, padding: "10px 14px", fontSize: 11, fontWeight: 700, cursor: "pointer", textTransform: "uppercase", marginBottom: -1 }}
        >
          My Focus Queue
        </button>
        <button 
          onClick={() => setInternTab("coach")} 
          style={{ background: "none", border: "none", borderBottom: internTab === "coach" ? `2px solid ${G}` : "2px solid transparent", color: internTab === "coach" ? G : MUTED, padding: "10px 14px", fontSize: 11, fontWeight: 700, cursor: "pointer", textTransform: "uppercase", marginBottom: -1 }}
        >
          My AI Coach Access
        </button>
      </div>

      <div style={{ padding: "16px 14px" }}>
        {internTab === "coach" ? (
          <div>
            <div style={{ fontSize: 11, color: MUTED, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 12 }}>COMPILATION HUB</div>
            <AICoach leads={leads} />
          </div>
        ) : (
          <div>
            <div style={{ fontSize: 11, color: MUTED, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 4 }}>{new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}</div>
            <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 14 }}>Your Follow-Up Queue</div>
            
            <div style={{ position: "relative", marginBottom: 12 }}>
              <Search size={13} style={{ position: "absolute", left: 10, top: 10, color: MUTED }} />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search your leads by name or company…" style={{ ...iStyle, paddingLeft: 28 }} />
            </div>
            
            {searching && <div style={{ fontSize: 10, color: G, marginBottom: 10 }}>Showing matches across all your leads.</div>}
            
            <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap", opacity: searching ? 0.4 : 1, pointerEvents: searching ? "none" : "auto" }}>
              {RANGES.map(r => {
                const cnt = mine.filter((l: Lead) => {
                  const due = effectiveDue(l);
                  if (r.key === "overdue") return due && due < today();
                  if (r.key === "today") return due && due <= today();
                  if (r.key === "tomorrow") return due === tomorrowStr;
                  if (r.key === "week") return due && due > today() && due <= weekEnd;
                  return true;
                }).length;
                const active = range === r.key;
                return <button key={r.key} onClick={() => setRange(r.key)} style={{ background: active ? G_DIM : "transparent", border: `1px solid ${active ? G_BORDER : BORDER}`, color: active ? G : MUTED, borderRadius: 20, padding: "7px 14px", fontSize: 12, fontWeight: active ? 700 : 500, cursor: "pointer" }}>{r.label} ({cnt})</button>;
              })}
            </div>

            {filtered.length === 0 ? (
              <div style={{ textAlign: "center", padding: "50px 0", color: MUTED }}>
                <Circle size={28} color="#22C55E" style={{ marginBottom: 8, display: "inline-block" }} />
                <div style={{ fontSize: 14, color: TEXT, fontWeight: 600 }}>Nothing in this window.</div>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {filtered.map((lead: Lead) => {
                  const dm = dmOutputs[lead.id];
                  const step = dmStep[lead.id] || 'idle';
                  const summary = dmSummary[lead.id];
                  const due = effectiveDue(lead);
                  const isOverdue = due && due < today();
                  const meetingFlag = detectMeetingRequest(lead) && !meetingQualified(lead);
                  const conflict = findDuplicateConflict(leads, lead);
                  const expanded = expandedId === lead.id;
                  
                  return (
                    <div key={lead.id} style={{ background: SURFACE, border: `1px solid ${meetingFlag || conflict ? "rgba(245,158,11,0.4)" : BORDER}`, borderLeft: `3px solid ${isOverdue ? "#EF4444" : STATUS_COLOR[lead.status]}`, borderRadius: 10, overflow: "hidden" }}>
                      {conflict && <div style={{ padding: "7px 12px", background: "rgba(239,68,68,0.08)", borderBottom: "1px solid rgba(239,68,68,0.25)", fontSize: 10, color: "#EF4444", fontWeight: 700 }}>Heads up — this company is also assigned to another intern. Flag to Alex before reaching out.</div>}
                      {meetingFlag && <div style={{ padding: "7px 12px", background: "rgba(245,158,11,0.08)", borderBottom: "1px solid rgba(245,158,11,0.25)", fontSize: 10, color: "#F59E0B", fontWeight: 700 }}>They asked to meet in person — don't agree yet. Ask about budget/timeline first.</div>}
                      
                      <div style={{ padding: "11px 14px", display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-start" }}>
                        <div style={{ flex: "1 1 140px" }}>
                          <div style={{ fontWeight: 700, fontSize: 13, color: "#fff" }}>{lead.name || "—"} <span style={{ color: MUTED, fontWeight: 400, fontSize: 11 }}>{lead.company}</span></div>
                          <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 5 }}>
                            <Bdg text={lead.status} color={STATUS_COLOR[lead.status]} solid />
                            <BucketBdg bucket={lead.aiBucket} classifying={classifying?.has(lead.id)} />
                            <BetaBdg text={lead.clientType} color="#a855f7" />
                            {lead.betaCandidate && <BetaBdg />}
                          </div>
                        </div>
                        <div style={{ display: "flex", gap: 6 }}>
                          <button onClick={() => startDMFlow(lead)} disabled={!!dmStep[lead.id] && dmStep[lead.id] !== 'idle'} style={{ background: (dmStep[lead.id] && dmStep[lead.id] !== 'idle') ? SURFACE2 : G_DIM, color: (dmStep[lead.id] && dmStep[lead.id] !== 'idle') ? MUTED : G, border: `1px solid ${G_BORDER}`, borderRadius: 6, padding: "6px 12px", fontSize: 11, fontWeight: 700 }}>{dmStep[lead.id] === 'summarizing' ? "Reading thread…" : dmStep[lead.id] === 'generating' ? "Writing…" : "Draft DM"}</button>
                          <button onClick={() => onQuickContact(lead)} style={{ background: "rgba(34,197,94,0.1)", color: "#22C55E", border: "1px solid rgba(34,197,94,0.3)", borderRadius: 6, padding: "6px 11px", fontSize: 11, fontWeight: 700 }}>✓ Contacted</button>
                          <button onClick={() => setExpandedId(expanded ? null : lead.id)} style={{ background: expanded ? G_DIM : "transparent", border: `1px solid ${expanded ? G_BORDER : BORDER}`, color: expanded ? G : MUTED, borderRadius: 6, padding: "6px 10px", fontSize: 11 }}>{expanded ? "Hide" : "Thread"}</button>
                          <button onClick={() => setModal(lead)} style={{ background: "transparent", border: `1px solid ${BORDER}`, color: MUTED2, borderRadius: 6, padding: "6px 10px", fontSize: 11 }}>Edit</button>
                        </div>
                      </div>

                      {/* Step 1 result — show prospect summary and ask specialist to confirm */}
                      {step === 'awaiting-confirm' && summary && (
                        <div style={{ padding: "12px 14px", borderTop: `1px solid ${BORDER}`, background: "rgba(62,207,220,0.04)" }}>
                          <div style={{ fontSize: 9, color: G, fontWeight: 700, letterSpacing: "0.1em", marginBottom: 8 }}>WHERE IS THIS PROSPECT?</div>
                          <div style={{ fontSize: 12, color: "#ccc", lineHeight: 1.78, whiteSpace: "pre-wrap", marginBottom: 12 }}>{summary}</div>
                          <div style={{ fontSize: 11, color: MUTED2, marginBottom: 10 }}>Does this match your understanding of where they are?</div>
                          <div style={{ display: "flex", gap: 8 }}>
                            <button onClick={() => confirmAndGenerateDM(lead)} style={{ background: "rgba(34,197,94,0.12)", color: "#22C55E", border: "1px solid rgba(34,197,94,0.35)", borderRadius: 6, padding: "7px 16px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>Yes — Generate DM</button>
                            <button onClick={() => cancelDMFlow(lead)} style={{ background: "transparent", border: `1px solid ${BORDER}`, color: MUTED, borderRadius: 6, padding: "7px 12px", fontSize: 11, cursor: "pointer" }}>Cancel</button>
                          </div>
                        </div>
                      )}

                      {/* Step 2 result — show the generated DM */}
                      {dm && step === 'idle' && (
                        <div style={{ padding: "12px 14px", borderTop: `1px solid ${BORDER}`, background: SURFACE2 }}>
                          <div style={{ fontSize: 9, color: G, fontWeight: 700, letterSpacing: "0.1em", marginBottom: 6 }}>SUGGESTED CONVERSATION MESSAGE</div>
                          <div style={{ fontSize: 12, color: "#ccc", lineHeight: 1.75, whiteSpace: "pre-wrap", marginBottom: 8 }}>{dm}</div>
                          <div style={{ display: "flex", gap: 8 }}>
                            <CopyBtn text={dm} />
                            <button onClick={() => startDMFlow(lead)} style={{ background: "transparent", border: `1px solid ${G_BORDER}`, color: G, borderRadius: 5, padding: "5px 12px", fontSize: 10, fontWeight: 700 }}>↺ Redo</button>
                          </div>
                        </div>
                      )}

                      {expanded && (
                        <div style={{ borderTop: `1px solid ${BORDER}`, background: SURFACE2, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
                          {lead.dmText && <div><div style={{ fontSize: 9, color: G, fontWeight: 700, letterSpacing: "0.1em", marginBottom: 4 }}>OUR DM</div><p style={{ fontSize: 11, color: "#aaa", lineHeight: 1.65, whiteSpace: "pre-wrap" }}>{lead.dmText}</p></div>}
                          {lead.prospectInitialResponse && <div><div style={{ fontSize: 9, color: "#F59E0B", fontWeight: 700, letterSpacing: "0.1em", marginBottom: 4 }}>THEIR REPLY</div><p style={{ fontSize: 11, color: "#aaa", lineHeight: 1.65, whiteSpace: "pre-wrap" }}>{lead.prospectInitialResponse}</p></div>}
                          {lead.prospectLatestResponse && <div><div style={{ fontSize: 9, color: "#8B5CF6", fontWeight: 700, letterSpacing: "0.1em", marginBottom: 4 }}>LATEST</div><p style={{ fontSize: 11, color: "#aaa", lineHeight: 1.65, whiteSpace: "pre-wrap" }}>{lead.prospectLatestResponse}</p></div>}
                          <ConversationHistoryPanel log={lead.conversationLog} />
                          <div>
                            <div style={{ fontSize: 9, color: MUTED, fontWeight: 700, letterSpacing: "0.1em", marginBottom: 4 }}>LOG A NEW REPLY FROM THEM</div>
                            <textarea value={replyDrafts[lead.id] || ""} onChange={e => setReplyDrafts(p => ({ ...p, [lead.id]: e.target.value }))} placeholder="Paste what they just said in WhatsApp…" rows={2} style={{ ...iStyle, lineHeight: 1.5 }} />
                            <button onClick={() => saveReply(lead)} style={{ marginTop: 6, background: "rgba(34,197,94,0.1)", color: "#22C55E", border: "1px solid rgba(34,197,94,0.3)", borderRadius: 6, padding: "6px 12px", fontSize: 11, fontWeight: 700 }}>Save Reply</button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
      {modal && <LeadModal lead={modal} leads={leads} onSave={onSave} onClose={() => setModal(null)} role="intern" onOpenExisting={l => setModal(l)} />}
    </div>
  );
}

function InternDashboardWrapper(props: any) {
  return <InternDashboard {...props} />;
}

// ----------------------------------------------------
// PIPELINE TAB & ROW SUB-COMPONENTS
// ----------------------------------------------------

function PipelineTab({ leads, onEdit, onDelete, onSave, onQuickContact, classifying }: any) {
  const [search, setSearch] = useState("");
  const [fStatus, setFStatus] = useState("All");
  const [fBucket, setFBucket] = useState("All");
  const [fClientType, setFClientType] = useState("All");
  const [fAssigned, setFAssigned] = useState("All");
  const [fDate, setFDate] = useState("");
  const [betaOnly, setBetaOnly] = useState(false);
  const [visibleCount, setVisibleCount] = useState(50);

  useEffect(() => { setVisibleCount(50); }, [search, fStatus, fBucket, fClientType, fAssigned, fDate, betaOnly]);

  const CHIPS = ["Today", "Tomorrow", "This Week", "Overdue"];
  const chipVal = (chip: string) => {
    if (chip === "Today") return today();
    if (chip === "Tomorrow") return addDays(1);
    if (chip === "This Week") return "week";
    return "overdue";
  };
  const chipColor = (chip: string) => chip === "Overdue" ? "#EF4444" : chip === "Today" ? G : chip === "Tomorrow" ? "#F59E0B" : "#8B5CF6";

  const filtered = leads.filter((l: Lead) => {
    const q = search.toLowerCase();
    const mt = !q || l.name.toLowerCase().includes(q) || (l.company || "").toLowerCase().includes(q);
    const ms = fStatus === "All" || l.status === fStatus;
    const mb = fBucket === "All" || l.aiBucket === fBucket;
    const mc = fClientType === "All" || (l.clientType || "Real Estate Developer") === fClientType;
    const ma = fAssigned === "All" || (l.assignedTo || "Unassigned") === fAssigned;
    const mBeta = !betaOnly || l.betaCandidate;
    const due = effectiveDue(l);
    let md = true;
    if (fDate === "overdue") md = !!(due && due < today() && !["Closed", "Lost"].includes(l.status));
    else if (fDate === "week") {
      const end = addDays(7);
      md = !!(due && due >= today() && due <= end);
    } else if (fDate) md = due === fDate;
    return mt && ms && mb && mc && ma && mBeta && md;
  });

  const sorted = fDate ? [...filtered].sort((a, b) => {
    const da = effectiveDue(a), db = effectiveDue(b);
    if (da && db) return da.localeCompare(db);
    return leadLabel(a).localeCompare(leadLabel(b), undefined, { sensitivity: "base" });
  }) : alphaSort(filtered);

  const counts = STATUSES.reduce((acc, s) => {
    acc[s] = leads.filter((l: Lead) => l.status === s).length;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div>
      <div style={{ display: "flex", gap: 4, overflowX: "auto", marginBottom: 12, paddingBottom: 4 }}>
        {STATUSES.map(s => (
          <div key={s} onClick={() => setFStatus(fStatus === s ? "All" : s)} style={{ background: fStatus === s ? `${STATUS_COLOR[s]}20` : SURFACE, border: `1px solid ${fStatus === s ? STATUS_COLOR[s] : BORDER}`, borderRadius: 6, padding: "6px 10px", cursor: "pointer", textAlign: "center", minWidth: 70, flexShrink: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: STATUS_COLOR[s] }}>{counts[s]}</div>
            <div style={{ fontSize: 9, color: MUTED, marginTop: 2 }}>{s}</div>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 5, overflowX: "auto", marginBottom: 10, paddingBottom: 2 }}>
        {BUCKETS.map(b => {
          const active = fBucket === b;
          const c = BUCKET_COLOR[b];
          const cnt = leads.filter((l: Lead) => l.aiBucket === b).length;
          return (
            <button key={b} onClick={() => setFBucket(active ? "All" : b)} style={{ background: active ? `${c}20` : "transparent", border: `1px solid ${active ? c : BORDER}`, color: active ? c : MUTED, borderRadius: 20, padding: "5px 12px", fontSize: 11, cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 4 }}>
              {b} ({cnt})
            </button>
          );
        })}
        <button onClick={() => setBetaOnly(!betaOnly)} style={{ background: betaOnly ? "rgba(250,204,21,0.15)" : "transparent", border: `1px solid ${betaOnly ? "#FACC15" : BORDER}`, color: betaOnly ? "#FACC15" : MUTED, borderRadius: 20, padding: "5px 12px", fontSize: 11, cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 4 }}>
          Beta Candidates
        </button>
      </div>
      
      <div style={{ display: "flex", gap: 5, overflowX: "auto", marginBottom: 10, paddingBottom: 2 }}>
        {SPECIALISTS.map(s => {
          const active = fAssigned === s;
          const cnt = leads.filter((l: Lead) => (l.assignedTo || "Unassigned") === s).length;
          if (cnt === 0 && !active) return null;
          return <button key={s} onClick={() => setFAssigned(active ? "All" : s)} style={{ background: active ? `${SPECIALIST_COLOR[s]}20` : "transparent", border: `1px solid ${active ? SPECIALIST_COLOR[s] : BORDER}`, color: active ? SPECIALIST_COLOR[s] : MUTED, borderRadius: 20, padding: "5px 12px", fontSize: 11, cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0 }}>{s} ({cnt})</button>;
        })}
      </div>

      <div style={{ display: "flex", gap: 5, marginBottom: 8, overflowX: "auto", paddingBottom: 2 }}>
        {CHIPS.map(chip => {
          const cv = chipVal(chip);
          const active = fDate === cv;
          const cc = chipColor(chip);
          return <button key={chip} onClick={() => setFDate(active ? "" : cv)} style={{ background: active ? `${cc}20` : "transparent", border: `1px solid ${active ? cc : BORDER}`, color: active ? cc : MUTED, borderRadius: 20, padding: "5px 13px", fontSize: 11, cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0 }}>{chip}</button>;
        })}
        <input type="date" value={["week", "overdue"].includes(fDate) ? "" : fDate} onChange={e => setFDate(e.target.value)} style={{ ...iStyle, width: 130, padding: "5px 10px", fontSize: 11 }} />
      </div>

      <div style={{ position: "relative", marginBottom: 12 }}>
        <Search size={13} style={{ position: "absolute", left: 10, top: 10, color: MUTED }} />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search Leads…" style={{ ...iStyle, paddingLeft: 28 }} />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {sorted.slice(0, visibleCount).map((l: Lead) => (
          <LeadRow key={l.id} lead={l} onEdit={onEdit} onDelete={onDelete} onSave={onSave} onQuickContact={onQuickContact} classifying={classifying?.has(l.id)} />
        ))}
      </div>
    </div>
  );
}

function LeadRow({ lead, onEdit, onDelete, onSave, onQuickContact, classifying }: any) {
  const [exp, setExp] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const due = effectiveDue(lead);
  const isOverdue = due && due < today() && !["Closed", "Lost"].includes(lead.status);
  const meetingFlag = detectMeetingRequest(lead) && !meetingQualified(lead) && !["Closed", "Lost"].includes(lead.status);

  return (
    <div style={{ background: SURFACE, border: `1px solid ${meetingFlag ? "rgba(245,158,11,0.4)" : BORDER}`, borderLeft: `3px solid ${meetingFlag ? "#F59E0B" : STATUS_COLOR[lead.status]}`, borderRadius: 10, overflow: "hidden" }}>
      {meetingFlag && (
        <div style={{ padding: "7px 12px", background: "rgba(245,158,11,0.08)", borderBottom: "1px solid rgba(245,158,11,0.25)", fontSize: 10, color: "#F59E0B", fontWeight: 700 }}>
          Meeting requested — not yet qualified. Don't commit to a physical office visit until budget, timeline, and decision-maker are confirmed.
        </div>
      )}
      <div style={{ padding: "10px 12px", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#555", flexShrink: 0 }} />
        <div style={{ flex: "1 1 120px" }}>
          <div style={{ fontWeight: 600, fontSize: 13, color: TEXT }}>{lead.name || "—"} <span style={{ color: MUTED, fontWeight: 400, fontSize: 11 }}>{lead.company}</span></div>
          {lead.phone && <div style={{ color: MUTED, fontSize: 11 }}>{lead.phone}</div>}
        </div>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", flex: "1 1 140px" }}>
          <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 4, background: `${STATUS_COLOR[lead.status]}15`, border: `1px solid ${STATUS_COLOR[lead.status]}40`, color: STATUS_COLOR[lead.status], fontWeight: 700 }}>{lead.status}</span>
          {lead.aiBucket && <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 4, background: `${BUCKET_COLOR[lead.aiBucket]}15`, border: `1px solid ${BUCKET_COLOR[lead.aiBucket]}40`, color: BUCKET_COLOR[lead.aiBucket], fontWeight: 700 }}>{lead.aiBucket}</span>}
          {lead.betaCandidate && <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 4, background: "rgba(250,204,21,0.1)", border: "1px solid rgba(250,204,21,0.3)", color: "#FACC15", fontWeight: 700 }}>BETA</span>}
          {isOverdue && <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 4, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", color: "#EF4444", fontWeight: 700 }}>OVERDUE</span>}
        </div>
        <div style={{ display: "flex", gap: 4, flexShrink: 0, flexWrap: "wrap" }}>
          {!["Closed", "Lost"].includes(lead.status) && <button onClick={() => onQuickContact(lead)} style={{ background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.3)", color: "#22C55E", borderRadius: 5, padding: "3px 8px", fontSize: 10, fontWeight: 700, cursor: "pointer" }}>✓ Contacted</button>}
          <button onClick={() => setExp(!exp)} style={{ background: exp ? G_DIM : "transparent", border: `1px solid ${exp ? G_BORDER : BORDER}`, color: exp ? G : MUTED, borderRadius: 5, padding: "3px 8px", fontSize: 10, cursor: "pointer" }}>Thread</button>
          <button onClick={() => onEdit(lead)} style={{ background: "transparent", border: `1px solid ${BORDER}`, color: MUTED2, borderRadius: 5, padding: "3px 8px", fontSize: 10, cursor: "pointer" }}>Edit</button>
          {confirmDel ? (
            <button onClick={() => onDelete(lead.id)} style={{ background: "rgba(239,68,68,0.12)", border: "1px solid #EF4444", color: "#EF4444", borderRadius: 5, padding: "3px 8px", fontSize: 10 }}>Confirm</button>
          ) : (
            <button onClick={() => setConfirmDel(true)} style={{ background: "transparent", border: `1px solid ${BORDER}`, color: "#EF4444", borderRadius: 5, padding: "3px 8px", fontSize: 10 }}>X</button>
          )}
        </div>
      </div>
      {exp && (
        <div style={{ borderTop: `1px solid ${BORDER}`, background: SURFACE2, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
          {lead.dmText && <div><div style={{ fontSize: 9, color: G, fontWeight: 700 }}>OUR DM</div><p style={{ fontSize: 11, color: "#aaa" }}>{lead.dmText}</p></div>}
          {lead.prospectLatestResponse && <div><div style={{ fontSize: 9, color: "#8B5CF6", fontWeight: 700 }}>LATEST</div><p style={{ fontSize: 11, color: "#aaa" }}>{lead.prospectLatestResponse}</p></div>}
          <ConversationHistoryPanel log={lead.conversationLog} />
        </div>
      )}
    </div>
  );
}

function ClientDelivery({ clients, onEdit }: { clients: Lead[], onEdit: (l: Lead) => void }) {
  const active = clients.filter(c => c.status === "Closed");
  return (
    <div className="dfq-card" style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 12, padding: "16px 18px" }}>
      <div style={{ fontSize: 9, color: G, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
        Active Client Delivery
      </div>
      {active.length === 0 ? (
        <div style={{ textAlign: "center", padding: "30px 0", color: MUTED }}>No active clients currently in delivery.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {active.map(c => (
            <div key={c.id} style={{ background: SURFACE2, border: `1px solid ${BORDER}`, padding: 12, borderRadius: 8, cursor: "pointer" }} onClick={() => onEdit(c)}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontWeight: 700, color: "#fff" }}>{c.company}</span>
                <Bdg text={c.deliveryStage || "Discovery"} color="#22C55E" solid />
              </div>
              {c.deliveryNote && <div style={{ fontSize: 11, color: MUTED2, marginTop: 4 }}>{c.deliveryNote}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
