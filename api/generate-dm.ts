// Serverless handler for /api/generate-dm — powered by Google Gemini.

import { GoogleGenAI } from "@google/genai";
import { DEFAULT_MODEL } from "./ai";

function friendlyError(error: any): { status: number; message: string } {
  const raw = String(error?.message ?? error ?? "");
  if (raw.includes("429") || raw.includes("RESOURCE_EXHAUSTED") || raw.toLowerCase().includes("quota") || raw.toLowerCase().includes("rate limit")) {
    return { status: 429, message: "Gemini API quota exceeded. Wait a moment and try again." };
  }
  if (raw.includes("401") || raw.includes("403")) {
    return { status: 401, message: "Invalid GEMINI_API_KEY. Check your environment variables." };
  }
  const clean = raw.replace(/\{[\s\S]*?\}/g, "").trim().slice(0, 200);
  return { status: 500, message: clean || "AI service temporarily unavailable. Please try again." };
}

export default async function handler(req: any, res: any) {
  res.setHeader("Content-Type", "application/json");

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "GEMINI_API_KEY is not configured on the server." });
  }

  const { name, company, role, niche, channel, painPoint, stage, lastConversation, notes, model } =
    req.body || {};

  if (!name || !company) {
    return res.status(400).json({ error: "Prospect name and company are required." });
  }

  let nextStage = "";
  let objective = "";

  switch (stage) {
    case "Outreach Sent":
      nextStage = "Replied / Interested";
      objective = "Get them to respond to our outreach. Follow up on the previous touchpoint or introduce a fresh, low-resistance, highly relevant angle. Offer immediate value or a specific insight rather than a sales pitch.";
      break;
    case "Replied / Interested":
      nextStage = "Audit Requested";
      objective = "Offer a free custom audit or brief analysis specific to their company/niche to diagnose their key pain point. Transition their general interest into requesting a custom audit.";
      break;
    case "Audit Requested":
      nextStage = "Audit Delivered";
      objective = "Deliver an outstanding insight (the audit) and invite them to schedule a brief 10-minute walk-through call to discuss the solution. The tone must be expert, helpful, and value-first.";
      break;
    case "Audit Delivered":
      nextStage = "Meeting Booked";
      objective = "Move them to book a specific strategy session or meeting. Address any initial feedback they had and provide an easy scheduling link or request 2 specific times that work for them.";
      break;
    case "Meeting Booked":
      nextStage = "Proposal Sent";
      objective = "Follow up on the booked meeting to outline what was discussed and send over a clear, tailored business proposal or outline next steps to initiate a partnership.";
      break;
    case "Proposal Sent":
      nextStage = "Client Closed";
      objective = "Gently but with high urgency and professionalism follow up to address final concerns, clarify pricing or terms, and invite them to take the closing step (signing contract / onboarding).";
      break;
    case "Client Closed":
      nextStage = "Referrals / Account Growth";
      objective = "Express appreciation for the partnership, verify that they are thrilled with the initial results, and request a warm referral or discuss scaling their campaign.";
      break;
    default:
      nextStage = "Replied / Interested";
      objective = "Foster a genuine conversation, build rapport, and offer value related to their business.";
  }

  const systemPrompt = `You are an elite outreach strategist writing on behalf of DFQ Labs — a boutique sales consultancy for Abuja real estate brands.

TONE: You are a respectful, experienced consultant — not a hungry salesperson. The prospect is a busy professional. Their time is more valuable than yours. Write from that position of confidence and courtesy.

STRICT RULES:
1. NEVER open with: "Hope you're doing well", "I came across your profile", "Great page!", "I see we share some mutual connections", or any hollow warm-up.
2. ZERO AI buzzwords: no "synergy", "leverage" (as a verb), "revolutionize", "supercharge", "unleash", "delve", "holistic", "elevate", "disrupt", "delighted to connect".
3. ZERO exclamation marks. ZERO emojis. Write the way a senior consultant texts — dry, precise, on-point.
4. ONE ask per message. Low-friction. Never ask for a long meeting before trust is established.
5. The message must reference something specific to this prospect's niche, company, or prior conversation — never generic copy.
6. LENGTH:
   - WhatsApp / Instagram / Twitter DM: 2-3 short sentences max. Readable in under 15 seconds.
   - Email: 80-120 words. Sharp subject line. Clean paragraphs.
7. TIMING AWARENESS: If prior conversation history is provided and shows a gap (days or weeks), your message must naturally pick up that thread — never pretend it's a first contact when it isn't. Reference something concrete from the last exchange.
8. RESPECT THE SILENCE: If the prospect hasn't replied in a while, never guilt-trip them. Re-engage with value or a new angle, not pressure.

OUTPUT: Write ONLY the final message. No preamble, no "Here is the message:", no post-script explanations.`;

  const userPrompt = `Write a highly specialized and hyper-personalized message for the following prospect.

Prospect Details:
- Name: ${name}
- Company: ${company}
- Role/Title: ${role || "decision-maker"}
- Niche/Industry: ${niche || "their sector"}
- Channel: ${channel}
- Primary Pain Point / Focus: ${painPoint || "improving client acquisition or operations"}
- Current Stage: ${stage}
- Next Target Stage: ${nextStage}
- Goal/Objective: ${objective}
${lastConversation ? `- Last Message / Conversation History: "${lastConversation}"` : ""}
${notes ? `- Contextual Notes: "${notes}"` : ""}

Draft a single, highly effective direct message tailored perfectly for this recipient. Use placeholder variables like [My Name] or [My Calendar Link] where appropriate. Ensure you write ONLY the final text of the message or email. Do not include any meta-text, introductions, or post-scripts. For email, you can include a "Subject: " line at the top.`;

  const activeModel = model || DEFAULT_MODEL;

  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: activeModel,
      contents: userPrompt,
      config: {
        systemInstruction: systemPrompt,
        maxOutputTokens: 600,
        temperature: 0.8,
      },
    });
    const draft: string = response.text ?? "Failed to generate DM.";
    return res.status(200).json({ draft });
  } catch (error: any) {
    console.error("Gemini /api/generate-dm error:", error);
    const { status, message } = friendlyError(error);
    return res.status(status).json({ error: message });
  }
}
