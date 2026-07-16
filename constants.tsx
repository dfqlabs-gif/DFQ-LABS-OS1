import { Flame, Sun, Sprout, Snowflake, Circle, Shield, UserCheck, Copy, Check } from "lucide-react";
import React from "react";
import { Lead } from "./types";
import { BUSINESS_CONTEXT, callClaude } from "./prompts";

export const G = "#3ECFDC";
export const G_DIM = "rgba(62,207,220,0.10)";
export const G_BORDER = "rgba(62,207,220,0.22)";
export const BG = "#080808";
export const SURFACE = "#0f0f0f";
export const SURFACE2 = "#141414";
export const BORDER = "#1e1e1e";
export const BORDER2 = "#2a2a2a";
export const TEXT = "#f0ede8";
export const MUTED = "#555";
export const MUTED2 = "#888";

export const TARGET_REVENUE = 10000000;
export const TARGET_DATE = new Date("2026-12-31");
export const DAILY_FOLLOWUP_CAP = 15;
export const BETA_SPOTS_TOTAL = 3;
export const BETA_MONTH_LABEL = "July 2026";
export const BETA_MONTH_KEY = "2026-07";
export const RELATIONSHIP_RENEWAL_DAYS = 90;
export const RELATIONSHIP_WARNING_DAYS = 75;
export const RESPONSE_GUARD_HOURS = 24;
export const MEETING_WINDOW_HOURS = 24;

export const CEO_PASSWORD = "War_Machine26";
export const INTERN_A_PASSWORD = "InternA_2607";
export const INTERN_B_PASSWORD = "InternB_2607";
export const SAADATU_PASSWORD = "Saadatu_2607";
export const SESSION_KEY = "dfqlabs-session-v1";
// Idle timeout before auto-logout. Raised from 15 minutes to reduce forced
// logout friction during normal work sessions, while still locking the OS
// if a device is left unattended for a few hours.
export const SESSION_IDLE_MS = 4 * 60 * 60 * 1000;

// Display-only labels for the intern roles. Internal keys ("Intern A" /
// "Intern B") are unchanged everywhere they're used as data values
// (assignedTo, SPECIALIST_COLOR, auto-assignment) so existing lead
// assignments never silently move — only what the user sees is renamed.
export const SPECIALIST_DISPLAY: Record<string, string> = {
  "Intern A": "Client Relationships",
  "Intern B": "Outreach"
};
export function specialistLabel(name: string): string {
  return SPECIALIST_DISPLAY[name] || name;
}

export const STATUSES = [
  "New",
  "DM Sent",
  "Replied",
  "Audit Requested",
  "Audit Delivered",
  "Value Given",
  "Discovery Call Booked",
  "Discovery Call Done",
  "Proposal Sent",
  "Closed",
  "Lost"
];

export const SOURCES = [
  "LinkedIn",
  "Instagram",
  "Twitter/X",
  "Referral",
  "Cold Email",
  "WhatsApp",
  "Event",
  "Other"
];

export const PRIORITIES = ["High", "Medium", "Low"];

export const SERVICES = [
  "Starter — ₦200K/mo",
  "Growth — ₦500K/mo",
  "Advanced — ₦1M/mo",
  "Team Training — ₦350K",
  "Custom"
];

export const SERVICE_VALUE: Record<string, number> = {
  "Starter — ₦200K/mo": 200000,
  "Growth — ₦500K/mo": 500000,
  "Advanced — ₦1M/mo": 1000000,
  "Team Training — ₦350K": 350000,
  "Custom": 0
};

export const CLIENT_TYPES = [
  "Real Estate Developer",
  "Luxury Realtor / Agency",
  "Architecture Firm",
  "Construction Firm",
  "Other"
];

export const STAGE_PROBABILITY: Record<string, number> = {
  "New": 5,
  "DM Sent": 10,
  "Replied": 20,
  "Audit Requested": 30,
  "Audit Delivered": 40,
  "Value Given": 50,
  "Discovery Call Booked": 60,
  "Discovery Call Done": 70,
  "Proposal Sent": 80,
  "Closed": 100,
  "Lost": 0
};

