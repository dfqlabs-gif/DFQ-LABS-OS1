import { useState, useEffect, useMemo } from "react";
import { Brain, Target, Copy as CopyIcon, CheckCircle2 } from "lucide-react";
import React from "react";
import { Lead } from "../types";
import { alphaSort, leadLabel, iStyle, G, G_DIM, G_BORDER, SURFACE, SURFACE2, BORDER, MUTED, TEXT } from "../constants";
import { runAI, runFollowUpReply, buildAuditPrompt, buildObjectionsPrompt, buildClosingPlanPrompt, buildPipelinePrompt } from "../aiEngine";

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

  useEffect(() => {
    if (sortedActive.length > 0 && (!selectedId || !sortedActive.some(l => l.id === selectedId))) {
      setSelectedId(sortedActive[0].id);
    } else if (sortedActive.length === 0) {
      setSelectedId(null);
    }
  }, [sortedActive, selectedId]);

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

  const runPlaybook = async () => {
    if (!selected) return;
    setLoading2(true);
    setOutput("");
    try {
      // "Value DM" runs through the full multi-step reasoning pipeline (Strategy
      // Generator -> DM Writer -> Quality Checker) since it writes an outward message;
      // the other playbooks are analytical outputs, not literal replies to send.
      const text = mode === "followup" ? await runFollowUpReply(selected) : await runAI(buildPrompt(selected, mode), 1000);
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
            
            <button
              onClick={runPlaybook}
              disabled={loading2 || !selectedId}
              style={{
                background: loading2 ? SURFACE2 : G,
                color: loading2 ? MUTED : "#000",
                border: "none",
                borderRadius: 6,
                padding: "9px 20px",
                fontWeight: 800,
                fontSize: 12,
                cursor: loading2 || !selectedId ? "not-allowed" : "pointer"
              }}
            >
              {loading2 ? "Generating…" : "Generate →"}
            </button>
            
            {output && (
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
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
