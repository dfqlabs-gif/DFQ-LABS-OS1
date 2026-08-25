import { useState, useEffect } from "react";
import { LeadAttachment } from "../types";
import { BORDER } from "../constants";

// Loads attachment content on demand from /api/attachments/:id and renders an
// image thumbnail. The lead JSON carries only metadata; the (potentially large)
// base64 content is fetched only when the attachment is actually displayed.
export function AttachmentImage({ att, size = 36 }: { att: LeadAttachment; size?: number }) {
  const [src, setSrc] = useState<string | null>(att.content || null);

  useEffect(() => {
    if (src) return;
    let active = true;
    fetch(`/api/attachments/${att.id}`)
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        if (active && data?.attachment?.content) setSrc(data.attachment.content);
      })
      .catch(() => {});
    return () => { active = false; };
  }, [att.id, src]);

  if (!src) {
    return (
      <div
        style={{
          width: size,
          height: size,
          borderRadius: 4,
          border: `1px solid ${BORDER}`,
          background: "#0d0d0d",
          flexShrink: 0,
        }}
      />
    );
  }
  return (
    <img
      src={src}
      alt={att.name}
      style={{
        width: size,
        height: size,
        objectFit: "cover",
        borderRadius: 4,
        border: `1px solid ${BORDER}`,
        flexShrink: 0,
      }}
    />
  );
}

export default AttachmentImage;
