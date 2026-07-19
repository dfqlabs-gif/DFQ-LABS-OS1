import React, { useState, useRef, useEffect, useCallback } from "react";
import { MessageCircle, X, Send, AtSign, Sun, Moon } from "lucide-react";
import { Lead } from "../types";
import {
  G, G_DIM, G_BORDER, SURFACE, SURFACE2, BORDER, TEXT, MUTED, MUTED2, iStyle, STATUS_COLOR,
} from "../constants";

interface AiMessage {
  role: "user" | "ai";
  text: string;
  dm?: string;
  strategy?: string;
}

interface AskAIProps {
  leads: Lead[];
}

function buildLeadContext(lead: Lead): string {
  const entries: string[] = [];
  if (lead.dmText) entries.push(`OUR INITIAL DM:\n${lead.dmText}`);
  if (lead.prospectInitialResponse) entries.push(`THEIR FIRST REPLY:\n${lead.prospectInitialResponse}`);
  if (lead.prospectLatestResponse) entries.push(`LATEST REPLY:\n${lead.prospectLatestResponse}`);
  (lead.conversationLog || []).forEach((e: any) => {
    entries.push(`[${e.date || ""}] ${e.sender || ""}: ${e.message || ""}`);
  });
  const convo = entries.join("\n\n") || "No conversation history recorded.";

  return `LEAD PROFILE:
Name: ${lead.name || "Unknown"}
Company: ${lead.company || "Unknown"}
Pipeline Stage: ${lead.status || "Unknown"}
Industry/Type: ${lead.clientType || "Unknown"}
Service Interest: ${lead.service || "Unknown"}
Assigned To: ${lead.assignedTo || "Unassigned"}
AI Bucket: ${lead.aiBucket || "Unknown"}
Notes: ${lead.notes || "None"}
Next Action: ${lead.nextAction || "None"}
Next Action Date: ${lead.nextActionDate || "None"}

CONVERSATION HISTORY:
${convo}`;
}

const SYSTEM_PROMPT = `You are the AI assistant inside DFQ Labs OS — a sales outreach CRM for Abuja real estate brands.

Your job is to help the sales team generate perfect outreach DMs and follow-up messages for their prospects.

RESPONSE FORMAT — always follow this exactly:
1. Write the section header "📨 SUGGESTED MESSAGE" on its own line.
2. Write the DM. It must be short, powerful, and consultant-grade. Rules:
   - NEVER open with hollow phrases like "Hope you're doing well", "I came across your profile", or "Great page!"
   - ZERO exclamation marks. ZERO emojis inside the message.
   - ZERO AI buzzwords: no "synergy", "leverage" (as verb), "revolutionize", "supercharge", "delve", "holistic", "elevate", "disrupt".
   - ONE clear ask per message. Low-friction.
   - If there is conversation history, pick it up naturally — never restart the relationship.
   - WhatsApp/DM: 2-4 sentences max. Email: 80-120 words with a sharp subject line.
3. Write "📊 STRATEGY" on its own line.
4. Write 2-4 bullet points explaining: what stage objective this targets, why the message is framed this way, and what the prospect should do next.

If no lead was referenced, answer the user's question helpfully and briefly.`;

// ─── Draggable bubble position ───────────────────────────────────────────────
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

function loadDarkMode() {
  try {
    const saved = localStorage.getItem("dfq-dark-mode");
    return saved !== "false"; // default to dark
  } catch {}
  return true;
}

