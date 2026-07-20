// AIQAPanel — reusable 3-stage AI quality gate UI.
// Drop this below any generated draft:
//   <AIQAPanel draft={text} lead={lead} onRegenerate={fn} />
//
// Stage 2 (review) runs automatically on mount.
// Stage 3 (validation) runs automatically after review (or after adjustment).

import React, { useState, useEffect, useCallback } from "react";
import { CheckCircle2, XCircle, RefreshCw, Wand2 } from "lucide-react";
import { Lead } from "../types";
import { runQAReview, runQAAdjust, runQAValidation, QAReview, QAValidation } from "../aiQA";
import {
  G, G_DIM, G_BORDER, BORDER, SURFACE2, MUTED, MUTED2, TEXT,
} from "../constants";

interface AIQAPanelProps {
  draft: string;
  lead: Lead;
  onRegenerate: () => void;
}

type Phase =
  | "reviewing"
  | "reviewed"
  | "adjusting"
  | "validating"
  | "done";

type DraftTab = "original" | "adjusted";

const scoreColor = (s: number) =>
  s >= 80 ? "#22C55E" : s >= 60 ? "#F59E0B" : "#EF4444";

function Spinner({ label }: { label: string }) {
  return (
    <div style={{
      background: "rgba(62,207,220,0.04)", border: `1px solid ${G_BORDER}`,
      borderRadius: 8, padding: "10px 14px", display: "flex", alignItems: "center", gap: 8,
    }}>
      <span style={{ fontSize: 13, animation: "none" }}>⟳</span>
      <span style={{ fontSize: 11, color: MUTED }}>{label}</span>
    </div>
  );
}