export const DELIVERY_STAGES = [
  "Discovery",
  "Strategy",
  "Production",
  "Review",
  "Delivery",
  "Invoice",
  "Paid"
];

export const STATUS_COLOR: Record<string, string> = {
  "New": "#333",
  "DM Sent": G,
  "Replied": "#F59E0B",
  "Audit Requested": "#a855f7",
  "Audit Delivered": "#ec4899",
  "Value Given": "#8B5CF6",
  "Discovery Call Booked": "#F97316",
  "Discovery Call Done": "#06B6D4",
  "Proposal Sent": "#EC4899",
  "Closed": "#22C55E",
  "Lost": "#EF4444"
};

export const PRIORITY_COLOR: Record<string, string> = {
  High: "#EF4444",
  Medium: "#F59E0B",
  Low: "#22C55E"
};

export const BUCKETS = ["Hot", "Warm", "Nurture", "Cold", "Dead"];

export const BUCKET_COLOR: Record<string, string> = {
  Hot: "#EF4444",
  Warm: "#F59E0B",
  Nurture: "#8B5CF6",
  Cold: "#3B82F6",
  Dead: "#444"
};

export const BUCKET_ICON_CMP: Record<string, any> = {
  Hot: Flame,
  Warm: Sun,
  Nurture: Sprout,
  Cold: Snowflake,
  Dead: Circle
};

export const SILENT_DAYS_TO_NURTURE = 7;
export const SPECIALISTS = ["Unassigned", "Alex", "Intern A", "Intern B"];

export const SPECIALIST_COLOR: Record<string, string> = {
  "Unassigned": "#555",
  "Alex": G,
  "Intern A": "#F59E0B",
  "Intern B": "#8B5CF6"
};

export const today = (): string => {
  const d = new Date();
  const tz = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tz).toISOString().split("T")[0];
};

export const addDays = (n: number): string => {
  const d = new Date();
  const tz = d.getTimezoneOffset() * 60000;
  const local = new Date(d.getTime() - tz);
  local.setDate(local.getDate() + n);
  return local.toISOString().split("T")[0];
};

export const nowISO = () => new Date().toISOString();

export const daysSince = (d: string | null | undefined): number => {
  if (!d) return 999;
  return Math.floor((Date.now() - new Date(d).getTime()) / 86400000);
};

export const hoursSince = (d: string | null | undefined): number => {
  if (!d) return Infinity;
  return (Date.now() - new Date(d).getTime()) / 3600000;
};

export const hoursUntil = (d: string | null | undefined): number => {
  if (!d) return -Infinity;
  return (new Date(d).getTime() - Date.now()) / 3600000;
};

export const touchpointDate = (l: Lead): string => {
  return l.lastMeaningfulTouchpoint || l.lastContacted || l.dateAdded;
};

