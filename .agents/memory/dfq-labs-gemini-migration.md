---
name: DFQ Labs OS Gemini migration
description: Details on the OpenRouter → Gemini migration, working model IDs, and quota behavior for this API key.
---

# DFQ Labs OS: Gemini Migration

## Working model
`gemini-3.1-flash-lite` — confirmed working at ~450ms, returns non-empty content, no quota errors on this API key.

## Model landscape (tested July 2026)
- `gemini-3.1-flash-lite` ✓ WORKS — recommended default
- `gemini-3.1-flash-lite-preview` ✓ WORKS — fallback
- `gemini-flash-lite-latest` ✓ WORKS — slower fallback
- `gemini-2.5-flash` ✗ 404 "no longer available to new users"
- `gemini-2.5-flash-lite` ✗ 404 "no longer available to new users"
- `gemini-2.0-flash`, `gemini-2.0-flash-lite`, `gemini-2.0-flash-001` ✗ 429 limit=0 (free-tier quota = 0 on this project, likely billing-enabled project)
- `gemini-1.5-flash`, `gemini-1.5-flash-8b` ✗ 404 on v1beta endpoint
- `gemini-3.5-flash` ✗ returns empty content (reasoning model behavior)

**Why limit=0 for 2.x models:** When a GCP project has billing enabled, the `*_FreeTier` quotas are set to 0 because free-tier doesn't apply; paid quotas are used instead. This key appears to be from a billing-enabled project where 2.x paid quotas were also exhausted or restricted.

## Architecture
- All AI calls go through `server.ts` → `callGemini()` → `@google/genai` SDK
- `GEMINI_MODEL` env var overrides the default model globally
- No fallback chain currently (see proposed follow-up task #3)
- `api/ai.ts`, `api/ai-status.ts`, `api/generate-dm.ts`, `api/call-gemini.ts` are Vercel serverless handlers (updated to match)
- Frontend `callClaude()` in `prompts.ts` routes to `/api/ai` — name unchanged to avoid churn

## Key centralization
- Model default: `server.ts` line ~16, `api/ai.ts` line ~5
- Model list in UI: `components/AIGateway.tsx` MODELS array
- Keep all three in sync when changing models.
