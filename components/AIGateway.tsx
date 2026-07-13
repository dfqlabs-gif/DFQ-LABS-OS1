import { useState, useEffect, useCallback } from "react";
import React from "react";
import { Zap, CheckCircle2, XCircle, RefreshCw, Trash2, ChevronDown } from "lucide-react";
import { getActiveModel, setActiveModel, getAIErrors, clearAIErrors, AIError } from "../prompts";
import {
  G, G_DIM, G_BORDER, SURFACE, SURFACE2, BORDER, BORDER2, BG, TEXT, MUTED, MUTED2, iStyle
} from "../constants";

// ─── Model list mirrored from api/ai.ts (no runtime import needed) ────────
// Keep this in sync with AVAILABLE_MODELS/DEFAULT_MODEL in api/ai.ts and
// GEMINI_MODEL in server.ts. All models below are Google Gemini — optimized
// for high-volume free-tier workloads (generous RPM / TPM on the free plan).
const MODELS = [
  { id: "gemini-2.5-flash",      label: "Gemini 2.5 Flash",      note: "Recommended · High Volume" },
  { id: "gemini-2.0-flash",      label: "Gemini 2.0 Flash",      note: "Fast · Concise" },
  { id: "gemini-2.5-flash-lite", label: "Gemini 2.5 Flash Lite", note: "Lightweight · Fastest" },
  { id: "gemini-1.5-flash",      label: "Gemini 1.5 Flash",      note: "Stable · Proven" },
];

const DEFAULT_MODEL_ID = "gemini-2.5-flash";

type Status = "idle" | "checking" | "ok" | "error";

interface TestResult {
  ok: boolean;
  model: string;
  latencyMs?: number;
  response?: string;
  error?: string;
}

interface HealthData {
  configured: boolean;
  defaultModel: string;
  fallbackModels?: string[];
  lastSuccessAt: string | null;
  lastModelUsed: string | null;
  successCount: number;
  failureCount: number;
  avgLatencyMs: number | null;
  recentErrors: { ts: string; message: string; model: string }[];
}

