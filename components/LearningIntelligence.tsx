import React, { useCallback, useEffect, useState } from "react";
import { Brain, RefreshCw, ShieldCheck, TrendingUp } from "lucide-react";
import { G, G_BORDER, SURFACE, SURFACE2, BORDER, MUTED, TEXT } from "../constants";
import type { LearningInsight, LearningSummary } from "../lib/learning";

type Payload = { enabled: boolean; influenceEnabled: boolean; summary: LearningSummary; insights: LearningInsight[] };
const pct = (value: number) => `${Math.round(value * 100)}%`;

/** Founder-only, aggregate view of organizational learning. No raw prospect threads. */
export function LearningIntelligence() {
  const [data, setData] = useState<Payload | null>(null); const [loading, setLoading] = useState(true); const [error, setError] = useState("");
  const load = useCallback(async () => { setLoading(true); setError(""); try { const response = await fetch("/api/learning/summary"); if (!response.ok) throw new Error("Unable to load learning analytics."); setData(await response.json()); } catch (e: any) { setError(e.message || "Unable to load learning analytics."); } finally { setLoading(false); } }, []);
  useEffect(() => { void load(); }, [load]);
  const disable = async (id: string) => { await fetch(`/api/learning/insights/${encodeURIComponent(id)}/disable`, { method: "POST" }); await load(); };
  const card: React.CSSProperties = { background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 10, padding: "16px 18px" };
  if (loading) return <div style={{ color: MUTED, padding: 20 }}>Loading organizational learning…</div>;
  if (error || !data) return <div style={{ color: "#F87171", padding: 20 }}>{error}</div>;
  const s = data.summary;
  return <div style={{ maxWidth: 1120, display: "flex", flexDirection: "column", gap: 14 }}>
    <div style={{ ...card, borderColor: G_BORDER, background: `linear-gradient(135deg, ${SURFACE}, ${SURFACE2})`, display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
      <div><div style={{ color: G, fontSize: 10, fontWeight: 800, letterSpacing: "0.12em" }}>SALES BRAIN LEARNING ENGINE</div><div style={{ color: TEXT, fontSize: 19, fontWeight: 800, marginTop: 5 }}>Learning from {s.totalEvents} outbound interactions</div><div style={{ color: MUTED, fontSize: 12, marginTop: 5 }}>Structured evidence and validated organizational memory — not model retraining.</div></div>
      <button onClick={() => void load()} style={{ background: "transparent", color: G, border: `1px solid ${G_BORDER}`, borderRadius: 6, padding: "8px 11px", cursor: "pointer", display: "flex", gap: 6, alignItems: "center" }}><RefreshCw size={13} /> Refresh</button>
    </div>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10 }}>
      {[ ["Generated", s.generated], ["Sent", s.sent], ["Responses", s.responses], ["Positive", s.positiveResponses], ["Meetings", s.meetings], ["Conversions", s.conversions] ].map(([label, value]) => <div key={String(label)} style={card}><div style={{ color: MUTED, fontSize: 10, textTransform: "uppercase" }}>{label}</div><div style={{ color: TEXT, fontSize: 24, fontWeight: 800, marginTop: 5 }}>{value}</div></div>)}
    </div>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 14 }}>
      <div style={card}><div style={{ color: G, fontSize: 10, fontWeight: 800, letterSpacing: "0.1em", marginBottom: 12 }}><TrendingUp size={12} style={{ verticalAlign: "middle" }} /> TOP STRATEGIES</div>{s.strategies.length ? <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}><thead style={{ color: MUTED, textAlign: "left" }}><tr><th>Strategy</th><th>Sample</th><th>Reply</th><th>Meeting</th></tr></thead><tbody>{s.strategies.slice(0, 6).map(item => <tr key={`${item.strategyType}-${item.sample}`} style={{ color: TEXT, borderTop: `1px solid ${BORDER}` }}><td style={{ padding: "9px 2px" }}>{item.strategyType}</td><td>{item.sample}</td><td>{pct(item.replyRate)}</td><td>{pct(item.meetingRate)}</td></tr>)}</tbody></table> : <div style={{ color: MUTED, fontSize: 12 }}>No sent-message evidence yet.</div>}</div>
      <div style={card}><div style={{ color: G, fontSize: 10, fontWeight: 800, letterSpacing: "0.1em", marginBottom: 12 }}>HUMAN EDIT SIGNALS</div>{s.humanEdits.length ? s.humanEdits.slice(0, 6).map(item => <div key={item.signal} style={{ color: TEXT, fontSize: 12, padding: "8px 0", borderTop: `1px solid ${BORDER}`, display: "flex", justifyContent: "space-between" }}><span>{item.signal.replace(/_/g, " ")}</span><b>{item.count}</b></div>) : <div style={{ color: MUTED, fontSize: 12 }}>Edits will appear when a generated message is changed before it is marked sent.</div>}</div>
    </div>
    <div style={card}><div style={{ color: G, fontSize: 10, fontWeight: 800, letterSpacing: "0.1em", marginBottom: 12 }}><Brain size={12} style={{ verticalAlign: "middle" }} /> WHAT SALES BRAIN LEARNED</div>{data.insights.length ? data.insights.map(insight => <div key={insight.id} style={{ padding: "12px 0", borderTop: `1px solid ${BORDER}`, display: "flex", gap: 12, justifyContent: "space-between", alignItems: "start" }}><div><div style={{ color: TEXT, fontSize: 12, lineHeight: 1.55 }}>{insight.pattern}</div><div style={{ color: MUTED, fontSize: 10, marginTop: 5 }}>{insight.evidenceCount} sent · {insight.positiveOutcomeCount} positive · {insight.meetingCount} meetings · confidence {insight.confidence}/100 · {insight.status}</div></div>{insight.status !== "DISABLED" && <button onClick={() => void disable(insight.id)} style={{ background: "transparent", border: `1px solid ${BORDER}`, color: MUTED, borderRadius: 5, padding: "5px 7px", fontSize: 10, cursor: "pointer" }}>Disable</button>}</div>) : <div style={{ color: MUTED, fontSize: 12 }}>Patterns remain observational until enough sent-message evidence exists.</div>}</div>
    <div style={{ color: MUTED, fontSize: 11, display: "flex", gap: 6, alignItems: "center" }}><ShieldCheck size={13} color={G} /> Influence is {data.influenceEnabled ? "enabled for validated, relevant patterns only" : "currently in collection mode"}. Disabled or stale insights never influence Sales Brain.</div>
  </div>;
}
