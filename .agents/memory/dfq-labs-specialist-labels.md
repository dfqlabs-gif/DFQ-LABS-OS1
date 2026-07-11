---
name: DFQ Labs OS specialist display labels
description: Why intern role names shown in the UI differ from the strings stored in lead data, and how to render them correctly.
---

The two intern roles are stored/keyed internally as `"Intern A"` / `"Intern B"`
(role keys `internA`/`internB`, and `Lead.assignedTo` values) throughout
localStorage-persisted lead data, `SPECIALIST_COLOR`, and auto-assignment
logic. The user-facing labels are "Outreach" and "Client Relationships".

**Why:** renaming the underlying data values would silently break every
existing lead's `assignedTo` field and any saved filters/exports keyed on the
old strings — there is no migration step for localStorage data.

**How to apply:** never change the data-side strings. Always render display
text through `specialistLabel()` / `SPECIALIST_DISPLAY` (in `constants.tsx`)
at the point of display — badges, dropdown option labels, headers. Grep for
literal `"Intern A"` / `"Intern B"` in JSX text content (not in
comparisons/assignments) before shipping any UI change touching these roles.
