import React, { useState, useRef, useEffect, useCallback } from "react";
import { MessageCircle, X, Send, AtSign, CheckCircle2, PhoneCall } from "lucide-react";
import { Lead } from "../types";
import {
  G, G_DIM, G_BORDER, SURFACE, SURFACE2, BORDER, TEXT, MUTED, MUTED2, iStyle,
  STATUS_COLOR, STATUS_COLOR as SC, SPECIALISTS, specialistLabel,
  daysSince, hoursSince, SERVICE_VALUE, today, getWeekStart,
  getInternActivities, getInternActivitiesRange, nowISO,
} from "../constants";
import { stripMarkdown } from "../aiEngine";
import { runSalesBrain } from "../salesBrain";

// ─── Types ───────────────────────────────────────────────────────────────────

interface AiMessage {
  role: "user" | "ai";
  text: string;
  dm?: string;
  strategy?: string;
  mentionedLeads?: Lead[];   // leads detected in this AI response
}

interface AskAIProps {
  leads: Lead[];
  onFollowUp: (lead: Lead) => void;  // globally save a followed-up lead
  onOpenLead?: (lead: Lead) => void; // open lead profile modal (optional)
  onMessageSent?: (lead: Lead, message: string, messageType: string) => void; // confirm message sent → update CRM
}

// ─── Pipeline + Activity context builder ─────────────────────────────────────

function buildFullPipelineContext(leads: Lead[]): string {
  const todayStr = today();
  const weekStart = getWeekStart();
  const active = leads.filter(l => !["Closed", "Lost"].includes(l.status));

  // Stage breakdown
  const byStage: Record<string, number> = {};
  active.forEach(l => { byStage[l.status] = (byStage[l.status] || 0) + 1; });
  const stageBreakdown = Object.entries(byStage).map(([s, c]) => `${s}: ${c}`).join(", ");

  // By specialist
  const bySpec: Record<string, number> = {};
  active.forEach(l => { const k = specialistLabel(l.assignedTo) || "Unassigned"; bySpec[k] = (bySpec[k] || 0) + 1; });

  // Priority groups
  const overdue = active
    .filter(l => { const d = l.nextActionDate || l.autoFollowUpDate; return d && d < todayStr; })
    .sort((a, b) => {
      const da = a.nextActionDate || a.autoFollowUpDate || "";
      const db = b.nextActionDate || b.autoFollowUpDate || "";
      return da < db ? -1 : 1;
    });

  const stale = active
    .filter(l => l.lastContacted && daysSince(l.lastContacted) >= 5)
    .sort((a, b) => daysSince(b.lastContacted) - daysSince(a.lastContacted));

  const highValueInactive = active
    .filter(l => (SERVICE_VALUE[l.service] || 0) >= 500000 && l.lastContacted && daysSince(l.lastContacted) >= 3);

  const awaitingReply = active
    .filter(l => l.awaitingReplySince && hoursSince(l.awaitingReplySince) >= 24);

  const neverContacted = active.filter(l => !l.lastContacted && l.status === "New");

  // Activity stats
  const todayActs = getInternActivities(leads, todayStr);
  const weekActs  = getInternActivitiesRange(leads, weekStart, todayStr);

  const actSpecs = SPECIALISTS.filter(s => s !== "Unassigned");
  const activityLines = actSpecs.map(s => {
    const ta = todayActs.filter(a => a.actor === s);
    const wa = weekActs.filter(a => a.actor === s);
    const count = (arr: any[], fn: (a: any) => boolean) => arr.filter(fn).length;
    const isDM  = (a: any) => a.type === "dm" || (a.type === "status_change" && a.text === "DM Sent");
    const isFU  = (a: any) => (a.type === "note" && a.title === "Follow-up Made") || (a.type === "status_change" && a.text === "Follow-up Made");
    const isRep = (a: any) => a.type === "reply" || (a.type === "status_change" && a.text === "Replied");
    const isAdd = (a: any) => a.type === "add";
    return (
      `${specialistLabel(s)} — ` +
      `Today: ${count(ta, isAdd)} leads added, ${count(ta, isDM)} DMs sent, ${count(ta, isFU)} follow-ups, ${count(ta, isRep)} replies | ` +
      `This Week: ${count(wa, isAdd)} leads added, ${count(wa, isDM)} DMs sent, ${count(wa, isFU)} follow-ups`
    );
  });

  // All active leads — condensed 1-liner each
  const leadLines = active.slice(0, 250).map(l => {
    const lastC = l.lastContacted ? `${daysSince(l.lastContacted)}d ago` : "never";
    const due   = l.nextActionDate || l.autoFollowUpDate;
    const dueStr = due ? (due < todayStr ? `OVERDUE(${due})` : `due:${due}`) : "";
    return `${l.name || "—"}|${l.company || "—"}|${l.status}|${specialistLabel(l.assignedTo)}|last:${lastC}|${l.aiBucket || "?"}${dueStr ? "|" + dueStr : ""}`;
  });

  return `=== LIVE PIPELINE — ${todayStr} ===
TOTALS: ${active.length} active, ${leads.filter(l => l.status === "Closed").length} closed, ${leads.filter(l => l.status === "Lost").length} lost
STAGES: ${stageBreakdown}
LOAD: ${Object.entries(bySpec).map(([s, c]) => `${s}: ${c}`).join(", ")}

OVERDUE FOLLOW-UPS (${overdue.length}):
${overdue.slice(0, 20).map(l => `• ${l.name || "—"} / ${l.company} (${l.status}, ${specialistLabel(l.assignedTo)}) — due ${l.nextActionDate || l.autoFollowUpDate}`).join("\n") || "None"}

STALE — 5+ DAYS NO CONTACT (${stale.length}):
${stale.slice(0, 20).map(l => `• ${l.name || "—"} / ${l.company} (${l.status}, ${specialistLabel(l.assignedTo)}) — ${daysSince(l.lastContacted)}d silent`).join("\n") || "None"}

HIGH-VALUE GONE QUIET ₦500K+, 3+ DAYS (${highValueInactive.length}):
${highValueInactive.slice(0, 10).map(l => `• ${l.name || "—"} / ${l.company} (${l.service}, ${l.status})`).join("\n") || "None"}

AWAITING OUR REPLY 24h+ (${awaitingReply.length}):
${awaitingReply.slice(0, 10).map(l => `• ${l.name || "—"} / ${l.company}`).join("\n") || "None"}

NEW — NEVER CONTACTED (${neverContacted.length}):
${neverContacted.slice(0, 10).map(l => `• ${l.name || "—"} / ${l.company} (added ${l.dateAdded})`).join("\n") || "None"}

=== TEAM ACTIVITY ===
${activityLines.join("\n")}

=== ALL ACTIVE LEADS (Name|Company|Status|Assigned|LastContact|Bucket|Due) ===
${leadLines.join("\n")}
=== END PIPELINE ===`;
}

