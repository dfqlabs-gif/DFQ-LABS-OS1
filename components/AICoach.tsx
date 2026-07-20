import { useState, useEffect, useMemo } from "react";
import { Brain, Target, Copy as CopyIcon, CheckCircle2 } from "lucide-react";
import React from "react";
import { Lead } from "../types";
import { AIQAPanel } from "./AIQAPanel";
import { alphaSort, leadLabel, iStyle, G, G_DIM, G_BORDER, SURFACE, SURFACE2, BORDER, MUTED, MUTED2, TEXT } from "../constants";
import { runAI, runFollowUpReply, runProspectSummary, buildAuditPrompt, buildObjectionsPrompt, buildClosingPlanPrompt, buildPipelinePrompt } from "../aiEngine";

interface AICoachProps {
  leads: Lead[];
}

export function AICoach({ leads }: AICoachProps) {
  const sortedActive = useMemo(() => alphaSort(leads.filter(l => !["Closed", "Lost"].includes(l.status))), [leads]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mode, setMode] = useState("followup");
  const [output, setOutput] = useState("");
  const [loading2, setLoading2] = useState(false);
  const [pipelineAI, setPipelineAI] = useState("");
  const [pipelineLoading, setPipelineLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  // Two-step flow state for "Value DM" mode
  const [summaryStep, setSummaryStep] = useState<'idle' | 'summarizing' | 'awaiting-confirm' | 'generating'>('idle');
  const [prospectSummary, setProspectSummary] = useState("");

  useEffect(() => {
    if (sortedActive.length > 0 && (!selectedId || !sortedActive.some(l => l.id === selectedId))) {
      setSelectedId(sortedActive[0].id);
    } else if (sortedActive.length === 0) {
      setSelectedId(null);
    }
  }, [sortedActive, selectedId]);

  // Reset two-step state when lead or mode changes
  useEffect(() => {
    setSummaryStep('idle');
    setProspectSummary('');
    setOutput('');
  }, [selectedId, mode]);

  const selected = leads.find(l => l.id === selectedId);
  const MODES = [
    { key: "followup", label: "Value DM" },
    { key: "audit", label: "Audit Pitch" },
    { key: "objections", label: "Rebuttals" },
    { key: "plan", label: "Closing Plan" }
  ];

  const buildPrompt = (lead: Lead, m: string) => {
    if (m === "audit") return buildAuditPrompt(lead);
    if (m === "objections") return buildObjectionsPrompt(lead);
    return buildClosingPlanPrompt(lead);
  };

  // Step 1 — for Value DM: read the thread and show specialist where prospect is
  const startValueDM = async () => {
    if (!selected) return;
    setSummaryStep('summarizing');
    setProspectSummary('');
    setOutput('');
    try {
      const summary = await runProspectSummary(selected);
      setProspectSummary(summary);
      setSummaryStep('awaiting-confirm');
    } catch (e: any) {
      setSummaryStep('idle');
    }
  };

  // Step 2 — specialist confirmed; generate the actual DM
  const confirmValueDM = async () => {
    if (!selected) return;
    setSummaryStep('generating');
    setLoading2(true);
    setOutput('');
    try {
      const text = await runFollowUpReply(selected);
      setOutput(text);
    } catch (e: any) {
      setOutput('Error: ' + e.message);
    }
    setSummaryStep('idle');
    setLoading2(false);
  };

  const cancelValueDM = () => {
    setSummaryStep('idle');
    setProspectSummary('');
  };

  // For non-DM modes (audit, objections, plan) — direct generation, no two-step needed
  const runPlaybook = async () => {
    if (!selected) return;
    setLoading2(true);
    setOutput("");
    try {
      const text = await runAI(buildPrompt(selected, mode), 1000);
      setOutput(text);
    } catch (e: any) {
      setOutput("Error: " + e.message);
    }
    setLoading2(false);
  };

  const runPipelineAI = async () => {
    setPipelineLoading(true);
    setPipelineAI("");
    try {
      const text = await runAI(buildPipelinePrompt(leads, "each specialist"), 1200);
      setPipelineAI(text);
    } catch (e: any) {
      setPipelineAI("Error: " + e.message);
    }
    setPipelineLoading(false);
  };

  const copyToClipboard = () => {
    try {
      const ta = document.createElement("textarea");
      ta.value = output;
      ta.style.cssText = "position:fixed;top:0;left:0;opacity:0";
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {}
  };

  const isValueDM = mode === "followup";
  const dmBusy = summaryStep === 'summarizing' || summaryStep === 'generating';
  const generateBtnDisabled = isValueDM ? (dmBusy || summaryStep === 'awaiting-confirm') : loading2;
  const generateBtnLabel = isValueDM
    ? (summaryStep === 'summarizing' ? "Reading thread…" : summaryStep === 'generating' ? "Writing DM…" : "Generate →")
    : (loading2 ? "Generating…" : "Generate →");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div className="dfq-card" style={{ background: SURFACE, border: `1px solid ${G_BORDER}`, borderRadius: 10, padding: "16px 18px" }}>
        <div style={{ fontSize: 9, color: G, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
          <Brain size={12} /> Pipeline Intelligence
        </div>
        <div style={{ fontSize: 12, color: MUTED, marginBottom: 10 }}>Chief Revenue Intelligence Officer read on where the pipeline is leaking.</div>
        <button
          onClick={runPipelineAI}
          disabled={pipelineLoading || leads.length === 0}
          style={{
            background: pipelineLoading ? SURFACE2 : G,
            color: pipelineLoading ? MUTED : "#000",
            border: "none",
            borderRadius: 6,
            padding: "9px 20px",
            fontWeight: 800,
            fontSize: 12,
            cursor: pipelineLoading || leads.length === 0 ? "not-allowed" : "pointer"
          }}
        >
          {pipelineLoading ? "Analysing…" : "Analyse Pipeline →"}
        </button>
        {pipelineAI && (
          <div style={{ marginTop: 14, background: SURFACE2, border: `1px solid ${BORDER}`, borderRadius: 8, padding: "14px 16px", fontSize: 12, lineHeight: 1.8, color: "#ccc", whiteSpace: "pre-wrap" }}>
            {pipelineAI}
          </div>
        )}
      </div>

      <div className="dfq-card" style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 10, padding: "16px 18px" }}>
        <div style={{ fontSize: 9, color: G, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
          <Target size={12} /> Lead-Specific Playbook
        </div>
        
        {sortedActive.length === 0 ? (
          <div style={{ fontSize: 12, color: MUTED, padding: "10px 0" }}>No active leads assigned to compile a playbook for. Add a lead or assign one to start!</div>
        ) : (
          <>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
              <select
                value={selectedId || ""}
                onChange={e => setSelectedId(e.target.value)}
                style={{ ...iStyle, flex: "1 1 180px", cursor: "pointer" }}
              >
                {sortedActive.map(l => (
                  <option key={l.id} value={l.id}>
                    {leadLabel(l)} — {l.status} {l.betaCandidate ? " [BETA]" : ""}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ fontSize: 9, color: MUTED, marginTop: -8, marginBottom: 12 }}>Sorted A–Z</div>
            
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 12 }}>
              {MODES.map(m => (
                <button
                  key={m.key}
                  onClick={() => setMode(m.key)}
                  style={{
                    background: mode === m.key ? G_DIM : "transparent",
                    border: `1px solid ${mode === m.key ? G_BORDER : BORDER}`,
                    color: mode === m.key ? G : MUTED,
                    borderRadius: 6,
                    padding: "6px 12px",
                    fontSize: 11,
                    cursor: "pointer",
                    fontWeight: mode === m.key ? 700 : 400
                  }}
                >
                  {m.label}
                </button>
              ))}
            </div>

            {/* Value DM shows a label explaining the two-step flow */}
            {isValueDM && (
              <div style={{ fontSize: 11, color: MUTED2, marginBottom: 10, lineHeight: 1.55 }}>
                The AI will first summarise where this prospect is in the conversation for you to verify, then draft the DM.
              </div>
            )}
            
            <button
              onClick={isValueDM ? startValueDM : runPlaybook}
              disabled={generateBtnDisabled || !selectedId}
              style={{
                background: generateBtnDisabled ? SURFACE2 : G,
                color: generateBtnDisabled ? MUTED : "#000",
                border: "none",
                borderRadius: 6,
                padding: "9px 20px",
                fontWeight: 800,
                fontSize: 12,
                cursor: (generateBtnDisabled || !selectedId) ? "not-allowed" : "pointer"
              }}
            >
              {generateBtnLabel}
            </button>

            {/* Step 1 result — prospect summary + confirm buttons */}
            {isValueDM && summaryStep === 'awaiting-confirm' && prospectSummary && (
              <div style={{ marginTop: 14, background: "rgba(62,207,220,0.04)", border: `1px solid ${G_BORDER}`, borderRadius: 8, padding: "14px 16px" }}>
                <div style={{ fontSize: 9, color: G, fontWeight: 700, letterSpacing: "0.1em", marginBottom: 8 }}>WHERE IS THIS PROSPECT?</div>
                <div style={{ fontSize: 12, color: "#ccc", lineHeight: 1.78, whiteSpace: "pre-wrap", marginBottom: 12 }}>{prospectSummary}</div>
                <div style={{ fontSize: 11, color: MUTED2, marginBottom: 12 }}>Does this match your understanding of where they are in the conversation?</div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    onClick={confirmValueDM}
                    style={{ background: "rgba(34,197,94,0.12)", color: "#22C55E", border: "1px solid rgba(34,197,94,0.35)", borderRadius: 6, padding: "8px 18px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}
                  >
                    Yes — Generate DM
                  </button>
                  <button
                    onClick={cancelValueDM}
                    style={{ background: "transparent", border: `1px solid ${BORDER}`, color: MUTED, borderRadius: 6, padding: "8px 14px", fontSize: 11, cursor: "pointer" }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
            
            {output && selected && (
              <div style={{ marginTop: 14, background: SURFACE2, border: `1px solid ${BORDER}`, borderRadius: 8, padding: "14px 16px" }}>
                <div style={{ fontSize: 12, lineHeight: 1.8, color: "#ccc", whiteSpace: "pre-wrap", marginBottom: 10 }}>
                  {output}
                </div>
                <button
                  onClick={copyToClipboard}
                  style={{
                    background: copied ? "rgba(34,197,94,0.1)" : "transparent",
                    border: `1px solid ${copied ? "rgba(34,197,94,0.4)" : BORDER}`,
                    color: copied ? "#22C55E" : TEXT,
                    borderRadius: 5,
                    padding: "5px 12px",
                    fontSize: 10,
                    fontWeight: 700,
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4
                  }}
                >
                  {copied ? <><CheckCircle2 size={11} />Copied</> : <><CopyIcon size={11} />Copy Playbook</>}
                </button>
                <AIQAPanel
                  draft={output}
                  lead={selected}
                  onRegenerate={isValueDM ? confirmValueDM : runPlaybook}
                />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
