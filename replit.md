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

- `GEMINI_API_KEY` — Google Gemini API key (get a free one at https://aistudio.google.com/apikey).
- `GEMINI_MODEL` *(optional)* — Override the default model. Defaults to `gemini-2.5-flash`. Other options: `gemini-2.0-flash`, `gemini-2.5-flash-lite`, `gemini-1.5-flash`.

## Notes on the AI model

- Default model is `gemini-2.5-flash` — best for high-volume free-tier workloads (generous RPM and TPM limits on the free plan).
- All Gemini models have a large context window (1M tokens) and no hidden reasoning token drain — reliable, consistent output.
- The model is centralized in `server.ts` (`GEMINI_MODEL` env var). To change it globally, set `GEMINI_MODEL` in environment variables. It can also be overridden per-session via the AI Gateway tab.
- If generation fails, check `/api/ai-status` for connection health. Gemini API keys are free at aistudio.google.com/apikey.

## API Endpoints

- `POST /api/generate-dm` — Generates a personalized outreach message using Gemini
  - Body: `{ name, company, role, niche, channel, painPoint, stage, lastConversation, notes }`

## User Preferences

- Keep all component files inside `components/` (they use `../` relative imports for constants/types/prompts)
- Port must remain 5000 for Replit preview compatibility