export const fmt = (n: number): string => {
  if (n >= 1000000) return `₦${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `₦${Math.round(n / 1000)}K`;
  return `₦${n}`;
};

export const leadLabel = (l: Lead): string => l.name || l.company || "Unnamed";

export const alphaSort = (arr: Lead[]): Lead[] => {
  return [...arr].sort((a, b) => leadLabel(a).localeCompare(leadLabel(b), undefined, { sensitivity: "base" }));
};

export const effectiveDue = (l: Lead): string => {
  return l.nextActionDate || l.autoFollowUpDate || "";
};

export const normalizeCompany = (s: string): string => {
  return (s || "").toLowerCase().replace(/[^a-z0-9]/g, "").trim();
};

export function getWeekKey(d: Date): string {
  const dt = new Date(d);
  dt.setHours(0, 0, 0, 0);
  dt.setDate(dt.getDate() - dt.getDay());
  return dt.toISOString().split("T")[0];
}

export function calcStreak(dates: string[]): number {
  if (!dates?.length) return 0;
  const unique = [...new Set(dates.map(d => d.split("T")[0]))].sort().reverse();
  let streak = 0;
  let check = new Date();
  check.setHours(0, 0, 0, 0);
  for (const d of unique) {
    const dt = new Date(d);
    const diff = Math.round((check.getTime() - dt.getTime()) / 86400000);
    if (diff <= 1) {
      streak++;
      check = dt;
    } else {
      break;
    }
  }
  return streak;
}

export function getXPLevel(xp: number) {
  if (xp < 100) return { level: 1, title: "Scout", next: 100, color: "#666" };
  if (xp < 300) return { level: 2, title: "Prospector", next: 300, color: "#F59E0B" };
  if (xp < 600) return { level: 3, title: "Connector", next: 600, color: "#8B5CF6" };
  if (xp < 1000) return { level: 4, title: "Closer", next: 1000, color: "#F97316" };
  return { level: 5, title: "Elite", next: null, color: G };
}

export function calcRevenue(leads: Lead[]) {
  let guaranteed = 0;
  let likely = 0;
  let best = 0;
  let weighted = 0;
  leads.filter(l => l.status !== "Lost").forEach(l => {
    const val = SERVICE_VALUE[l.service] || 0;
    const prob = STAGE_PROBABILITY[l.status] || 0;
    if (l.status === "Closed") {
      guaranteed += val;
      likely += val;
      best += val;
      weighted += val;
    } else {
      weighted += val * (prob / 100);
      if (prob >= 60) likely += val;
      best += val;
    }
  });
  return { guaranteed, likely, best, weighted: Math.round(weighted) };
}

export function calcWeeklyTargets(leads: Lead[]) {
  const revenue = calcRevenue(leads);
  const closedRevenue = revenue.guaranteed;
  const gap = Math.max(0, TARGET_REVENUE - closedRevenue);
  const now = new Date();
  const weeksLeft = Math.max(1, Math.ceil((TARGET_DATE.getTime() - now.getTime()) / (7 * 86400000)));
  const totalLeads = leads.length;
  const totalClosed = leads.filter(l => l.status === "Closed").length;
  const closeRate = totalLeads > 0 ? totalClosed / totalLeads : 0.1;
  const convRate = Math.max(0.05, closeRate);
  const BOOKING_RATE = 0.3;
  const avgDealSize = totalClosed > 0 ? closedRevenue / totalClosed : 500000;
  const dealsNeeded = Math.ceil(gap / Math.max(avgDealSize, 200000));
  const dealsNeededPerWeek = Math.max(1, Math.ceil(dealsNeeded / weeksLeft));
  const callsNeededPerWeek = Math.max(1, Math.ceil(dealsNeededPerWeek / convRate));
  const dmsNeededPerWeek = Math.max(callsNeededPerWeek, Math.ceil(callsNeededPerWeek / BOOKING_RATE));
  return {
    closedRevenue,
    gap,
    weeksLeft,
    totalLeads,
    totalClosed,
    closeRate,
    convRate,
    BOOKING_RATE,
    avgDealSize,
    dealsNeeded,
    dealsNeededPerWeek,
    callsNeededPerWeek,
    dmsNeededPerWeek
  };
}

export function scoreBreakdown(l: Lead) {
  const reasons = [];
  const ds = daysSince(l.lastContacted);
  if (ds <= 1) {
    reasons.push({ label: "Contacted very recently", pts: 25 });
  } else if (ds <= 3) {
    reasons.push({ label: "Contacted within 3 days", pts: 15 });
  } else if (ds <= 7) {
    reasons.push({ label: "Contacted within a week", pts: 8 });
  }
  
  const sp: Record<string, number> = {
    "Discovery Call Booked": 25,
    "Discovery Call Done": 25,
    "Replied": 20,
    "Audit Requested": 20,
    "Audit Delivered": 20,
    "Value Given": 20,
    "Proposal Sent": 18,
    "DM Sent": 10,
    "New": 5
  };
  reasons.push({ label: `Pipeline stage: ${l.status}`, pts: sp[l.status] || 5 });
  
  const pp: Record<string, number> = { High: 25, Medium: 15, Low: 5 };
  reasons.push({ label: `Priority: ${l.priority}`, pts: pp[l.priority] || 15 });
  
  const due = l.nextActionDate || l.autoFollowUpDate;
  const overdue = due && due < today();
  const dueToday = due === today();
  if (overdue) reasons.push({ label: "Follow-up overdue", pts: 25 });
  else if (dueToday) reasons.push({ label: "Follow-up due today", pts: 20 });
  else if (!due && (l.prospectInitialResponse || l.prospectLatestResponse)) {
    reasons.push({ label: "Has unscheduled reply thread", pts: 15 });
  } else if (!due && l.dmText) {
    reasons.push({ label: "Outreach sent, no schedule", pts: 8 });
  }
  
  const bb: Record<string, number> = { Hot: 30, Warm: 18, Nurture: 0, Cold: -10, Dead: -30 };
  if (l.aiBucket) reasons.push({ label: `AI bucket: ${l.aiBucket}`, pts: bb[l.aiBucket] || 0 });
  if (l.betaCandidate) reasons.push({ label: "Beta candidate", pts: 10 });
  
  const val = SERVICE_VALUE[l.service] || 0;
  if (val >= 1000000) reasons.push({ label: "High revenue potential (₦1M+ tier)", pts: 14 });
  else if (val >= 500000) reasons.push({ label: "Mid-high revenue potential", pts: 8 });
  
  if (l.awaitingReplySince && hoursSince(l.awaitingReplySince) >= RESPONSE_GUARD_HOURS) {
    reasons.push({ label: `Awaiting our reply ${Math.floor(hoursSince(l.awaitingReplySince))}h`, pts: 22 });
  }
  
  if (l.meetingScheduledAt && hoursUntil(l.meetingScheduledAt) >= 0 && hoursUntil(l.meetingScheduledAt) <= MEETING_WINDOW_HOURS) {
    reasons.push({ label: "Meeting within 24h", pts: 20 });
  }
  
  const tp = daysSince(touchpointDate(l));
  if (tp >= RELATIONSHIP_RENEWAL_DAYS) reasons.push({ label: `${tp}d since meaningful touchpoint`, pts: -10 });
  
  return reasons;
}

export function scoreLead(l: Lead): number {
  const total = scoreBreakdown(l).reduce((s, r) => s + r.pts, 0);
  return Math.max(0, Math.min(total, 180));
}

export function ruleBasedBucket(lead: Lead) {
  const hasOutreach = !!lead.dmText;
  const hasAnyReply = !!(lead.prospectInitialResponse || lead.prospectLatestResponse);
  if (lead.status === "Closed") return null;
  if (lead.status === "Lost") return { bucket: "Dead", days: null };
  if (hasOutreach && !hasAnyReply) {
    const ds = daysSince(lead.lastContacted || lead.dateAdded);
    if (ds >= SILENT_DAYS_TO_NURTURE) return { bucket: "Nurture", days: 3 };
  }
  return null;
}

export function getInternActivities(leads: Lead[], selectedDate: string) {
  const activities: any[] = [];
  leads.forEach(lead => {
    const actor = lead.assignedTo || "Unassigned";
    
    // Check if added on this date
    if (lead.dateAdded === selectedDate) {
      activities.push({
        ts: lead.dateAdded + "T00:00:00.000Z",
        type: "add",
        actor,
        leadName: lead.name || "Unnamed",
        company: lead.company || "Unknown Company",
        title: "Added New Lead",
        text: `Created lead for ${lead.company}${lead.name ? ` (${lead.name})` : ""}. Source: ${lead.source}, Client Type: ${lead.clientType}.`
      });
    }

    // Check conversationLog for matching dates
    if (lead.conversationLog && Array.isArray(lead.conversationLog)) {
      lead.conversationLog.forEach(log => {
        if (log.ts && log.ts.split("T")[0] === selectedDate) {
          let typeLabel = "Action Logged";
          if (log.type === "dm") typeLabel = "Sent Outbound DM";
          else if (log.type === "reply") typeLabel = "Logged Prospect Reply";
          else if (log.type === "status_change") typeLabel = "Status Updated";
          else if (log.type === "note") typeLabel = "Added Note";

          activities.push({
            ts: log.ts,
            type: log.type,
            actor: log.by || actor,
            leadName: lead.name || "Unnamed",
            company: lead.company || "Unknown Company",
            title: typeLabel,
            text: log.text
          });
        }
      });
    }

    // Check completedFollowUps for entries on this date that aren't already captured by the logs
    if (lead.completedFollowUps && Array.isArray(lead.completedFollowUps)) {
      lead.completedFollowUps.forEach(ts => {
        if (ts && ts.split("T")[0] === selectedDate) {
          const hasLog = lead.conversationLog?.some(l => l.ts === ts || (l.ts.split("T")[0] === selectedDate && l.label === "Follow-up Made"));
          if (!hasLog) {
            activities.push({
              ts,
              type: "note",
              actor,
              leadName: lead.name || "Unnamed",
              company: lead.company || "Unknown Company",
              title: "Follow-up Made",
              text: "Marked as contacted/followed up."
            });
          }
        }
      });
    }
  });

  return activities.sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());
}

// ── Lead Integrity & Duplicate Prevention ────────────────────────────────────
// Normalization helpers used both to clean data on save and to compare leads
// for potential duplicates. Kept separate from normalizeCompany (above) which
// existing assignment-conflict logic already depends on.

export const cleanText = (s: string | undefined | null): string => (s || "").replace(/\s+/g, " ").trim();

export const normalizePhoneDigits = (s: string | undefined | null): string => {
  const digits = (s || "").replace(/\D/g, "");
  if (!digits) return "";
  // Compare on the last 10 significant digits so +234 / 234 / leading-0
  // formatting differences don't produce false negatives or positives.
  return digits.slice(-10);
};

export const normalizeInstagramHandle = (s: string | undefined | null): string => {
  return (s || "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\/(www\.)?instagram\.com\//, "")
    .replace(/^@/, "")
    .split("?")[0]
    .replace(/\/+$/, "");
};

export const normalizeEmailAddress = (s: string | undefined | null): string => (s || "").trim().toLowerCase();

export const normalizeContactName = (s: string | undefined | null): string => {
  return (s || "")
    .toLowerCase()
    .replace(/^(mr|mrs|ms|dr|miss|engr|chief|prince|princess)\.?\s+/, "")
    .replace(/[^a-z0-9]/g, "")
    .trim();
};

const COMPANY_SUFFIX_WORDS = new Set(["ltd", "limited", "llc", "inc", "incorporated", "plc", "co", "company", "corp", "corporation", "group"]);

export const normalizeCompanyFuzzy = (s: string | undefined | null): string => {
  const v = (s || "").toLowerCase().trim().replace(/[^a-z0-9\s]/g, " ");
  const words = v.split(/\s+/).filter(w => w && !COMPANY_SUFFIX_WORDS.has(w));
  return words.join("");
};

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const dp: number[] = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, dp[j], dp[j - 1]);
      prev = tmp;
    }
  }
  return dp[b.length];
}

export function textSimilarity(a: string, b: string): number {
  if (!a && !b) return 1;
  if (!a || !b) return 0;
  const maxLen = Math.max(a.length, b.length);
  if (!maxLen) return 1;
  return 1 - levenshtein(a, b) / maxLen;
}

export interface DuplicateMatch {
  lead: Lead;
  confidence: number; // 0-100
  matchedFields: string[];
}

// Fast, purely client-side (no network round-trip) scan against already-loaded
// leads — safe to run on every keystroke without hurting lead-creation speed.
export function findPotentialDuplicates(existingLeads: Lead[], candidate: Lead, opts?: { threshold?: number }): DuplicateMatch[] {
  const threshold = opts?.threshold ?? 45;
  const candCompany = normalizeCompanyFuzzy(candidate.company);
  const candContact = normalizeContactName(candidate.name);
  const candPhone = normalizePhoneDigits(candidate.phone);
  const candWhatsapp = normalizePhoneDigits(candidate.whatsapp);
  const candIg = normalizeInstagramHandle(candidate.instagram);
  const candEmail = normalizeEmailAddress(candidate.email);

  const results: DuplicateMatch[] = [];

  for (const l of existingLeads) {
    if (l.id === candidate.id || l.mergedInto) continue;

    let score = 0;
    const matched: string[] = [];

    if (candPhone && normalizePhoneDigits(l.phone) === candPhone) { score += 45; matched.push("Phone"); }
    if (candWhatsapp && normalizePhoneDigits(l.whatsapp) === candWhatsapp) { score += 45; matched.push("WhatsApp"); }
    if (candIg && normalizeInstagramHandle(l.instagram) === candIg) { score += 45; matched.push("Instagram"); }
    if (candEmail && normalizeEmailAddress(l.email) === candEmail) { score += 45; matched.push("Email"); }

    const lCompany = normalizeCompanyFuzzy(l.company);
    if (candCompany && lCompany) {
      if (lCompany === candCompany) { score += 50; matched.push("Company Name"); }
      else {
        const sim = textSimilarity(lCompany, candCompany);
        if (sim >= 0.84) { score += Math.round(25 * sim); matched.push("Company Name (similar)"); }
      }
    }

    const lContact = normalizeContactName(l.name);
    if (candContact && lContact) {
      if (lContact === candContact) { score += 20; matched.push("Contact Name"); }
      else {
        const sim = textSimilarity(lContact, candContact);
        if (sim >= 0.86) { score += Math.round(12 * sim); matched.push("Contact Name (similar)"); }
      }
    }

    score = Math.min(100, score);
    if (score >= threshold && matched.length) results.push({ lead: l, confidence: score, matchedFields: matched });
  }

  return results.sort((a, b) => b.confidence - a.confidence);
}

export interface DuplicatePair {
  a: Lead;
  b: Lead;
  confidence: number;
  matchedFields: string[];
}

export function duplicatePairKey(idA: string, idB: string): string {
  return [idA, idB].sort().join("::");
}

// Full pairwise scan for the Duplicate Review page. O(n^2) but only runs when
// that tab is open, against already-loaded leads — fine at CRM scale.
export function scanAllDuplicates(leads: Lead[]): DuplicatePair[] {
  const active = leads.filter(l => !l.mergedInto);
  const pairs: DuplicatePair[] = [];
  for (let i = 0; i < active.length; i++) {
    const matches = findPotentialDuplicates(active.slice(i + 1), active[i]);
    for (const m of matches) {
      pairs.push({ a: active[i], b: m.lead, confidence: m.confidence, matchedFields: m.matchedFields });
    }
  }
  return pairs.sort((a, b) => b.confidence - a.confidence);
}

export const REQUIRED_LEAD_FIELDS: Array<{ key: keyof Lead; label: string }> = [
  { key: "name", label: "Contact Name" },
  { key: "company", label: "Company Name" },
  { key: "source", label: "Lead Source" },
  { key: "assignedTo", label: "Assigned Team Member" },
  { key: "status", label: "Pipeline Stage" }
];

export function getMissingRequiredFields(lead: Lead): string[] {
  const missing: string[] = [];
  if (!cleanText(lead.name)) missing.push("Contact Name");
  if (!cleanText(lead.company)) missing.push("Company Name");
  if (!lead.source) missing.push("Lead Source");
  if (!lead.assignedTo || lead.assignedTo === "Unassigned") missing.push("Assigned Team Member");
  if (!lead.status) missing.push("Pipeline Stage");
  return missing;
}

export function findDuplicateConflict(leads: Lead[], lead: Lead) {
  const norm = normalizeCompany(lead.company);
  if (!norm || !lead.assignedTo || lead.assignedTo === "Unassigned") return null;
  return leads.find(l => l.id !== lead.id && normalizeCompany(l.company) === norm && l.assignedTo && l.assignedTo !== "Unassigned" && l.assignedTo !== lead.assignedTo && l.status !== "Lost") || null;
}

export function autoAssignSpecialist(leads: Lead[], lead: Lead): string {
  const norm = normalizeCompany(lead.company);
  if (norm) {
    const existing = leads.find(l => normalizeCompany(l.company) === norm && l.assignedTo && l.assignedTo !== "Unassigned" && l.status !== "Lost");
    if (existing) return existing.assignedTo;
  }
  let countA = leads.filter(l => l.assignedTo === "Intern A" && !["Closed", "Lost"].includes(l.status)).length;
  let countB = leads.filter(l => l.assignedTo === "Intern B" && !["Closed", "Lost"].includes(l.status)).length;
  return countA <= countB ? "Intern A" : "Intern B";
}

export const ROLE_ACCESS = {
  founder: { password: CEO_PASSWORD, label: "Founder", color: G, Icon: Shield },
  saadatu: { password: SAADATU_PASSWORD, label: "Saadatu", color: SPECIALIST_COLOR["Intern A"], Icon: UserCheck },
  // Legacy keys kept so any persisted sessions still resolve; not shown on login screen
  internA: { password: INTERN_A_PASSWORD, label: "Outreach", color: SPECIALIST_COLOR["Intern A"], Icon: UserCheck },
  internB: { password: INTERN_B_PASSWORD, label: "Client Relationships", color: SPECIALIST_COLOR["Intern B"], Icon: UserCheck }
};

export async function classifyLead(lead: Lead): Promise<{ bucket: string; reason: string; nextAction: string; followUpInDays?: number }> {
  try {
    const thread = `Lead: ${lead.name || "—"} (${lead.company || "—"}). Client Type: ${lead.clientType || "—"}. Status: ${lead.status}. Priority: ${lead.priority}. DM Sent: ${lead.dmText || "none"}. Reply: ${lead.prospectInitialResponse || "none"}. Latest: ${lead.prospectLatestResponse || "none"}. Notes: ${lead.notes || "none"}.`;
    const prompt = `Read this lead's thread and classify it into one of these buckets: Hot, Warm, Nurture, Cold, Dead. Respond in EXACT JSON format with keys: "bucket", "reason", "nextAction", "followUpInDays". No other text.\n\n${thread}`;
    const raw = await callClaude(BUSINESS_CONTEXT, prompt, 300);
    const jsonStart = raw.indexOf("{");
    const jsonEnd = raw.lastIndexOf("}");
    if (jsonStart !== -1 && jsonEnd !== -1) {
      const parsed = JSON.parse(raw.slice(jsonStart, jsonEnd + 1));
      if (parsed.bucket && BUCKETS.includes(parsed.bucket)) {
        return parsed;
      }
    }
  } catch (_) {}
  const rule = ruleBasedBucket(lead);
  return {
    bucket: rule ? rule.bucket : (lead.aiBucket || "Cold"),
    reason: "Standard follow-up pattern.",
    nextAction: "Send value piece or re-engagement message.",
    followUpInDays: rule?.days ?? 3
  };
}

