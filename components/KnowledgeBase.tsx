// ─────────────────────────────────────────────────────────────────────────────
// KnowledgeBase — DFQ Labs Knowledge Base manager (Part 1)
//
// Authorized users upload/manage proprietary knowledge the AI uses when
// reasoning about leads. Supports: PDF, DOC/DOCX, TXT, Markdown, Website URL,
// and other text-based documents. Retrieval is keyword-based (server-side).
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect, useRef, useCallback } from "react";
import { BookOpen, Upload, Globe, Trash2, Eye, EyeOff, FileText, Link2, RefreshCw, X, CheckCircle2, AlertCircle, Search } from "lucide-react";
import { G, G_DIM, G_BORDER, BORDER, SURFACE, SURFACE2, TEXT, MUTED, MUTED2, iStyle } from "../constants";

export interface KnowledgeSource {
  id: string;
  title: string;
  type: string;        // "pdf" | "docx" | "txt" | "markdown" | "url" | "other"
  status: string;      // "ready" | "processing" | "error"
  content: string;     // extracted text
  sourceUrl?: string;
  enabled: boolean;
  createdAt: string;
  fileSize?: number;
  error?: string;
}

const TYPE_ICON: Record<string, any> = {
  pdf: FileText, docx: FileText, doc: FileText, txt: FileText,
  markdown: FileText, md: FileText, url: Link2, other: FileText,
};

const TYPE_LABEL: Record<string, string> = {
  pdf: "PDF", docx: "DOCX", doc: "DOC", txt: "TXT",
  markdown: "Markdown", md: "Markdown", url: "Website URL", other: "Document",
};

function detectType(file: File): string {
  const name = file.name.toLowerCase();
  if (name.endsWith(".pdf")) return "pdf";
  if (name.endsWith(".docx")) return "docx";
  if (name.endsWith(".doc")) return "doc";
  if (name.endsWith(".md") || name.endsWith(".markdown")) return "markdown";
  if (name.endsWith(".txt")) return "txt";
  if (name.endsWith(".json")) return "txt";
  if (name.endsWith(".html") || name.endsWith(".htm")) return "txt";
  return "other";
}

