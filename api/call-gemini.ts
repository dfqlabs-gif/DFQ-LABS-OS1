// Serverless handler for /api/call-gemini
// Called by callClaude() in prompts.ts for all in-app AI generation.
import { GoogleGenAI } from "@google/genai";

function friendlyGeminiError(error: any): { status: number; message: string } {
  const raw = error?.message ?? "";

  // Quota / billing exhausted
  if (raw.includes("RESOURCE_EXHAUSTED") || raw.includes("quota") || raw.includes("429")) {
    return {
      status: 429,
      message:
        "AI quota exhausted. The Gemini API free tier has been used up. Enable billing at aistudio.google.com or use a fresh API key.",
    };
  }

  // Auth / invalid key
  if (raw.includes("API_KEY_INVALID") || raw.includes("401") || raw.includes("403")) {
    return { status: 401, message: "Invalid Gemini API key. Check your GEMINI_API_KEY environment variable." };
  }

  // Model not found
  if (raw.includes("NOT_FOUND") || raw.includes("404")) {
    return { status: 404, message: "Gemini model not found. The requested model may not be available." };
  }

  // Generic fallback — strip JSON noise, cap length
  const clean = raw.replace(/\{.*\}/s, "").trim().slice(0, 200) || "AI generation failed. Please try again.";
  return { status: 500, message: clean };
}

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
    const { status, message } = friendlyGeminiError(error);
    return res.status(status).json({ error: message });
  }
}
