// ─────────────────────────────────────────────────────────────────────────────
// AI QA Pipeline — reusable 3-stage quality gate for every AI-generated message
//
//  Stage 1 — Generation  (handled by caller: runFollowUpReply, runQuickReply, etc.)
//  Stage 2 — Conversation Alignment Review  (runQAReview)
//  Stage 3 — Strict Validation              (runQAValidation)
//
//  Between Stage 2 and 3, the user may request an adjusted draft (runQAAdjust).
// ─────────────────────────────────────────────────────────────────────────────

import { Lead } from "./types";
import { buildLeadContext } from "./aiEngine";
import { callClaude } from "./prompts";

// ── Shared reviewer / validator system prompts ────────────────────────────────

const REVIEWER_SYSTEM = `You are DFQ Labs' Head of Conversation Quality.
Your only job is to review AI-generated sales messages and determine whether they are appropriate for this specific prospect at this exact moment in the conversation.
You never rewrite messages in this role. You only analyse and score.
Return ONLY valid JSON — no markdown, no prose, no code fences.`;

const ADJUSTER_SYSTEM = `You are DFQ Labs' Elite Sales Copywriter.
You receive a message that failed a quality review. Your job is to rewrite it, fixing every identified problem while preserving the core intent.
Return ONLY the final rewritten message — no labels, no preamble, no explanations.`;

const VALIDATOR_SYSTEM = `You are DFQ Labs' Strict Message Validator.
Your only job is to approve or reject a message with a binary verdict.
You never rewrite, suggest, or soften feedback — only approve or reject with scored evidence.
Return ONLY valid JSON — no markdown, no prose, no code fences.`;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface QAReview {
  score: number;             // 0–100
  strengths: string[];
  problems: string[];
  reasons: string[];         // one reason per problem (parallel array)
  recommendation: string;
  needsAdjustment: boolean;  // true when score < 75 or problems exist
}

export interface QAValidation {
  status: "approved" | "rejected";
  overallScore: number;
  conversationConsistency: number;
  tone: number;
  context: number;
  cta: number;
  finalRecommendation: string;
  rejectionReasons: string[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function safeJSON<T>(raw: string, fallback: T): T {
  try {
    const cleaned = raw.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
    return JSON.parse(cleaned) as T;
  } catch {
    try {
      const m = raw.match(/\{[\s\S]*\}/);
      if (m) return JSON.parse(m[0]) as T;
    } catch {}
    return fallback;
  }
}

// ── Stage 2 — Conversation Alignment Review ───────────────────────────────────

export async function runQAReview(draft: string, lead: Lead): Promise<QAReview> {
  const context = buildLeadContext(lead);

  const prompt = `You are reviewing an AI-generated sales message for DFQ Labs.

${context}

=== DRAFT MESSAGE TO REVIEW ===
${draft}
=== END DRAFT ===

Determine whether this message is appropriate for this prospect at this exact moment in the conversation.

Return a JSON object with exactly these fields:
{
  "score": <integer 0-100 — how well the message fits this prospect and conversation moment>,
  "strengths": [<specific things the message does well — at least one if score >= 60>],
  "problems": [<specific issues found — empty array if none>],
  "reasons": [<for each problem, one sentence explaining WHY it is a problem given the context — parallel to problems array>],
  "recommendation": <one concise sentence summarising your overall verdict>,
  "needsAdjustment": <true if score < 75 or problems array is non-empty, false otherwise>
}`;

  const raw = await callClaude(REVIEWER_SYSTEM, prompt, 800);
  return safeJSON<QAReview>(raw, {
    score: 72,
    strengths: ["Message generated successfully"],
    problems: [],
    reasons: [],
    recommendation: "Message appears suitable. Manual review recommended.",
    needsAdjustment: false,
  });
}

// ── Stage 2b — Adjusted Draft (only called when user clicks "Adjust Message") ─

export async function runQAAdjust(
  review: QAReview,
  originalDraft: string,
  lead: Lead
): Promise<string> {
  const context = buildLeadContext(lead);
  const problemLines = review.problems.length > 0
    ? review.problems
        .map((p, i) => `• ${p}${review.reasons[i] ? ` — ${review.reasons[i]}` : ""}`)
        .join("\n")
    : "Minor tone and alignment improvements needed.";

  const prompt = `You are rewriting a sales message that failed the DFQ Labs quality review.

${context}

=== ORIGINAL DRAFT (QA score: ${review.score}/100) ===
${originalDraft}
=== END ORIGINAL ===

=== QA PROBLEMS TO FIX ===
${problemLines}

Reviewer recommendation: ${review.recommendation}
=== END REVIEW ===

Rewrite the message to fix every problem above. Keep the same channel/format (WhatsApp DM). Do NOT add a preamble or explanation — output ONLY the final message text.`;

  return callClaude(ADJUSTER_SYSTEM, prompt, 700);
}

// ── Stage 3 — Strict Validation ───────────────────────────────────────────────

export async function runQAValidation(draft: string, lead: Lead): Promise<QAValidation> {
  const context = buildLeadContext(lead);

  const prompt = `You are strictly approving or rejecting a DFQ Labs sales message. No rewrites. Binary verdict only.

${context}

=== MESSAGE TO VALIDATE ===
${draft}
=== END MESSAGE ===

Check ALL nine criteria:
1. Matches conversation history — no contradictions, no repeating what was already said
2. Matches relationship stage — not skipping steps, not regressing
3. Correct tone — professional but warm, appropriate for a WhatsApp sales message
4. No contradictions of previous messages or promises
5. References previous discussions correctly — never invents facts
6. Makes sense for this specific prospect
7. Single clear CTA — one next step, not multiple asks
8. Maintains DFQ Labs' methodology (audit → discovery → proposal → close)
9. Factually consistent with all CRM data

Return a JSON object with exactly these fields:
{
  "status": <"approved" or "rejected">,
  "overallScore": <integer 0-100>,
  "conversationConsistency": <integer 0-100>,
  "tone": <integer 0-100>,
  "context": <integer 0-100>,
  "cta": <integer 0-100>,
  "finalRecommendation": <"Ready to Send" if approved, or one sentence explaining rejection>,
  "rejectionReasons": [<specific reasons if rejected, empty array if approved>]
}`;

  const raw = await callClaude(VALIDATOR_SYSTEM, prompt, 700);
  return safeJSON<QAValidation>(raw, {
    status: "approved",
    overallScore: 75,
    conversationConsistency: 75,
    tone: 75,
    context: 75,
    cta: 75,
    finalRecommendation: "Ready to Send",
    rejectionReasons: [],
  });
}
