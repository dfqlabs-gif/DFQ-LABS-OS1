import { useState, useMemo, useCallback } from "react";
import {
  Calendar, UserCheck, Shield, FileText, BarChart3, DollarSign, Brain,
  Search, Clock3, AlertTriangle, Sprout, TrendingUp, TrendingDown,
  Zap, Target, Activity, Eye, EyeOff, ChevronRight, ArrowDown,
  Flame, Star, CheckCircle2, XCircle, Radio, BarChart2, Layers,
  RefreshCw, Bell
} from "lucide-react";
import React from "react";
import { Lead, Stats } from "../types";
import {
  today, addDays, fmt, calcRevenue, getInternActivities, alphaSort,
  STATUSES, STATUS_COLOR, SPECIALISTS, SPECIALIST_COLOR, specialistLabel,
  SERVICE_VALUE, STAGE_PROBABILITY, G, G_DIM, G_BORDER, SURFACE, SURFACE2,
  BG, BORDER, BORDER2, MUTED, MUTED2, TEXT, iStyle, daysSince, hoursSince,
  hoursUntil, touchpointDate, RELATIONSHIP_WARNING_DAYS, RELATIONSHIP_RENEWAL_DAYS,
  RESPONSE_GUARD_HOURS, MEETING_WINDOW_HOURS, scoreLead
} from "../constants";
import { buildCEOAdvisorPrompt, runAI } from "../aiEngine";

interface CEOTabProps {
  leads: Lead[];
  stats: Stats;
  revenue: any;
  onEdit: (l: Lead) => void;
}

// ── Design tokens ─────────────────────────────────────────────────────────────
const CARD = { background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 12, padding: "20px 22px", marginBottom: 16 } as const;
const CARD_ACCENT = { background: `linear-gradient(160deg,${SURFACE},#0c0c0c)`, border: `1px solid ${G_BORDER}`, borderRadius: 12, padding: "20px 22px", marginBottom: 16 } as const;
const SECTION_LABEL = (icon: any, text: string) => (
  <div style={{ fontSize: 9, color: G, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase" as const, marginBottom: 14, display: "flex", alignItems: "center", gap: 6 }}>
    {React.createElement(icon, { size: 12 })} {text}
  </div>
);
const DIVIDER = <div style={{ height: 1, background: BORDER, margin: "16px 0" }} />;

// ── Helper: format large numbers ──────────────────────────────────────────────
const fmtPct = (n: number) => `${Math.round(n)}%`;
const health_color = (s: number) => s >= 75 ? "#22C55E" : s >= 50 ? "#F59E0B" : s >= 30 ? "#F97316" : "#EF4444";
const health_label = (s: number) => s >= 75 ? "Healthy" : s >= 50 ? "Moderate" : s >= 30 ? "Needs Work" : "Critical";

// Trend arrow component
function Trend({ value, positive = true }: { value: number; positive?: boolean }) {
  const up = value >= 0;
  const good = positive ? up : !up;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 2, fontSize: 10, fontWeight: 700, color: good ? "#22C55E" : "#EF4444" }}>
      {up ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
      {Math.abs(value)}%
    </span>
  );
}

// Score ring component
function ScoreRing({ score, size = 72 }: { score: number; size?: number }) {
  const r = (size - 8) / 2;
  const circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;
  const color = health_color(score);
  return (
    <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={BORDER2} strokeWidth={6} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={6}
        strokeDasharray={`${dash} ${circ}`} strokeLinecap="round" style={{ transition: "stroke-dasharray 0.8s ease" }} />
    </svg>
  );
}

