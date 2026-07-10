// Serverless handler for /api/call-gemini
// Called by callClaude() in prompts.ts for all in-app AI generation.
import { GoogleGenAI } from "@google/genai";

export default async function handler(req: any, res: any) {
  // Always respond with JSON — never let Vercel return an HTML error page.
  res.setHeader("Content-Type", "application/json");

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "GEMINI_API_KEY is not configured on the server." });
  }

  const { systemInstruction, prompt, maxTokens } = req.body || {};
  if (!prompt) {
    return res.status(400).json({ error: "prompt is required" });
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: prompt,
      config: {
        systemInstruction: systemInstruction || undefined,
        maxOutputTokens: maxTokens || undefined,
        temperature: 0.7,
      },
    });

    const text = response.text ?? "";
    return res.status(200).json({ text });
  } catch (error: any) {
    console.error("Gemini /api/call-gemini error:", error);
    return res.status(500).json({ error: error.message || "Failed to generate AI response." });
  }
}
