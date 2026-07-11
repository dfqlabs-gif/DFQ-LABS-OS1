---
name: DFQ Labs OS centralized AI engine
description: Where AI prompt construction and model-call reliability logic live for the DFQ Labs OS project, and the pattern to follow when adding a new AI feature.
---

All AI features (DM generation, AI Coach playbooks, Pipeline Analysis, CEO
Advisor) build their prompts through a single module (`aiEngine.ts`) rather
than constructing prompt strings inline in components. It owns: the shared
system prompt (business context + speaker-attribution rules + an internal
reasoning framework the model follows silently before answering), the CRM
context builder for a single lead, and the pipeline-wide context builder.

**Why:** the project previously had 3+ copies of near-identical funnel-stage
prompts scattered across components, which drifted out of sync and made the
"sound like a 20-year sales strategist" / word-count / no-truncation
requirements inconsistent between features.

**How to apply:** when adding a new AI-powered feature, add a prompt builder
function to `aiEngine.ts` and call it through `runAI(prompt, maxTokens)`
rather than importing `callClaude` directly in a component. `runAI` already
attaches the shared system prompt.

Model call reliability is handled server-side, not in `aiEngine.ts`: both
`server.ts` (Express/dev) and `api/ai.ts` (Vercel) implement a fallback chain
that tries the requested model, then walks the rest of the free-model list in
order, skipping any response that errors or returns empty content. Both
files also track in-memory health stats (last success, avg latency, recent
errors) exposed via `GET /api/ai-status`, consumed by the AI Gateway's health
panel. If you add a new free-tier model to try, update the model list in
both `server.ts` and `api/ai.ts` together — they intentionally don't share
a module (dev server vs. Vercel serverless twin).
