---
name: OpenRouter free-model reasoning trap
description: Why OpenRouter free-tier models can return empty completion content, and how to fix it.
---

Many free-tier OpenRouter model slugs (e.g. deepseek-r1, gpt-oss, qwen3, llama-3.x `:free` variants)
are reasoning models. By default they spend the entire `max_tokens` budget on hidden
"reasoning" content and stop with `finish_reason: "length"` before writing any actual
answer — the API returns `content: null` even though the request succeeded (`ok: true`
if you only check for absence of an error).

**Why:** the OpenRouter free catalog also churns — slugs frequently 404 ("unavailable for
free, use X instead") or upstream-rate-limit (429) as providers rotate free capacity.
A default model picked once can silently stop working weeks later.

**How to apply:** when wiring a new default free model, verify actual non-empty `content`
(not just `ok`) via a real completion call. Pass `reasoning: { exclude: true, effort: "low" }`
in the chat completion request body to stop reasoning tokens from consuming the whole
budget, and give a generous `max_tokens` (verified working: `nvidia/nemotron-nano-9b-v2:free`
with `max_tokens: 900+`). If generation later starts failing, suspect the model slug was
deprecated/rate-limited before suspecting app logic.
