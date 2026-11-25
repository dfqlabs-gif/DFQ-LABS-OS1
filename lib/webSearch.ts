export interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
  provider: "brave" | "tavily";
}

export interface WebSearchConfig {
  provider: "brave" | "tavily";
  apiKey: string;
}

export function configuredWebSearchProviders(env: Record<string, string | undefined> = process.env): WebSearchConfig[] {
  const keys = { brave: env.BRAVE_SEARCH_API_KEY?.trim(), tavily: env.TAVILY_API_KEY?.trim() };
  const order = (env.WEB_SEARCH_PROVIDER_ORDER || "tavily,brave").split(",").map(v => v.trim().toLowerCase());
  const seen = new Set<string>();
  return order.flatMap(value => {
    if ((value !== "brave" && value !== "tavily") || seen.has(value) || !keys[value]) return [];
    seen.add(value);
    return [{ provider: value, apiKey: keys[value]! }];
  });
}

async function searchWithProvider(config: WebSearchConfig, query: string, fetchImpl: typeof fetch): Promise<WebSearchResult[]> {
  if (config.provider === "brave") {
    const url = new URL("https://api.search.brave.com/res/v1/web/search");
    url.searchParams.set("q", query);
    url.searchParams.set("count", "8");
    const response = await fetchImpl(url, {
      headers: { "X-Subscription-Token": config.apiKey, Accept: "application/json" },
      signal: AbortSignal.timeout(20000),
    });
    const payload: any = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error("Brave Search " + response.status + ": " + String(payload?.message || response.statusText).slice(0,180));
    return (payload?.web?.results || []).map((item: any) => ({
      title: String(item.title || "").slice(0,200),
      url: String(item.url || ""),
      snippet: String(item.description || "").slice(0,1200),
      provider: "brave" as const,
    })).filter((item: WebSearchResult) => /^https?:\\/\\//i.test(item.url));
  }
  const response = await fetchImpl("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ api_key: config.apiKey, query, search_depth: "basic", max_results: 8, include_answer: false, include_raw_content: false }),
    signal: AbortSignal.timeout(20000),
  });
  const payload: any = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error("Tavily Search " + response.status + ": " + String(payload?.detail || payload?.message || response.statusText).slice(0,180));
  return (payload?.results || []).map((item: any) => ({
    title: String(item.title || "").slice(0,200),
    url: String(item.url || ""),
    snippet: String(item.content || "").slice(0,1200),
    provider: "tavily" as const,
  })).filter((item: WebSearchResult) => /^https?:\\/\\//i.test(item.url));
}

export async function searchWebWithFallback(
  queries: string[],
  env: Record<string, string | undefined> = process.env,
  fetchImpl: typeof fetch = fetch,
): Promise<{ results: WebSearchResult[]; provider: string; queries: string[] }> {
  const providers = configuredWebSearchProviders(env);
  if (!providers.length) throw new Error("No web-search provider configured. Add TAVILY_API_KEY or BRAVE_SEARCH_API_KEY.");
  const errors: string[] = [];
  for (const config of providers) {
    try {
      const batches = await Promise.all(queries.slice(0,5).map(query => searchWithProvider(config, query, fetchImpl)));
      const seen = new Set<string>();
      const results = batches.flat().filter(item => {
        const key = item.url.toLowerCase().replace(/\\/$/, "");
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      return { results, provider: config.provider, queries: queries.slice(0,5) };
    } catch (error: any) {
      errors.push(String(error?.message || error).slice(0,200));
    }
  }
  throw new Error("All configured web-search providers failed: " + errors.join(" | "));
}
