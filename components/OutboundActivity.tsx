import React, { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw, Search } from "lucide-react";
import { BORDER, G, G_BORDER, MUTED, MUTED2, SURFACE, SURFACE2, TEXT, iStyle } from "../constants";

type OutboundActivityItem = {
  id: string; leadId: string; leadName: string; company: string; assignedTo: string;
  generatedBy: string; messageType: string; messageText: string; originalGeneratedMessage: string;
  status: string; source: string; generatedAt: string | null; whatsappOpenedAt: string | null; sentAt: string | null;
};

const dateLabel = (value: string | null) => value ? new Date(value).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }) : "—";

export function OutboundActivity() {
  const [items, setItems] = useState<OutboundActivityItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("ALL");
  const [type, setType] = useState("ALL");
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/outbound/activity");
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Could not load outbound activity.");
      setItems(Array.isArray(payload.activity) ? payload.activity : []);
      setTotal(Number(payload.total) || 0);
    } catch (err: any) { setError(err.message || "Could not load outbound activity."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const types = useMemo(() => [...new Set(items.map(item => item.messageType))].sort(), [items]);
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter(item => (status === "ALL" || item.status === status) &&
      (type === "ALL" || item.messageType === type) &&
      (!q || [item.leadName, item.company, item.assignedTo, item.generatedBy, item.messageText].some(value => (value || "").toLowerCase().includes(q))));
  }, [items, search, status, type]);
  const sent = items.filter(item => item.status === "SENT").length;
  const opened = items.filter(item => item.whatsappOpenedAt && item.status !== "SENT").length;
  const card: React.CSSProperties = { background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 10, padding: "14px 16px" };

  return <div style={{ maxWidth: 1120, display: "flex", flexDirection: "column", gap: 12 }}>
    <div style={{ ...card, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
      <div><div style={{ color: G, fontSize: 10, fontWeight: 800, letterSpacing: "0.12em" }}>OUTBOUND EXECUTION LEDGER</div><div style={{ color: TEXT, fontSize: 19, fontWeight: 800, marginTop: 4 }}>DM Activity & Execution</div><div style={{ color: MUTED, fontSize: 11, marginTop: 4 }}>Every persisted draft, WhatsApp handoff and confirmed send, linked to its recipient.</div></div>
      <button onClick={() => void load()} style={{ background: "transparent", color: G, border: `1px solid ${G_BORDER}`, borderRadius: 6, padding: "8px 11px", cursor: "pointer", display: "flex", gap: 6, alignItems: "center" }}><RefreshCw size={13}/> Refresh</button>
    </div>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: 8 }}>
      {[[ "Persisted generations", total ], [ "Confirmed sent", sent ], [ "Opened, not confirmed", opened ]].map(([label, value]) => <div key={String(label)} style={card}><div style={{ color: MUTED, fontSize: 10, textTransform: "uppercase" }}>{label}</div><div style={{ color: TEXT, fontSize: 24, fontWeight: 800, marginTop: 5 }}>{value}</div></div>)}
    </div>
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      <div style={{ position: "relative", flex: "1 1 260px" }}><Search size={13} style={{ position: "absolute", left: 10, top: 10, color: MUTED }}/><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search recipient, company, staff or message…" style={{ ...iStyle, paddingLeft: 30, width: "100%" }}/></div>
      <select value={status} onChange={e => setStatus(e.target.value)} style={{ ...iStyle, width: 160 }}><option value="ALL">All statuses</option>{["GENERATED","READY_TO_SEND","WHATSAPP_OPENED","SENT","FAILED","CANCELLED"].map(value => <option key={value}>{value}</option>)}</select>
      <select value={type} onChange={e => setType(e.target.value)} style={{ ...iStyle, width: 160 }}><option value="ALL">All message types</option>{types.map(value => <option key={value}>{value}</option>)}</select>
    </div>
    {error && <div style={{ color: "#F87171", fontSize: 12 }}>{error}</div>}
    {loading ? <div style={{ color: MUTED, padding: 20 }}>Loading outbound records…</div> : filtered.length === 0 ? <div style={{ ...card, color: MUTED, textAlign: "center", padding: 28 }}>No outbound messages match these filters.</div> :
      <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
        {filtered.map(item => <div key={item.id} style={{ ...card, padding: "12px 14px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "start" }}>
            <div style={{ minWidth: 220, flex: 1 }}>
              <div style={{ color: TEXT, fontWeight: 800, fontSize: 13 }}>{item.leadName} <span style={{ color: MUTED, fontWeight: 400 }}>{item.company ? `· ${item.company}` : ""}</span></div>
              <div style={{ color: MUTED2, fontSize: 10, marginTop: 4 }}>Assigned: {item.assignedTo} · Generated by: {item.generatedBy} · {item.messageType} · {item.source || "unknown source"}</div>
              <div style={{ color: MUTED, fontSize: 10, marginTop: 4 }}>Generated: {dateLabel(item.generatedAt)} · WhatsApp opened: {dateLabel(item.whatsappOpenedAt)} · Sent: {dateLabel(item.sentAt)}</div>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span style={{ color: item.status === "SENT" ? "#22C55E" : G, border: `1px solid ${item.status === "SENT" ? "rgba(34,197,94,.35)" : G_BORDER}`, borderRadius: 5, padding: "4px 7px", fontSize: 9, fontWeight: 800 }}>{item.status}</span>
              <button onClick={() => setExpanded(expanded === item.id ? null : item.id)} style={{ background: SURFACE2, color: TEXT, border: `1px solid ${BORDER}`, borderRadius: 5, padding: "5px 9px", fontSize: 10, cursor: "pointer" }}>{expanded === item.id ? "Hide message" : "View message"}</button>
            </div>
          </div>
          {expanded === item.id && <div style={{ marginTop: 10, borderTop: `1px solid ${BORDER}`, paddingTop: 10 }}>
            <div style={{ color: MUTED, fontSize: 9, fontWeight: 800, marginBottom: 5 }}>EXACT STORED MESSAGE</div>
            <div style={{ color: TEXT, fontSize: 12, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{item.messageText}</div>
            {item.originalGeneratedMessage !== item.messageText && <><div style={{ color: MUTED, fontSize: 9, fontWeight: 800, margin: "10px 0 5px" }}>ORIGINAL GENERATED VERSION</div><div style={{ color: MUTED2, fontSize: 11, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{item.originalGeneratedMessage}</div></>}
          </div>}
        </div>)}
      </div>}
    <div style={{ color: MUTED, fontSize: 10 }}>Showing up to 1,000 most recent records from {total} total persisted outbound messages.</div>
  </div>;
}