export function detectMeetingRequest(lead: Lead): boolean {
  const text = `${lead.prospectInitialResponse || ""} ${lead.prospectLatestResponse || ""} ${lead.notes || ""}`.toLowerCase();
  return text.includes("meet") || text.includes("office") || text.includes("site") || text.includes("physical") || text.includes("visit") || text.includes("come over") || text.includes("zoom") || text.includes("call");
}

export function meetingQualified(lead: Lead): boolean {
  const text = `${lead.notes || ""} ${lead.prospectLatestResponse || ""}`.toLowerCase();
  const hasBudget = text.includes("budget") || text.includes("naira") || text.includes("₦") || text.includes("pay") || text.includes("fee");
  const hasTimeline = text.includes("start") || text.includes("timeline") || text.includes("month") || text.includes("week") || text.includes("ready");
  const hasAuthority = text.includes("ceo") || text.includes("director") || text.includes("founder") || text.includes("owner") || text.includes("decision");
  return hasBudget || hasTimeline || hasAuthority;
}

// ----------------------------------------------------
// VISUAL DESIGN AND BADGES UTILITIES
// ----------------------------------------------------

export const iStyle = {
  background: "#141414",
  border: "1px solid #1e1e1e",
  color: "#f0ede8",
  borderRadius: "6px",
  padding: "8px 12px",
  fontSize: "13px",
  width: "100%",
  outline: "none",
};