// Mini sparkline (fake-generated from value for visual texture)
function Sparkline({ values, color }: { values: number[]; color: string }) {
  if (!values.length) return null;
  const max = Math.max(...values, 1);
  const w = 60; const h = 20;
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * w},${h - (v / max) * h}`).join(" ");
  return (
    <svg width={w} height={h} style={{ opacity: 0.7 }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" />
    </svg>
  );
}

export function CEOTab({ leads, stats, revenue, onEdit }: CEOTabProps) {
  // ── Focus Mode ─────────────────────────────────────────────────────────────
  const [focusMode, setFocusMode] = useState(false);

  // ── AI states ──────────────────────────────────────────────────────────────
  const [brief, setBrief] = useState("");
  const [briefLoading, setBriefLoading] = useState(false);
  const [advisorQuestion, setAdvisorQuestion] = useState("");
  const [advisorAnswer, setAdvisorAnswer] = useState("");
  const [advisorLoading, setAdvisorLoading] = useState(false);
  const [aiPriorities, setAiPriorities] = useState("");
  const [aiPrioritiesLoading, setAiPrioritiesLoading] = useState(false);
  const [aiRadar, setAiRadar] = useState("");
  const [aiRadarLoading, setAiRadarLoading] = useState(false);

  // ── Intern activity state (preserved) ─────────────────────────────────────
  const specialists = SPECIALISTS.filter(s => s !== "Unassigned");
  const [fSpecialist, setFSpecialist] = useState("All");
  const [selectedActivityDate, setSelectedActivityDate] = useState(today());
  const yesterdayStr = addDays(-1);
  const dayBeforeYesterdayStr = addDays(-2);
  const [showInternSection, setShowInternSection] = useState(false);

  // ── Core computed metrics ─────────────────────────────────────────────────
  const active = useMemo(() => leads.filter(l => !["Closed", "Lost"].includes(l.status)), [leads]);
  const closed = useMemo(() => leads.filter(l => l.status === "Closed"), [leads]);
  const lost = useMemo(() => leads.filter(l => l.status === "Lost"), [leads]);

  // Pipeline value (sum of active SERVICE_VALUE)
  const pipelineValue = useMemo(() => active.reduce((s, l) => s + (SERVICE_VALUE[l.service] || 0), 0), [active]);
  const weightedPipeline = revenue.weighted || 0;
  const guaranteedRevenue = revenue.guaranteed || 0;

  // Month-to-date closed
  const monthKey = today().slice(0, 7);
  const closedThisMonth = useMemo(() => closed.filter(l => (l.lastContacted || l.dateAdded || "").startsWith(monthKey)).reduce((s, l) => s + (SERVICE_VALUE[l.service] || 0), 0), [closed, monthKey]);

  // Week navigation (0 = current week, -1 = last week, etc.)
  const [rollupWeekOffset, setRollupWeekOffset] = useState(0);

  // Meetings this week (always current week)
  const weekStart = useMemo(() => {
    const d = new Date(); d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return d.toISOString().split("T")[0];
  }, []);

  // Selected week for the rollup panel (can navigate backwards)
  const { rollupWeekStart, rollupWeekEnd } = useMemo(() => {
    const d = new Date();
    // Go to the Monday of the current week, then shift by rollupWeekOffset weeks
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + rollupWeekOffset * 7);
    const start = d.toISOString().split("T")[0];
    const end = new Date(d);
    end.setDate(d.getDate() + 6);
    const endStr = end.toISOString().split("T")[0];
    // Cap end at today
    return { rollupWeekStart: start, rollupWeekEnd: endStr < today() ? endStr : today() };
  }, [rollupWeekOffset]);

  const meetingsThisWeek = useMemo(() => leads.filter(l => l.meetingScheduledAt && l.meetingScheduledAt >= weekStart), [leads, weekStart]);
  const meetingsSoon = useMemo(() => active.filter(l => l.meetingScheduledAt && hoursUntil(l.meetingScheduledAt) >= -1 && hoursUntil(l.meetingScheduledAt) <= MEETING_WINDOW_HOURS), [active]);

  // Close rate & avg deal size
  const closeRate = leads.length ? Math.round((closed.length / leads.length) * 100) : 0;
  const avgDealSize = closed.length ? Math.round(guaranteedRevenue / closed.length) : 0;

  // Revenue forecast (weighted pipeline remaining)
  const monthForecast = weightedPipeline + closedThisMonth;

  // Awaiting reply
  const awaitingReply = useMemo(() => active.filter(l => l.awaitingReplySince && hoursSince(l.awaitingReplySince) >= RESPONSE_GUARD_HOURS), [active]);

  // Relationship risk
  const approaching90 = useMemo(() => active.filter(l => { const d = daysSince(touchpointDate(l)); return d >= RELATIONSHIP_WARNING_DAYS && d < RELATIONSHIP_RENEWAL_DAYS; }), [active]);
  const overdue90 = useMemo(() => active.filter(l => daysSince(touchpointDate(l)) >= RELATIONSHIP_RENEWAL_DAYS), [active]);

  // ── Agency Health Score (0-100) ────────────────────────────────────────────
  const healthScores = useMemo(() => {
    const totalLeads = leads.length || 1;
    const activeCount = active.length || 1;

    // Sales health: close rate, proposals → closed conversion
    const proposals = leads.filter(l => ["Proposal Sent", "Closed"].includes(l.status)).length;
    const proposalConv = proposals ? Math.round((closed.length / proposals) * 100) : 0;
    const salesScore = Math.min(100, Math.round((closeRate * 0.5) + (proposalConv * 0.5)));

    // Marketing health: reply rate, new leads
    const replied = leads.filter(l => !["New", "DM Sent"].includes(l.status)).length;
    const replyRate = totalLeads ? Math.round((replied / totalLeads) * 100) : 0;
    const newThisWeek = leads.filter(l => (l.dateAdded || "") >= weekStart).length;
    const marketingScore = Math.min(100, Math.round((replyRate * 0.6) + Math.min(40, newThisWeek * 4)));

    // Operations health: follow-ups done, low stale count
    const stale = active.filter(l => l.lastContacted && daysSince(l.lastContacted) >= 7).length;
    const staleRatio = 1 - Math.min(1, stale / activeCount);
    const operationsScore = Math.min(100, Math.round(staleRatio * 100));

    // Client Delivery health: closed leads with delivery stages tracked
    const withDelivery = closed.filter(l => l.deliveryStage && l.deliveryStage !== "").length;
    const deliveryScore = closed.length ? Math.min(100, Math.round((withDelivery / closed.length) * 100)) : 60;

    // Cash Flow health: guaranteed vs weighted pipeline ratio
    const cashScore = pipelineValue > 0 ? Math.min(100, Math.round((guaranteedRevenue / pipelineValue) * 200)) : 30;

    // Team Productivity: avg leads per intern
    const internLeads = specialists.map(s => active.filter(l => l.assignedTo === s).length);
    const maxLoad = 20;
    const productivityScore = internLeads.length ? Math.min(100, Math.round((internLeads.reduce((a, b) => a + b, 0) / (specialists.length * maxLoad)) * 100)) : 30;

    const overall = Math.round((salesScore + marketingScore + operationsScore + deliveryScore + cashScore + productivityScore) / 6);
    return { sales: salesScore, marketing: marketingScore, operations: operationsScore, delivery: deliveryScore, cashFlow: cashScore, productivity: productivityScore, overall };
  }, [leads, active, closed, closeRate, weekStart, pipelineValue, guaranteedRevenue, specialists]);

  // ── Funnel stage data ─────────────────────────────────────────────────────
  const FUNNEL_STAGES = ["New", "DM Sent", "Replied", "Audit Requested", "Audit Delivered", "Value Given", "Discovery Call Booked", "Discovery Call Done", "Proposal Sent", "Closed"];
  const funnelData = useMemo(() => {
    return FUNNEL_STAGES.map(stage => {
      const count = leads.filter(l => l.status === stage).length;
      const value = leads.filter(l => l.status === stage).reduce((s, l) => s + (SERVICE_VALUE[l.service] || 0), 0);
      return { stage, count, value };
    });
  }, [leads]);

  // Funnel leak detection: conversion between consecutive stages
  const funnelLeaks = useMemo(() => {
    const leaks = [];
    for (let i = 0; i < funnelData.length - 1; i++) {
      const from = funnelData[i];
      const to = funnelData[i + 1];
      // Count leads that have reached or passed `to.stage`
      const fromReached = leads.filter(l => {
        const fi = FUNNEL_STAGES.indexOf(l.status);
        return fi >= i;
      }).length;
      const toReached = leads.filter(l => {
        const fi = FUNNEL_STAGES.indexOf(l.status);
        return fi >= i + 1;
      }).length;
      const convRate = fromReached > 0 ? Math.round((toReached / fromReached) * 100) : 0;
      // Expected benchmarks per stage
      const benchmarks: Record<string, number> = {
        "New": 70, "DM Sent": 35, "Replied": 55, "Audit Requested": 65,
        "Audit Delivered": 60, "Value Given": 55, "Discovery Call Booked": 75,
        "Discovery Call Done": 70, "Proposal Sent": 45
      };
      const expected = benchmarks[from.stage] || 50;
      leaks.push({ from: from.stage, to: to.stage, convRate, expected, gap: convRate - expected, fromCount: fromReached, toCount: toReached });
    }
    return leaks.sort((a, b) => a.gap - b.gap); // worst leaks first
  }, [leads, funnelData]);

  // ── Priority opportunities ─────────────────────────────────────────────────
  const priorityLeads = useMemo(() => {
    return [...active]
      .map(l => ({ lead: l, score: scoreLead(l), value: SERVICE_VALUE[l.service] || 0, prob: STAGE_PROBABILITY[l.status] || 0 }))
      .sort((a, b) => (b.score + b.value / 50000) - (a.score + a.value / 50000))
      .slice(0, 6);
  }, [active]);

  // ── CEO Alerts ─────────────────────────────────────────────────────────────
  const alerts = useMemo(() => {
    const list: { type: "danger" | "warning" | "info"; msg: string; lead?: Lead }[] = [];

    // Proposals unanswered 6+ days
    const staleProposals = active.filter(l => l.status === "Proposal Sent" && daysSince(l.lastContacted) >= 6);
    staleProposals.forEach(l => list.push({ type: "danger", msg: `Proposal unanswered ${daysSince(l.lastContacted)}d — ${l.name || l.company}`, lead: l }));

    // Hot leads inactive 3+ days
    const hotInactive = active.filter(l => l.aiBucket === "Hot" && daysSince(touchpointDate(l)) >= 3);
    hotInactive.forEach(l => list.push({ type: "danger", msg: `Hot lead inactive ${daysSince(touchpointDate(l))}d — ${l.name || l.company}`, lead: l }));

    // Awaiting our reply 48h+
    const longWait = awaitingReply.filter(l => hoursSince(l.awaitingReplySince) >= 48);
    longWait.forEach(l => list.push({ type: "danger", msg: `${l.name || l.company} waiting ${Math.round(hoursSince(l.awaitingReplySince))}h for our reply`, lead: l }));

    // Meetings tomorrow
    const tomorrow = addDays(1);
    const tmrwMeetings = leads.filter(l => l.meetingScheduledAt && l.meetingScheduledAt.startsWith(tomorrow));
    tmrwMeetings.forEach(l => list.push({ type: "warning", msg: `Meeting tomorrow — ${l.name || l.company}`, lead: l }));

    // No meetings booked this week
    if (meetingsThisWeek.length === 0) {
      list.push({ type: "warning", msg: "No meetings booked this week — pipeline momentum at risk" });
    }

    // Close rate below 15%
    if (closeRate < 15 && leads.length >= 5) {
      list.push({ type: "warning", msg: `Close rate ${closeRate}% — significantly below 25% target` });
    }

    // High-value leads past 90 days
    overdue90.filter(l => (SERVICE_VALUE[l.service] || 0) >= 500000).forEach(l =>
      list.push({ type: "warning", msg: `High-value lead ${l.name || l.company} (${fmt(SERVICE_VALUE[l.service] || 0)}) past 90-day mark`, lead: l })
    );

    // Intern with no activity today
    specialists.forEach(s => {
      const todayActivity = getInternActivities(leads, today()).filter(a => a.actor === s);
      if (todayActivity.length === 0) {
        list.push({ type: "info", msg: `${specialistLabel(s)} — no activity logged today` });
      }
    });

    return list.slice(0, 12);
  }, [active, awaitingReply, leads, meetingsThisWeek, closeRate, overdue90, specialists]);

  // ── Revenue forecast breakdown ─────────────────────────────────────────────
  const forecast = useMemo(() => {
    const guaranteed = guaranteedRevenue;
    const likely = revenue.likely || 0;
    const possible = leads.filter(l => !["Lost"].includes(l.status) && (STAGE_PROBABILITY[l.status] || 0) >= 20)
      .reduce((s, l) => s + (SERVICE_VALUE[l.service] || 0), 0);
    const stretch = leads.filter(l => !["Lost"].includes(l.status))
      .reduce((s, l) => s + (SERVICE_VALUE[l.service] || 0), 0);
    return { guaranteed, likely, possible, stretch };
  }, [leads, guaranteedRevenue, revenue]);

  // ── Team performance leaderboard ──────────────────────────────────────────
  const teamPerf = useMemo(() => specialists.map(s => {
    const mine = leads.filter(l => l.assignedTo === s);
    const activeLeads = mine.filter(l => !["Closed", "Lost"].includes(l.status));
    const closedDeals = mine.filter(l => l.status === "Closed");
    const todayActs = getInternActivities(leads, today()).filter(a => a.actor === s);
    const dmsSent = todayActs.filter(a => a.type === "dm").length;
    const repliesGot = todayActs.filter(a => a.type === "reply").length;
    const meetBk = mine.filter(l => (l.status === "Discovery Call Booked" || l.meetingScheduledAt) && (l.dateAdded || "") >= weekStart).length;
    const revenue = closedDeals.reduce((s, l) => s + (SERVICE_VALUE[l.service] || 0), 0);
    const responseTime = mine.filter(l => l.awaitingReplySince).length === 0 ? 95 : 60;
    const prodScore = Math.min(100, Math.round((dmsSent * 10) + (repliesGot * 15) + (meetBk * 20) + (closedDeals.length * 25)));
    return { name: s, activeLeads: activeLeads.length, closedDeals: closedDeals.length, dmsSent, repliesGot, meetBk, revenue, responseTime, prodScore };
  }).sort((a, b) => b.prodScore - a.prodScore), [leads, specialists, weekStart]);

  // ── Live activity feed ─────────────────────────────────────────────────────
  const liveActivity = useMemo(() => {
    const acts = getInternActivities(leads, today());
    const yestActs = getInternActivities(leads, yesterdayStr).slice(0, 10);
    return [...acts, ...yestActs].sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime()).slice(0, 20);
  }, [leads, yesterdayStr]);

  // ── Intern activity (preserved) ────────────────────────────────────────────
  const activitiesForSelectedDate = useMemo(() => getInternActivities(leads, selectedActivityDate), [leads, selectedActivityDate]);

  const internStatsForSelectedDate = useMemo(() => {
    const report: Record<string, any> = {};
    specialists.forEach(s => {
      const myActs = activitiesForSelectedDate.filter(a => a.actor === s);
      report[s] = {
        newLeads: myActs.filter(a => a.type === "add").length,
        outreaches: myActs.filter(a => a.type === "dm" || (a.type === "status_change" && a.text === "DM Sent")).length,
        replies: myActs.filter(a => a.type === "reply" || (a.type === "status_change" && a.text === "Replied")).length,
        auditsRequested: myActs.filter(a => a.type === "status_change" && a.text === "Audit Requested").length,
        auditsDelivered: myActs.filter(a => a.type === "status_change" && (a.text === "Audit Delivered" || a.text === "Value Given")).length,
        meetingsBooked: myActs.filter(a => a.type === "status_change" && a.text === "Discovery Call Booked").length,
        proposalsSent: myActs.filter(a => a.type === "status_change" && a.text === "Proposal Sent").length,
        clientsClosed: myActs.filter(a => a.type === "status_change" && a.text === "Closed").length,
      };
    });
    return report;
  }, [activitiesForSelectedDate, specialists]);

  // Weekly rollup (uses selected week, not just current week)
  const inWeek = (d: string) => d && d >= rollupWeekStart && d <= rollupWeekEnd;
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

  // ── AI functions ──────────────────────────────────────────────────────────
  const getBrief = useCallback(async () => {
    setBriefLoading(true); setBrief("");
    try { setBrief(await runAI(buildCEOAdvisorPrompt(leads, revenue), 700)); }
    catch (e: any) { setBrief("Error: " + e.message); }
    setBriefLoading(false);
  }, [leads, revenue]);

  const askAdvisor = useCallback(async () => {
    if (!advisorQuestion.trim()) return;
    setAdvisorLoading(true); setAdvisorAnswer("");
    try { setAdvisorAnswer(await runAI(buildCEOAdvisorPrompt(leads, revenue, advisorQuestion), 800)); }
    catch (e: any) { setAdvisorAnswer("Error: " + e.message); }
    setAdvisorLoading(false);
  }, [leads, revenue, advisorQuestion]);

  const getPriorities = useCallback(async () => {
    setAiPrioritiesLoading(true); setAiPriorities("");
    const active_count = active.length;
    const top_leads = [...active].sort((a, b) => scoreLead(b) - scoreLead(a)).slice(0, 5).map(l => `${l.name || l.company} (${l.status}, ₦${SERVICE_VALUE[l.service] || 0})`).join(", ");
    const prompt = `You are the COO of DFQ Labs. The founder has 3 focused hours today. Generate the 5 highest-ROI actions they should take right now, each with: action title, estimated business impact (₦ or qualitative), time required (minutes), and priority ranking. Ground every action in this data: ${active_count} active leads. Top scored leads: ${top_leads}. Close rate: ${closeRate}%. Awaiting reply: ${awaitingReply.length} leads. Meetings today: ${meetingsSoon.length}. Format as a numbered list. Be specific — name actual leads where relevant.`;
    try { setAiPriorities(await runAI(prompt, 600)); }
    catch (e: any) { setAiPriorities("Error: " + e.message); }
    setAiPrioritiesLoading(false);
  }, [active, awaitingReply, closeRate, meetingsSoon]);

  const getRadar = useCallback(async () => {
    setAiRadarLoading(true); setAiRadar("");
    const top = [...active].sort((a, b) => (SERVICE_VALUE[b.service] || 0) * (STAGE_PROBABILITY[b.status] || 0) - (SERVICE_VALUE[a.service] || 0) * (STAGE_PROBABILITY[a.status] || 0)).slice(0, 8).map(l => `${l.name || l.company}: status=${l.status}, value=₦${SERVICE_VALUE[l.service] || 0}, score=${scoreLead(l)}, lastContact=${l.lastContacted || "never"}`).join("\n");
    const prompt = `You are an AI Opportunity Intelligence system for DFQ Labs. Rank these 8 opportunities by closability today. For each, output: Lead name, Probability (%), Reason (1 sentence), Suggested Action (1 sentence), Confidence level (High/Medium/Low). Ground every assessment in the actual data. Format as a concise numbered list.\n\n${top}`;
    try { setAiRadar(await runAI(prompt, 700)); }
    catch (e: any) { setAiRadar("Error: " + e.message); }
    setAiRadarLoading(false);
  }, [active]);

  // ── Button style ──────────────────────────────────────────────────────────
  const btn = (loading: boolean, disabled?: boolean) => ({
    background: (loading || disabled) ? SURFACE2 : G,
    color: (loading || disabled) ? MUTED : "#000",
    border: "none", borderRadius: 6, padding: "8px 16px",
    fontWeight: 800 as const, fontSize: 11, cursor: (loading || disabled) ? "not-allowed" : "pointer",
    display: "inline-flex", alignItems: "center", gap: 6
  });

  // ─────────────────────────────────────────────────────────────────────────
  // FOCUS MODE — shows only alerts, top priorities, AI brief
  // ─────────────────────────────────────────────────────────────────────────
  if (focusMode) {
    return (
      <div>
        {/* Focus Mode Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, padding: "12px 16px", background: `${G_DIM}`, border: `1px solid ${G_BORDER}`, borderRadius: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Eye size={14} color={G} />
            <span style={{ color: G, fontWeight: 800, fontSize: 12, letterSpacing: "0.08em" }}>CEO FOCUS MODE</span>
            <span style={{ fontSize: 10, color: MUTED }}>— Only what matters right now</span>
          </div>
          <button onClick={() => setFocusMode(false)} style={{ ...btn(false), background: "transparent", color: MUTED, border: `1px solid ${BORDER}` }}>
            <EyeOff size={11} /> Exit Focus Mode
          </button>
        </div>

        {/* Alerts */}
        {alerts.length > 0 && (
          <div style={CARD_ACCENT}>
            {SECTION_LABEL(Bell, "CEO Alerts")}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {alerts.filter(a => a.type === "danger").slice(0, 5).map((a, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 8, cursor: a.lead ? "pointer" : "default" }} onClick={() => a.lead && onEdit(a.lead)}>
                  <AlertTriangle size={12} color="#EF4444" />
                  <span style={{ fontSize: 12, color: "#f0ede8" }}>{a.msg}</span>
                  {a.lead && <ChevronRight size={11} color={MUTED} style={{ marginLeft: "auto" }} />}
                </div>
              ))}
              {alerts.filter(a => a.type === "warning").slice(0, 3).map((a, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.2)", borderRadius: 8, cursor: a.lead ? "pointer" : "default" }} onClick={() => a.lead && onEdit(a.lead)}>
                  <AlertTriangle size={12} color="#F59E0B" />
                  <span style={{ fontSize: 12, color: "#f0ede8" }}>{a.msg}</span>
                  {a.lead && <ChevronRight size={11} color={MUTED} style={{ marginLeft: "auto" }} />}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Top 3 Priority Leads */}
        <div style={CARD}>
          {SECTION_LABEL(Target, "Highest Priority Opportunities")}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {priorityLeads.slice(0, 3).map(({ lead: l, score, value, prob }) => (
              <div key={l.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", background: SURFACE2, border: `1px solid ${BORDER}`, borderRadius: 8, cursor: "pointer" }} onClick={() => onEdit(l)}>
                <div style={{ minWidth: 40, textAlign: "center" }}>
                  <div style={{ fontSize: 16, fontWeight: 900, color: G }}>{score}</div>
                  <div style={{ fontSize: 8, color: MUTED, fontWeight: 600 }}>SCORE</div>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: TEXT }}>{l.name || l.company}</div>
                  <div style={{ fontSize: 10, color: MUTED2 }}>{l.company} · {l.status}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: "#22C55E" }}>{fmt(value)}</div>
                  <div style={{ fontSize: 9, color: MUTED }}>{prob}% prob</div>
                </div>
                <ChevronRight size={12} color={MUTED} />
              </div>
            ))}
          </div>
        </div>

        {/* AI Brief */}
        <div style={CARD_ACCENT}>
          {SECTION_LABEL(Brain, "AI Strategic Focus")}
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: brief ? 10 : 0 }}>
            <span style={{ fontSize: 11, color: MUTED, flex: 1 }}>What should you do in the next 2 hours to create the most revenue impact?</span>
            <button onClick={getBrief} disabled={briefLoading} style={btn(briefLoading)}><RefreshCw size={10} />{briefLoading ? "Briefing…" : "Get Brief"}</button>
          </div>
          {brief && <div style={{ fontSize: 12, lineHeight: 1.85, color: "#ccc", whiteSpace: "pre-wrap", background: SURFACE2, padding: "12px 14px", borderRadius: 8, border: `1px solid ${BORDER}`, marginTop: 8 }}>{brief}</div>}
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // FULL EXECUTIVE DASHBOARD
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div>

      {/* ── HEADER: Focus Mode Toggle ─────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 900, color: TEXT, letterSpacing: "-0.02em" }}>Executive Decision Center</div>
          <div style={{ fontSize: 11, color: MUTED, marginTop: 2 }}>DFQ Labs OS — Command Dashboard</div>
        </div>
        <button onClick={() => setFocusMode(true)} style={{ background: G_DIM, border: `1px solid ${G_BORDER}`, color: G, borderRadius: 8, padding: "9px 16px", fontSize: 11, fontWeight: 800, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
          <Eye size={12} /> CEO Focus Mode
        </button>
      </div>

      {/* ─────────────────────────────────────────────────────────────────────
          SECTION 1 — EXECUTIVE SUMMARY STRIP
      ───────────────────────────────────────────────────────────────────── */}
      <div style={{ ...CARD_ACCENT, marginBottom: 16 }}>
        {SECTION_LABEL(BarChart2, "Executive Summary")}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 10 }}>
          {[
            { label: "PIPELINE VALUE", value: fmt(pipelineValue), sub: `${active.length} active leads`, color: G, spark: [60, 70, 65, 80, 75, 90, pipelineValue > 0 ? 100 : 0] },
            { label: "WEIGHTED PIPELINE", value: fmt(weightedPipeline), sub: "Probability-adjusted", color: "#8B5CF6", spark: [40, 55, 50, 65, 70, 80, 85] },
            { label: "REVENUE CLOSED", value: fmt(guaranteedRevenue), sub: "All-time guaranteed", color: "#22C55E", spark: [20, 30, 45, 40, 60, 70, 80] },
            { label: "MEETINGS THIS WK", value: meetingsThisWeek.length, sub: meetingsSoon.length > 0 ? `${meetingsSoon.length} within 24h` : "No urgent meetings", color: "#F97316", spark: [1, 2, 1, 3, 2, 4, meetingsThisWeek.length] },
            { label: "CLOSE RATE", value: `${closeRate}%`, sub: `${closed.length} of ${leads.length} leads`, color: closeRate >= 25 ? "#22C55E" : closeRate >= 15 ? "#F59E0B" : "#EF4444", spark: [12, 15, 13, 18, 20, closeRate - 5, closeRate] },
            { label: "AVG DEAL SIZE", value: avgDealSize ? fmt(avgDealSize) : "—", sub: closed.length ? `${closed.length} closed` : "No closed deals", color: "#F59E0B", spark: [200, 300, 250, 400, 350, 500, avgDealSize / 10000] },
            { label: "MONTHLY FORECAST", value: fmt(monthForecast), sub: "Weighted + closed", color: "#06B6D4", spark: [50, 80, 70, 100, 120, 150, monthForecast / 10000] },
            { label: "HEALTH SCORE", value: `${healthScores.overall}/100`, sub: health_label(healthScores.overall), color: health_color(healthScores.overall), spark: [40, 50, 45, 60, 65, 70, healthScores.overall] },
          ].map(item => (
            <div key={item.label} style={{ background: "#0a0a0a", border: `1px solid ${BORDER}`, borderRadius: 10, padding: "14px 14px 10px", display: "flex", flexDirection: "column", gap: 4 }}>
              <div style={{ fontSize: 8, color: MUTED, fontWeight: 700, letterSpacing: "0.1em" }}>{item.label}</div>
              <div style={{ fontSize: 20, fontWeight: 900, color: item.color, letterSpacing: "-0.02em" }}>{item.value}</div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ fontSize: 9, color: MUTED2 }}>{item.sub}</div>
                <Sparkline values={item.spark} color={item.color} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────────────
          SECTION 13 — EXECUTIVE KPI STRIP
      ───────────────────────────────────────────────────────────────────── */}
      <div style={{ ...CARD, padding: "14px 18px" }}>
        <div style={{ display: "flex", gap: 0, overflowX: "auto", scrollbarWidth: "none" }}>
          {[
            { label: "Leads", value: leads.length, color: TEXT },
            { label: "Active", value: active.length, color: G },
            { label: "Closed", value: closed.length, color: "#22C55E" },
            { label: "Lost", value: lost.length, color: "#EF4444" },
            { label: "Replies", value: leads.filter(l => l.prospectInitialResponse || l.prospectLatestResponse).length, color: "#F59E0B" },
            { label: "Meetings", value: meetingsThisWeek.length, color: "#F97316" },
            { label: "Proposals", value: leads.filter(l => ["Proposal Sent", "Closed"].includes(l.status)).length, color: "#EC4899" },
            { label: "Awaiting", value: awaitingReply.length, color: "#EF4444" },
            { label: "Close %", value: `${closeRate}%`, color: closeRate >= 25 ? "#22C55E" : "#F59E0B" },
            { label: "MRR", value: guaranteedRevenue > 0 ? fmt(guaranteedRevenue) : "₦0", color: "#22C55E" },
            { label: "Pipeline", value: fmt(pipelineValue), color: G },
            { label: "Weighted", value: fmt(weightedPipeline), color: "#8B5CF6" },
            { label: "At Risk 90d", value: overdue90.length, color: "#8B5CF6" },
            { label: "Alerts", value: alerts.filter(a => a.type === "danger").length, color: "#EF4444" },
          ].map((k, i) => (
            <div key={k.label} style={{ display: "flex", flexDirection: "column", alignItems: "center", minWidth: 70, padding: "6px 10px", borderRight: i < 13 ? `1px solid ${BORDER}` : "none" }}>
              <div style={{ fontSize: 14, fontWeight: 900, color: k.color }}>{k.value}</div>
              <div style={{ fontSize: 8, color: MUTED, fontWeight: 600, whiteSpace: "nowrap" }}>{k.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────────────
          SECTION 11 — CEO ALERTS
      ───────────────────────────────────────────────────────────────────── */}
      {alerts.length > 0 && (
        <div style={CARD}>
          {SECTION_LABEL(Bell, `CEO Alerts — ${alerts.length} Active`)}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 8 }}>
            {alerts.map((a, i) => (
              <div key={i}
                style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 12px", background: a.type === "danger" ? "rgba(239,68,68,0.05)" : a.type === "warning" ? "rgba(245,158,11,0.05)" : "rgba(62,207,220,0.05)", border: `1px solid ${a.type === "danger" ? "rgba(239,68,68,0.2)" : a.type === "warning" ? "rgba(245,158,11,0.2)" : G_BORDER}`, borderRadius: 8, cursor: a.lead ? "pointer" : "default", transition: "opacity 0.15s" }}
                onClick={() => a.lead && onEdit(a.lead)}>
                <AlertTriangle size={12} color={a.type === "danger" ? "#EF4444" : a.type === "warning" ? "#F59E0B" : G} style={{ marginTop: 1, flexShrink: 0 }} />
                <span style={{ fontSize: 11, color: "#d0cdc8", lineHeight: 1.4 }}>{a.msg}</span>
                {a.lead && <ChevronRight size={10} color={MUTED} style={{ marginLeft: "auto", flexShrink: 0 }} />}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────────
          SECTION 2 — AI CEO MORNING BRIEF
      ───────────────────────────────────────────────────────────────────── */}
      <div style={CARD_ACCENT}>
        {SECTION_LABEL(Brain, "AI CEO Morning Brief")}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
          <div style={{ fontSize: 11, color: MUTED, maxWidth: 420 }}>Your executive assistant generates a concise strategic brief — what happened, what concerns, what to act on today.</div>
          <button onClick={getBrief} disabled={briefLoading} style={btn(briefLoading)}>
            <RefreshCw size={10} />{briefLoading ? "Briefing…" : "Generate Morning Brief"}
          </button>
        </div>
        {brief ? (
          <div style={{ fontSize: 12, lineHeight: 1.9, color: "#d0cdc8", whiteSpace: "pre-wrap", background: "#0a0a0a", padding: "16px 18px", borderRadius: 10, border: `1px solid ${BORDER}`, fontFamily: "inherit" }}>{brief}</div>
        ) : (
          <div style={{ textAlign: "center", padding: "20px 0", color: MUTED, fontSize: 11 }}>Click "Generate Morning Brief" to receive your executive daily summary.</div>
        )}
      </div>

      {/* ─────────────────────────────────────────────────────────────────────
          SECTION 3 — AGENCY HEALTH SCORE
      ───────────────────────────────────────────────────────────────────── */}
      <div style={CARD}>
        {SECTION_LABEL(Activity, "Agency Health Score")}
        <div style={{ display: "flex", gap: 20, alignItems: "center", marginBottom: 16, flexWrap: "wrap" }}>
          <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center", width: 80, height: 80, flexShrink: 0 }}>
            <ScoreRing score={healthScores.overall} size={80} />
            <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
              <div style={{ fontSize: 20, fontWeight: 900, color: health_color(healthScores.overall) }}>{healthScores.overall}</div>
              <div style={{ fontSize: 7, color: MUTED, fontWeight: 700 }}>/ 100</div>
            </div>
          </div>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, color: health_color(healthScores.overall) }}>{health_label(healthScores.overall)}</div>
            <div style={{ fontSize: 11, color: MUTED2, marginTop: 2 }}>Overall agency health — calculated across 6 dimensions</div>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 8 }}>
          {[
            { label: "Sales", score: healthScores.sales, reason: `${closeRate}% close rate, ${leads.filter(l => l.status === "Proposal Sent").length} open proposals` },
            { label: "Marketing", score: healthScores.marketing, reason: `${leads.filter(l => !["New","DM Sent"].includes(l.status)).length} reply-stage leads` },
            { label: "Operations", score: healthScores.operations, reason: `${active.filter(l => l.lastContacted && daysSince(l.lastContacted) >= 7).length} stale active leads` },
            { label: "Client Delivery", score: healthScores.delivery, reason: `${closed.filter(l => l.deliveryStage).length} of ${closed.length} tracked` },
            { label: "Cash Flow", score: healthScores.cashFlow, reason: `${fmt(guaranteedRevenue)} locked vs ${fmt(pipelineValue)} pipeline` },
            { label: "Team Productivity", score: healthScores.productivity, reason: `${active.length} active leads across ${specialists.length} interns` },
          ].map(cat => (
            <div key={cat.label} style={{ background: SURFACE2, border: `1px solid ${BORDER}`, borderRadius: 8, padding: "12px 14px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: TEXT }}>{cat.label}</span>
                <span style={{ fontSize: 14, fontWeight: 900, color: health_color(cat.score) }}>{cat.score}</span>
              </div>
              <div style={{ background: BORDER, borderRadius: 3, height: 4, overflow: "hidden", marginBottom: 6 }}>
                <div style={{ width: `${cat.score}%`, height: "100%", background: health_color(cat.score), borderRadius: 3, transition: "width 0.6s ease" }} />
              </div>
              <div style={{ fontSize: 9, color: MUTED }}>{cat.reason}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────────────
          SECTION 4 — REVENUE PIPELINE (visual by stage)
      ───────────────────────────────────────────────────────────────────── */}
      <div style={CARD}>
        {SECTION_LABEL(Layers, "Revenue Pipeline")}
        <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 4, scrollbarWidth: "none" }}>
          {funnelData.map((s, i) => {
            const isLast = i === funnelData.length - 1;
            const color = STATUS_COLOR[s.stage] || MUTED;
            const maxCount = Math.max(...funnelData.map(d => d.count), 1);
            const barH = Math.max(4, Math.round((s.count / maxCount) * 60));
            return (
              <React.Fragment key={s.stage}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, minWidth: 84 }}>
                  <div style={{ width: "100%", background: SURFACE2, border: `1px solid ${BORDER}`, borderTop: `2px solid ${color}`, borderRadius: 8, padding: "10px 8px", textAlign: "center" }}>
                    <div style={{ fontSize: 18, fontWeight: 900, color }}>{s.count}</div>
                    <div style={{ height: barH, width: "80%", margin: "4px auto", background: `${color}25`, borderRadius: 3, overflow: "hidden", display: "flex", alignItems: "flex-end" }}>
                      <div style={{ width: "100%", height: `${(s.count / maxCount) * 100}%`, background: color, borderRadius: 3, transition: "height 0.6s ease" }} />
                    </div>
                    <div style={{ fontSize: 8, fontWeight: 700, color: MUTED, letterSpacing: "0.06em", marginTop: 4 }}>{s.stage.toUpperCase()}</div>
                    {s.value > 0 && <div style={{ fontSize: 10, fontWeight: 700, color: "#22C55E", marginTop: 2 }}>{fmt(s.value)}</div>}
                    <div style={{ fontSize: 8, color: MUTED2, marginTop: 1 }}>{STAGE_PROBABILITY[s.stage] || 0}% prob</div>
                  </div>
                </div>
                {!isLast && <div style={{ display: "flex", alignItems: "center", paddingTop: 16, color: MUTED, flexShrink: 0 }}>→</div>}
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────────────
          SECTION 5 — SALES FUNNEL LEAK DETECTOR
      ───────────────────────────────────────────────────────────────────── */}
      <div style={CARD}>
        {SECTION_LABEL(Zap, "Sales Funnel Leak Detector")}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {/* Funnel visual */}
          <div>
            <div style={{ fontSize: 10, color: MUTED, marginBottom: 10 }}>Conversion through pipeline stages</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
              {funnelLeaks.filter((_, i) => i < 9).map((leak, i) => {
                const good = leak.convRate >= leak.expected;
                return (
                  <div key={i} style={{ display: "flex", align: "center", gap: 8 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 0" }}>
                        <span style={{ fontSize: 10, color: MUTED2, display: "flex", alignItems: "center", gap: 6 }}>
                          <span style={{ fontSize: 11, fontWeight: 700, color: TEXT }}>{leak.fromCount}</span> {leak.from}
                        </span>
                        <span style={{ fontSize: 10, fontWeight: 700, color: good ? "#22C55E" : "#EF4444" }}>{fmtPct(leak.convRate)}</span>
                      </div>
                      {i < 8 && <div style={{ display: "flex", alignItems: "center", paddingLeft: 8, color: MUTED, fontSize: 10 }}><ArrowDown size={10} /></div>}
                    </div>
                  </div>
                );
              })}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 0" }}>
                <span style={{ fontSize: 10, color: "#22C55E", fontWeight: 700 }}><span style={{ fontSize: 11 }}>{closed.length}</span> Closed</span>
                <span style={{ fontSize: 10, color: "#22C55E", fontWeight: 700 }}>{fmtPct(closeRate)}</span>
              </div>
            </div>
          </div>
          {/* Top leaks */}
          <div>
            <div style={{ fontSize: 10, color: MUTED, marginBottom: 10 }}>Biggest revenue leaks</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {funnelLeaks.slice(0, 4).map((leak, i) => (
                <div key={i} style={{ background: SURFACE2, border: "1px solid rgba(239,68,68,0.15)", borderRadius: 8, padding: "10px 12px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: TEXT }}>{leak.from} → {leak.to}</span>
                    <span style={{ fontSize: 11, fontWeight: 900, color: "#EF4444" }}>{fmtPct(leak.convRate)}</span>
                  </div>
                  <div style={{ background: BORDER, borderRadius: 3, height: 3, overflow: "hidden", marginBottom: 6 }}>
                    <div style={{ width: `${leak.convRate}%`, height: "100%", background: "#EF4444", borderRadius: 3 }} />
                  </div>
                  <div style={{ fontSize: 9, color: MUTED }}>Expected {fmtPct(leak.expected)} · Gap: <span style={{ color: "#EF4444" }}>{leak.gap > 0 ? "+" : ""}{fmtPct(leak.gap)}</span></div>
                </div>
              ))}
              {funnelLeaks.length === 0 && <div style={{ fontSize: 11, color: MUTED, padding: "12px 0" }}>Add more leads to detect funnel leaks.</div>}
            </div>
          </div>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────────────
          SECTION 6 — HIGHEST PRIORITY OPPORTUNITIES
      ───────────────────────────────────────────────────────────────────── */}
      <div style={CARD}>
        {SECTION_LABEL(Target, "Highest Priority Opportunities")}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 10 }}>
          {priorityLeads.map(({ lead: l, score, value, prob }, idx) => {
            const urgency = l.awaitingReplySince ? `Awaiting reply ${Math.round(hoursSince(l.awaitingReplySince))}h` : l.nextActionDate && l.nextActionDate <= today() ? "Overdue follow-up" : l.meetingScheduledAt ? "Meeting scheduled" : "Active";
            const daysSinceContact = l.lastContacted ? daysSince(l.lastContacted) : null;
            return (
              <div key={l.id} style={{ background: SURFACE2, border: `1px solid ${idx === 0 ? G_BORDER : BORDER}`, borderTop: `2px solid ${idx === 0 ? G : BORDER}`, borderRadius: 10, padding: "14px 16px", cursor: "pointer", transition: "border-color 0.15s" }} onClick={() => onEdit(l)}>
                <div style={{ display: "flex", justify: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: 800, color: TEXT, marginBottom: 1 }}>{l.name || "—"}</div>
                    <div style={{ fontSize: 10, color: MUTED2 }}>{l.company}</div>
                  </div>
                  <div style={{ textAlign: "right", marginLeft: 8 }}>
                    <div style={{ fontSize: 11, fontWeight: 900, color: "#22C55E" }}>{value > 0 ? fmt(value) : "—"}</div>
                    <div style={{ fontSize: 8, color: MUTED }}>{prob}% prob</div>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 8 }}>
                  <span style={{ fontSize: 9, padding: "2px 6px", borderRadius: 4, background: `${STATUS_COLOR[l.status]}15`, border: `1px solid ${STATUS_COLOR[l.status]}35`, color: STATUS_COLOR[l.status], fontWeight: 700 }}>{l.status}</span>
                  <span style={{ fontSize: 9, padding: "2px 6px", borderRadius: 4, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", color: "#F97316", fontWeight: 700 }}>{urgency}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ fontSize: 9, color: MUTED }}>{daysSinceContact !== null ? `${daysSinceContact}d since contact` : "Never contacted"}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 9, fontWeight: 700, color: G }}>
                    Score {score} <ChevronRight size={10} />
                  </div>
                </div>
              </div>
            );
          })}
          {priorityLeads.length === 0 && <div style={{ fontSize: 11, color: MUTED, padding: "16px 0" }}>No active leads yet. Add leads to see priority opportunities.</div>}
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────────────
          SECTION 7 — TODAY'S CEO PRIORITIES (AI-generated)
      ───────────────────────────────────────────────────────────────────── */}
      <div style={CARD_ACCENT}>
        {SECTION_LABEL(CheckCircle2, "Today's CEO Priorities")}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
          <div style={{ fontSize: 11, color: MUTED }}>AI-ranked highest-ROI actions for today, grounded in live pipeline data.</div>
          <button onClick={getPriorities} disabled={aiPrioritiesLoading} style={btn(aiPrioritiesLoading)}>
            <RefreshCw size={10} />{aiPrioritiesLoading ? "Calculating…" : "Generate Priorities"}
          </button>
        </div>
        {aiPriorities ? (
          <div style={{ fontSize: 12, lineHeight: 1.85, color: "#d0cdc8", whiteSpace: "pre-wrap", background: "#0a0a0a", padding: "14px 16px", borderRadius: 10, border: `1px solid ${BORDER}` }}>{aiPriorities}</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {["Follow up on highest-scored active leads", "Review unanswered proposals", "Check intern DM activity", "Respond to waiting leads", "Plan tomorrow's outreach"].map((ex, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: "#0a0a0a", border: `1px solid ${BORDER}`, borderRadius: 8, opacity: 0.45 }}>
                <span style={{ fontSize: 12, fontWeight: 800, color: G, minWidth: 18 }}>{i + 1}</span>
                <span style={{ fontSize: 11, color: MUTED2 }}>{ex}</span>
                <span style={{ marginLeft: "auto", fontSize: 9, color: MUTED }}>Example</span>
              </div>
            ))}
            <div style={{ fontSize: 10, color: MUTED, textAlign: "center", marginTop: 4 }}>Click "Generate Priorities" to get AI-powered recommendations from your live data.</div>
          </div>
        )}
      </div>

      {/* ─────────────────────────────────────────────────────────────────────
          SECTION 10 — REVENUE FORECAST
      ───────────────────────────────────────────────────────────────────── */}
      <div style={CARD}>
        {SECTION_LABEL(DollarSign, "Revenue Forecast")}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10 }}>
          {[
            { label: "GUARANTEED", value: forecast.guaranteed, color: "#22C55E", desc: "Closed deals" },
            { label: "LIKELY (60%+)", value: forecast.likely, color: G, desc: "High-probability pipeline" },
            { label: "POSSIBLE (20%+)", value: forecast.possible, color: "#F59E0B", desc: "Mid-stage leads" },
            { label: "STRETCH (ALL)", value: forecast.stretch, color: "#8B5CF6", desc: "Full pipeline potential" },
          ].map(f => (
            <div key={f.label} style={{ textAlign: "center", padding: "14px 10px", background: SURFACE2, borderRadius: 10, border: `1px solid ${BORDER}`, borderTop: `2px solid ${f.color}` }}>
              <div style={{ fontSize: 8, color: MUTED, fontWeight: 700, letterSpacing: "0.1em", marginBottom: 6 }}>{f.label}</div>
              <div style={{ fontSize: 18, fontWeight: 900, color: f.color, letterSpacing: "-0.02em" }}>{fmt(f.value)}</div>
              <div style={{ fontSize: 9, color: MUTED2, marginTop: 4 }}>{f.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────────────
          SECTION 8 — TEAM PERFORMANCE DASHBOARD
      ───────────────────────────────────────────────────────────────────── */}
      <div style={CARD}>
        {SECTION_LABEL(UserCheck, "Team Performance Dashboard")}
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
            <thead>
              <tr>
                {["Team Member", "Role", "Active Leads", "DMs Today", "Replies", "Meetings", "Deals Closed", "Revenue", "Productivity"].map(h => (
                  <th key={h} style={{ textAlign: "left", padding: "6px 10px", fontSize: 8, color: MUTED, fontWeight: 700, letterSpacing: "0.08em", borderBottom: `1px solid ${BORDER}`, whiteSpace: "nowrap" }}>{h.toUpperCase()}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {teamPerf.map((p, idx) => (
                <tr key={p.name} style={{ borderBottom: `1px solid ${BORDER}` }}>
                  <td style={{ padding: "10px 10px", fontWeight: 800, color: SPECIALIST_COLOR[p.name] || TEXT, whiteSpace: "nowrap" }}>
                    {idx === 0 && <Star size={10} color="#F59E0B" style={{ marginRight: 4, display: "inline" }} />}
                    {specialistLabel(p.name)}
                  </td>
                  <td style={{ padding: "10px 10px", color: MUTED2, fontSize: 10, whiteSpace: "nowrap" }}>{p.name === "Alex" ? "Founder" : p.name.includes("Intern") ? "Intern" : "Team"}</td>
                  <td style={{ padding: "10px 10px", fontWeight: 700, color: TEXT }}>{p.activeLeads}</td>
                  <td style={{ padding: "10px 10px", fontWeight: 700, color: G }}>{p.dmsSent}</td>
                  <td style={{ padding: "10px 10px", fontWeight: 700, color: "#F59E0B" }}>{p.repliesGot}</td>
                  <td style={{ padding: "10px 10px", fontWeight: 700, color: "#F97316" }}>{p.meetBk}</td>
                  <td style={{ padding: "10px 10px", fontWeight: 700, color: "#22C55E" }}>{p.closedDeals}</td>
                  <td style={{ padding: "10px 10px", fontWeight: 700, color: "#22C55E", whiteSpace: "nowrap" }}>{p.revenue > 0 ? fmt(p.revenue) : "—"}</td>
                  <td style={{ padding: "10px 10px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <div style={{ width: 50, height: 4, background: BORDER, borderRadius: 2, overflow: "hidden" }}>
                        <div style={{ width: `${Math.min(100, p.prodScore)}%`, height: "100%", background: health_color(p.prodScore), borderRadius: 2 }} />
                      </div>
                      <span style={{ fontSize: 10, fontWeight: 700, color: health_color(p.prodScore) }}>{p.prodScore}</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────────────
          SECTION 9 — LIVE ACTIVITY FEED
      ───────────────────────────────────────────────────────────────────── */}
      <div style={CARD}>
        {SECTION_LABEL(Radio, "Live Activity Feed")}
        <div style={{ display: "flex", flexDirection: "column", gap: 0, maxHeight: 360, overflowY: "auto", paddingRight: 4 }}>
          {liveActivity.length === 0 && <div style={{ fontSize: 11, color: MUTED, padding: "16px 0", textAlign: "center" }}>No activity logged today. Your team will show here as they work.</div>}
          {liveActivity.map((act, idx) => {
            const actorColor = SPECIALIST_COLOR[act.actor] || MUTED;
            const typeColor = act.type === "dm" ? G : act.type === "reply" ? "#8B5CF6" : act.type === "add" ? "#22C55E" : "#F59E0B";
            const timeStr = new Date(act.ts).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
            const isToday = act.ts.startsWith(today());
            return (
              <div key={idx} style={{ display: "flex", gap: 10, padding: "9px 0", borderBottom: idx < liveActivity.length - 1 ? `1px solid ${BORDER}` : "none" }}>
                <div style={{ width: 3, borderRadius: 2, background: typeColor, flexShrink: 0, margin: "2px 0" }} />
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                    <span style={{ fontSize: 11, color: TEXT }}>
                      <span style={{ color: actorColor, fontWeight: 700 }}>{specialistLabel(act.actor)}</span>
                      {" "}<span style={{ color: MUTED2 }}>{act.type === "dm" ? "sent DM to" : act.type === "reply" ? "logged reply from" : act.type === "add" ? "added lead" : "updated"}</span>{" "}
                      <span style={{ color: G, fontWeight: 600 }}>{act.company}</span>
                    </span>
                    <span style={{ fontSize: 9, color: MUTED, whiteSpace: "nowrap", flexShrink: 0 }}>{isToday ? timeStr : `Yesterday ${timeStr}`}</span>
                  </div>
                  <div style={{ fontSize: 10, color: MUTED2, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "100%" }}>{act.text?.slice(0, 120)}{act.text?.length > 120 ? "…" : ""}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────────────
          SECTION 12 — AI OPPORTUNITY RADAR
      ───────────────────────────────────────────────────────────────────── */}
      <div style={CARD_ACCENT}>
        {SECTION_LABEL(Star, "AI Opportunity Radar")}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
          <div style={{ fontSize: 11, color: MUTED }}>AI ranks your top opportunities by closability right now, with specific reasoning and suggested actions.</div>
          <button onClick={getRadar} disabled={aiRadarLoading} style={btn(aiRadarLoading)}>
            <RefreshCw size={10} />{aiRadarLoading ? "Scanning…" : "Run Opportunity Radar"}
          </button>
        </div>
        {aiRadar ? (
          <div style={{ fontSize: 12, lineHeight: 1.85, color: "#d0cdc8", whiteSpace: "pre-wrap", background: "#0a0a0a", padding: "14px 16px", borderRadius: 10, border: `1px solid ${BORDER}` }}>{aiRadar}</div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 8 }}>
            {priorityLeads.slice(0, 4).map(({ lead: l, value, prob }) => (
              <div key={l.id} style={{ background: "#0a0a0a", border: `1px solid ${BORDER}`, borderRadius: 8, padding: "12px 14px", opacity: 0.6, cursor: "pointer" }} onClick={() => onEdit(l)}>
                <div style={{ fontSize: 12, fontWeight: 800, color: TEXT, marginBottom: 4 }}>{l.name || l.company}</div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: MUTED2 }}>
                  <span>{l.status}</span>
                  <span style={{ color: "#22C55E", fontWeight: 700 }}>{fmt(value)}</span>
                </div>
                <div style={{ fontSize: 9, color: MUTED, marginTop: 4 }}>Run radar for detailed AI analysis →</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ─────────────────────────────────────────────────────────────────────
          SECTION 14 — AI DECISION CENTER
      ───────────────────────────────────────────────────────────────────── */}
      <div style={CARD_ACCENT}>
        {SECTION_LABEL(Brain, "AI Decision Center — Executive Advisor")}
        <div style={{ fontSize: 11, color: MUTED, marginBottom: 10 }}>Ask any strategic question. Your AI advisor answers with live CRM context — pipeline data, lead names, and specific numbers.</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
          {["Which lead should I call today?", "Why is our close rate dropping?", "Where is revenue leaking?", "Who performs best?", "Forecast this month"].map(q => (
            <button key={q} onClick={() => setAdvisorQuestion(q)} style={{ background: "#0a0a0a", border: `1px solid ${BORDER}`, color: MUTED2, borderRadius: 6, padding: "5px 10px", fontSize: 10, cursor: "pointer", transition: "border-color 0.15s" }}>{q}</button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input value={advisorQuestion} onChange={e => setAdvisorQuestion(e.target.value)} onKeyDown={e => { if (e.key === "Enter") askAdvisor(); }} placeholder="e.g. Which deals are most likely to close this week?" style={{ ...iStyle, flex: "1 1 240px" }} />
          <button onClick={askAdvisor} disabled={advisorLoading || !advisorQuestion.trim()} style={btn(advisorLoading, !advisorQuestion.trim())}>
            {advisorLoading ? "Thinking…" : "Ask Advisor →"}
          </button>
        </div>
        {advisorAnswer && (
          <div style={{ marginTop: 12, fontSize: 12, lineHeight: 1.9, color: "#d0cdc8", whiteSpace: "pre-wrap", background: "#0a0a0a", padding: "14px 16px", borderRadius: 10, border: `1px solid ${BORDER}` }}>{advisorAnswer}</div>
        )}
      </div>

      {/* ─────────────────────────────────────────────────────────────────────
          EXISTING SECTIONS (preserved) — Intern Monitor, Weekly Rollup, Logs
      ───────────────────────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 8 }}>
        <button onClick={() => setShowInternSection(s => !s)} style={{ background: "transparent", border: `1px solid ${BORDER}`, color: MUTED2, borderRadius: 8, padding: "9px 16px", fontSize: 11, cursor: "pointer", fontWeight: 600, display: "flex", alignItems: "center", gap: 6, width: "100%" }}>
          <BarChart3 size={12} />
          {showInternSection ? "Hide" : "Show"} Intern Activity Monitor & Conversation Logs
          <ChevronRight size={11} style={{ marginLeft: "auto", transform: showInternSection ? "rotate(90deg)" : "none", transition: "transform 0.2s" }} />
        </button>
      </div>

      {showInternSection && (
        <>
          {/* Intern Activity Monitor */}
          <div style={CARD}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
              {SECTION_LABEL(Calendar, "Intern Activity Monitor & Audit")}
              <div style={{ display: "flex", gap: 4, alignItems: "center", flexWrap: "wrap" }}>
                {[{ label: "Today", val: today() }, { label: "Yesterday", val: yesterdayStr }, { label: "2 Days Ago", val: dayBeforeYesterdayStr }].map(p => (
                  <button key={p.label} onClick={() => setSelectedActivityDate(p.val)} style={{ background: selectedActivityDate === p.val ? G_DIM : "transparent", border: `1px solid ${selectedActivityDate === p.val ? G_BORDER : BORDER}`, color: selectedActivityDate === p.val ? G : MUTED, borderRadius: 6, padding: "4px 10px", fontSize: 11, cursor: "pointer" }}>{p.label}</button>
                ))}
                <div style={{ display: "flex", alignItems: "center", gap: 2, background: SURFACE2, border: `1px solid ${BORDER}`, borderRadius: 6, padding: "2px 6px" }}>
                  <Search size={11} color={MUTED} />
                  <input type="date" value={selectedActivityDate} onChange={e => setSelectedActivityDate(e.target.value)} style={{ background: "none", border: "none", color: TEXT, fontSize: 11, outline: "none", width: 115 }} />
                </div>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 10, marginBottom: 14 }}>
              {specialists.map(s => {
                const r = internStatsForSelectedDate[s] || { newLeads: 0, outreaches: 0, replies: 0, auditsRequested: 0, auditsDelivered: 0, meetingsBooked: 0, proposalsSent: 0, clientsClosed: 0 };
                return (
                  <div key={s} style={{ background: SURFACE2, border: `1px solid ${SPECIALIST_COLOR[s]}30`, borderTop: `2px solid ${SPECIALIST_COLOR[s]}`, borderRadius: 8, padding: "12px 14px" }}>
                    <div style={{ fontSize: 11, fontWeight: 800, color: SPECIALIST_COLOR[s], marginBottom: 8, display: "flex", alignItems: "center", gap: 4 }}>
                      <UserCheck size={12} /> {specialistLabel(s)}
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                      {[["New Leads Added", r.newLeads, TEXT], ["Outreach Sent", r.outreaches, G], ["Replies Received", r.replies, "#F59E0B"], ["Audits Requested", r.auditsRequested, "#a855f7"], ["Audits Delivered", r.auditsDelivered, "#ec4899"], ["Meetings Booked", r.meetingsBooked, "#F97316"], ["Proposals Sent", r.proposalsSent, "#06B6D4"], ["Clients Closed", r.clientsClosed, "#22C55E"]].map(([label, val, color]) => (
                        <div key={label as string} style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
                          <span style={{ color: MUTED2 }}>{label}:</span>
                          <span style={{ fontWeight: 700, color: color as string }}>{val as number}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
            <div style={{ background: SURFACE2, border: `1px solid ${BORDER}`, borderRadius: 8, padding: 12 }}>
              <div style={{ fontSize: 9, color: MUTED2, fontWeight: 700, letterSpacing: "0.08em", marginBottom: 10, textTransform: "uppercase" }}>
                Chronological Audit — {activitiesForSelectedDate.length} Event{activitiesForSelectedDate.length !== 1 ? "s" : ""} on {selectedActivityDate}
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
                      <p style={{ fontSize: 11, color: "#ccc", lineHeight: 1.5, marginTop: 4, whiteSpace: "pre-wrap", background: BG, padding: "6px 8px", borderRadius: 5, border: `1px solid ${BORDER}` }}>{act.text}</p>
                    </div>
                  );
                })}
                {activitiesForSelectedDate.length === 0 && <div style={{ textAlign: "center", padding: "20px 0", color: MUTED, fontSize: 11 }}>No events on {selectedActivityDate}.</div>}
              </div>
            </div>
          </div>

          {/* Weekly Rollup */}
          <div style={CARD}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
              {SECTION_LABEL(BarChart3, `Weekly Performance — ${rollupWeekStart} to ${rollupWeekEnd}`)}
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <button onClick={() => setRollupWeekOffset(o => o - 1)} style={{ background: SURFACE2, border: `1px solid ${BORDER}`, color: TEXT, borderRadius: 6, padding: "4px 10px", fontSize: 11, cursor: "pointer" }}>← Prev Week</button>
                {rollupWeekOffset < 0 && <button onClick={() => setRollupWeekOffset(0)} style={{ background: G_DIM, border: `1px solid ${G_BORDER}`, color: G, borderRadius: 6, padding: "4px 10px", fontSize: 11, cursor: "pointer" }}>This Week</button>}
                {rollupWeekOffset < 0 && <button onClick={() => setRollupWeekOffset(o => Math.min(0, o + 1))} style={{ background: SURFACE2, border: `1px solid ${BORDER}`, color: TEXT, borderRadius: 6, padding: "4px 10px", fontSize: 11, cursor: "pointer" }}>Next Week →</button>}
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 10 }}>
              {rollup.map(r => (
                <div key={r.name} style={{ background: SURFACE2, border: `1px solid ${SPECIALIST_COLOR[r.name]}30`, borderTop: `2px solid ${SPECIALIST_COLOR[r.name]}`, borderRadius: 8, padding: "12px 14px" }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: SPECIALIST_COLOR[r.name], marginBottom: 8, display: "flex", alignItems: "center", gap: 5 }}>
                    <UserCheck size={13} /> {specialistLabel(r.name)}
                  </div>
                  <div style={{ fontSize: 11, color: "#ccc", display: "flex", flexDirection: "column", gap: 3 }}>
                    <span>New conversations: <b style={{ color: TEXT }}>{r.newLeads}</b></span>
                    <span>Follow-ups made: <b style={{ color: TEXT }}>{r.followUps}</b></span>
                    <span>Replies logged: <b style={{ color: TEXT }}>{r.replies}</b></span>
                    <span>Proposals sent: <b style={{ color: TEXT }}>{r.proposals}</b></span>
                    <span>Partnerships closed: <b style={{ color: "#22C55E" }}>{r.closed}</b></span>
                  </div>
                  <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${BORDER}`, fontSize: 10, color: MUTED }}>
                    All-time: {r.totalLeads} leads · {r.totalClosed} closed · {fmt(r.totalRevenue)} locked
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Full Conversation Log */}
          <div style={CARD}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
              {SECTION_LABEL(FileText, "Full Conversation Log View")}
              <select value={fSpecialist} onChange={e => setFSpecialist(e.target.value)} style={{ ...iStyle, width: 170, cursor: "pointer" }}>
                <option value="All">All Interns</option>
                {specialists.map(s => <option key={s} value={s}>{specialistLabel(s)}</option>)}
              </select>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 600, overflowY: "auto" }}>
              {alphaSort(filteredLeads).map(l => (
                <div key={l.id} style={{ background: SURFACE2, border: `1px solid ${BORDER}`, borderRadius: 8, padding: "10px 12px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 6, marginBottom: l.dmText || l.prospectLatestResponse ? 6 : 0 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: TEXT }}>{l.name || "—"} <span style={{ color: MUTED, fontWeight: 400 }}>{l.company}</span></span>
                    <div style={{ display: "flex", gap: 5 }}>
                      <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 4, background: `${STATUS_COLOR[l.status]}18`, border: `1px solid ${STATUS_COLOR[l.status]}40`, color: STATUS_COLOR[l.status], fontWeight: 700 }}>{l.status}</span>
                      <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 4, background: `${SPECIALIST_COLOR[l.assignedTo]}15`, border: `1px solid ${SPECIALIST_COLOR[l.assignedTo]}40`, color: SPECIALIST_COLOR[l.assignedTo], fontWeight: 700 }}>{specialistLabel(l.assignedTo)}</span>
                    </div>
                  </div>
                  {l.dmText && <div style={{ fontSize: 10, color: MUTED2, marginBottom: 2 }}><b style={{ color: G }}>DM sent:</b> {l.dmText.slice(0, 140)}{l.dmText.length > 140 ? "…" : ""}</div>}
                  {l.prospectLatestResponse && <div style={{ fontSize: 10, color: MUTED2 }}><b style={{ color: "#8B5CF6" }}>Latest reply:</b> {l.prospectLatestResponse.slice(0, 140)}{l.prospectLatestResponse.length > 140 ? "…" : ""}</div>}
                </div>
              ))}
              {filteredLeads.length === 0 && <div style={{ fontSize: 11, color: MUTED, textAlign: "center", padding: "14px 0" }}>No leads under this filter.</div>}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