// ─── Detect leads mentioned in an AI response ────────────────────────────────

function extractMentionedLeads(text: string, leads: Lead[]): Lead[] {
  const found: Lead[] = [];
  const seen = new Set<string>();
  const lowerText = text.toLowerCase();
  leads
    .filter(l => !["Closed", "Lost"].includes(l.status))
    .forEach(lead => {
      if (seen.has(lead.id)) return;
      const name = (lead.name || "").trim();
      const company = (lead.company || "").trim();
      if (name.length > 3 && lowerText.includes(name.toLowerCase())) {
        found.push(lead); seen.add(lead.id); return;
      }
      if (company.length > 3 && lowerText.includes(company.toLowerCase())) {
        found.push(lead); seen.add(lead.id);
      }
    });
  return found.slice(0, 12);
}

// ─── Apply a follow-up to a lead ─────────────────────────────────────────────

function applyFollowUp(lead: Lead): Lead {
  const now = nowISO();
  return {
    ...lead,
    lastContacted: today(),
    followUpCount: (lead.followUpCount || 0) + 1,
    completedFollowUps: [...(lead.completedFollowUps || []), now],
    conversationLog: [
      ...(lead.conversationLog || []),
      {
        ts: now,
        type: "note" as const,
        label: "Follow-up Made",
        text: "Marked as followed up via Ask AI",
        by: lead.assignedTo || "Unknown",
      },
    ],
  };
}

// ─── Build the single-lead context block for @ mentions ──────────────────────

function buildLeadContext(lead: Lead): string {
  const entries: string[] = [];
  if (lead.dmText) entries.push(`OUR INITIAL DM:\n${lead.dmText}`);
  if (lead.prospectInitialResponse) entries.push(`THEIR FIRST REPLY:\n${lead.prospectInitialResponse}`);
  if (lead.prospectLatestResponse) entries.push(`LATEST REPLY:\n${lead.prospectLatestResponse}`);
  (lead.conversationLog || []).forEach((e: any) => {
    if (e.type === "dm" || e.type === "reply") {
      entries.push(`[${e.ts?.split("T")[0] || ""}] ${e.type === "dm" ? "US" : "LEAD"}: ${e.text || ""}`);
    }
  });
  const convo = entries.join("\n\n") || "No conversation history recorded.";
  return `=== SPECIFICALLY REFERENCED LEAD ===
Name: ${lead.name || "Unknown"}  |  Company: ${lead.company || "Unknown"}
Stage: ${lead.status}  |  Assigned: ${specialistLabel(lead.assignedTo)}  |  Bucket: ${lead.aiBucket || "?"}
Service: ${lead.service}  |  Notes: ${lead.notes || "none"}
Next Action: ${lead.nextAction || "none"}  |  Due: ${lead.nextActionDate || "none"}

CONVERSATION:
${convo}
=== END REFERENCED LEAD ===`;
}

