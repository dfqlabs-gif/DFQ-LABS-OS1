// Shared Gemini client — prefixed with _ so Vercel does not expose it as a route
import { GoogleGenAI } from "@google/genai";

let client: GoogleGenAI | null = null;

export function getGeminiClient(): GoogleGenAI {
  if (!client) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.warn("WARNING: GEMINI_API_KEY is not set. AI calls will fail.");
    }
    client = new GoogleGenAI({ apiKey: apiKey || "" });
  }
  return client;
}