export function Fld({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, width: "100%" }}>
      <label style={{ fontSize: "10px", color: "#888", fontWeight: 700, textTransform: "uppercase" }}>{label}</label>
      {children}
    </div>
  );
}

export function Bdg({ text, color, solid, icon: Icon }: { text: string; color: string; solid?: boolean; icon?: any }) {
  return (
    <span style={{ 
      display: "inline-flex", 
      alignItems: "center", 
      gap: 4, 
      fontSize: "10px", 
      padding: "2px 7px", 
      borderRadius: "4px", 
      background: solid ? `${color}15` : "transparent", 
      border: `1px solid ${color}35`, 
      color: color, 
      fontWeight: 700 
    }}>
      {Icon && <Icon size={10} />}
      {text}
    </span>
  );
}

export function BucketBdg({ bucket, classifying }: { bucket?: string; classifying?: boolean }) {
  if (classifying) {
    return (
      <span className="pulse" style={{ fontSize: "9px", padding: "2px 6px", borderRadius: "4px", background: "rgba(62,207,220,0.1)", border: "1px solid rgba(62,207,220,0.3)", color: G, fontWeight: 700 }}>
        CLASSIFYING…
      </span>
    );
  }
  if (!bucket) return null;
  const c = BUCKET_COLOR[bucket] || "#555";
  return (
    <span style={{ fontSize: "10px", padding: "2px 7px", borderRadius: "4px", background: `${c}12`, border: `1px solid ${c}30`, color: c, fontWeight: 700 }}>
      {bucket.toUpperCase()}
    </span>
  );
}

