# DFQLABS OS

An AI-powered sales outreach CRM built with React, Vite, and Express. Uses Google's Gemini API to generate hyper-personalized outreach DMs for leads at each stage of the sales pipeline.

## Stack

- **Frontend**: React 19 + TypeScript + Tailwind CSS v4
- **Backend**: Express (serves Vite in dev, compiled dist in production)
- **AI**: Google Gemini (`@google/genai`) for DM generation
- **Build**: Vite 6, esbuild for server bundle

## Project Structure

```
/
├── App.tsx              # Main app component (pipeline dashboard)
├── main.tsx             # React entry point
├── server.ts            # Express server + Gemini API endpoint
├── constants.tsx        # Shared styles, utilities, constants
├── types.ts             # TypeScript types (Lead, Stats, etc.)
├── prompts.ts           # Gemini system prompts + callClaude helper
├── components/          # Modular subcomponents
│   ├── AICoach.tsx      # AI coaching tab
│   ├── CEOTab.tsx       # CEO/founder dashboard
│   ├── LeadModal.tsx    # Lead detail modal + conversation history
│   ├── TeamTab.tsx      # Team management tab
│   └── WeeklyReport.tsx # Weekly performance report
├── index.html           # HTML entry (references /main.tsx)
└── vite.config.ts       # Vite config (allowedHosts: true for Replit)
```

## How to Run

```bash
npm run dev
```

Server starts on port 5000 (Vite middleware in dev mode).

## Required Secrets

- `OPENROUTER_API_KEY` — OpenRouter API key (get one at https://openrouter.ai/settings/keys). Note: the top-level `README.md` still references a legacy `GEMINI_API_KEY`/AI Studio setup — the app was migrated to OpenRouter and no longer uses Gemini directly.

## Notes on the AI model

- Default model is `nvidia/nemotron-nano-9b-v2:free`. Many OpenRouter free-tier models are reasoning models that spend their whole token budget "thinking" and return empty content — `callOpenRouter` in `server.ts` sets `reasoning: { exclude: true, effort: "low" }` and generous `max_tokens` to avoid this. If you swap the default model, verify it returns non-empty content via `/api/ai-status`, not just `ok: true`.
- OpenRouter's free-tier catalog changes over time; some previously-free model slugs may 404 or rate-limit. If generation starts failing, check `/api/ai-status` with a candidate model and adjust `DEFAULT_MODEL` in `server.ts`.

## API Endpoints

- `POST /api/generate-dm` — Generates a personalized outreach message using Gemini
  - Body: `{ name, company, role, niche, channel, painPoint, stage, lastConversation, notes }`

## User Preferences

- Keep all component files inside `components/` (they use `../` relative imports for constants/types/prompts)
- Port must remain 5000 for Replit preview compatibility
