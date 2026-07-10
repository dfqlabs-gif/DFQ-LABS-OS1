// Legacy compatibility endpoint — now powered by OpenRouter.
// Accepts both old field names (prompt, systemInstruction) and new ones (userPrompt, systemPrompt).
// New code should call /api/ai directly.
import aiHandler from "./ai";

export default async function handler(req: any, res: any) {
  // Map legacy field names to the new contract before delegating
  if (req.body) {
    if (req.body.prompt && !req.body.userPrompt) req.body.userPrompt = req.body.prompt;
    if (req.body.systemInstruction && !req.body.systemPrompt) req.body.systemPrompt = req.body.systemInstruction;
  }
  return aiHandler(req, res);
}
