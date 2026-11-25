import assert from "node:assert/strict";
import test from "node:test";
import { configuredWebSearchProviders, searchWebWithFallback } from "./webSearch.js";

test("web search providers follow configured order and skip missing keys", () => {
  const providers = configuredWebSearchProviders({
    WEB_SEARCH_PROVIDER_ORDER: "brave,tavily,brave",
    BRAVE_SEARCH_API_KEY: "brave-key",
    TAVILY_API_KEY: "tavily-key",
  });
  assert.deepEqual(providers.map(provider => provider.provider), ["brave", "tavily"]);
});

test("Tavily search results are normalized and deduplicated", async () => {
  const result = await searchWebWithFallback(["Abuja property developers", "Abuja luxury real estate"], {
    WEB_SEARCH_PROVIDER_ORDER: "tavily",
    TAVILY_API_KEY: "test-key",
  }, async (_input, init) => {
    const body = JSON.parse(String(init?.body));
    assert.equal(body.search_depth, "basic");
    return new Response(JSON.stringify({ results: [
      { title: "A", url: "https://example.com/", content: "Verified company profile" },
      { title: "A duplicate", url: "https://example.com", content: "Duplicate result" },
      { title: "B", url: "https://example.org", content: "Another result" },
    ] }), { status: 200 });
  });
  assert.equal(result.provider, "tavily");
  assert.equal(result.results.length, 2);
  assert.equal(result.results[0].snippet, "Verified company profile");
});

test("web search refuses to run without an independent search key", async () => {
  await assert.rejects(() => searchWebWithFallback(["test"], {}), /No web-search provider configured/);
});
