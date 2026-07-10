// Serverless handler for /api/call-gemini
// Called by callClaude() in prompts.ts for all in-app AI generation.
import { getGeminiClient } from "./_gemini";

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { systemInstruction, prompt, maxTokens } = req.body || {};

  if (!prompt) {
    return res.status(400).json({ error: "prompt is required" });
  }

  try {
    const ai = getGeminiClient();
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
    res.json({ text });
  } catch (error: any) {
    console.error("Gemini /api/call-gemini error:", error);
    res.status(500).json({ error: error.message || "Failed to generate AI response." });
  }
}