// ─── System prompt ────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are the AI intelligence layer inside DFQ Labs OS — a live sales outreach CRM for Abuja real estate brands.

You have FULL ACCESS to the live pipeline data injected at the end of this prompt. Use it to answer any question about leads, team activity, follow-ups, or pipeline health. Always cite specific lead names and real numbers from the data — never invent leads.

CORE CAPABILITIES:
1. Pipeline Q&A — "who needs follow-up right now?", "which leads are stale?", "show me the pipeline status" → answer directly from the live data
2. Team activity queries — "how many DMs did Sa'adatu send today?", "how many leads did Alex add this week?" → pull exact numbers from the TEAM ACTIVITY section
3. Opportunity spotting — proactively surface overlooked leads, high-value leads gone quiet, overdue follow-ups, new leads never contacted
4. VALUE DM — when asked to "send a value DM", "draft a DM", "write a message to [name]", or similar:
   - If a specific lead is referenced (via @mention or name), the system will automatically run the full AI sales pipeline for that lead and generate a high-quality, genuinely valuable message. You do NOT need to draft the message yourself in this case — just acknowledge the request.
   - If no lead is specified, ask which lead they want to message.
   📨 SUGGESTED MESSAGE
   [the message — 3-4 sentences, no emojis, no buzzwords, genuinely valuable insight]
   📊 STRATEGY
   [2-4 bullet points: stage objective, why this framing, what the prospect does next]
5. General platform questions — answer helpfully

When suggesting leads for follow-up, for each one give:
• Lead name / company
• Current pipeline stage
• Assigned specialist
• Why they need follow-up RIGHT NOW — one specific sentence

