import express from "express";
import path from "path";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";
import { createServer as createViteServer } from "vite";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());

// Initialize Gemini Client Lazily/Safely
let aiClient: GoogleGenAI | null = null;

function getGeminiClient(): GoogleGenAI {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.warn("WARNING: GEMINI_API_KEY environment variable is not set. All DM generation calls will fail.");
    }
    aiClient = new GoogleGenAI({
      apiKey: apiKey || "",
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  }
  return aiClient;
}

// API endpoint to generate high-impact personalized DMs
app.post("/api/generate-dm", async (req, res) => {
  const { name, company, role, niche, channel, painPoint, stage, lastConversation, notes } = req.body;

  if (!name || !company) {
    res.status(400).json({ error: "Prospect name and company are required." });
    return;
  }

  try {
    const ai = getGeminiClient();
    
    // Determine the next natural buyer journey stage and objective
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

    const systemInstruction = `You are an elite, highly paid cold outreach and conversion copywriter who writes bespoke, ultra-high-converting direct messages.
Your copy has no "AI signature". It sounds exactly like an authentic, highly focused, professional human who respects the recipient's time and intelligence.

STRICT WRITING RULES:
1. NEVER start with generic clichés, e.g., "Hope you're having a great week", "Hi [Name], I came across your profile and...", "I see we share some mutual connections".
2. NEVER use fake excitement or excessive exclamation marks. Use maximum 0-1 exclamation marks per message.
3. NEVER use generic AI jargon: "synergies", "leverage", "revolutionize", "disrupt", "delighted to connect", "supercharge", "unleash", "delve".
4. Keep the length appropriate to the channel:
   - LinkedIn/Instagram/Twitter DMs: 2-3 short, highly punchy sentences. Must be readable in under 15 seconds.
   - Email: Maximum 100-120 words, clean paragraphs, direct subject line.
5. Focus on ONE clear, low-friction, natural action step. Don't ask them to commit to a long call immediately if it's too early.
6. The message must feel fully personalized, speaking directly to their niche and pain points. Never generic.`;

    const prompt = `Write a highly specialized and hyper-personalized message for the following prospect.

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

Draft a single, highly effective direct message tailored perfectly for this recipient. Use placeholder variables like [My Name] or [My Calendar Link] where appropriate. Let's make it punchy, incredibly natural, and hard to ignore. Ensure you write ONLY the final text of the message or email. Do not include any meta-text, introductions, or post-scripts. For email, you can include a "Subject: " line at the top.`;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
      config: {
        systemInstruction: systemInstruction,
        temperature: 0.8,
      },
    });

    const draft = response.text || "Failed to generate DM.";
    res.json({ draft });
  } catch (error: any) {
    console.error("Gemini Generation Error:", error);
    res.status(500).json({ error: error.message || "Failed to generate direct message." });
  }
});

// Serve frontend through Vite in development, or compiled folder in production
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();