export function KnowledgeBase() {
  const [sources, setSources] = useState<KnowledgeSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [urlInput, setUrlInput] = useState("");
  const [urlTitle, setUrlTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [viewing, setViewing] = useState<KnowledgeSource | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const loadSources = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/knowledge");
      if (res.ok) {
        const data = await res.json();
        setSources(data.sources || []);
      }
    } catch (e) {
      setError("Failed to load knowledge sources.");
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadSources(); }, [loadSources]);

  const saveSource = async (source: KnowledgeSource) => {
    await fetch("/api/knowledge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source }),
    });
  };

  const deleteSource = async (id: string) => {
    setSources(p => p.filter(s => s.id !== id));
    await fetch("/api/knowledge", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
  };

  const toggleEnabled = async (source: KnowledgeSource) => {
    const updated = { ...source, enabled: !source.enabled };
    setSources(p => p.map(s => s.id === source.id ? updated : s));
    await saveSource(updated);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setUploading(true);
    setError(null);

    for (const file of files) {
      const type = detectType(file);
      const id = "kb-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      const source: KnowledgeSource = {
        id,
        title: file.name.replace(/\.[^.]+$/, ""),
        type,
        status: "processing",
        content: "",
        enabled: true,
        createdAt: new Date().toISOString(),
        fileSize: file.size,
      };

      // Optimistic add
      setSources(p => [source, ...p]);

      try {
        let text = "";
        // Text-based formats — extract client-side
        if (type === "txt" || type === "markdown" || file.type.startsWith("text/") || file.type === "application/json") {
          text = await file.text();
        } else if (file.type === "text/html" || file.name.endsWith(".html") || file.name.endsWith(".htm")) {
          text = (await file.text()).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
        } else {
          // PDF/DOCX — best-effort text extraction from raw stream
          const raw = await file.text();
          // Extract readable text between stream markers (basic PDF text recovery)
          text = raw
            .replace(/[^\x20-\x7E\n\r]/g, " ")
            .replace(/\b(BT|ET|Tf|Td|Tj|TJ|Tm|rg|rg|re|w|J|j|M|d|S|f|g|gs|cs|scn|BI|ID|EI|Do|cm|q|Q|gs|BT|ET)\b/g, " ")
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, 50000);
          if (!text || text.length < 50) {
            text = `[Binary document: ${file.name}. Text extraction for ${type.toUpperCase()} is limited — the source is indexed by title and metadata. For full AI retrieval, paste the key content as a TXT file.]`;
          }
        }

        const final: KnowledgeSource = { ...source, content: text, status: "ready" };
        setSources(p => p.map(s => s.id === id ? final : s));
        await saveSource(final);
      } catch (err: any) {
        const failed: KnowledgeSource = { ...source, status: "error", error: err.message };
        setSources(p => p.map(s => s.id === id ? failed : s));
        await saveSource(failed);
      }
    }

    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleUrlAdd = async () => {
    const url = urlInput.trim();
    if (!url) return;
    setUploading(true);
    setError(null);
    const id = "kb-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const title = urlTitle.trim() || url;
    const source: KnowledgeSource = {
      id, title, type: "url", status: "processing", content: "",
      sourceUrl: url, enabled: true, createdAt: new Date().toISOString(),
    };
    setSources(p => [source, ...p]);

    try {
      const res = await fetch("/api/knowledge/fetch-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      const final: KnowledgeSource = {
        ...source,
        content: data.text || "",
        title: urlTitle.trim() || data.title || url,
        status: "ready",
      };
      setSources(p => p.map(s => s.id === id ? final : s));
      await saveSource(final);
      setUrlInput("");
      setUrlTitle("");
    } catch (err: any) {
      const failed: KnowledgeSource = { ...source, status: "error", error: err.message };
      setSources(p => p.map(s => s.id === id ? failed : s));
      await saveSource(failed);
      setError(err.message);
    }
    setUploading(false);
  };

  const filtered = sources.filter(s => {
    const q = search.toLowerCase();
    return !q || s.title.toLowerCase().includes(q) || s.type.toLowerCase().includes(q);
  });

  const readyCount = sources.filter(s => s.status === "ready" && s.enabled).length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Header */}
      <div className="dfq-card" style={{ background: SURFACE, border: `1px solid ${G_BORDER}`, borderRadius: 12, padding: "16px 18px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <BookOpen size={16} color={G} />
          <span style={{ fontSize: 16, fontWeight: 800, color: TEXT }}>DFQ Labs Knowledge Base</span>
        </div>
        <div style={{ fontSize: 12, color: MUTED, lineHeight: 1.6 }}>
          Upload proprietary knowledge the AI retrieves when reasoning about leads and generating messages. The AI uses <span style={{ color: G, fontWeight: 700 }}>retrieval</span> — it never dumps entire documents into every prompt. Only knowledge relevant to the specific lead, conversation, and message type is injected.
        </div>
        <div style={{ fontSize: 11, color: MUTED2, marginTop: 8 }}>
          <CheckCircle2 size={11} style={{ display: "inline", marginRight: 4, color: "#22C55E" }} />
          {readyCount} active source{readyCount !== 1 ? "s" : ""} · {sources.length} total
        </div>
      </div>

      {/* Upload area */}
      <div className="dfq-card" style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 12, padding: "16px 18px" }}>
        <div style={{ fontSize: 9, color: G, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
          <Upload size={12} /> Add Knowledge Source
        </div>

        {/* File upload */}
        <input ref={fileRef} type="file" multiple accept=".pdf,.docx,.doc,.txt,.md,.markdown,.json,.html,.htm,text/*" style={{ display: "none" }} onChange={handleFileUpload} />
        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          style={{ background: uploading ? SURFACE2 : G_DIM, color: uploading ? MUTED : G, border: `1px solid ${G_BORDER}`, borderRadius: 8, padding: "14px 20px", fontWeight: 700, fontSize: 12, cursor: uploading ? "not-allowed" : "pointer", display: "flex", alignItems: "center", gap: 8, width: "100%", justifyContent: "center" }}
        >
          <Upload size={14} /> {uploading ? "Processing…" : "Upload Document (PDF, DOCX, TXT, Markdown)"}
        </button>

        {/* URL input */}
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ fontSize: 10, color: MUTED, display: "flex", alignItems: "center", gap: 5 }}>
            <Globe size={12} /> Or add a website URL — the OS fetches and indexes the page text:
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input value={urlTitle} onChange={e => setUrlTitle(e.target.value)} placeholder="Title (optional)" style={{ ...iStyle, flex: "1 1 140px", minWidth: 120 }} />
            <input value={urlInput} onChange={e => setUrlInput(e.target.value)} placeholder="https://example.com/article" style={{ ...iStyle, flex: "2 1 240px", minWidth: 200 }} onKeyDown={e => { if (e.key === "Enter") handleUrlAdd(); }} />
            <button onClick={handleUrlAdd} disabled={uploading || !urlInput.trim()} style={{ background: uploading || !urlInput.trim() ? SURFACE2 : G, color: uploading || !urlInput.trim() ? MUTED : "#000", border: "none", borderRadius: 6, padding: "8px 16px", fontWeight: 700, fontSize: 11, cursor: uploading || !urlInput.trim() ? "not-allowed" : "pointer", display: "flex", alignItems: "center", gap: 5, whiteSpace: "nowrap" }}>
              <Globe size={13} /> Fetch & Index
            </button>
          </div>
        </div>

        {error && <div style={{ marginTop: 8, fontSize: 10, color: "#EF4444", display: "flex", alignItems: "center", gap: 5 }}><AlertCircle size={12} /> {error}</div>}
      </div>

      {/* Sources list */}
      <div className="dfq-card" style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 12, padding: "16px 18px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
          <div style={{ fontSize: 9, color: G, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase" }}>Knowledge Sources</div>
          <button onClick={loadSources} style={{ background: "transparent", border: `1px solid ${BORDER}`, color: MUTED, borderRadius: 5, padding: "4px 10px", fontSize: 10, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}><RefreshCw size={11} /> Refresh</button>
        </div>

        <div style={{ position: "relative", marginBottom: 12 }}>
          <Search size={12} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: MUTED, pointerEvents: "none" }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search sources…" style={{ ...iStyle, paddingLeft: 28 }} />
        </div>

        {loading ? (
          <div style={{ textAlign: "center", padding: "30px 0", color: MUTED, fontSize: 12 }}>Loading…</div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: "40px 0", color: MUTED }}>
            <BookOpen size={28} style={{ marginBottom: 8, opacity: 0.4 }} />
            <div style={{ fontSize: 13, color: TEXT, fontWeight: 600, marginBottom: 4 }}>No knowledge sources yet</div>
            <div style={{ fontSize: 11 }}>Upload a document or add a URL above to give the AI proprietary knowledge.</div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {filtered.map(s => {
              const Icon = TYPE_ICON[s.type] || FileText;
              const statusColor = s.status === "ready" ? (s.enabled ? "#22C55E" : MUTED) : s.status === "processing" ? "#F59E0B" : "#EF4444";
              return (
                <div key={s.id} style={{ background: SURFACE2, border: `1px solid ${BORDER}`, borderLeft: `3px solid ${statusColor}`, borderRadius: 8, padding: "11px 14px", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <div style={{ width: 32, height: 32, borderRadius: 7, background: `${G}10`, border: `1px solid ${G_BORDER}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <Icon size={15} color={G} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.title}</div>
                    <div style={{ fontSize: 10, color: MUTED, marginTop: 2, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                      <span>{TYPE_LABEL[s.type] || s.type}</span>
                      <span>· {new Date(s.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</span>
                      {s.fileSize ? <span>· {(s.fileSize / 1024).toFixed(0)} KB</span> : null}
                      <span style={{ color: statusColor, fontWeight: 700 }}>· {s.status === "ready" ? (s.enabled ? "Ready" : "Disabled") : s.status === "processing" ? "Processing…" : "Error"}</span>
                    </div>
                    {s.error && <div style={{ fontSize: 10, color: "#EF4444", marginTop: 3 }}>{s.error}</div>}
                  </div>
                  <div style={{ display: "flex", gap: 5, flexShrink: 0 }}>
                    <button onClick={() => toggleEnabled(s)} title={s.enabled ? "Disable" : "Enable"} style={{ background: s.enabled ? "rgba(34,197,94,0.1)" : "transparent", border: `1px solid ${s.enabled ? "rgba(34,197,94,0.3)" : BORDER}`, color: s.enabled ? "#22C55E" : MUTED, borderRadius: 5, padding: "5px 8px", cursor: "pointer", display: "flex", alignItems: "center" }}>
                      {s.enabled ? <Eye size={13} /> : <EyeOff size={13} />}
                    </button>
                    <button onClick={() => setViewing(s)} title="View content" style={{ background: "transparent", border: `1px solid ${BORDER}`, color: MUTED2, borderRadius: 5, padding: "5px 8px", cursor: "pointer", display: "flex", alignItems: "center" }}><FileText size={13} /></button>
                    <button onClick={() => { if (confirm(`Delete "${s.title}"?`)) deleteSource(s.id); }} title="Delete" style={{ background: "transparent", border: "1px solid rgba(239,68,68,0.3)", color: "#EF4444", borderRadius: 5, padding: "5px 8px", cursor: "pointer", display: "flex", alignItems: "center" }}><Trash2 size={13} /></button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Content viewer modal */}
      {viewing && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 16 }} onClick={() => setViewing(null)}>
          <div onClick={e => e.stopPropagation()} style={{ background: "#0d0d0d", border: `1px solid ${BORDER}`, borderRadius: 12, width: "100%", maxWidth: 640, maxHeight: "80vh", display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 18px", borderBottom: `1px solid ${BORDER}` }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: TEXT }}>{viewing.title}</span>
              <button onClick={() => setViewing(null)} style={{ background: "none", border: "none", color: MUTED, cursor: "pointer" }}><X size={18} /></button>
            </div>
            <div style={{ padding: "16px 18px", overflowY: "auto", flex: 1, fontSize: 12, color: "#ccc", lineHeight: 1.7, whiteSpace: "pre-wrap" }}>
              {viewing.content || <span style={{ color: MUTED }}>No extractable content.</span>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default KnowledgeBase;
