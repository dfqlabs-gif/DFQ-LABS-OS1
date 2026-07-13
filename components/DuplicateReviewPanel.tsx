import { useMemo, useState } from "react";
import React from "react";
import { ShieldCheck, GitMerge, EyeOff, Search } from "lucide-react";
import { Lead, Stats } from "../types";
import { scanAllDuplicates, duplicatePairKey, G, G_DIM, G_BORDER, BORDER, SURFACE, SURFACE2, TEXT, MUTED, MUTED2 } from "../constants";

interface DuplicateReviewPanelProps {
  leads: Lead[];
  stats: Stats;
  onPersistStats: (s: Stats) => void;
  onMerge: (a: Lead, b: Lead) => void;
}

// Founder-only review surface for the whole shared dataset. Never auto-merges
// or auto-deletes anything — every pair requires an explicit human decision.
export function DuplicateReviewPanel({ leads, stats, onPersistStats, onMerge }: DuplicateReviewPanelProps) {
  const [search, setSearch] = useState("");

  const ignored = new Set(stats.ignoredDuplicatePairs || []);
  const allPairs = useMemo(() => scanAllDuplicates(leads), [leads]);
  const pairs = allPairs.filter(p => !ignored.has(duplicatePairKey(p.a.id, p.b.id)));

  const q = search.trim().toLowerCase();
  const filtered = q
    ? pairs.filter(p => (p.a.name || "").toLowerCase().includes(q) || (p.a.company || "").toLowerCase().includes(q) || (p.b.name || "").toLowerCase().includes(q) || (p.b.company || "").toLowerCase().includes(q))
    : pairs;

  const ignorePair = (a: Lead, b: Lead) => {
    const key = duplicatePairKey(a.id, b.id);
    onPersistStats({ ...stats, ignoredDuplicatePairs: [...(stats.ignoredDuplicatePairs || []), key] });
  };

  return (
    <div>
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 11, color: MUTED, letterSpacing: "0.08em", textTransform: "uppercase" }}>Lead Integrity</div>
        <div style={{ fontSize: 20, fontWeight: 800, color: TEXT, marginTop: 4 }}>Duplicate Review</div>
        <div style={{ fontSize: 11, color: MUTED, marginTop: 4 }}>Scans every active lead for likely duplicates (company, contact, phone, WhatsApp, Instagram, email). Nothing here is deleted automatically — merge or dismiss each pair yourself.</div>
      </div>

      <div style={{ position: "relative", marginBottom: 14, maxWidth: 340 }}>
        <Search size={13} style={{ position: "absolute", left: 10, top: 10, color: MUTED }} />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Filter by name or company…" style={{ width: "100%", background: SURFACE2, border: `1px solid ${BORDER}`, borderRadius: 6, padding: "8px 10px 8px 28px", color: TEXT, fontSize: 12 }} />
      </div>

      {filtered.length === 0 ? (
        <div style={{ textAlign: "center", padding: "50px 0", color: MUTED }}>
          <ShieldCheck size={28} color="#22C55E" style={{ marginBottom: 8, display: "inline-block" }} />
          <div style={{ fontSize: 14, color: TEXT, fontWeight: 600 }}>No likely duplicates found.</div>
          <div style={{ fontSize: 11, color: MUTED, marginTop: 4 }}>{ignored.size > 0 ? `${ignored.size} pair(s) previously dismissed.` : ""}</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {filtered.map(p => (
            <div key={duplicatePairKey(p.a.id, p.b.id)} style={{ background: SURFACE, border: "1px solid rgba(239,68,68,0.3)", borderRadius: 10, padding: "12px 14px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
                <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                  {[p.a, p.b].map(l => (
                    <div key={l.id}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: TEXT }}>{l.name || "—"}</div>
                      <div style={{ fontSize: 11, color: MUTED }}>{l.company || "—"}</div>
                      <div style={{ fontSize: 10, color: MUTED2, marginTop: 2 }}>{l.status} · {l.assignedTo || "Unassigned"}</div>
                    </div>
                  ))}
                </div>
                <span style={{ fontSize: 11, fontWeight: 800, color: "#EF4444", flexShrink: 0 }}>{p.confidence}% match</span>
              </div>
              <div style={{ fontSize: 10, color: MUTED, marginBottom: 10 }}>Matched on: {p.matchedFields.join(", ")}</div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => onMerge(p.a, p.b)} style={{ background: "rgba(139,92,246,0.1)", color: "#8B5CF6", border: "1px solid rgba(139,92,246,0.3)", borderRadius: 6, padding: "6px 12px", fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", gap: 5, cursor: "pointer" }}><GitMerge size={12} /> Merge</button>
                <button onClick={() => ignorePair(p.a, p.b)} style={{ background: "transparent", border: `1px solid ${BORDER}`, color: MUTED, borderRadius: 6, padding: "6px 12px", fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", gap: 5, cursor: "pointer" }}><EyeOff size={12} /> Not a Duplicate</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
export default DuplicateReviewPanel;
