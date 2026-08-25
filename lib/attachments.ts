// ─────────────────────────────────────────────────────────────────────────────
// Attachment content / metadata separation
//
// Lead records and lead attachments are separate concerns. The lead JSON
// stores only lightweight attachment metadata (id, name, mimeType, size,
// uploadedAt). The actual file content (raw text or base64 data URL) lives in a
// dedicated `lead_attachments` table and is fetched on demand — never embedded
// in the lead JSON and never serialized during list/import operations.
//
// This keeps `GET /api/leads` and lead imports small, which is what prevents
// the browser "Load failed" error caused by huge base64 payloads.
// ─────────────────────────────────────────────────────────────────────────────

import type { LeadAttachment } from "../types";

// Return a copy of an attachment with its `content` field removed (metadata only).
export function attachmentMetadata(att: LeadAttachment): LeadAttachment {
  if (!att || typeof att !== "object") return att;
  const { content: _content, ...meta } = att;
  return meta as LeadAttachment;
}

// Strip `content` from every attachment on a loosely-typed lead object (used at
// API boundaries where the lead comes from JSONB / request bodies). Returns the
// same object reference when there is nothing to strip.
export function stripAttachmentContent(lead: any): any {
  if (!lead || !Array.isArray(lead.attachments) || lead.attachments.length === 0) return lead;
  const cleaned = lead.attachments.map((a: any) => {
    if (a && typeof a === "object" && "content" in a) {
      const { content: _c, ...meta } = a;
      return meta;
    }
    return a;
  });
  return { ...lead, attachments: cleaned };
}
