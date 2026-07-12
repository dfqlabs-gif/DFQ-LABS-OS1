---
name: DFQ Labs OS centralized AI engine
description: Where AI prompt construction and model-call reliability logic live for the DFQ Labs OS project, and the pattern to follow when adding a new AI feature.
---

All AI features (DM generation, AI Coach playbooks, Pipeline Analysis, CEO
Advisor) build their prompts through a single module (`aiEngine.ts`) rather
than constructing prompt strings inline in components. It owns the shared
system prompt (business context + speaker-attribution rules + "Head of
Sales" identity + internal reasoning framework) and the CRM context builders.

**Why:** the project previously had 3+ copies of near-identical funnel-stage
prompts scattered across components, which drifted out of sync and made the
"sound like a 20-year sales strategist" / word-count / no-truncation
requirements inconsistent between features.

**How to apply:** when adding a new AI-powered feature, add a prompt builder
function to `aiEngine.ts` and call it through `runAI(prompt, maxTokens)`
rather than importing `callClaude` directly in a component.

For any feature that writes an outward-facing message to a lead (Draft DM,
Suggest Reply, AI Coach's "Value DM" playbook), do NOT call `runAI` with a
single combined prompt — call `runSalesPipeline(lead, task,
styleInstructions)` instead. It runs a multi-step pipeline: a deterministic
Timeline Builder (no AI call — reconstructs what has/hasn't happened from
lead fields, so the model can never claim a false CRM state), a Strategy
Generator AI call (produces structured stage/objective/reasoning/risk/
key-facts), a DM Writer AI call that receives ONLY that structured strategy
(never raw notes/conversation dump — this is intentional, to stop the writer
re-litigating facts or inventing details), and a Quality Checker AI call that
grades the draft and triggers exactly one regeneration on failure. Analytical
outputs that aren't literal messages to send (objections prediction, closing
plan, pipeline analysis) stay on plain `runAI` + a prompt builder — the
3-call pipeline is reserved for actual outbound replies.

Model call reliability (fallback chain across free OpenRouter models +
health stats) is handled server-side, not in `aiEngine.ts`: both `server.ts`
(Express/dev) and `api/ai.ts` (Vercel) implement this independently since
they don't share a module — update both together when changing the model list.

This project also has a separate Vercel deployment (`dfq-labs-os-1-*.vercel.app`)
outside Replit's own deployment system. If the user reports AI errors only
visible in screenshots of that Vercel URL, check whether `OPENROUTER_API_KEY`
is set in *that* Vercel project's environment variables and whether it's been
redeployed from the latest `main` — those are configuration issues on their
external Vercel project, not bugs in this codebase, and can't be fixed from
inside this Replit workspace.