export function BetaBdg({ text = "BETA CANDIDATE", color = "#FACC15" }: { text?: string; color?: string }) {
  return (
    <span style={{ fontSize: "10px", padding: "2px 7px", borderRadius: "4px", background: `${color}12`, border: `1px solid ${color}35`, color, fontWeight: 700 }}>
      {text}
    </span>
  );
}

export function AssignedBdg({ who }: { who?: string }) {
  if (!who || who === "Unassigned") return null;
  const c = SPECIALIST_COLOR[who] || "#888";
  return (
    <span style={{ fontSize: "10px", padding: "2px 7px", borderRadius: "4px", background: `${c}12`, border: `1px solid ${c}35`, color: c, fontWeight: 700 }}>
      {specialistLabel(who)}
    </span>
  );
}

export function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = React.useState(false);
  const handleCopy = () => {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.cssText = "position:fixed;top:0;left:0;opacity:0";
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (_) {}
  };
  return (
    <button onClick={handleCopy} style={{ background: copied ? "rgba(34,197,94,0.15)" : "rgba(62,207,220,0.1)", border: `1px solid ${copied ? "#22C55E" : G_BORDER}`, color: copied ? "#22C55E" : G, borderRadius: "5px", padding: "5px 12px", fontSize: "10px", fontWeight: 700, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4 }}>
      {copied ? <><Check size={11} /> Copied</> : <><Copy size={11} /> Copy Message</>}
    </button>
  );
}

export function Celebration({ msg, sub, onDone }: { msg: string; sub: string; onDone: () => void }) {
  React.useEffect(() => {
    const t = setTimeout(onDone, 3500);
    return () => clearTimeout(t);
  }, [onDone]);
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 999, background: "rgba(0,0,0,0.85)", display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(4px)" }}>
      <div style={{ background: SURFACE, border: `2px solid ${G_BORDER}`, padding: "24px 32px", borderRadius: "12px", textAlign: "center", boxShadow: `0 0 40px ${G}25` }}>
        <div style={{ fontSize: "28px", fontWeight: 900, color: G, marginBottom: 4 }}>{msg}</div>
        <div style={{ fontSize: "14px", color: "#ccc" }}>{sub}</div>
      </div>
    </div>
  );
}