export function AIQAPanel({ draft, lead, onRegenerate }: AIQAPanelProps) {
  const [phase, setPhase] = useState<Phase>("reviewing");
  const [review, setReview] = useState<QAReview | null>(null);
  const [adjusted, setAdjusted] = useState("");
  const [activeTab, setActiveTab] = useState<DraftTab>("original");
  const [validation, setValidation] = useState<QAValidation | null>(null);

  const validate = useCallback(async (text: string) => {
    setPhase("validating");
    try {
      const v = await runQAValidation(text, lead);
      setValidation(v);
    } catch {}
    setPhase("done");
  }, [lead]);

  // Stage 2 — auto-run review whenever draft changes
  useEffect(() => {
    let cancelled = false;
    setPhase("reviewing");
    setReview(null);
    setAdjusted("");
    setActiveTab("original");
    setValidation(null);

    runQAReview(draft, lead)
      .then(r => {
        if (cancelled) return;
        setReview(r);
        if (!r.needsAdjustment) {
          // Auto-proceed to Stage 3
          validate(draft);
        } else {
          setPhase("reviewed");
        }
      })
      .catch(() => { if (!cancelled) setPhase("reviewed"); });

    return () => { cancelled = true; };
  }, [draft, lead.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // "Adjust Message" button handler
  const handleAdjust = async () => {
    if (!review) return;
    setPhase("adjusting");
    try {
      const adj = await runQAAdjust(review, draft, lead);
      setAdjusted(adj);
      setActiveTab("adjusted");
      await validate(adj);
    } catch {
      setPhase("reviewed");
    }
  };

  // Validate the original without adjusting
  const handleValidateOriginal = () => validate(draft);

  const busy = phase === "reviewing" || phase === "adjusting" || phase === "validating";

  return (
    <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>

      {/* ── Stage 2 spinner ── */}
      {phase === "reviewing" && <Spinner label="Running Conversation Alignment Review…" />}

      {/* ── Stage 2 result ── */}
      {review && (
        <div style={{
          background: "rgba(62,207,220,0.03)",
          border: `1px solid ${review.score >= 75 ? G_BORDER : "rgba(245,158,11,0.45)"}`,
          borderRadius: 8, padding: "12px 14px",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, flexWrap: "wrap", gap: 6 }}>
            <span style={{ fontSize: 9, color: G, fontWeight: 700, letterSpacing: "0.1em" }}>CONVERSATION ALIGNMENT REVIEW</span>
            <span style={{ fontSize: 15, fontWeight: 800, color: scoreColor(review.score) }}>{review.score}/100</span>
          </div>

          {review.strengths.length > 0 && (
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 9, color: "#22C55E", fontWeight: 700, marginBottom: 4, letterSpacing: "0.06em" }}>STRENGTHS</div>
              {review.strengths.map((s, i) => (
                <div key={i} style={{ fontSize: 11, color: "#ccc", display: "flex", gap: 6, marginBottom: 2 }}>
                  <span style={{ color: "#22C55E", flexShrink: 0 }}>✓</span>{s}
                </div>
              ))}
            </div>
          )}

          {review.problems.length > 0 && (
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 9, color: "#EF4444", fontWeight: 700, marginBottom: 4, letterSpacing: "0.06em" }}>PROBLEMS FOUND</div>
              {review.problems.map((p, i) => (
                <div key={i} style={{ marginBottom: 5 }}>
                  <div style={{ fontSize: 11, color: "#ccc", display: "flex", gap: 6 }}>
                    <span style={{ color: "#EF4444", flexShrink: 0 }}>✗</span>{p}
                  </div>
                  {review.reasons[i] && (
                    <div style={{ fontSize: 10, color: MUTED, marginLeft: 16, marginTop: 2 }}>
                      {review.reasons[i]}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          <div style={{ fontSize: 10, color: MUTED2, fontStyle: "italic", marginBottom: review.needsAdjustment && phase === "reviewed" ? 10 : 0 }}>
            {review.recommendation}
          </div>

          {review.needsAdjustment && phase === "reviewed" && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                onClick={handleAdjust}
                style={{
                  background: "rgba(245,158,11,0.12)", color: "#F59E0B",
                  border: "1px solid rgba(245,158,11,0.4)", borderRadius: 6,
                  padding: "7px 14px", fontSize: 11, fontWeight: 700, cursor: "pointer",
                  display: "flex", alignItems: "center", gap: 5,
                }}
              >
                <Wand2 size={11} /> Adjust Message
              </button>
              <button
                onClick={handleValidateOriginal}
                style={{
                  background: "transparent", border: `1px solid ${BORDER}`,
                  color: MUTED, borderRadius: 6, padding: "7px 14px", fontSize: 11, cursor: "pointer",
                }}
              >
                Validate Original Anyway
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Adjusted draft tab switcher ── */}
      {adjusted && (
        <div style={{ background: SURFACE2, border: `1px solid ${BORDER}`, borderRadius: 8, overflow: "hidden" }}>
          <div style={{ display: "flex", borderBottom: `1px solid ${BORDER}` }}>
            {(["original", "adjusted"] as DraftTab[]).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                style={{
                  flex: 1, background: activeTab === tab ? G_DIM : "transparent",
                  border: "none", borderBottom: activeTab === tab ? `2px solid ${G}` : "2px solid transparent",
                  color: activeTab === tab ? G : MUTED,
                  padding: "8px 0", fontSize: 10, fontWeight: 700, cursor: "pointer",
                  textTransform: "uppercase", letterSpacing: "0.06em",
                }}
              >
                {tab === "original" ? "Original Draft" : "✦ Adjusted Draft"}
              </button>
            ))}
          </div>
          <div style={{ padding: "12px 14px", fontSize: 12, lineHeight: 1.85, color: "#ccc", whiteSpace: "pre-wrap" }}>
            {activeTab === "original" ? draft : adjusted}
          </div>
        </div>
      )}

      {/* ── Stage 2b / 3 spinners ── */}
      {phase === "adjusting" && <Spinner label="Adjusting message…" />}
      {phase === "validating" && <Spinner label="Running Strict Validation…" />}

      {/* ── Stage 3 result ── */}
      {validation && phase === "done" && (
        <div style={{
          background: validation.status === "approved" ? "rgba(34,197,94,0.05)" : "rgba(239,68,68,0.05)",
          border: `1px solid ${validation.status === "approved" ? "rgba(34,197,94,0.35)" : "rgba(239,68,68,0.35)"}`,
          borderRadius: 8, padding: "12px 14px",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, flexWrap: "wrap", gap: 6 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
              {validation.status === "approved"
                ? <CheckCircle2 size={14} color="#22C55E" />
                : <XCircle size={14} color="#EF4444" />}
              <span style={{
                fontSize: 9, fontWeight: 700, letterSpacing: "0.1em",
                color: validation.status === "approved" ? "#22C55E" : "#EF4444",
              }}>
                STRICT VALIDATION — {validation.status.toUpperCase()}
              </span>
            </div>
            <span style={{ fontSize: 15, fontWeight: 800, color: scoreColor(validation.overallScore) }}>
              {validation.overallScore}/100
            </span>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 5, marginBottom: 10 }}>
            {([
              ["Conversation", validation.conversationConsistency],
              ["Tone", validation.tone],
              ["Context", validation.context],
              ["CTA", validation.cta],
            ] as [string, number][]).map(([label, score]) => (
              <div key={label} style={{ background: "rgba(255,255,255,0.03)", borderRadius: 6, padding: "6px 10px" }}>
                <div style={{ fontSize: 9, color: MUTED, marginBottom: 1 }}>{label}</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: scoreColor(score) }}>{score}</div>
              </div>
            ))}
          </div>

          <div style={{ fontSize: 10, color: MUTED2, fontStyle: "italic", marginBottom: validation.rejectionReasons.length > 0 ? 8 : 0 }}>
            {validation.finalRecommendation}
          </div>

          {validation.rejectionReasons.length > 0 && (
            <div style={{ marginBottom: 10 }}>
              {validation.rejectionReasons.map((r, i) => (
                <div key={i} style={{ fontSize: 11, color: "#EF4444", display: "flex", gap: 6, marginBottom: 2 }}>
                  <span style={{ flexShrink: 0 }}>✗</span>{r}
                </div>
              ))}
            </div>
          )}

          {validation.status === "rejected" && (
            <button
              onClick={onRegenerate}
              style={{
                background: "rgba(239,68,68,0.1)", color: "#EF4444",
                border: "1px solid rgba(239,68,68,0.3)", borderRadius: 6,
                padding: "7px 14px", fontSize: 11, fontWeight: 700, cursor: "pointer",
                display: "flex", alignItems: "center", gap: 5,
              }}
            >
              <RefreshCw size={11} /> Regenerate Draft
            </button>
          )}
        </div>
      )}
    </div>
  );
}