export function AskAI({ leads }: AskAIProps) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<AiMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionResults, setMentionResults] = useState<Lead[]>([]);
  const [referencedLead, setReferencedLead] = useState<Lead | null>(null);
  const [darkMode, setDarkMode] = useState(loadDarkMode);

  // Draggable bubble position
  const [bubblePos, setBubblePos] = useState(loadBubblePos);
  const posRef = useRef(bubblePos);
  const dragRef = useRef<{ startX: number; startY: number; startBottom: number; startRight: number } | null>(null);
  const isDragging = useRef(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    posRef.current = bubblePos;
  }, [bubblePos]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 80);
  }, [open]);

  // Sync dark mode with body class
  useEffect(() => {
    if (darkMode) {
      document.body.classList.remove("light-mode");
    } else {
      document.body.classList.add("light-mode");
    }
    localStorage.setItem("dfq-dark-mode", String(darkMode));
  }, [darkMode]);

  // Restore saved light/dark preference on mount
  useEffect(() => {
    if (!loadDarkMode()) {
      document.body.classList.add("light-mode");
    }
  }, []);

  const toggleDarkMode = () => setDarkMode(d => !d);

  // ─── Drag handlers ────────────────────────────────────────────────────────
  const onBubbleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const pos = posRef.current;
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startBottom: pos.bottom,
      startRight: pos.right,
    };
    isDragging.current = false;

    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      const dx = ev.clientX - dragRef.current.startX;
      const dy = ev.clientY - dragRef.current.startY;
      if (!isDragging.current && (Math.abs(dx) > 4 || Math.abs(dy) > 4)) {
        isDragging.current = true;
      }
      if (!isDragging.current) return;
      const BUBBLE_SIZE = 54;
      const newRight = Math.max(8, Math.min(window.innerWidth - BUBBLE_SIZE - 8, dragRef.current.startRight - dx));
      const newBottom = Math.max(8, Math.min(window.innerHeight - BUBBLE_SIZE - 8, dragRef.current.startBottom + dy));
      const newPos = { bottom: newBottom, right: newRight };
      posRef.current = newPos;
      setBubblePos(newPos);
    };

    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      saveBubblePos(posRef.current);
      // Delay clearing so the click handler can check isDragging first
      setTimeout(() => { isDragging.current = false; }, 50);
      dragRef.current = null;
    };

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, []);

  const onBubbleClick = useCallback(() => {
    if (isDragging.current) return; // was a drag, not a click
    setOpen(o => !o);
  }, []);

  // ─── Chat panel position (just above the bubble) ─────────────────────────
  const panelWidth = typeof window !== "undefined" ? Math.min(440, window.innerWidth - 32) : 420;

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

  const send = async () => {
    const q = input.trim();
    if (!q || loading) return;

    setMessages(prev => [...prev, { role: "user", text: q }]);
    setInput("");
    setLoading(true);
    const lead = referencedLead;
    setReferencedLead(null);

    try {
      const fullSystem = lead
        ? `${SYSTEM_PROMPT}\n\nYou have full CRM context for this lead:\n${buildLeadContext(lead)}`
        : SYSTEM_PROMPT;

      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ systemPrompt: fullSystem, userPrompt: q, maxTokens: 1000 }),
      });

      const data = await res.json();
      if (data.error) throw new Error(data.error);

      const raw: string = data.text || "";

      const dmMarker = "📨 SUGGESTED MESSAGE";
      const stratMarker = "📊 STRATEGY";
      const hasDm = raw.includes(dmMarker);
      const hasSt = raw.includes(stratMarker);

      let dm = "";
      let strategy = "";

      if (hasDm) {
        const start = raw.indexOf(dmMarker) + dmMarker.length;
        const end = hasSt ? raw.indexOf(stratMarker) : raw.length;
        dm = raw.slice(start, end).trim();
      }
      if (hasSt) {
        strategy = raw.slice(raw.indexOf(stratMarker) + stratMarker.length).trim();
      }

      setMessages(prev => [...prev, { role: "ai", text: raw, dm: dm || undefined, strategy: strategy || undefined }]);
    } catch (err: any) {
      setMessages(prev => [...prev, { role: "ai", text: "Error: " + err.message }]);
    }
    setLoading(false);
  };

  // Chat panel opens above the bubble
  const BUBBLE_SIZE = 54;
  const panelBottom = bubblePos.bottom + BUBBLE_SIZE + 10;

  return (
    <>
      {/* Draggable floating bubble */}
      <div
        onMouseDown={onBubbleMouseDown}
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
        {open
          ? <X size={20} color={G} />
          : <MessageCircle size={20} color="#000" strokeWidth={2.5} />
        }
      </div>

      {/* Chat panel — positioned relative to bubble */}
      {open && (
        <div style={{
          position: "fixed",
          bottom: panelBottom,
          right: bubblePos.right,
          zIndex: 1050,
          width: panelWidth,
          maxHeight: "72vh",
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
            display: "flex", alignItems: "center", justifyContent: "space-between",
          }}>
            <div>
              <div style={{ fontWeight: 800, fontSize: 13, letterSpacing: "0.08em" }}>
                DFQ<span style={{ color: G }}>LABS</span>{" "}
                <span style={{ color: MUTED, fontWeight: 400, fontSize: 11 }}>Ask AI</span>
              </div>
              <div style={{ fontSize: 10, color: MUTED, marginTop: 2 }}>
                Type <span style={{ color: G, fontWeight: 700 }}>@name</span> to pull a prospect's CRM context and get a DM + strategy.
              </div>
            </div>
            {/* Light / Dark mode toggle */}
            <button
              onClick={toggleDarkMode}
              title={darkMode ? "Switch to light mode" : "Switch to dark mode"}
              style={{
                background: "transparent",
                border: `1px solid ${BORDER}`,
                borderRadius: 8,
                padding: "6px 8px",
                cursor: "pointer",
                color: MUTED2,
                display: "flex", alignItems: "center", justifyContent: "center",
                flexShrink: 0,
              }}
            >
              {darkMode ? <Sun size={14} /> : <Moon size={14} />}
            </button>
          </div>

          {/* Messages */}
          <div style={{ flex: 1, overflowY: "auto", padding: "12px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
            {messages.length === 0 && !loading && (
              <div style={{ textAlign: "center", padding: "32px 0", color: MUTED }}>
                <AtSign size={30} color={G} style={{ marginBottom: 10, display: "inline-block", opacity: 0.55 }} />
                <div style={{ fontSize: 13, color: TEXT, fontWeight: 600, marginBottom: 4 }}>Ready to draft a message</div>
                <div style={{ fontSize: 11, lineHeight: 1.6 }}>
                  Try:{" "}
                  <span style={{ color: G, fontStyle: "italic" }}>"Write a follow-up for @Kamalu Properties"</span>
                </div>
              </div>
            )}

            {messages.map((msg, i) => (
              <div key={i} style={{ display: "flex", flexDirection: "column" }}>
                {msg.role === "user" ? (
                  <div style={{
                    alignSelf: "flex-end",
                    maxWidth: "85%",
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
                    {msg.dm ? (
                      <>
                        <div style={{
                          background: SURFACE2,
                          border: `1px solid ${BORDER}`,
                          borderRadius: 10, padding: "10px 12px",
                        }}>
                          <div style={{ fontSize: 9, color: G, fontWeight: 700, letterSpacing: "0.1em", marginBottom: 6 }}>
                            📨 SUGGESTED MESSAGE
                          </div>
                          <div style={{ fontSize: 12, color: "#ddd", lineHeight: 1.78, whiteSpace: "pre-wrap" }}>
                            {msg.dm}
                          </div>
                          <button
                            onClick={() => navigator.clipboard.writeText(msg.dm || "")}
                            style={{
                              marginTop: 8, background: "transparent",
                              border: `1px solid ${G_BORDER}`, color: G,
                              borderRadius: 5, padding: "4px 10px",
                              fontSize: 10, fontWeight: 700, cursor: "pointer",
                            }}
                          >
                            Copy message
                          </button>
                        </div>
                        {msg.strategy && (
                          <div style={{
                            background: "rgba(139,92,246,0.07)",
                            border: "1px solid rgba(139,92,246,0.22)",
                            borderRadius: 10, padding: "10px 12px",
                          }}>
                            <div style={{ fontSize: 9, color: "#8B5CF6", fontWeight: 700, letterSpacing: "0.1em", marginBottom: 6 }}>
                              📊 STRATEGY
                            </div>
                            <div style={{ fontSize: 11, color: MUTED2, lineHeight: 1.72, whiteSpace: "pre-wrap" }}>
                              {msg.strategy}
                            </div>
                          </div>
                        )}
                      </>
                    ) : (
                      <div style={{
                        background: SURFACE2, border: `1px solid ${BORDER}`,
                        borderRadius: 10, padding: "10px 12px",
                        fontSize: 12, color: MUTED2, lineHeight: 1.65, whiteSpace: "pre-wrap",
                      }}>
                        {msg.text}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}

            {loading && (
              <div style={{
                background: SURFACE2, border: `1px solid ${BORDER}`,
                borderRadius: 10, padding: "10px 14px",
                fontSize: 11, color: MUTED, fontStyle: "italic",
              }}>
                Writing…
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* @ mention dropdown */}
          {mentionQuery !== null && mentionResults.length > 0 && (
            <div style={{
              borderTop: `1px solid ${BORDER}`,
              background: SURFACE2,
              maxHeight: 180, overflowY: "auto",
              flexShrink: 0,
            }}>
              <div style={{ fontSize: 9, color: MUTED, fontWeight: 700, letterSpacing: "0.1em", padding: "6px 14px 2px" }}>
                SELECT PROSPECT
              </div>
              {mentionResults.map(lead => (
                <button
                  key={lead.id}
                  onClick={() => selectMention(lead)}
                  style={{
                    width: "100%", textAlign: "left",
                    background: "transparent", border: "none",
                    borderBottom: `1px solid ${BORDER}`,
                    padding: "8px 14px", cursor: "pointer",
                    display: "flex", alignItems: "center", gap: 10,
                    color: TEXT,
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = G_DIM)}
                  onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                >
                  <div style={{
                    width: 7, height: 7, borderRadius: "50%",
                    background: STATUS_COLOR[lead.status] || G,
                    flexShrink: 0,
                  }} />
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600 }}>{lead.name || "—"}</div>
                    <div style={{ fontSize: 10, color: MUTED }}>
                      {lead.company} · {lead.status}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Referenced lead chip */}
          {referencedLead && (
            <div style={{
              padding: "6px 14px",
              borderTop: `1px solid ${BORDER}`,
              flexShrink: 0,
              display: "flex", alignItems: "center", gap: 6,
            }}>
              <span style={{ fontSize: 9, color: G, fontWeight: 700, letterSpacing: "0.08em" }}>CONTEXT:</span>
              <span style={{
                fontSize: 10, background: G_DIM,
                border: `1px solid ${G_BORDER}`,
                color: G, borderRadius: 20, padding: "2px 8px",
              }}>
                {referencedLead.name || referencedLead.company} · {referencedLead.status}
              </span>
              <button
                onClick={() => setReferencedLead(null)}
                style={{ background: "transparent", border: "none", color: MUTED, cursor: "pointer", fontSize: 12, padding: "0 2px" }}
              >×</button>
            </div>
          )}

          {/* Input row */}
          <div style={{
            padding: "10px 12px",
            borderTop: `1px solid ${BORDER}`,
            display: "flex", gap: 8, alignItems: "flex-end",
            flexShrink: 0,
          }}>
            <textarea
              ref={inputRef}
              value={input}
              onChange={handleChange}
              onKeyDown={e => {
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
              }}
              placeholder="Ask AI… use @ to tag a prospect"
              rows={2}
              style={{ ...iStyle, flex: 1, resize: "none", fontSize: 12, lineHeight: 1.5 }}
            />
            <button
              onClick={send}
              disabled={loading || !input.trim()}
              style={{
                background: loading || !input.trim() ? SURFACE2 : G,
                color: loading || !input.trim() ? MUTED : "#000",
                border: "none", borderRadius: 8,
                padding: "9px 12px",
                cursor: loading || !input.trim() ? "not-allowed" : "pointer",
                flexShrink: 0,
                display: "flex", alignItems: "center", justifyContent: "center",
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
