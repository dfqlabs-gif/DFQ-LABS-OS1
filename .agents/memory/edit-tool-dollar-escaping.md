---
name: Edit tool collapses $$ before ${ in replacement text
description: When using the Edit tool to insert JS/TS template-literal text containing a literal "$" immediately before "${...}" (i.e. "$${expr}"), the written file can end up with only a single "$", silently breaking the intended output (e.g. SQL placeholders like `$1`). Relevant whenever editing code that builds parameterized SQL or other "$${i}"-style strings.
---

## The quirk

Editing a file to introduce text like `` `($${i * 2 + 1}, ...)` `` (a literal
`$` followed by an interpolated `${...}` — used to emit SQL placeholders like
`$1`, `$2` from a JS template literal) can silently collapse to a single `$`
after the Edit tool call reports success. Re-reading/grepping the file right
after can still show the stale (already-reverted) content, then later match
the collapsed one-`$` version — very easy to mistake for "the edit didn't
apply" when it's actually a lossy transform of the replacement string.

**Why:** Not root-caused, but reproduced multiple times in one session while
fixing a bulk SQL insert that needed `$1, $2` placeholders — Edit calls with
`$${...}` in `new_string` kept coming back as `${...}` (one `$` short) even
though the tool reported a successful diff.

**How to apply:** When a replacement string must contain a literal `$`
directly before a template interpolation (`$${...}`), don't trust Edit's
success report alone — re-read the exact line afterward. If it collapsed,
don't retry Edit again with the same pattern; instead do the write via a
shell/Node script (e.g. `node -e "fs.writeFileSync(...)"` or `sed`) which
handles the literal text faithfully, then verify with `sed -n '<line>p'`.