Keep answers concise and direct. Never fabricate data.`;

// ─── Detect "value DM / draft DM / send a message" intent ─────────────────────
function isValueDmIntent(text: string): boolean {
  return /\b(value\s*dm|send\s*(a\s*)?(dm|message|text|msg)|draft\s*(a\s*)?(dm|message|msg)|write\s*(a\s*)?(dm|message|msg|text)|craft\s*(a\s*)?(dm|message)|let'?s\s*(dm|message|text|send)|shoot\s*(a\s*)(dm|message))\b/i.test(text);
}

// ─── Find ALL leads whose name/company appears in the raw message text ───────
// Returns every match so the caller can disambiguate when there are duplicates.
function detectLeadsFromText(text: string, leads: Lead[]): Lead[] {
  const lower = text.toLowerCase();
  const active = leads.filter(l => !["Closed", "Lost"].includes(l.status));
  const seen = new Set<string>();
  const candidates: Lead[] = [];
  for (const l of active) {
    if (seen.has(l.id)) continue;
    const name    = (l.name    || "").trim();
    const company = (l.company || "").trim();
    if ((name.length > 3    && lower.includes(name.toLowerCase())) ||
        (company.length > 3 && lower.includes(company.toLowerCase()))) {
      candidates.push(l);
      seen.add(l.id);
    }
  }
  // Sort by specificity (longest match first) — still used when there's exactly one
  return candidates.sort((a, b) => {
    const aLen = Math.max((a.name || "").length, (a.company || "").length);
    const bLen = Math.max((b.name || "").length, (b.company || "").length);
    return bLen - aLen;
  });
}

// ─── Drag helpers ─────────────────────────────────────────────────────────────

function loadBubblePos() {
  try {
    const saved = localStorage.getItem("dfq-bubble-pos");
    if (saved) return JSON.parse(saved);
  } catch {}
  return { bottom: 24, right: 24 };
}

function saveBubblePos(pos: { bottom: number; right: number }) {
  try { localStorage.setItem("dfq-bubble-pos", JSON.stringify(pos)); } catch {}
}

// ─── Follow-up chip rendered per mentioned lead ──────────────────────────────

function FollowUpChip({
  lead,
  alreadyDone,
  onFollowUp,
  onOpenLead,
}: {
  lead: Lead;
  alreadyDone: boolean;
  onFollowUp: (lead: Lead) => void;
  onOpenLead?: (lead: Lead) => void;
}) {
  const stageColor = STATUS_COLOR[lead.status] || G;
  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 8,
      background: SURFACE2,
      border: `1px solid ${BORDER}`,
      borderLeft: `3px solid ${stageColor}`,
      borderRadius: 7,
      padding: "7px 10px",
      flexWrap: "wrap",
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{ fontSize: 11, fontWeight: 700, color: "#fff", cursor: onOpenLead ? "pointer" : "default" }}
          onClick={() => onOpenLead?.(lead)}
        >
          {lead.name || "—"}
          {lead.company ? <span style={{ color: MUTED, fontWeight: 400 }}> · {lead.company}</span> : null}
        </div>
        <div style={{ fontSize: 9, color: stageColor, fontWeight: 700, marginTop: 2 }}>
          {lead.status} · {specialistLabel(lead.assignedTo)}
        </div>
      </div>
      <button
        disabled={alreadyDone}
        onClick={() => !alreadyDone && onFollowUp(lead)}
        style={{
          background: alreadyDone ? "rgba(34,197,94,0.12)" : "rgba(62,207,220,0.1)",
          color: alreadyDone ? "#22C55E" : G,
          border: `1px solid ${alreadyDone ? "rgba(34,197,94,0.35)" : G_BORDER}`,
          borderRadius: 5,
          padding: "4px 10px",
          fontSize: 10,
          fontWeight: 700,
          cursor: alreadyDone ? "default" : "pointer",
          display: "flex",
          alignItems: "center",
          gap: 4,
          flexShrink: 0,
          whiteSpace: "nowrap",
        }}
      >
        {alreadyDone
          ? <><CheckCircle2 size={11} /> Logged</>
          : <><PhoneCall size={10} /> Mark Followed Up</>
        }
      </button>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function AskAI({ leads, onFollowUp, onOpenLead, onMessageSent }: AskAIProps) {
  const [open, setOpen]       = useState(false);
  const [input, setInput]     = useState("");
  const [messages, setMessages] = useState<AiMessage[]>([]);
  const [loading, setLoading] = useState(false);

  // @ mention
  const [mentionQuery, setMentionQuery]   = useState<string | null>(null);
  const [mentionResults, setMentionResults] = useState<Lead[]>([]);
  const [referencedLead, setReferencedLead] = useState<Lead | null>(null);

  // Tracks which leads have been followed up in this session (by lead id)
  const [followedUpIds, setFollowedUpIds] = useState<Set<string>>(new Set());

  // Disambiguation: held when multiple leads share the name the user typed
  const [pendingValueDm, setPendingValueDm] = useState<{ query: string; candidates: Lead[] } | null>(null);

  // Draggable bubble
  const [bubblePos, setBubblePos] = useState(loadBubblePos);
  const posRef    = useRef(bubblePos);
  const dragRef   = useRef<{ startX: number; startY: number; startBottom: number; startRight: number } | null>(null);
  const isDragging = useRef(false);

  const inputRef  = useRef<HTMLTextAreaElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => { posRef.current = bubblePos; }, [bubblePos]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, loading]);
  useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 80); }, [open]);

  // ── Drag (mouse + touch) ────────────────────────────────────────────────────
  const startDrag = useCallback((startX: number, startY: number) => {
    const pos = posRef.current;
    dragRef.current = { startX, startY, startBottom: pos.bottom, startRight: pos.right };
    isDragging.current = false;
  }, []);

  const moveDrag = useCallback((clientX: number, clientY: number) => {
    if (!dragRef.current) return;
    const dx = clientX - dragRef.current.startX;
    const dy = clientY - dragRef.current.startY;
    if (!isDragging.current && (Math.abs(dx) > 4 || Math.abs(dy) > 4)) isDragging.current = true;
    if (!isDragging.current) return;
    const SZ = 54;
    const newRight  = Math.max(8, Math.min(window.innerWidth - SZ - 8, dragRef.current.startRight - dx));
    const newBottom = Math.max(8, Math.min(window.innerHeight - SZ - 8, dragRef.current.startBottom - dy));
    const newPos = { bottom: newBottom, right: newRight };
    posRef.current = newPos;
    setBubblePos(newPos);
  }, []);

  const endDrag = useCallback(() => {
    saveBubblePos(posRef.current);
    setTimeout(() => { isDragging.current = false; }, 50);
    dragRef.current = null;
  }, []);

  const onBubbleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    startDrag(e.clientX, e.clientY);
    const onMove = (ev: MouseEvent) => moveDrag(ev.clientX, ev.clientY);
    const onUp = () => { document.removeEventListener("mousemove", onMove); document.removeEventListener("mouseup", onUp); endDrag(); };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, [startDrag, moveDrag, endDrag]);

  const onBubbleTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    startDrag(touch.clientX, touch.clientY);
    const onMove = (ev: TouchEvent) => { ev.preventDefault(); moveDrag(ev.touches[0].clientX, ev.touches[0].clientY); };
    const onUp = () => { document.removeEventListener("touchmove", onMove); document.removeEventListener("touchend", onUp); endDrag(); };
    document.addEventListener("touchmove", onMove, { passive: false });
    document.addEventListener("touchend", onUp);
  }, [startDrag, moveDrag, endDrag]);

  const onBubbleClick = useCallback(() => {
    if (isDragging.current) return;
    setOpen(o => !o);
  }, []);

  // ── @ mention ───────────────────────────────────────────────────────────────
  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setInput(val);
    const atIdx = val.lastIndexOf("@");
    if (atIdx !== -1) {
      const query = val.slice(atIdx + 1);
      if (!query.includes(" ") || query.length < 20) {
        setMentionQuery(query.toLowerCase());
        const q = query.toLowerCase();
        setMentionResults(
          leads.filter(l =>
            (l.name || "").toLowerCase().includes(q) ||
            (l.company || "").toLowerCase().includes(q)
          ).slice(0, 7)
        );
        return;
      }
    }
    setMentionQuery(null);
    setMentionResults([]);
  };

  const selectMention = (lead: Lead) => {
    const atIdx = input.lastIndexOf("@");
    setInput(input.slice(0, atIdx) + `@${lead.name || lead.company} `);
    setReferencedLead(lead);
    setMentionQuery(null);
    setMentionResults([]);
    inputRef.current?.focus();
  };

  // ── Follow-up handler ───────────────────────────────────────────────────────
  const handleFollowUp = useCallback((lead: Lead) => {
    const updated = applyFollowUp(lead);
    onFollowUp(updated);
    setFollowedUpIds(prev => new Set([...prev, lead.id]));
  }, [onFollowUp]);

  // ── Value DM executor — shared by send() and disambiguation picker ──────────
  const runValueDm = useCallback(async (lead: Lead, query: string) => {
    setLoading(true);
    setPendingValueDm(null);
    try {
      const res = await fetch("/api/value-dm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lead, task: query, messageType: "VALUE_DM" }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setMessages(prev => [
        ...prev,
        {
          role: "ai" as const,
          text: data.text || "",
          dm: data.text || undefined,
          strategy: data.strategy || undefined,
          mentionedLeads: [lead],
          messageType: data.messageType || "VALUE_DM",
          knowledgeUsed: data.knowledgeUsed || [],
        },
      ]);
    } catch (err: any) {
      setMessages(prev => [...prev, { role: "ai" as const, text: "Error generating value DM: " + err.message }]);
    }
    setLoading(false);
  }, []);

  // ── Send ────────────────────────────────────────────────────────────────────
  const send = async () => {
    const q = input.trim();
    if (!q || loading) return;

    setMessages(prev => [...prev, { role: "user", text: q }]);
    setInput("");
    setLoading(true);

    // Determine the lead context: @mention takes priority, then name-detection
    const mentionedLead = referencedLead;
    setReferencedLead(null);

    // ── Value DM routing ─────────────────────────────────────────────────────
    if (isValueDmIntent(q)) {
      setLoading(false); // loading managed by runValueDm / branch

      if (mentionedLead) {
        // Explicit @mention — always unambiguous
        await runValueDm(mentionedLead, q);
        return;
      }

      const textMatches = detectLeadsFromText(q, leads);

      if (textMatches.length === 1) {
        // Exactly one match — proceed immediately
        await runValueDm(textMatches[0], q);
        return;
      }

      if (textMatches.length > 1) {
        // Multiple leads share the same name — ask the user to pick
        setPendingValueDm({ query: q, candidates: textMatches });
        return;
      }

      // No lead found at all
      setMessages(prev => [
        ...prev,
        { role: "ai", text: "Which lead do you want to send a value DM to? Type @ and their name to select them, then try again." },
      ]);
      return;
    }

    // ── Standard pipeline Q&A path ────────────────────────────────────────────
    // For general Q&A, use @mention lead or best single text-match for context
    const textMatches = detectLeadsFromText(q, leads);
    const ctxLead = mentionedLead ?? (textMatches.length === 1 ? textMatches[0] : null);

    try {
      const pipelineCtx = buildFullPipelineContext(leads);
      const leadCtx = ctxLead ? `\n\n${buildLeadContext(ctxLead)}` : "";
      const fullSystem = `${SYSTEM_PROMPT}\n\n${pipelineCtx}${leadCtx}`;

      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ systemPrompt: fullSystem, userPrompt: q, maxTokens: 1200 }),
      });

      const data = await res.json();
      if (data.error) throw new Error(data.error);

      const raw: string = stripMarkdown(data.text || "");

      // Parse DM / strategy sections
      const dmMarker    = "📨 SUGGESTED MESSAGE";
      const stratMarker = "📊 STRATEGY";
      const hasDm = raw.includes(dmMarker);
      const hasSt = raw.includes(stratMarker);

      let dm = "";
      let strategy = "";
      if (hasDm) {
        const start = raw.indexOf(dmMarker) + dmMarker.length;
        const end   = hasSt ? raw.indexOf(stratMarker) : raw.length;
        dm = raw.slice(start, end).trim();
      }
      if (hasSt) {
        strategy = raw.slice(raw.indexOf(stratMarker) + stratMarker.length).trim();
      }

      // A message request for a specific lead is always finalized by the
      // canonical Sales Brain; Ask AI only explains the result.
      let finalDm = dm;
      if (dm && ctxLead) {
        try {
          const brain = await runSalesBrain(ctxLead, { task: q });
          finalDm = brain.message;
          strategy = brain.reasoningSummary;
        } catch { /* Preserve the explanatory response if Sales Brain is unavailable. */ }
      }

      const mentioned = extractMentionedLeads(raw, leads);

      setMessages(prev => [
        ...prev,
        { role: "ai", text: raw, dm: finalDm || undefined, strategy: strategy || undefined, mentionedLeads: mentioned },
      ]);
    } catch (err: any) {
      setMessages(prev => [...prev, { role: "ai", text: "Error: " + err.message }]);
    }
    setLoading(false);
  };

  // ── Layout ───────────────────────────────────────────────────────────────────
  const BUBBLE_SIZE  = 54;
  const panelWidth   = typeof window !== "undefined" ? Math.min(460, window.innerWidth - 32) : 440;
  const panelBottom  = bubblePos.bottom + BUBBLE_SIZE + 10;

  return (
    <>
      {/* ── Floating bubble ─────────────────────────────────────────────────── */}
      <div
        onMouseDown={onBubbleMouseDown}
        onTouchStart={onBubbleTouchStart}
        onClick={onBubbleClick}
        title="Drag to move · Click to open Ask AI"
        style={{
          position: "fixed",
          bottom: bubblePos.bottom,
          right: bubblePos.right,
          zIndex: 1100,
          width: BUBBLE_SIZE,
          height: BUBBLE_SIZE,
          borderRadius: "50%",
          background: open ? "#1a1a1a" : `linear-gradient(135deg, ${G} 0%, #00b8c4 100%)`,
          border: open ? `1px solid ${G_BORDER}` : "none",
          cursor: "grab",
          boxShadow: open ? `0 2px 12px rgba(0,0,0,0.4)` : `0 4px 22px ${G}55`,
          display: "flex", alignItems: "center", justifyContent: "center",
          transition: "background 0.2s ease, border 0.2s ease, box-shadow 0.2s ease",
          userSelect: "none",
        }}
      >
        {open ? <X size={20} color={G} /> : <MessageCircle size={20} color="#000" strokeWidth={2.5} />}
      </div>

      {/* ── Chat panel ──────────────────────────────────────────────────────── */}
      {open && (
        <div style={{
          position: "fixed",
          bottom: panelBottom,
          right: bubblePos.right,
          zIndex: 1050,
          width: panelWidth,
          maxHeight: "76vh",
          background: "#111",
          border: `1px solid ${G_BORDER}`,
          borderRadius: 16,
          boxShadow: `0 12px 48px rgba(0,0,0,0.6), 0 0 0 1px ${G}15`,
          display: "flex", flexDirection: "column",
          overflow: "hidden",
          fontFamily: "'Inter',system-ui,sans-serif",
          color: TEXT,
        }}>

          {/* Header */}
          <div style={{
            padding: "12px 16px",
            borderBottom: `1px solid ${BORDER}`,
            background: `linear-gradient(180deg, rgba(62,207,220,0.07), transparent)`,
            flexShrink: 0,
          }}>
            <div style={{ fontWeight: 800, fontSize: 13, letterSpacing: "0.08em" }}>
              DFQ<span style={{ color: G }}>LABS</span>{" "}
              <span style={{ color: MUTED, fontWeight: 400, fontSize: 11 }}>Ask AI</span>
            </div>
            <div style={{ fontSize: 10, color: MUTED, marginTop: 2 }}>
              Ask about pipeline · activity · or say{" "}
              <span style={{ color: G, fontWeight: 700 }}>"send value DM to [name]"</span>
            </div>
          </div>

          {/* Messages */}
          <div style={{ flex: 1, overflowY: "auto", padding: "12px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
            {messages.length === 0 && !loading && (
              <div style={{ textAlign: "center", padding: "32px 0", color: MUTED }}>
                <AtSign size={30} color={G} style={{ marginBottom: 10, display: "inline-block", opacity: 0.55 }} />
                <div style={{ fontSize: 13, color: TEXT, fontWeight: 600, marginBottom: 6 }}>Your pipeline AI</div>
                <div style={{ fontSize: 11, lineHeight: 1.7, color: MUTED2 }}>
                  Try asking:<br />
                  <span style={{ color: G, fontStyle: "italic" }}>"Send a value DM to Fatima"</span><br />
                  <span style={{ color: G, fontStyle: "italic" }}>"Who needs follow-up right now?"</span><br />
                  <span style={{ color: G, fontStyle: "italic" }}>"Which high-value leads have gone quiet?"</span>
                </div>
              </div>
            )}

            {messages.map((msg, i) => (
              <div key={i} style={{ display: "flex", flexDirection: "column", gap: 6 }}>

                {/* User bubble */}
                {msg.role === "user" ? (
                  <div style={{
                    alignSelf: "flex-end",
                    maxWidth: "86%",
                    background: G_DIM,
                    border: `1px solid ${G_BORDER}`,
                    borderRadius: "12px 12px 2px 12px",
                    padding: "8px 12px",
                    fontSize: 12, color: TEXT, lineHeight: 1.55,
                    wordBreak: "break-word",
                  }}>
                    {msg.text}
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>

                    {/* DM output (if present) */}
                    {msg.dm ? (
                      <>
                        <div style={{ background: SURFACE2, border: `1px solid ${BORDER}`, borderRadius: 10, padding: "10px 12px" }}>
                          <div style={{ fontSize: 9, color: G, fontWeight: 700, letterSpacing: "0.1em", marginBottom: 6 }}>
                            📨 FINAL SALES BRAIN MESSAGE
                          </div>
                          <div style={{ fontSize: 12, color: "#ddd", lineHeight: 1.78, whiteSpace: "pre-wrap" }}>
                            {msg.dm}
                          </div>
                          <button
                            onClick={() => navigator.clipboard.writeText(msg.dm || "")}
                            style={{ marginTop: 8, background: "transparent", border: `1px solid ${G_BORDER}`, color: G, borderRadius: 5, padding: "4px 10px", fontSize: 10, fontWeight: 700, cursor: "pointer" }}
                          >
                            Copy message
                          </button>
                        </div>
                        {msg.strategy && (
                          <div style={{ background: "rgba(139,92,246,0.07)", border: "1px solid rgba(139,92,246,0.22)", borderRadius: 10, padding: "10px 12px" }}>
                            <div style={{ fontSize: 9, color: "#8B5CF6", fontWeight: 700, letterSpacing: "0.1em", marginBottom: 6 }}>📊 STRATEGY</div>
                            <div style={{ fontSize: 11, color: MUTED2, lineHeight: 1.72, whiteSpace: "pre-wrap" }}>{msg.strategy}</div>
                          </div>
                        )}
                      </>
                    ) : (
                      /* Plain text response */
                      <div style={{ background: SURFACE2, border: `1px solid ${BORDER}`, borderRadius: 10, padding: "10px 12px", fontSize: 12, color: MUTED2, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>
                        {msg.text}
                      </div>
                    )}

                    {/* Follow-up chips — one per detected lead */}
                    {msg.mentionedLeads && msg.mentionedLeads.length > 0 && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                        <div style={{ fontSize: 9, color: MUTED, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" }}>
                          Leads mentioned — tap to log follow-up:
                        </div>
                        {msg.mentionedLeads.map(lead => (
                          <React.Fragment key={lead.id}>
                            <FollowUpChip
                              lead={lead}
                              alreadyDone={followedUpIds.has(lead.id)}
                              onFollowUp={handleFollowUp}
                              onOpenLead={onOpenLead}
                            />
                          </React.Fragment>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}

            {/* ── Disambiguation picker — shown when multiple leads share the name ── */}
            {pendingValueDm && !loading && (
              <div style={{ background: SURFACE2, border: `1px solid ${G_BORDER}`, borderRadius: 10, padding: "12px 14px" }}>
                <div style={{ fontSize: 10, color: G, fontWeight: 700, letterSpacing: "0.08em", marginBottom: 8 }}>
                  MULTIPLE LEADS MATCH — pick one to send the value DM to:
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {pendingValueDm.candidates.map(lead => (
                    <button
                      key={lead.id}
                      onClick={() => runValueDm(lead, pendingValueDm.query)}
                      style={{
                        background: "transparent",
                        border: `1px solid ${BORDER}`,
                        borderLeft: `3px solid ${STATUS_COLOR[lead.status] || G}`,
                        borderRadius: 7,
                        padding: "8px 12px",
                        cursor: "pointer",
                        textAlign: "left",
                        color: TEXT,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 8,
                        transition: "background 0.15s",
                      }}
                      onMouseEnter={e => (e.currentTarget.style.background = G_DIM)}
                      onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                    >
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 700 }}>
                          {lead.name || "—"}
                          {lead.company ? <span style={{ color: MUTED, fontWeight: 400 }}> · {lead.company}</span> : null}
                        </div>
                        <div style={{ fontSize: 10, color: MUTED, marginTop: 2 }}>
                          {lead.status} · {lead.assignedTo?.split(" ")[0] || "Unassigned"}
                          {lead.nextActionDate ? ` · due ${lead.nextActionDate}` : ""}
                        </div>
                      </div>
                      <span style={{ fontSize: 10, color: G, fontWeight: 700, flexShrink: 0 }}>Use this →</span>
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => setPendingValueDm(null)}
                  style={{ marginTop: 8, background: "transparent", border: "none", color: MUTED, fontSize: 10, cursor: "pointer", padding: 0 }}
                >
                  Cancel
                </button>
              </div>
            )}

            {loading && (
              <div style={{ background: SURFACE2, border: `1px solid ${BORDER}`, borderRadius: 10, padding: "10px 14px", fontSize: 11, color: MUTED, fontStyle: "italic" }}>
                Running sales pipeline — strategy → message → quality check…
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* @ mention dropdown */}
          {mentionQuery !== null && mentionResults.length > 0 && (
            <div style={{ borderTop: `1px solid ${BORDER}`, background: SURFACE2, maxHeight: 180, overflowY: "auto", flexShrink: 0 }}>
              <div style={{ fontSize: 9, color: MUTED, fontWeight: 700, letterSpacing: "0.1em", padding: "6px 14px 2px" }}>SELECT PROSPECT</div>
              {mentionResults.map(lead => (
                <button
                  key={lead.id}
                  onClick={() => selectMention(lead)}
                  style={{ width: "100%", textAlign: "left", background: "transparent", border: "none", borderBottom: `1px solid ${BORDER}`, padding: "8px 14px", cursor: "pointer", display: "flex", alignItems: "center", gap: 10, color: TEXT }}
                  onMouseEnter={e => (e.currentTarget.style.background = G_DIM)}
                  onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                >
                  <div style={{ width: 7, height: 7, borderRadius: "50%", background: STATUS_COLOR[lead.status] || G, flexShrink: 0 }} />
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600 }}>{lead.name || "—"}</div>
                    <div style={{ fontSize: 10, color: MUTED }}>{lead.company} · {lead.status}</div>
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Referenced lead chip */}
          {referencedLead && (
            <div style={{ padding: "6px 14px", borderTop: `1px solid ${BORDER}`, flexShrink: 0, display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 9, color: G, fontWeight: 700, letterSpacing: "0.08em" }}>CONTEXT:</span>
              <span style={{ fontSize: 10, background: G_DIM, border: `1px solid ${G_BORDER}`, color: G, borderRadius: 20, padding: "2px 8px" }}>
                {referencedLead.name || referencedLead.company} · {referencedLead.status}
              </span>
              <button onClick={() => setReferencedLead(null)} style={{ background: "transparent", border: "none", color: MUTED, cursor: "pointer", fontSize: 12, padding: "0 2px" }}>×</button>
            </div>
          )}

          {/* Input row */}
          <div style={{ padding: "10px 12px", borderTop: `1px solid ${BORDER}`, display: "flex", gap: 8, alignItems: "flex-end", flexShrink: 0 }}>
            <textarea
              ref={inputRef}
              value={input}
              onChange={handleChange}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
              placeholder="Ask about your pipeline, team activity, who to follow up with…"
              rows={2}
              style={{ ...iStyle, flex: 1, resize: "none", fontSize: 12, lineHeight: 1.5 }}
            />
            <button
              onClick={send}
              disabled={loading || !input.trim()}
              style={{
                background: loading || !input.trim() ? SURFACE2 : G,
                color: loading || !input.trim() ? MUTED : "#000",
                border: "none", borderRadius: 8, padding: "9px 12px",
                cursor: loading || !input.trim() ? "not-allowed" : "pointer",
                flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
              }}
            >
              <Send size={15} />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
