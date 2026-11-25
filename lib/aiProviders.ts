export type CompatibleProvider = "groq" | "openrouter" | "cerebras";

export interface CompatibleProviderConfig {
  provider: CompatibleProvider;
  apiKey: string;
  baseUrl: string;
  model: string;
}

export interface CompatibleGenerationInput {
  config: CompatibleProviderConfig;
  systemPrompt?: string;
  userPrompt: string;
  maxTokens: number;
  temperature: number;
  fetchImpl?: typeof fetch;
}

export interface CompatibleGenerationResult {
  text: string;
  provider: CompatibleProvider;
  model: string;
}

const DEFAULTS: Record<CompatibleProvider, { baseUrl: string; model: string }> = {
  groq: { baseUrl: "https://api.groq.com/openai/v1", model: "openai/gpt-oss-120b" },
  openrouter: { baseUrl: "https://openrouter.ai/api/v1", model: "openrouter/free" },
  cerebras: { baseUrl: "https://api.cerebras.ai/v1", model: "gpt-oss-120b" },
};

export function configuredFallbackProviders(env: Record<string, string | undefined> = process.env): CompatibleProviderConfig[] {
  const available: Record<CompatibleProvider, string | undefined> = {
    groq: env.GROQ_API_KEY,
    openrouter: env.OPENROUTER_API_KEY,
    cerebras: env.CEREBRAS_API_KEY,
  };
  const requested = (env.AI_FALLBACK_ORDER || "groq,openrouter,cerebras")
    .split(",")
    .map(value => value.trim().toLowerCase())
    .filter((value): value is CompatibleProvider => value === "groq" || value === "openrouter" || value === "cerebras");
  const seen = new Set<string>();
  return requested.flatMap(provider => {
    const apiKey = available[provider]?.trim();
    if (!apiKey || seen.has(provider)) return [];
    seen.add(provider);
    const defaults = DEFAULTS[provider];
    const model = provider === "groq" ? env.GROQ_MODEL
      : provider === "openrouter" ? env.OPENROUTER_MODEL
      : env.CEREBRAS_MODEL;
    const baseUrl = provider === "groq" ? env.GROQ_BASE_URL
      : provider === "openrouter" ? env.OPENROUTER_BASE_URL
      : env.CEREBRAS_BASE_URL;
    return [{ provider, apiKey, baseUrl: (baseUrl || defaults.baseUrl).replace(/\/+$/, ""), model: model?.trim() || defaults.model }];
  });
}

export async function generateWithCompatibleProvider(input: CompatibleGenerationInput): Promise<CompatibleGenerationResult> {
  const fetchImpl = input.fetchImpl || fetch;
  const { config } = input;
  const messages = [
    ...(input.systemPrompt ? [{ role: "system", content: input.systemPrompt }] : []),
    { role: "user", content: input.userPrompt },
  ];
  const response = await fetchImpl(config.baseUrl + "/chat/completions", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + config.apiKey,
      "Content-Type": "application/json",
      ...(config.provider === "openrouter" ? { "HTTP-Referer": "https://dfqlabs.com.ng", "X-Title": "DFQLABS OS1" } : {}),
    },
    body: JSON.stringify({
      model: config.model,
      messages,
      max_tokens: input.maxTokens,
      temperature: input.temperature,
      stream: false,
    }),
    signal: AbortSignal.timeout(60000),
  });
  const raw = await response.text();
  let payload: any = {};
  try { payload = raw ? JSON.parse(raw) : {}; } catch { /* surfaced below without leaking response bodies */ }
  if (!response.ok) {
    const detail = String(payload?.error?.message || payload?.message || response.statusText || "Provider request failed").slice(0, 240);
    throw new Error(config.provider + " " + response.status + ": " + detail);
  }
  const text = payload?.choices?.[0]?.message?.content;
  if (typeof text !== "string" || !text.trim()) throw new Error(config.provider + " returned an empty completion.");
  return { text: text.trim(), provider: config.provider, model: config.model };
}
