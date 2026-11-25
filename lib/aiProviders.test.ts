import assert from "node:assert/strict";
import test from "node:test";
import { configuredFallbackProviders, generateWithCompatibleProvider } from "./aiProviders.js";

test("fallback providers are configured in priority order and ignore missing keys", () => {
  const providers = configuredFallbackProviders({
    AI_FALLBACK_ORDER: "openrouter,groq,cerebras,openrouter",
    OPENROUTER_API_KEY: "or-key",
    GROQ_API_KEY: "groq-key",
  });
  assert.deepEqual(providers.map(provider => provider.provider), ["openrouter", "groq"]);
  assert.equal(providers[0].model, "openrouter/free");
});

test("provider generation sends OpenAI-compatible chat completions request", async () => {
  let requestUrl = "";
  let requestInit: RequestInit | undefined;
  const result = await generateWithCompatibleProvider({
    config: {
      provider: "openrouter",
      apiKey: "test-key",
      baseUrl: "https://openrouter.ai/api/v1",
      model: "openrouter/free",
    },
    systemPrompt: "Be concise.",
    userPrompt: "Reply with OK.",
    maxTokens: 32,
    temperature: 0,
    fetchImpl: async (input, init) => {
      requestUrl = String(input);
      requestInit = init;
      return new Response(JSON.stringify({ choices: [{ message: { content: "OK" } }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    },
  });
  assert.equal(requestUrl, "https://openrouter.ai/api/v1/chat/completions");
  assert.equal(result.text, "OK");
  assert.equal(result.provider, "openrouter");
  const body = JSON.parse(String(requestInit?.body));
  assert.equal(body.messages.length, 2);
  assert.equal(body.model, "openrouter/free");
});

test("provider errors are surfaced with provider and status for fallback decisions", async () => {
  await assert.rejects(
    () => generateWithCompatibleProvider({
      config: { provider: "groq", apiKey: "bad", baseUrl: "https://api.groq.com/openai/v1", model: "openai/gpt-oss-120b" },
      userPrompt: "test",
      maxTokens: 20,
      temperature: 0,
      fetchImpl: async () => new Response(JSON.stringify({ error: { message: "rate limited" } }), { status: 429 }),
    }),
    /groq 429: rate limited/i,
  );
});
