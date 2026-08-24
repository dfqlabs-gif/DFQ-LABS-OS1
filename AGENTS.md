# DFQ Labs OS — Agent Notes

## Stack
- React 19 + Vite 6 (dev middleware inside `server.ts` via `tsx`). Single server, no separate frontend dev server.
- Express server (`server.ts`) serves Vite middleware in dev / static dist in prod. Listens on `PORT` (default 5000).
- PostgreSQL via `pg` Pool (`DATABASE_URL`). Leads stored as JSONB rows in `leads(id, data, updated_at)`.
- AI: Google Gemini via `@google/genai`. All AI calls route through `/api/ai` (server) → `callClaude` (client `prompts.ts`).
- Auth: role-based with passwords in `constants.tsx` (ROLE_ACCESS). Session in localStorage with idle timeout.

## Dev environment (Base44)
- `docker compose -f docker-compose.base44.yml up -d` — postgres + node:22-slim with bind mount.
- `npm install` runs at container start; node_modules live in a named volume.
- `package-lock.json` had Replit-internal `resolved` URLs — replaced with registry.npmjs.org. If lockfile regenerates with Replit URLs, sed-fix again.
- GEMINI_API_KEY delivered via `/run/base44/app.env` (env_file, last entry wins).
- Preview reaches port 3000 → container 5000. Vite `allowedHosts: true` already set.

## Architecture conventions
- **One AI engine** (`aiEngine.ts`): `runSalesPipeline` = 7-step pipeline (context → timeline → stage → objective → strategy → DM writer → quality checker). Every message-writing feature routes through it. Do NOT duplicate prompt strings in components.
- **Lead context** via `buildLeadContext(lead)` — the single source of CRM context for prompts.
- **Conversation log** is append-only (`conversationLog` on Lead). `dmText`/`prospectInitialResponse`/`prospectLatestResponse` are quick-reference latest values; full history is in `conversationLog`.
- **saveLead** (App.tsx) compiles the conversation log, auto-schedules follow-ups, and triggers AI status inference. Reuse it — don't bypass.
- **QA pipeline** (`aiQA.ts`): 3-stage quality gate (review → adjust → validate). `AIQAPanel` drops below any draft.
- Phone normalization: `normalizePhoneDigits` in `constants.tsx` (last-10-digits). WhatsApp execution lives in `lib/whatsapp.ts` + `components/WhatsAppExecutionButton.tsx`.
- Message types (`lib/messageTypes.ts`): VALUE_DM, SALES_DM, FOLLOW_UP, etc. VALUE_DM has strict no-CTA rules — must never inherit sales behavior.
- Knowledge Base: `knowledge_sources` table + `/api/knowledge*` endpoints. Retrieval is keyword-based (`retrieveKnowledge` in `aiEngine.ts`).

## Verify it works
- `curl -sf -H "Host: x.example" http://localhost:3000/` → 200 (app shell).
- `curl -sf http://localhost:3000/api/leads` → `{"leads":[...]}`.
- Login as Founder (password in constants.tsx ROLE_ACCESS).
