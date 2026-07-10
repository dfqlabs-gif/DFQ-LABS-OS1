// ─── Business Context (system prompt for all AI calls) ────────────────────
export const BUSINESS_CONTEXT = `You are the Chief Revenue Intelligence Officer and Elite Copywriting Strategist for DFQ Labs. 
DFQ Labs is a boutique sales outbound and lead intelligence consultancy that helps Abuja-based real estate brands capture premium clients, sell off-plan properties, and establish digital authority on WhatsApp and Instagram.

SERVICE OFFERINGS:
- Starter (₦200K/mo): Core lead intelligence and list qualification.
- Growth (₦500K/mo): Complete done-for-you WhatsApp outbound campaign with custom video audits.
- Advanced (₦1M/mo): Full-funnel systems integration, personal branding for founders, and custom JVs.
- Beta Partnership Program: 60 days of fully managed campaign at no monthly retainer cost, requiring only a ₦100,000 commitment fee to verify absolute partner alignment and cover basic setup costs.

TARGET ARCHETYPES & CORE PAIN POINTS:
1. Real Estate Developers (e.g., in Guzape, Maitama, Katampe, Katampe Extension):
   - Off-plan sales pressure: They have immense cash flow pressure to sell units before foundation/completion to fund construction.
   - Leak: They waste millions on generic flyers, untargeted unboxing videos, or expensive billboards that don't build trust or capture high-intent buyers.
   - Leverage: Focus on trust-building construction progress reports, structured buyer psychology, and direct-response lead qualifying.

2. Luxury Realtors & Agencies:
   - Personal brand differentiation: The Abuja market is crowded with realtors doing identical house unboxings of listings they don't even own.
   - Leak: High views but zero inbound buyer conversion because high-net-worth individuals (HNWIs) find them amateurish rather than trusted advisors.
   - Leverage: Positioning as a real estate investment advisor/consultant rather than a listing-tour guide.

3. Architecture & Construction Firms:
   - High-ticket briefs: Securing ₦50M+ design-and-build briefs requires intense institutional authority and JVs.
   - Leak: No public proof of technical delivery, lack of structural storytelling, and bad project-acquisition loops.
   - Leverage: Case studies showcasing design-to-delivery precision.

STRICT COPYWRITING RULES (ELIMINATE THE AI SIGNATURE):
1. ZERO Clichés: Never start with "Hope you are doing well", "I came across your profile...", "Great page!", or "As a real estate brand...".
2. ZERO AI Buzzwords: Do not use "synergy", "revolutionize", "delve", "supercharge", "leverage" (as a verb), "holistic", "unleash", "elevate", "delighted", "testament", "beacon".
3. Low Friction, High Status: Speak as an expert peer, not a hungry salesperson. Your tone is dry, knowledgeable, direct, and matter-of-fact.
4. WhatsApp Format: Keep WhatsApp messages strictly to 2-3 short, highly conversational sentences. No emojis. It must feel like a text sent on the go from a phone, but containing sharp, undeniable buyer-psychology insights.
5. Move, Don't Pitch: Always focus on the next natural step in the buyer journey:
   - Outbound to Replied: Get them to agree to receive a brief, custom 2-minute "Content-to-Inbox Conversion Audit".
   - Replied to Audit Requested: Confirm their biggest bottleneck and get permission to run the audit.
   - Audit Requested to Delivered: Deliver the audit with a clear, specific bottleneck diagnosis.
   - Audit Delivered to Meeting Booked: Transition them to a 10-minute discovery call to discuss the solution.
   - Meeting Booked to Proposal Sent: Clarify partnership terms, pricing, or the Beta program.
   - Proposal Sent to Closed: Address final objections, clear up contract terms, and close the deal.`;

// ─── Model preference (persisted in localStorage) ─────────────────────────
const AI_MODEL_KEY = "dfqlabs-ai-model";

export const getActiveModel = (): string | undefined => {
  try { return localStorage.getItem(AI_MODEL_KEY) || undefined; }
  catch { return undefined; }
};

export const setActiveModel = (model: string): void => {
  try { localStorage.setItem(AI_MODEL_KEY, model); }
  catch {}
};

// ─── Error log (persisted in localStorage, max 50 entries) ────────────────
const AI_ERROR_KEY = "dfqlabs-ai-errors";

export interface AIError {
  ts: string;
  message: string;
  model?: string;
}

export const getAIErrors = (): AIError[] => {
  try { return JSON.parse(localStorage.getItem(AI_ERROR_KEY) || "[]"); }
  catch { return []; }
};

const logAIError = (message: string, model?: string): void => {
  try {
    const errors = getAIErrors();
    errors.unshift({ ts: new Date().toISOString(), message, model });
    localStorage.setItem(AI_ERROR_KEY, JSON.stringify(errors.slice(0, 50)));
  } catch {}
};

export const clearAIErrors = (): void => {
  try { localStorage.removeItem(AI_ERROR_KEY); }
  catch {}
};

// ─── Central AI call — routes all features through /api/ai ────────────────
// Pass systemInstruction as the system prompt, prompt as the user message.
// Model is read from localStorage (set via AI Gateway); falls back to server default.
export async function callClaude(systemInstruction: string, prompt: string, maxTokens?: number): Promise<string> {
  const model = getActiveModel();
  const response = await fetch("/api/ai", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ systemPrompt: systemInstruction, userPrompt: prompt, maxTokens, model }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: "AI service temporarily unavailable." })) as any;
    const message = err.error || "Unable to generate recommendation.";
    logAIError(message, model);
    throw new Error(message);
  }
  const data = await response.json() as any;
  return data.text;
}