export function AIGateway() {
  const [selectedModel, setSelectedModel] = useState<string>(DEFAULT_MODEL_ID);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [errors, setErrors] = useState<AIError[]>([]);
  const [saving, setSaving] = useState(false);
  const [health, setHealth] = useState<HealthData | null>(null);

  // Load persisted model + errors on mount
  useEffect(() => {
    const saved = getActiveModel();
    if (saved) setSelectedModel(saved);
    setErrors(getAIErrors());
    checkConfigured();
    const interval = setInterval(checkConfigured, 30000);
    return () => clearInterval(interval);
  }, []);

  const checkConfigured = async () => {
    try {
      const res = await fetch("/api/ai-status");
      const contentType = res.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) {
        setConfigured(false);
        return;
      }
      const data = await res.json();
      setConfigured(data.configured);
      setHealth(data);
    } catch {
      setConfigured(false);
    }
  };

  const saveModel = () => {
    setSaving(true);
    setActiveModel(selectedModel);
    setTimeout(() => setSaving(false), 900);
  };

  const testConnection = useCallback(async () => {
    setStatus("checking");
    setTestResult(null);
    try {
      const res = await fetch("/api/ai-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: selectedModel })
      });
      const contentType = res.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) {
        setTestResult({ ok: false, model: selectedModel, error: "API endpoint not found — the latest code may not be deployed yet. Push to Vercel and trigger a redeploy." });
        setStatus("error");
        return;
      }
      const data: TestResult = await res.json();
      setTestResult(data);
      setStatus(data.ok ? "ok" : "error");
      checkConfigured();
    } catch (e: any) {
      setTestResult({ ok: false, model: selectedModel, error: e.message || "Network error" });
      setStatus("error");
    }
  }, [selectedModel]);

  const handleClearErrors = () => {
    clearAIErrors();
    setErrors([]);
  };

  const activeModelInfo = MODELS.find(m => m.id === selectedModel) || MODELS[0];

  const StatusDot = ({ s }: { s: Status }) => {
    if (s === "checking") return <span className="pulse" style={{ width: 8, height: 8, borderRadius: "50%", background: "#F59E0B", display: "inline-block" }} />;
    if (s === "ok") return <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#22C55E", display: "inline-block", boxShadow: "0 0 6px #22C55E80" }} />;
    if (s === "error") return <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#EF4444", display: "inline-block" }} />;
    return <span style={{ width: 8, height: 8, borderRadius: "50%", background: MUTED, display: "inline-block" }} />;
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

      {/* ── Header card ─────────────────────────────────────────────────── */}
      <div className="dfq-card" style={{ background: `linear-gradient(160deg, ${SURFACE}, #0c0c0c)`, border: `1px solid ${G_BORDER}`, borderRadius: 12, padding: "16px 18px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <Zap size={13} color={G} />
          <span style={{ fontSize: 9, color: G, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase" }}>AI Gateway</span>
          <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6, fontSize: 10, color: MUTED }}>
            <StatusDot s={status} />
            {status === "idle" && "Not tested"}
            {status === "checking" && "Testing…"}
            {status === "ok" && <span style={{ color: "#22C55E", fontWeight: 700 }}>Connected</span>}
            {status === "error" && <span style={{ color: "#EF4444", fontWeight: 700 }}>Error</span>}
          </span>
        </div>
        <div style={{ fontSize: 12, color: MUTED2, lineHeight: 1.6 }}>
          Switch AI models without touching code or redeploying. Changes take effect immediately for all AI features in the OS.
        </div>

        {/* API key status */}
        <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderRadius: 7, background: configured === null ? SURFACE2 : configured ? "rgba(34,197,94,0.06)" : "rgba(239,68,68,0.06)", border: `1px solid ${configured === null ? BORDER : configured ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)"}` }}>
          {configured === null && <span style={{ fontSize: 11, color: MUTED }}>Checking API key…</span>}
          {configured === true && <><CheckCircle2 size={13} color="#22C55E" /><span style={{ fontSize: 11, color: "#22C55E", fontWeight: 700 }}>GEMINI_API_KEY is configured on the server.</span></>}
          {configured === false && <><XCircle size={13} color="#EF4444" /><span style={{ fontSize: 11, color: "#EF4444", fontWeight: 700 }}>GEMINI_API_KEY is not set. Add it to your environment variables.</span></>}
        </div>
      </div>

      {/* ── Model selector ──────────────────────────────────────────────── */}
      <div className="dfq-card" style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 12, padding: "16px 18px" }}>
        <div style={{ fontSize: 9, color: G, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 14 }}>Active Model</div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
          {MODELS.map(m => {
            const active = selectedModel === m.id;
            return (
              <div
                key={m.id}
                onClick={() => setSelectedModel(m.id)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "10px 14px",
                  borderRadius: 8,
                  border: `1px solid ${active ? G_BORDER : BORDER}`,
                  background: active ? G_DIM : SURFACE2,
                  cursor: "pointer",
                  transition: "all 0.15s"
                }}
              >
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: active ? G : TEXT }}>{m.label}</div>
                  <div style={{ fontSize: 10, color: MUTED, marginTop: 2 }}>{m.id}</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 9, padding: "2px 7px", borderRadius: 4, background: active ? `${G}15` : `${MUTED}10`, border: `1px solid ${active ? G_BORDER : BORDER}`, color: active ? G : MUTED, fontWeight: 600 }}>{m.note}</span>
                  {active && <div style={{ width: 7, height: 7, borderRadius: "50%", background: G, boxShadow: `0 0 8px ${G}` }} />}
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={saveModel}
            style={{
              background: saving ? "rgba(34,197,94,0.15)" : G,
              color: saving ? "#22C55E" : "#000",
              border: saving ? "1px solid rgba(34,197,94,0.4)" : "none",
              borderRadius: 7,
              padding: "9px 20px",
              fontWeight: 800,
              fontSize: 12,
              cursor: "pointer"
            }}
          >
            {saving ? "✓ Saved" : "Apply Model"}
          </button>
          <button
            onClick={testConnection}
            disabled={status === "checking"}
            style={{
              background: "transparent",
              color: status === "checking" ? MUTED : G,
              border: `1px solid ${status === "checking" ? BORDER : G_BORDER}`,
              borderRadius: 7,
              padding: "9px 18px",
              fontWeight: 700,
              fontSize: 12,
              cursor: status === "checking" ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              gap: 6
            }}
          >
            <RefreshCw size={12} style={{ animation: status === "checking" ? "spin 1s linear infinite" : "none" }} />
            {status === "checking" ? "Testing…" : "Test Connection"}
          </button>
        </div>

        {/* Test result */}
        {testResult && (
          <div style={{ marginTop: 12, padding: "10px 14px", borderRadius: 8, background: testResult.ok ? "rgba(34,197,94,0.06)" : "rgba(239,68,68,0.06)", border: `1px solid ${testResult.ok ? "rgba(34,197,94,0.25)" : "rgba(239,68,68,0.25)"}` }}>
            {testResult.ok ? (
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <CheckCircle2 size={13} color="#22C55E" />
                <span style={{ fontSize: 12, color: "#22C55E", fontWeight: 700 }}>Connected — {testResult.latencyMs}ms</span>
                <span style={{ fontSize: 10, color: MUTED }}>· {testResult.model}</span>
              </div>
            ) : (
              <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                <XCircle size={13} color="#EF4444" style={{ flexShrink: 0, marginTop: 1 }} />
                <div>
                  <div style={{ fontSize: 12, color: "#EF4444", fontWeight: 700, marginBottom: 2 }}>Connection failed</div>
                  <div style={{ fontSize: 11, color: "#ccc" }}>{testResult.error}</div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── AI Health Monitoring ────────────────────────────────────────── */}
      <div className="dfq-card" style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 12, padding: "16px 18px" }}>
        <div style={{ fontSize: 9, color: G, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 14 }}>Health Monitoring</div>
        {!health ? (
          <div style={{ fontSize: 11, color: MUTED, padding: "10px 0" }}>Loading health data…</div>
        ) : (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 10, marginBottom: 12 }}>
              <div style={{ background: SURFACE2, border: `1px solid ${BORDER}`, borderRadius: 8, padding: "10px 12px" }}>
                <div style={{ fontSize: 9, color: MUTED, fontWeight: 700, letterSpacing: "0.06em", marginBottom: 4 }}>ACTIVE / LAST MODEL</div>
                <div style={{ fontSize: 11, color: TEXT, fontWeight: 700 }}>{(health.lastModelUsed || health.defaultModel).split("/").pop()}</div>
              </div>
              <div style={{ background: SURFACE2, border: `1px solid ${BORDER}`, borderRadius: 8, padding: "10px 12px" }}>
                <div style={{ fontSize: 9, color: MUTED, fontWeight: 700, letterSpacing: "0.06em", marginBottom: 4 }}>LAST SUCCESS</div>
                <div style={{ fontSize: 11, color: TEXT, fontWeight: 700 }}>{health.lastSuccessAt ? new Date(health.lastSuccessAt).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" }) : "—"}</div>
              </div>
              <div style={{ background: SURFACE2, border: `1px solid ${BORDER}`, borderRadius: 8, padding: "10px 12px" }}>
                <div style={{ fontSize: 9, color: MUTED, fontWeight: 700, letterSpacing: "0.06em", marginBottom: 4 }}>AVG LATENCY</div>
                <div style={{ fontSize: 11, color: TEXT, fontWeight: 700 }}>{health.avgLatencyMs != null ? `${health.avgLatencyMs}ms` : "—"}</div>
              </div>
              <div style={{ background: SURFACE2, border: `1px solid ${BORDER}`, borderRadius: 8, padding: "10px 12px" }}>
                <div style={{ fontSize: 9, color: MUTED, fontWeight: 700, letterSpacing: "0.06em", marginBottom: 4 }}>SUCCESS / FAILURE</div>
                <div style={{ fontSize: 11, fontWeight: 700 }}><span style={{ color: "#22C55E" }}>{health.successCount}</span> <span style={{ color: MUTED }}>/</span> <span style={{ color: health.failureCount > 0 ? "#EF4444" : MUTED }}>{health.failureCount}</span></div>
              </div>
            </div>
            {health.fallbackModels && (
              <div style={{ fontSize: 10, color: MUTED, marginBottom: health.recentErrors.length > 0 ? 10 : 0 }}>
                Fallback chain: {health.fallbackModels.map(m => m.split("/").pop()).join(" → ")}
              </div>
            )}
            {health.recentErrors.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 180, overflowY: "auto" }}>
                {health.recentErrors.slice(0, 5).map((e, i) => (
                  <div key={i} style={{ padding: "6px 10px", background: SURFACE2, border: "1px solid rgba(239,68,68,0.15)", borderLeft: "2px solid #EF4444", borderRadius: 6 }}>
                    <div style={{ fontSize: 9, color: MUTED }}>{new Date(e.ts).toLocaleTimeString("en-GB")} · {e.model.split("/").pop()}</div>
                    <div style={{ fontSize: 10, color: "#ccc" }}>{e.message}</div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Error log ───────────────────────────────────────────────────── */}
      <div className="dfq-card" style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 12, padding: "16px 18px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <div style={{ fontSize: 9, color: G, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase" }}>
            Error Log <span style={{ color: errors.length > 0 ? "#EF4444" : MUTED, fontWeight: 400 }}>({errors.length})</span>
          </div>
          {errors.length > 0 && (
            <button
              onClick={handleClearErrors}
              style={{ background: "transparent", color: MUTED, border: `1px solid ${BORDER}`, borderRadius: 5, padding: "4px 10px", fontSize: 10, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}
            >
              <Trash2 size={10} /> Clear
            </button>
          )}
        </div>

        {errors.length === 0 ? (
          <div style={{ fontSize: 11, color: MUTED, padding: "12px 0", textAlign: "center" }}>No errors logged. The AI service is running cleanly.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 320, overflowY: "auto" }}>
            {errors.map((e, i) => (
              <div key={i} style={{ padding: "8px 10px", background: SURFACE2, border: "1px solid rgba(239,68,68,0.15)", borderLeft: "2px solid #EF4444", borderRadius: 6 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                  <span style={{ fontSize: 9, color: MUTED, fontWeight: 600 }}>{new Date(e.ts).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" })}</span>
                  {e.model && <span style={{ fontSize: 9, color: MUTED, fontStyle: "italic" }}>{e.model.split("/").pop()}</span>}
                </div>
                <div style={{ fontSize: 11, color: "#ccc", lineHeight: 1.5 }}>{e.message}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Info ────────────────────────────────────────────────────────── */}
      <div style={{ padding: "10px 14px", background: BG, border: `1px solid ${BORDER}`, borderRadius: 8, fontSize: 10, color: MUTED, lineHeight: 1.7 }}>
        <span style={{ color: MUTED2, fontWeight: 700 }}>How to add a new key:</span> Go to <span style={{ color: G }}>aistudio.google.com/apikey</span> → create a free API key → add it as <span style={{ color: G }}>GEMINI_API_KEY</span> in your Replit environment variables. Optionally set <span style={{ color: G }}>GEMINI_MODEL</span> to switch models globally. All models listed above use Google's free tier (generous RPM / TPM).
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
